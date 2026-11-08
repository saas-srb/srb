import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { TokenVerifier } from "livekit-server-sdk";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import {
  addParticipants, claimReminder, createMeeting, findGuestByToken, getMeeting, listMeetings, markJoined, mutateMeeting, regenerateGuestToken, removeParticipant, resetMeetingIndexes, revokeGuestToken,
  setRoomFlags, setWaiting, toMeetingView, transitionMeeting, updateMeetingFields, updateMeetingStatus, SYSTEM_ACTOR,
} from "../src/lib/dealflow-ai/db-meetings";
import { createMeetingFromInput } from "../src/lib/dealflow-ai/meetings/service";
import { canHostMeeting, canSeeMeeting, guestLinkStatus, joinAsGuest, joinAsStaff } from "../src/lib/dealflow-ai/meetings/access";
import { buildGrant, verifyRoomToken, issueRoomToken } from "../src/lib/dealflow-ai/meetings/livekit";
import { generateJoinToken, hashJoinToken, linkState, looksLikeJoinToken, tokenExpiry } from "../src/lib/dealflow-ai/meetings/tokens";
import { buildIcs, foldLine } from "../src/lib/dealflow-ai/meetings/ics";
import { sendMeetingInvites, inviteCopy } from "../src/lib/dealflow-ai/meetings/invites";
import { acceptUtterance, appendUtterance, assembleTranscript, listUtterances, resetUtteranceIndexes } from "../src/lib/dealflow-ai/meetings/utterances";
import { parseSummary, runPostMeeting } from "../src/lib/dealflow-ai/meetings/postmeeting";
import { dueReminders, runMeetingsSweep } from "../src/lib/dealflow-ai/meetings/sweep";
import { checkRoster, isValidTimezone, normalizeParticipant, parseMeetingFields } from "../src/lib/dealflow-ai/meetings/validate";
import { migrateLegacyMeeting } from "../src/lib/dealflow-ai/meetings/legacy";
import { parseGuestList, utcToZoned, zonedToUtc, bucketOf } from "../src/lib/dealflow-ai/meetings/ui";
import type { MeetingParticipant } from "../src/lib/dealflow-ai/meetings/types";

// Runs only against a throwaway database (MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>). No LiveKit server, email provider or OpenAI is contacted.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const CREDS = { url: "wss://lk.example.test", apiKey: "APIkeyTEST", apiSecret: "secret-secret-secret-secret-secret-1234" };
const creds = async () => CREDS;
const at = (min: number, base = new Date()) => new Date(base.getTime() + min * 60_000).toISOString();

(async () => {
  await runAsCompany("co_a", async () => {
    const db = await getDb();
    assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
    await (await getPlatformDb()).dropDatabase();
    resetMeetingIndexes();
    resetUtteranceIndexes();

    const hostId = new ObjectId(), staffId = new ObjectId(), outsiderId = new ObjectId(), mgrId = new ObjectId();
    await db.collection("admin_users").insertMany([
      { _id: hostId, name: "Hema Host", email: "hema@co.test", roles: ["lms_agent"], status: "active" },
      { _id: staffId, name: "Sam Staff", email: "sam@co.test", roles: ["lms_agent"], status: "active" },
      { _id: outsiderId, name: "Olga Outsider", email: "olga@co.test", roles: ["lms_agent"], status: "active" },
      { _id: mgrId, name: "Mona Manager", email: "mona@co.test", roles: ["lms_manager"], status: "active" },
    ] as never[]);
    const u = (id: ObjectId, roles: string[]) => ({ id: String(id), email: "x@co.test", roles, permissionOverrides: {} });
    const host = u(hostId, ["lms_agent"]), staff = u(staffId, ["lms_agent"]), outsider = u(outsiderId, ["lms_agent"]), manager = u(mgrId, ["lms_manager"]);
    const deps = { agents: async () => [{ id: "bot1", name: "Asha" }, { id: "bot2", name: "Ravi" }] };
    const tz = "Asia/Kolkata";
    const future = at(180);

    await t("validation: names, emails, E.164 phones, timezone, duration, dates", async () => {
      const now = new Date();
      const f = (o: Record<string, unknown>) => parseMeetingFields({ title: "Kickoff", scheduledAt: future, durationMinutes: 30, timezone: tz, ...o }, now);
      assert.ok(f({}).ok);
      assert.equal((f({ title: "  " }) as { ok: false }).ok, false);
      assert.equal(f({ timezone: "Mars/Base" }).ok, false);
      assert.equal(f({ durationMinutes: 2 }).ok, false);
      assert.equal(f({ durationMinutes: 9999 }).ok, false);
      assert.equal(f({ scheduledAt: at(-120) }).ok, false);
      assert.equal(f({ scheduledAt: "not a date" }).ok, false);
      assert.ok(isValidTimezone("Asia/Kolkata") && !isValidTimezone(""));
      const dir = { staff: new Map(), agents: new Map() };
      const n = (o: unknown) => normalizeParticipant(o, dir, () => "p1", now);
      assert.equal(n({ kind: "external", name: "" }).ok, false);
      assert.equal(n({ kind: "external", name: "A", email: "bad@" }).ok, false);
      const ok = n({ kind: "external", name: "  Asha   Rao ", email: " ASHA@X.TEST ", phone: "+91 98765-43210" });
      assert.ok(ok.ok && ok.value.name === "Asha Rao" && ok.value.email === "asha@x.test" && ok.value.phone === "+919876543210");
      assert.equal(n({ kind: "external", name: "A", phone: "98765" }).ok, false);
      assert.equal(n({ kind: "internal", refId: "nobody" }).ok, false);
      assert.equal(n({ kind: "agent", refId: "nope" }).ok, false);
      assert.equal(n({ kind: "robot" }).ok, false);
    });

    await t("roster rules: host required, duplicates, caps, alias clashes", async () => {
      const mk = (o: Partial<MeetingParticipant> & { id: string }): MeetingParticipant => ({ kind: "external", role: "participant", name: o.id, refId: null, invitedAt: "", ...o });
      const h = mk({ id: "h", kind: "internal", role: "host", refId: "u1", name: "H" });
      assert.equal(checkRoster([h]), null);
      assert.match(checkRoster([mk({ id: "g" })])!, /host/);
      assert.match(checkRoster([h, mk({ id: "a", email: "a@x.test" }), mk({ id: "b", email: "a@x.test" })])!, /twice/);
      assert.match(checkRoster([h, mk({ id: "a", phone: "+919000000001" }), mk({ id: "b", phone: "+919000000001" })])!, /twice/);
      assert.match(checkRoster([h, mk({ id: "h2", kind: "internal", refId: "u1" })])!, /twice/);
      const guests = Array.from({ length: 50 }, (_, i) => mk({ id: `g${i}`, email: `g${i}@x.test` }));
      assert.equal(checkRoster([h, ...guests.slice(0, 49)]), null);
      assert.match(checkRoster([h, ...guests])!, /at most 50/);
      const agents = Array.from({ length: 11 }, (_, i) => mk({ id: `a${i}`, kind: "agent", refId: `b${i}`, name: `Agent${i}` }));
      assert.match(checkRoster([h, ...agents])!, /at most 10/);
      assert.match(checkRoster([h, mk({ id: "x", kind: "agent", refId: "b1", name: "Asha" }), mk({ id: "y", kind: "agent", refId: "b2", name: "Ravi", aliases: ["asha"] })])!, /answer to/);
    });

    let roomId = "";
    let aliceToken = "";
    let aliceId = "";
    await t("create: n externals, n internals, n agents; host defaults to the scheduler; tokens are hashed", async () => {
      const bad = await createMeetingFromInput({ title: "X", scheduledAt: future, timezone: tz, participants: [{ kind: "external", name: "A", email: "a@x.test", phone: "12" }] }, host, deps);
      assert.equal(bad.ok, false);
      const made = await createMeetingFromInput({
        title: "Kickoff", scheduledAt: future, durationMinutes: 45, timezone: tz, agenda: { title: "Scope", description: "Agree scope", agentGoal: "Answer pricing questions" },
        target: { product: "dealflow-ai", entityType: "lead", entityId: "lead1", label: "Alice" },
        participants: [
          { kind: "internal", refId: String(staffId) },
          { kind: "external", name: "Alice", email: "alice@x.test", phone: "+919876543210", company: "Acme" },
          { kind: "external", name: "Bob", email: "bob@x.test" },
          { kind: "external", name: "Carol NoMail" },
          { kind: "agent", refId: "bot1", aliases: ["Ash", "asha", "Ash"] },
          { kind: "agent", refId: "bot2" },
        ],
      }, host, deps);
      assert.ok(made.ok);
      if (!made.ok) return;
      roomId = made.meeting.roomId;
      const m = made.meeting;
      assert.equal(m.status, "scheduled");
      assert.equal(m.participants.filter((p) => p.kind === "internal").length, 2);
      assert.equal(m.participants.find((p) => p.refId === String(hostId))?.role, "host");
      assert.equal(m.participants.find((p) => p.refId === String(hostId))?.name, "Hema Host");
      assert.deepEqual(m.participants.find((p) => p.refId === "bot1")?.aliases, ["Ash"]);
      assert.equal(m.participants.filter((p) => p.kind === "external").length, 3);
      assert.equal(made.tokens.length, 3);
      for (const tk of made.tokens) {
        assert.ok(looksLikeJoinToken(tk.token));
        const p = m.participants.find((x) => x.id === tk.participantId)!;
        assert.equal(p.joinTokenHash, hashJoinToken(tk.token));
        assert.notEqual(p.joinTokenHash, tk.token);
        assert.equal(p.joinTokenExpiresAt, tokenExpiry(m.scheduledAt, 45).toISOString());
      }
      const stored = JSON.stringify(await db.collection("meeting_rooms").findOne({ roomId }));
      for (const tk of made.tokens) assert.ok(!stored.includes(tk.token), "raw token must not be stored");
      const view = JSON.stringify(toMeetingView(m));
      assert.ok(!view.includes("joinTokenHash"));
      aliceId = made.tokens[0].participantId;
      aliceToken = made.tokens[0].token;
      assert.equal(m.participants.find((p) => p.id === aliceId)?.name, "Alice");
      assert.equal(m.audit?.[0]?.action, "create");
      assert.equal(generateJoinToken().length, 43);
    });

    await t("legacy single-client meetings are migrated on read and keep their old fields", async () => {
      const when = new Date(Date.now() + 3600_000);
      await db.collection("meeting_rooms").insertOne({ roomId: "df-old", title: "Old call", clientName: "Legacy Larry", clientEmail: "l@x.test", clientPhone: "+911234567890", scheduledAt: when.toISOString(), durationMinutes: 30, status: "scheduled", agentIds: ["bot1"], agentNames: ["Asha"], salesPersonName: "Seller Sue", notes: "bring docs", clientJoinLink: "https://x/meeting/df-old", createdAt: new Date(), updatedAt: new Date() } as never);
      const m = (await getMeeting("df-old"))!;
      assert.equal(m.participants.length, 3);
      assert.deepEqual(m.participants.map((p) => [p.kind, p.name]), [["internal", "Seller Sue"], ["external", "Legacy Larry"], ["agent", "Asha"]]);
      assert.deepEqual(m.agentIds, ["bot1"]);
      assert.equal(m.clientName, "Legacy Larry");
      assert.equal(m.agenda?.description, "bring docs");
      assert.equal(m.timezone, "Asia/Kolkata");
      const r = await updateMeetingFields("df-old", { title: "Old call 2", agenda: m.agenda, scheduledAt: m.scheduledAt, durationMinutes: 30, timezone: "Asia/Kolkata", agentSettings: m.agentSettings, waitingRoom: false, target: null }, { id: "u", name: "U" });
      assert.ok(r.ok);
      const raw = (await db.collection("meeting_rooms").findOne({ roomId: "df-old" }))!;
      assert.ok(Array.isArray(raw.participants) && raw.title === "Old call 2" && raw.createdAt instanceof Date, "persisted in the new shape");
      assert.deepEqual(migrateLegacyMeeting({ roomId: "x" }).participants.length, 1);
      const legacyCreate = await createMeeting({ roomId: "df-l2", title: "T", clientName: "C", clientEmail: "c@x.test", scheduledAt: when.toISOString(), durationMinutes: 30, status: "scheduled", agentIds: [], agentNames: [] });
      assert.equal(legacyCreate.clientName, "C");
      assert.equal((await listMeetings()).length >= 3, true);
    });

    await t("status machine: scheduled -> live -> ended; atomic under races; no way back", async () => {
      const a = { id: String(hostId), name: "Hema Host" };
      const [x, y] = await Promise.all([transitionMeeting(roomId, "ended", a), transitionMeeting(roomId, "live", a)]);
      assert.ok(!x.ok, "scheduled cannot end directly");
      assert.ok(y.ok && y.result.changed);
      const again = await transitionMeeting(roomId, "live", a);
      assert.ok(again.ok && !again.result.changed, "starting twice is harmless");
      assert.equal((await transitionMeeting(roomId, "cancelled", a)).ok, false, "a live meeting cannot be cancelled");
      const race = await Promise.all([transitionMeeting("df-l2", "live", a), transitionMeeting("df-l2", "cancelled", a)]);
      assert.equal(race.filter((r) => r.ok && r.result.changed).length, 1, "exactly one transition wins");
      assert.equal(await updateMeetingStatus("df-old", "ended"), false);
      assert.equal((await getMeeting(roomId))?.status, "live");
      assert.ok((await getMeeting(roomId))?.startedAt);
    });

    await t("roster changes while live: agents can be added/removed; concurrent adds never lose one", async () => {
      const dir = { staff: new Map(), agents: new Map([["bot3", { name: "Maya" }]]) };
      const maya = normalizeParticipant({ kind: "agent", refId: "bot3" }, dir, () => "p_maya", new Date());
      assert.ok(maya.ok);
      if (!maya.ok) return;
      const a = { id: String(hostId), name: "Hema Host" };
      const add = await addParticipants(roomId, [maya.value], a);
      assert.ok(add.ok && add.meeting.participants.some((p) => p.id === "p_maya"));
      const rm = await removeParticipant(roomId, "p_maya", a);
      assert.ok(rm.ok && !rm.meeting.participants.some((p) => p.id === "p_maya"));
      const people = Array.from({ length: 6 }, (_, i) => normalizeParticipant({ kind: "external", name: `Parallel ${i}`, email: `par${i}@x.test` }, dir, () => `p_par${i}`, new Date()));
      const results = await Promise.all(people.map((p) => (p.ok ? addParticipants(roomId, [p.value], a) : Promise.resolve({ ok: false } as never))));
      assert.ok(results.every((r) => r.ok), "all concurrent adds succeed (revision retry)");
      const m = (await getMeeting(roomId))!;
      assert.equal(m.participants.filter((p) => p.name.startsWith("Parallel")).length, 6);
      for (let i = 0; i < 6; i++) await removeParticipant(roomId, `p_par${i}`, a);
      assert.equal((await removeParticipant(roomId, aliceId.replace(/.$/, "0") + "zz", a)).ok, false);
      const hostP = m.participants.find((p) => p.refId === String(hostId))!;
      assert.match((await removeParticipant(roomId, hostP.id, a) as { error?: string }).error ?? "", /host/, "the last host cannot be removed");
    });

    await t("guest links: hash lookup, expiry, revoke, regenerate", async () => {
      const m = (await getMeeting(roomId))!;
      assert.equal(findGuestByToken(m, aliceToken)?.id, aliceId);
      assert.equal(findGuestByToken(m, generateJoinToken()), null);
      const p = m.participants.find((x) => x.id === aliceId)!;
      assert.equal(linkState(p, new Date()), "active");
      assert.equal(linkState(p, new Date(new Date(p.joinTokenExpiresAt!).getTime() + 1)), "expired");
      assert.equal(new Date(p.joinTokenExpiresAt!).getTime() - new Date(m.scheduledAt).getTime(), (45 + 120) * 60_000, "meeting end + 2h");
      const a = { id: String(hostId), name: "Hema Host" };
      const regen = await regenerateGuestToken(roomId, aliceId, a);
      assert.ok(regen.ok);
      if (!regen.ok) return;
      const m2 = (await getMeeting(roomId))!;
      assert.equal(findGuestByToken(m2, aliceToken), null, "the old link stops working");
      assert.equal(findGuestByToken(m2, regen.result.token)?.id, aliceId);
      aliceToken = regen.result.token;
      assert.ok((await revokeGuestToken(roomId, aliceId, a)).ok);
      const m3 = (await getMeeting(roomId))!;
      assert.equal(findGuestByToken(m3, aliceToken), null);
      assert.equal(linkState(m3.participants.find((x) => x.id === aliceId)!), "revoked");
      assert.equal((await regenerateGuestToken(roomId, "p_internal", a)).ok, false, "only guests have links");
      const again = await regenerateGuestToken(roomId, aliceId, a);
      assert.ok(again.ok);
      if (again.ok) aliceToken = again.result.token;
      assert.equal(linkState((await getMeeting(roomId))!.participants.find((x) => x.id === aliceId)!), "active", "regenerating un-revokes");
    });

    await t("permissions: who sees and hosts a meeting", async () => {
      const m = (await getMeeting(roomId))!;
      assert.ok(canSeeMeeting(host, m) && canHostMeeting(host, m));
      assert.ok(canSeeMeeting(staff, m) && !canHostMeeting(staff, m), "listed staff see it but do not host");
      assert.ok(!canSeeMeeting(outsider, m) && !canHostMeeting(outsider, m));
      assert.ok(canSeeMeeting(manager, m) && canHostMeeting(manager, m));
      assert.equal((await listMeetings({ visibleTo: String(outsiderId) })).length, 0);
      assert.ok((await listMeetings({ visibleTo: String(staffId) })).some((x) => x.roomId === roomId));
      assert.equal((await listMeetings({ agentId: "bot2" })).length, 1);
    });

    await t("token issuer: staff by roster, manager auto-listed, outsiders refused; JWT carries a fixed identity and minimal grants", async () => {
      // a second meeting that is still scheduled
      const sched = await createMeetingFromInput({ title: "Later", scheduledAt: future, timezone: tz, waitingRoom: true, participants: [{ kind: "internal", refId: String(staffId) }, { kind: "external", name: "Dan", email: "dan@x.test" }, { kind: "agent", refId: "bot1" }] }, host, deps);
      assert.ok(sched.ok);
      if (!sched.ok) return;
      const sid = sched.meeting.roomId;
      const J = { credentials: creds };
      const early = await joinAsStaff((await getMeeting(sid))!, staff, J);
      assert.ok(!early.ok && early.code === "not_started", "only a host starts the meeting");
      assert.ok(!(await joinAsStaff((await getMeeting(sid))!, outsider, J)).ok, "an unlisted non-manager is refused");
      assert.equal((await getMeeting(sid))!.status, "scheduled");
      const h = await joinAsStaff((await getMeeting(sid))!, host, J);
      assert.ok(h.ok);
      if (!h.ok) return;
      assert.equal((await getMeeting(sid))!.status, "live", "the host's arrival starts it");
      assert.equal(h.props.me.role, "host");
      assert.equal(h.props.me.name, "Hema Host");
      assert.equal(h.props.canRunAgents, true);
      assert.equal(h.props.liveKit.url, CREDS.url);
      assert.ok(!JSON.stringify(h.props).includes(CREDS.apiSecret), "the secret never reaches the browser");
      const claims = await new TokenVerifier(CREDS.apiKey, CREDS.apiSecret).verify(h.props.token);
      assert.equal(claims.sub, h.participantId);
      assert.equal(claims.name, "Hema Host");
      assert.equal(claims.video?.room, sid);
      assert.equal(claims.video?.roomAdmin, false);
      assert.equal(claims.video?.canPublishSources, undefined, "the runner may publish extra audio tracks");
      assert.deepEqual(JSON.parse(claims.metadata!), { participantId: h.participantId, kind: "internal", role: "host", runner: true });
      const verified = await verifyRoomToken(CREDS, h.props.token);
      assert.equal(verified?.participantId, h.participantId);
      assert.equal(await verifyRoomToken(CREDS, h.props.token + "x"), null);
      assert.equal(await verifyRoomToken({ ...CREDS, apiSecret: "other-other-other-other-other-other-12" }, h.props.token), null);
      const s = await joinAsStaff((await getMeeting(sid))!, staff, J);
      assert.ok(s.ok && s.props.me.role === "participant" && !s.props.canHost);
      const mg = await joinAsStaff((await getMeeting(sid))!, manager, J);
      assert.ok(mg.ok);
      assert.ok((await getMeeting(sid))!.participants.some((p) => p.refId === String(mgrId)), "a manager who joins is put on the roster");
      assert.equal(buildGrant({ roomId: "r", canRunAgents: false, kind: "external", role: "participant" }).canPublishSources?.length, 4);
      const none = await joinAsStaff((await getMeeting(sid))!, host, { credentials: async () => null });
      assert.ok(!none.ok && none.code === "not_configured");
      assert.equal((await getMeeting(sid))!.participants.filter((p) => p.kind === "agent").length, 1);
      // the rosters' agents never appear as token subjects
      assert.ok(![h, s, mg].some((r) => r.ok && r.props.me.kind === ("agent" as never)));
      await issueRoomToken(CREDS, { roomId: "r", participantId: "p", name: "n", kind: "external", role: "participant", canRunAgents: false, ttlSeconds: 60 });

      // guests
      const dan = sched.tokens[0];
      const roomView = guestLinkStatus((await getMeeting(sid))!, dan.token);
      assert.ok(roomView.ok && roomView.name === "Dan");
      assert.ok(!(await joinAsGuest((await getMeeting(sid))!, "short", J)).ok);
      assert.ok(!(await joinAsGuest((await getMeeting(sid))!, generateJoinToken(), J)).ok);
      const wait = await joinAsGuest((await getMeeting(sid))!, dan.token, J);
      assert.ok(!wait.ok && wait.code === "waiting", "waiting room holds the guest");
      const waiting = (await getMeeting(sid))!.participants.find((p) => p.id === dan.participantId)!;
      assert.ok(waiting.waitingSince);
      assert.ok((await setWaiting(sid, dan.participantId, "admitted", { id: "h", name: "Hema" })).ok);
      const g = await joinAsGuest((await getMeeting(sid))!, dan.token, J);
      assert.ok(g.ok);
      if (!g.ok) return;
      const gc = await new TokenVerifier(CREDS.apiKey, CREDS.apiSecret).verify(g.props.token);
      assert.equal(gc.sub, dan.participantId);
      assert.equal(gc.name, "Dan");
      assert.equal(JSON.parse(gc.metadata!).kind, "external");
      assert.equal(JSON.parse(gc.metadata!).runner, false);
      assert.equal(gc.video?.canPublishSources?.length, 4);
      assert.equal(g.props.canRunAgents, false);
      const gv = JSON.stringify(g.props.meeting);
      assert.ok(!gv.includes("hema@co.test") && !gv.includes("sam@co.test") && !gv.includes("agentGoal") && !gv.includes("joinTokenHash"), "guests do not see other people's details");
      // locked: a first-time guest is kept out, someone who already joined can rejoin
      assert.ok((await setRoomFlags(sid, { locked: true }, SYSTEM_ACTOR)).ok);
      assert.ok((await joinAsGuest((await getMeeting(sid))!, dan.token, J)).ok, "a guest who already joined may come back");
      // revoked / expired / ended
      await revokeGuestToken(sid, dan.participantId, SYSTEM_ACTOR);
      const rev = await joinAsGuest((await getMeeting(sid))!, dan.token, J);
      assert.ok(!rev.ok && rev.code === "invalid");
      const m5 = (await getMeeting(sid))!;
      const regen = await regenerateGuestToken(sid, dan.participantId, SYSTEM_ACTOR);
      const exp = await joinAsGuest((await getMeeting(sid))!, regen.ok ? regen.result.token : "", { ...J, now: () => new Date(Date.now() + 10 * 3600_000) });
      assert.ok(!exp.ok && exp.code === "expired");
      assert.ok(m5.locked);
      await transitionMeeting(sid, "ended", SYSTEM_ACTOR);
      const ended = await joinAsGuest((await getMeeting(sid))!, regen.ok ? regen.result.token : "", J);
      assert.ok(!ended.ok && ended.code === "ended");
      assert.ok(!(await joinAsStaff((await getMeeting(sid))!, host, J)).ok);
      // not started + cancelled for a fresh meeting
      const c = await createMeetingFromInput({ title: "Never", scheduledAt: future, timezone: tz, participants: [{ kind: "external", name: "Eve", email: "eve@x.test" }] }, host, deps);
      assert.ok(c.ok);
      if (!c.ok) return;
      const ns = await joinAsGuest((await getMeeting(c.meeting.roomId))!, c.tokens[0].token, J);
      assert.ok(!ns.ok && ns.code === "not_started");
      await transitionMeeting(c.meeting.roomId, "cancelled", SYSTEM_ACTOR, { reason: "no longer needed" });
      const cx = await joinAsGuest((await getMeeting(c.meeting.roomId))!, c.tokens[0].token, J);
      assert.ok(!cx.ok && cx.code === "cancelled");
    });

    await t("ICS: stable UID, SEQUENCE up on reschedule, CANCEL on cancel, folding and escaping", async () => {
      const base = { roomId: "df-abc", title: "Kickoff; plan, v2", description: "Line1\nLine2", start: new Date("2026-12-01T09:30:00Z"), durationMinutes: 45, organizer: { name: "Hema", email: "hema@co.test" }, attendee: { name: "Alice", email: "alice@x.test" }, url: "https://x.test/meeting/df-abc?t=abc", stamp: new Date("2026-11-01T00:00:00Z") };
      const req0 = buildIcs({ ...base, sequence: 0, method: "REQUEST" });
      const req1 = buildIcs({ ...base, sequence: 1, method: "REQUEST", start: new Date("2026-12-02T09:30:00Z") });
      const can = buildIcs({ ...base, sequence: 2, method: "CANCEL" });
      assert.ok(req0.includes("METHOD:REQUEST") && req0.includes("UID:df-abc@meetings.selfrun") && req0.includes("SEQUENCE:0"));
      assert.ok(req0.includes("DTSTART:20261201T093000Z") && req0.includes("DTEND:20261201T101500Z"));
      assert.ok(req0.includes("SUMMARY:Kickoff\; plan\\, v2") && req0.includes("Line1\\nLine2"));
      assert.ok(req1.includes("SEQUENCE:1") && req1.includes("UID:df-abc@meetings.selfrun"));
      assert.ok(can.includes("METHOD:CANCEL") && can.includes("STATUS:CANCELLED") && can.includes("SEQUENCE:2") && can.includes("UID:df-abc@meetings.selfrun"));
      assert.ok(req0.endsWith("\r\n") && !/[^\r]\n/.test(req0), "CRLF line endings");
      for (const line of req0.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
      assert.equal(foldLine("x".repeat(160)).split("\r\n").length, 3);
      const m = (await getMeeting(roomId))!;
      const before = m.sequence ?? 0;
      const up = await updateMeetingFields(roomId, { title: m.title, agenda: m.agenda, scheduledAt: m.scheduledAt, durationMinutes: 60, timezone: tz, agentSettings: m.agentSettings, waitingRoom: false, target: m.target ?? null }, { id: "h", name: "H" });
      assert.ok(!up.ok, "a live meeting cannot be rescheduled");
    });

    await t("reschedule: sequence +1, guest links follow the new end, reminders reset", async () => {
      const c = await createMeetingFromInput({ title: "Move me", scheduledAt: future, durationMinutes: 30, timezone: tz, participants: [{ kind: "external", name: "Fay", email: "fay@x.test" }] }, host, deps);
      assert.ok(c.ok);
      if (!c.ok) return;
      const rid = c.meeting.roomId;
      await claimReminder(rid, "m60");
      const m = (await getMeeting(rid))!;
      assert.equal(m.sequence, 0);
      const newTime = at(24 * 60);
      const r = await updateMeetingFields(rid, { title: m.title, agenda: null, scheduledAt: newTime, durationMinutes: 30, timezone: tz, agentSettings: m.agentSettings, waitingRoom: false, target: null }, { id: "h", name: "H" });
      assert.ok(r.ok && r.result.rescheduled);
      const m2 = (await getMeeting(rid))!;
      assert.equal(m2.sequence, 1);
      assert.deepEqual(m2.remindersSent, {});
      assert.equal(m2.participants[1].joinTokenExpiresAt, tokenExpiry(newTime, 30).toISOString());
      assert.equal(findGuestByToken(m2, c.tokens[0].token)?.name, "Fay", "the same link still works");
      const same = await updateMeetingFields(rid, { title: "Renamed", agenda: null, scheduledAt: m2.scheduledAt, durationMinutes: 30, timezone: tz, agentSettings: m.agentSettings, waitingRoom: false, target: null }, { id: "h", name: "H" });
      assert.ok(same.ok && !same.result.rescheduled && (await getMeeting(rid))!.sequence === 1, "a rename is not a reschedule");
      assert.ok((await getMeeting(rid))!.audit!.some((a) => a.action === "update"));
      await transitionMeeting(rid, "cancelled", { id: "h", name: "H" });
      assert.equal((await updateMeetingFields(rid, { title: "x", agenda: null, scheduledAt: m2.scheduledAt, durationMinutes: 30, timezone: tz, agentSettings: m.agentSettings, waitingRoom: false, target: null }, SYSTEM_ACTOR)).ok, false, "cancelled meetings cannot be edited");
      assert.ok((await getMeeting(rid))!.audit!.some((a) => a.action === "cancel"));
    });

    await t("invites: per-person mail with ICS, personal link, failures and missing emails recorded", async () => {
      const c = await createMeetingFromInput({ title: "Invite me", scheduledAt: future, timezone: tz, participants: [{ kind: "internal", refId: String(staffId) }, { kind: "external", name: "Gus", email: "gus@x.test" }, { kind: "external", name: "Hal", email: "hal@x.test" }, { kind: "external", name: "Ivy NoMail" }, { kind: "agent", refId: "bot1" }] }, host, deps);
      assert.ok(c.ok);
      if (!c.ok) return;
      const sent: { to: string; subject: string; text: string; ics: string; method: string }[] = [];
      const send = async (m: { to: string; subject: string; text: string; calendar: { method: "REQUEST" | "CANCEL"; ics: string } }) => {
        if (m.to === "hal@x.test") return { ok: false as const, error: "Mailbox unavailable" };
        sent.push({ to: m.to, subject: m.subject, text: m.text, ics: m.calendar.ics, method: m.calendar.method });
        return { ok: true as const, id: "id1" };
      };
      const ctx = { origin: "https://acme.test", organizer: { name: "Hema", email: "hema@co.test" }, send: send as never, brand: "Acme" };
      const out = await sendMeetingInvites(c.meeting, c.meeting.participants, { ...ctx, kind: "invite", tokens: new Map(c.tokens.map((x) => [x.participantId, x.token])) });
      assert.deepEqual(out.map((o) => [o.name, o.state]), [["Hema Host", "sent"], ["Sam Staff", "sent"], ["Gus", "sent"], ["Hal", "failed"], ["Ivy NoMail", "skipped"]]);
      const gus = sent.find((s) => s.to === "gus@x.test")!;
      const gusTok = c.tokens[0].token;
      assert.ok(gus.text.includes(`https://acme.test/meeting/${c.meeting.roomId}?t=${gusTok}`), "the personal link is in the mail");
      assert.ok(gus.ics.includes("METHOD:REQUEST") && gus.ics.replace(/\r\n /g, "").includes(gusTok));
      assert.ok(!sent.find((s) => s.to === "sam@co.test")!.text.includes("?t="), "staff get the room page, not a guest link");
      assert.ok(gus.text.includes("Asha"), "mail names the AI agents");
      const m = (await getMeeting(c.meeting.roomId))!;
      const byName = (n: string) => m.participants.find((p) => p.name === n)!;
      assert.equal(byName("Gus").invite?.state, "sent");
      assert.equal(byName("Hal").invite?.state, "failed");
      assert.equal(byName("Hal").invite?.error, "Mailbox unavailable");
      assert.equal(byName("Ivy NoMail").invite?.state, "skipped");
      assert.equal(byName("Asha").invite, undefined);
      // reminder to cancel goes only to those invited, ICS CANCEL
      sent.length = 0;
      const cancelled = await sendMeetingInvites(m, m.participants.filter((p) => p.invite?.state === "sent"), { ...ctx, kind: "cancel" });
      assert.ok(cancelled.every((o) => o.state === "sent") && sent.length === 3 && sent.every((s) => s.method === "CANCEL" && s.ics.includes("STATUS:CANCELLED")));
      // without raw tokens, mailing a guest creates a fresh link (the old one stops working)
      const before = byName("Gus");
      const upd = await sendMeetingInvites(m, [before], { ...ctx, kind: "update" });
      assert.equal(upd[0].state, "sent");
      const m2 = (await getMeeting(c.meeting.roomId))!;
      assert.equal(findGuestByToken(m2, gusTok), null);
      assert.equal(inviteCopy(m2, { name: "Z" }, "cancel", "Acme", "u").subject.startsWith("Cancelled"), true);
      const boom = await sendMeetingInvites(m2, [byName("Gus")], { ...ctx, kind: "update", send: (async () => { throw new Error("socket hang up"); }) as never });
      assert.equal(boom[0].state, "failed");
    });

    await t("utterances: idempotent, capped, speaker fixed by the token, agents only via the runner", async () => {
      const rid = roomId; // live
      const m = (await getMeeting(rid))!;
      const hostP = m.participants.find((p) => p.refId === String(hostId))!;
      const staffP = m.participants.find((p) => p.refId === String(staffId))!;
      const agentP = m.participants.find((p) => p.kind === "agent")!;
      const first = await appendUtterance({ roomId: rid, utteranceId: "u1", at: 1000, speakerId: hostP.id, speakerName: hostP.name, speakerKind: "internal", text: "  Hello everyone  " });
      const dup = await appendUtterance({ roomId: rid, utteranceId: "u1", at: 1000, speakerId: hostP.id, speakerName: hostP.name, speakerKind: "internal", text: "Hello everyone" });
      assert.deepEqual([first, dup], [{ ok: true, stored: true }, { ok: true, stored: false }]);
      const race = await Promise.all(Array.from({ length: 8 }, () => appendUtterance({ roomId: rid, utteranceId: "u2", at: 2000, speakerId: hostP.id, speakerName: hostP.name, speakerKind: "internal", text: "Same line" })));
      assert.equal(race.filter((r) => r.ok && r.stored).length, 1);
      assert.equal((await appendUtterance({ roomId: rid, utteranceId: "u3", at: 1, speakerId: "x", speakerName: "x", speakerKind: "internal", text: "   " })).ok, false);
      const long = await appendUtterance({ roomId: rid, utteranceId: "u4", at: 3000, speakerId: hostP.id, speakerName: hostP.name, speakerKind: "internal", text: "y".repeat(5000) });
      assert.ok(long.ok);
      const lines = await listUtterances(rid);
      assert.deepEqual(lines.map((l) => l.id), ["u1", "u2", "u4"]);
      assert.equal(lines[2].text.length, 2000);
      assert.equal(assembleTranscript(lines.slice(0, 2)), "Hema Host: Hello everyone\nHema Host: Same line");
      const indexes = await db.collection("dealflow_meeting_utterances").indexes();
      assert.ok(indexes.some((i) => i.unique && i.key.roomId === 1 && i.key.utteranceId === 1), "unique (roomId, utteranceId)");

      const verify = async (_c: unknown, token: string) => (token === "host" ? { participantId: hostP.id, roomId: rid, kind: "internal", runner: true } : token === "staff" ? { participantId: staffP.id, roomId: rid, kind: "internal", runner: false } : token === "other" ? { participantId: hostP.id, roomId: "df-else", kind: "internal", runner: true } : token === "ghost" ? { participantId: "p_gone", roomId: rid, kind: "internal", runner: false } : null);
      const D = { credentials: creds, verify: verify as never };
      const post = (bearer: string | null, body: unknown) => acceptUtterance(rid, bearer, body, D);
      assert.deepEqual(await post(null, { id: "a", text: "x" }), { ok: false, status: 401, error: "Sign-in required" });
      assert.equal((await post("bogus", { id: "a", text: "x" }) as { status: number }).status, 401);
      assert.equal((await post("other", { id: "a", text: "x" }) as { status: number }).status, 401, "a token for another room is refused");
      assert.equal((await post("ghost", { id: "a", text: "x" }) as { status: number }).status, 403, "a removed participant is refused");
      const mine = await post("staff", { id: "s1", text: "I am Sam", speakerName: "Hema Host", speakerKind: "internal" });
      assert.deepEqual(mine, { ok: true, stored: true });
      const stored = (await listUtterances(rid)).find((l) => l.id === "s1")!;
      assert.deepEqual([stored.speakerId, stored.speakerName], [staffP.id, "Sam Staff"], "name comes from the roster, not the request");
      assert.equal((await post("staff", { id: "s2", text: "spoof", speakerId: hostP.id }) as { status: number }).status, 403);
      assert.equal((await post("staff", { id: "s3", text: "as agent", speakerId: agentP.id }) as { status: number }).status, 403, "only the runner speaks for agents");
      assert.deepEqual(await post("host", { id: "s4", text: "Pricing starts at ten", speakerId: agentP.id, addressedTo: [agentP.id] }), { ok: true, stored: true });
      const a = (await listUtterances(rid)).find((l) => l.id === "s4")!;
      assert.deepEqual([a.speakerKind, a.speakerName, a.addressedTo], ["agent", agentP.name, [agentP.id]]);
      assert.equal((await post("host", { id: "s5", text: "x", speakerId: "p_unknown" }) as { status: number }).status, 403);
      assert.equal((await acceptUtterance("df-old", "host", { id: "z", text: "x" }, { ...D, verify: (async () => ({ participantId: "p_legacy_host", roomId: "df-old", kind: "internal", runner: true })) as never }) as { status: number }).status, 409, "not live");
    });

    await t("post-meeting: summary written once, even when triggered concurrently; timeline entry once; graceful skips", async () => {
      await db.collection("lead_records").insertOne({ _id: "lead1", code: "L-1", name: "Alice", email: "alice@x.test", phone: "+919876543210", type: "client", source: "manual", status: "open", stage: "inquiry", doNotContact: false, deletedAt: null, createdAt: new Date() } as never);
      assert.equal((await runPostMeeting(roomId, {})).ran, false, "not ended yet");
      await transitionMeeting(roomId, "ended", SYSTEM_ACTOR);
      let calls = 0;
      const deps2 = { aiConfigured: async () => true, summarize: async (_m: unknown, tr: string) => { calls++; assert.ok(tr.includes("Hema Host: Hello everyone")); await new Promise((r) => setTimeout(r, 30)); return { summary: "They said hello.", actionItems: [{ text: "Send quote", owner: "Hema Host" }] }; } };
      const results = await Promise.all([runPostMeeting(roomId, deps2 as never), runPostMeeting(roomId, deps2 as never), runPostMeeting(roomId, deps2 as never)]);
      assert.equal(results.filter((r) => r.ran).length, 1, "exactly one run wins");
      assert.equal(calls, 1);
      const m = (await getMeeting(roomId))!;
      assert.equal(m.summary, "They said hello.");
      assert.deepEqual(m.actionItems, [{ text: "Send quote", owner: "Hema Host" }]);
      assert.ok(m.transcript?.includes("Pricing starts at ten"));
      assert.ok(m.postProcessedAt && m.timelineWrittenAt);
      const tl = await db.collection("lead_timeline").find({ leadId: "lead1" }).toArray();
      assert.equal(tl.length, 1);
      assert.equal(tl[0].kind, "meeting");
      assert.ok(String(tl[0].detail).includes("They said hello."));
      assert.equal((await runPostMeeting(roomId, deps2 as never)).ran, false);
      assert.equal((await runPostMeeting(roomId, deps2 as never, { force: true })).ran, false, "force never replaces an existing summary");
      assert.equal(calls, 1);
      assert.equal((await db.collection("lead_timeline").countDocuments({ leadId: "lead1" })), 1);

      // not configured -> graceful note; later configured + force -> summary, still one timeline entry
      const c = await createMeetingFromInput({ title: "Quiet", scheduledAt: future, timezone: tz, target: { product: "dealflow-ai", entityType: "lead", entityId: "lead1", label: "Alice" }, participants: [{ kind: "external", name: "Jo", email: "jo@x.test" }] }, host, deps);
      assert.ok(c.ok);
      if (!c.ok) return;
      const rid = c.meeting.roomId;
      await transitionMeeting(rid, "live", SYSTEM_ACTOR);
      await transitionMeeting(rid, "ended", SYSTEM_ACTOR);
      const empty = await runPostMeeting(rid, { aiConfigured: async () => true, summarize: async () => { throw new Error("must not be called"); } });
      assert.ok(empty.ran && !empty.summarized && /No conversation/.test(empty.note ?? ""));
      const mo = (await getMeeting(rid))!;
      assert.equal(mo.summary, undefined);
      assert.ok(mo.summaryNote);
      await appendUtterance({ roomId: rid, utteranceId: "q1", at: 1, speakerId: "p", speakerName: "Jo", speakerKind: "external", text: "We should talk about the launch date next week please." });
      const noAi = await runPostMeeting(rid, { aiConfigured: async () => false }, { force: true });
      assert.ok(noAi.ran && !noAi.summarized && /isn't connected/.test(noAi.note ?? ""));
      assert.ok((await getMeeting(rid))!.transcript?.includes("launch date"), "the transcript is saved even without AI");
      const later = await runPostMeeting(rid, { aiConfigured: async () => true, summarize: async () => ({ summary: "Launch date discussed.", actionItems: [] }) }, { force: true });
      assert.ok(later.ran && later.summarized);
      assert.equal((await db.collection("lead_timeline").countDocuments({ leadId: "lead1" })), 2, "one entry per meeting");
      // failure releases the claim so it can be retried
      const f = await createMeetingFromInput({ title: "Flaky", scheduledAt: future, timezone: tz, participants: [{ kind: "external", name: "Kit", email: "kit@x.test" }] }, host, deps);
      assert.ok(f.ok);
      if (!f.ok) return;
      await transitionMeeting(f.meeting.roomId, "live", SYSTEM_ACTOR);
      await transitionMeeting(f.meeting.roomId, "ended", SYSTEM_ACTOR);
      await appendUtterance({ roomId: f.meeting.roomId, utteranceId: "f1", at: 1, speakerId: "p", speakerName: "Kit", speakerKind: "external", text: "A long enough sentence to be worth summarising here." });
      await assert.rejects(runPostMeeting(f.meeting.roomId, { aiConfigured: async () => true, summarize: async () => { throw new Error("OpenAI down"); } }));
      assert.equal((await getMeeting(f.meeting.roomId))!.postProcessedAt, null);
      assert.ok((await runPostMeeting(f.meeting.roomId, { aiConfigured: async () => true, summarize: async () => ({ summary: "ok", actionItems: [] }) })).ran);
      // parsing the model's answer
      assert.equal(parseSummary("not json"), null);
      assert.equal(parseSummary('{"summary":""}'), null);
      assert.deepEqual(parseSummary('{"summary":" S ","actionItems":[{"text":"A","owner":"B","due":""},{"text":""},5]}'), { summary: "S", actionItems: [{ text: "A", owner: "B" }] });
    });

    await t("reminders: 60 and 10 minutes before, once each, staff only; abandoned live meetings end; summaries are picked up", async () => {
      const now = new Date();
      assert.deepEqual(dueReminders({ scheduledAt: at(61, now), remindersSent: {}, status: "scheduled" }, now), []);
      assert.deepEqual(dueReminders({ scheduledAt: at(59, now), remindersSent: {}, status: "scheduled" }, now), [{ which: "m60", send: true }]);
      assert.deepEqual(dueReminders({ scheduledAt: at(9, now), remindersSent: {}, status: "scheduled" }, now), [{ which: "m60", send: false }, { which: "m10", send: true }], "no stale 60-minute reminder 9 minutes out");
      assert.deepEqual(dueReminders({ scheduledAt: at(9, now), remindersSent: { m60: "x", m10: "y" }, status: "scheduled" }, now), []);
      assert.deepEqual(dueReminders({ scheduledAt: at(-1, now), remindersSent: {}, status: "scheduled" }, now), []);
      assert.deepEqual(dueReminders({ scheduledAt: at(5, now), remindersSent: {}, status: "cancelled" }, now), []);
      const c = await createMeetingFromInput({ title: "Soon", scheduledAt: at(50, now), timezone: tz, participants: [{ kind: "internal", refId: String(staffId) }, { kind: "external", name: "Lou", email: "lou@x.test" }] }, host, deps, now);
      assert.ok(c.ok);
      if (!c.ok) return;
      const notes: { ids: string[]; title: string; url: string }[] = [];
      const D = { notifyStaff: async (ids: string[], title: string, _b: string, url: string) => { notes.push({ ids, title, url }); return ids.length; } };
      const r1 = await runMeetingsSweep(now, D);
      const r2 = await runMeetingsSweep(now, D);
      assert.equal(r1.reminders, 1);
      assert.equal(r2.reminders, 0, "not sent twice");
      assert.deepEqual(notes[0].ids.sort(), [String(hostId), String(staffId)].sort(), "staff only, not guests");
      assert.match(notes[0].title, /Meeting in 5\d minutes|Meeting in 50 minutes/);
      assert.equal(notes[0].url, `/dealflow-ai/meetings/${c.meeting.roomId}/details`);
      const r3 = await runMeetingsSweep(new Date(now.getTime() + 41 * 60_000), D);
      assert.equal(r3.reminders, 1, "the 10-minute reminder");
      assert.equal((await getMeeting(c.meeting.roomId))!.remindersSent?.m10 !== undefined, true);
      // abandoned live meeting ends itself, then is summarised after the delay
      const l = await createMeetingFromInput({ title: "Forgotten", scheduledAt: at(10, now), durationMinutes: 30, timezone: tz, participants: [{ kind: "external", name: "Moe", email: "moe@x.test" }] }, host, deps, now);
      assert.ok(l.ok);
      if (!l.ok) return;
      await transitionMeeting(l.meeting.roomId, "live", SYSTEM_ACTOR);
      const far = new Date(now.getTime() + (10 + 30 + 100) * 60_000);
      const posted: string[] = [];
      const s1 = await runMeetingsSweep(far, { ...D, post: (async (id: string) => { posted.push(id); return { ran: true, summarized: false, timeline: 0 }; }) as never });
      assert.equal(s1.autoEnded >= 1, true);
      assert.equal((await getMeeting(l.meeting.roomId))!.status, "ended");
      const s2 = await runMeetingsSweep(new Date(far.getTime() + 3 * 60_000), { ...D, post: (async (id: string) => { posted.push(id); return { ran: true, summarized: false, timeline: 0 }; }) as never });
      assert.ok(s2.summarised >= 1 && posted.includes(l.meeting.roomId));
    });

    await t("screens: pasted guest lists, time zones, tabs", async () => {
      const g = parseGuestList("Asha Rao, asha@acme.com, +91 98765 43210, Acme\nRavi Kumar <ravi@beta.in>\nmeera@gamma.co\n\nJo\tjo@x.test\t\tZeta Ltd");
      assert.deepEqual(g.map((x) => [x.name, x.email, x.phone, x.company]), [["Asha Rao", "asha@acme.com", "+91 98765 43210", "Acme"], ["Ravi Kumar", "ravi@beta.in", "", ""], ["Meera", "meera@gamma.co", "", ""], ["Jo", "jo@x.test", "", "Zeta Ltd"]]);
      assert.equal(zonedToUtc("2026-12-01", "15:30", "Asia/Kolkata")?.toISOString(), "2026-12-01T10:00:00.000Z");
      assert.equal(zonedToUtc("2026-07-01", "09:00", "America/New_York")?.toISOString(), "2026-07-01T13:00:00.000Z", "daylight saving");
      assert.deepEqual(utcToZoned("2026-12-01T10:00:00.000Z", "Asia/Kolkata"), { date: "2026-12-01", time: "15:30" });
      assert.equal(zonedToUtc("nope", "15:30", "Asia/Kolkata"), null);
      const base = { scheduledAt: new Date(Date.now() + 3600_000).toISOString(), durationMinutes: 30 };
      assert.equal(bucketOf({ ...base, status: "scheduled" }), "upcoming");
      assert.equal(bucketOf({ ...base, status: "live" }), "live");
      assert.equal(bucketOf({ ...base, status: "cancelled" }), "past");
      assert.equal(bucketOf({ scheduledAt: new Date(Date.now() - 86400_000).toISOString(), durationMinutes: 30, status: "scheduled" }), "past", "a missed meeting is past");
    });

    await t("concurrency + audit: join and flag changes are recorded; audit is capped", async () => {
      const rid = (await listMeetings({ status: "live" }))[0]?.roomId ?? roomId;
      await markJoined(rid, (await getMeeting(rid))!.participants[0].id, { id: "u", name: "U" });
      assert.ok((await getMeeting(rid))!.audit!.some((a) => a.action === "join"));
      for (let i = 0; i < 4; i++) await mutateMeeting(rid, SYSTEM_ACTOR, () => ({ audit: Array.from({ length: 100 }, () => ({ action: "update" as const })) }));
      assert.equal((await getMeeting(rid))!.audit!.length, 300);
    });
  });
  console.log("meetings data: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
