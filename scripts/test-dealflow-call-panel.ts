import assert from "node:assert/strict";
import { getDb, getPlatformDb } from "../src/lib/mongodb";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { callsCollection, resetCallIndexes } from "../src/lib/products/agentos/calls/store";
import {
  canOpenCall, countActiveDealflowCalls, isVisibleDealflowCall, listActiveDealflowCalls, listCallPeople, listPersonCalls, loadCallPerson, loadPanelCallDetail, maskNumber, type PanelViewerCtx,
} from "../src/lib/dealflow-ai/call-panel";
import { CALLS_PAGE_SIZE, PEOPLE_PAGE_SIZE, filterTranscript, formatDuration, formatIst, formatTimer } from "../src/lib/dealflow-ai/call-panel-types";
import { buildThreadSummary, threadContextLine } from "../src/lib/products/agentos/chat-call";
import { CONTEXT_NOTES_MAX } from "../src/lib/products/agentos/calls/context";
import type { CallDoc } from "../src/lib/products/agentos/calls/types";
import type { AibotsViewer } from "../src/lib/products/agentos/viewer";

// Runs only against a throwaway database (MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_<n>). No call is placed; no provider is contacted.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };

const call = (over: Partial<CallDoc> & { _id: string }): CallDoc => ({
  idempotencyKey: `k-${over._id}`, direction: "outbound", agentId: "bot1", elevenAgentId: null, purpose: "lead_followup", target: null, phone: "+919876543210", phoneHash: null, phoneLast4: "3210", fromNumberId: null,
  initiatedBy: { userId: "u1", email: "u1@x.test" }, scheduledFor: null, anchorAt: new Date(), dialedAt: new Date(), endedAt: new Date(), status: "completed", attempts: 1, conversationId: null, callSid: null,
  context: {}, compliance: null, failure: null, collected: [], outcome: "success", summary: "Interested in a web app.", summaryTitle: null, transcript: null, durationSecs: 60, hasAudio: null,
  terminationReason: null, meteredAt: null, meterLeaseUntil: null, chatId: null, cancelledBy: null, control: { mode: "ai", handler: null, canHandBack: true, history: [] } as never, eventSeq: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
}) as CallDoc;
const tgt = (entityType: string, entityId: string, label: string) => ({ product: "dealflow-ai", entityType, entityId, label });
const viewer = (userId: string, roles: string[]): AibotsViewer => ({ userId, email: `${userId}@x.test`, roles, ctx: { roles, permissionOverrides: null }, seesAll: false });

(async () => {
  await t("pure helpers: IST time, timer, duration, transcript search, thread notes", async () => {
    assert.equal(formatIst("2026-03-12T10:35:00Z"), "12 Mar 2026, 4:05 pm IST");
    assert.equal(formatTimer(65), "1:05");
    assert.equal(formatTimer(3725), "1:02:05");
    assert.equal(formatDuration(125), "2 min 5 s");
    assert.equal(formatDuration(null), "-");
    const lines = [{ speaker: "Lead", text: "I need a Website" }, { speaker: "Asha AI", text: "Sure, what budget?" }];
    assert.equal(filterTranscript(lines, "website").length, 1);
    assert.equal(filterTranscript(lines, "asha").length, 1);
    assert.equal(filterTranscript(lines, "  ").length, 2);
    assert.equal(threadContextLine("whatsapp", "Asha"), "Continuing from a WhatsApp conversation with Asha.");
    assert.equal(threadContextLine("email", "A{b}"), "Continuing from a email conversation with Ab.");
    const long = Array.from({ length: 12 }, (_, i) => ({ mine: i % 2 === 0, text: `message ${i} ${"x".repeat(300)} {{inject}} <b>` }));
    const sum = buildThreadSummary("chat", "Asha", long);
    assert.ok(sum.startsWith("Recent messages: ") && !/[{}<>]/.test(sum));
    assert.ok(threadContextLine("chat", "Asha").length + 1 + sum.length <= CONTEXT_NOTES_MAX);
    assert.ok(sum.includes("Asha:") && sum.includes("Team:"));
    assert.equal(buildThreadSummary("chat", "Asha", []), "");
  });

  await t("masking never exposes the middle digits", async () => {
    assert.equal(maskNumber("+919876543210"), "+91••••••3210");
    assert.ok(!maskNumber("098765-43210").includes("98765"));
    assert.match(maskNumber("098765-43210"), /3210$/);
    assert.equal(maskNumber("n/a"), "");
    assert.equal(maskNumber(undefined), "");
  });

  await runAsCompany("co_a", async () => {
    const db = await getDb();
    assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
    await (await getPlatformDb()).dropDatabase();
    resetCallIndexes();
    const now = new Date();
    await (await getPlatformDb()).collection("companies").insertOne({ _id: "co_a", slug: "coa", name: "Co A", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now } as never);

    const leads = [
      { _id: "lead1", code: "LEAD-1", name: "Asha Rao", phone: "098765-43210", email: "asha@x.test", type: "client", doNotContact: false, deletedAt: null },
      { _id: "lead2", code: "LEAD-2", name: "Dev Patel", phone: "+91 91234 56789", email: "dev@x.test", type: "intern", doNotContact: true, deletedAt: null },
      { _id: "lead3", code: "LEAD-3", name: "No Phone", phone: "", email: "np@x.test", type: "client", doNotContact: false, deletedAt: null },
      { _id: "lead4", code: "LEAD-4", name: "Deleted Dan", phone: "+91 90000 00001", email: "dd@x.test", type: "client", doNotContact: false, deletedAt: now },
      { _id: "lead5", code: "LEAD-5", name: "Idle Ishaan", phone: "+91 90000 00005", email: "ii@x.test", type: "trainee", doNotContact: false, deletedAt: null },
    ];
    await db.collection("lead_records").insertMany(leads.map((l) => ({ ...l, source: "manual", status: "open", stage: "inquiry", createdAt: now })) as never[]);
    await db.collection("career_applications").insertOne({ _id: "app1", name: "Ravi Applicant", email: "r@x.test", phone: "+91 90000 00002", positionTitle: "Accountant", createdAt: now } as never);
    await db.collection("aibots_bots").insertOne({ _id: "bot1", name: "Priya", icon: "Bot", color: "indigo", kind: "voice", status: "active", deletedAt: null, voice: { dataFields: [{ key: "budget", label: "Budget range" }] } } as never).catch(() => {});

    const col = await callsCollection();
    const at = (min: number) => new Date(now.getTime() - min * 60_000);
    await col.insertMany([
      // Asha: three separate calls, one live
      call({ _id: "c1", target: tgt("lead", "lead1", "Asha Rao"), createdAt: at(300), collected: [{ key: "budget", label: "budget", value: "5 lakh" }], transcript: [{ role: "agent", text: "Hello Asha", atSecs: 0 }, { role: "user", text: "Hi", atSecs: 2 }] }),
      call({ _id: "c2", target: tgt("lead", "lead1", "Asha Rao"), createdAt: at(200), status: "no_answer", summary: null, outcome: null, durationSecs: null }),
      call({ _id: "c3", target: tgt("lead", "lead1", "Asha Rao"), createdAt: at(1), status: "in_progress", endedAt: null, summary: null, outcome: null, initiatedBy: { userId: "u2", email: "u2@x.test" }, testMode: true }),
      // Dev: one call by u2 (not u1)
      call({ _id: "c4", target: tgt("lead", "lead2", "Dev Patel"), createdAt: at(100), initiatedBy: { userId: "u2", email: "u2@x.test" }, purpose: "screening" }),
      // Applicant Ravi
      call({ _id: "c5", target: tgt("applicant", "app1", "Ravi Applicant"), createdAt: at(50), status: "dialing", endedAt: null, summary: null, outcome: null }),
      // Another product's call about a record with the same id, and a call without a target: never shown
      call({ _id: "x1", target: { product: "talentos", entityType: "lead", entityId: "lead1", label: "Other" }, createdAt: at(10) }),
      call({ _id: "x2", target: null, createdAt: at(10) }),
    ] as never[]);
    // c1's stored copy (DealFlow's result) and c4's
    await db.collection("dealflow_call_results").insertMany([
      { _id: "c4", entityType: "lead", entityId: "lead2", label: "Dev Patel", status: "completed", outcome: "success", purpose: "screening", agentId: "bot1", summary: "Stored summary for Dev.", collected: [{ key: "budget", label: "Budget range", value: "2 lakh" }], durationSecs: 60, endedAt: now, createdAt: now },
    ] as never[]);

    const lms = { roles: ["lms_admin"], permissionOverrides: null };
    const lmsNoCareers = { roles: ["lms_admin"], permissionOverrides: { "lms.canViewCareers": false } };
    const lmsNone = { roles: ["lms_admin"], permissionOverrides: { "lms.canViewLeads": false } };
    const owner: PanelViewerCtx = { lms, agentos: viewer("u1", ["aibots_user"]) };
    const manager: PanelViewerCtx = { lms, agentos: viewer("u9", ["aibots_manager"]) };
    const noAccount: PanelViewerCtx = { lms, agentos: null };

    await t("people: grouped per record with counts, last status and a live flag; other products and targetless calls are ignored", async () => {
      const r = await listCallPeople(owner, {});
      const by = new Map(r.people.map((p) => [p.entityId, p]));
      assert.equal(by.get("lead1")!.callCount, 3);
      assert.equal(by.get("lead1")!.lastStatus, "in_progress");
      assert.equal(by.get("lead1")!.activeCallId, "c3");
      assert.equal(by.get("lead2")!.callCount, 1);
      assert.equal(by.get("app1")!.activeCallId, "c5");
      assert.equal(by.get("app1")!.category, "jobs");
      assert.equal(by.get("lead2")!.category, "interns");
      // the callable-but-never-called lead is listed; no-phone and deleted are not
      assert.equal(by.get("lead5")!.callCount, 0);
      assert.equal(by.get("lead5")!.lastStatus, null);
      assert.ok(!by.has("lead3") && !by.has("lead4"));
      assert.equal(r.total, 4);
      // people with calls first, newest call first: lead1 (1 min ago), app1 (50), lead2 (100), then the idle lead
      assert.deepEqual(r.people.map((p) => p.entityId), ["lead1", "app1", "lead2", "lead5"]);
    });

    await t("people: numbers are masked in the list", async () => {
      const r = await listCallPeople(owner, {});
      const json = JSON.stringify(r);
      for (const raw of ["98765", "43210", "91234 56789", "90000 00002", "9000000002"]) assert.ok(!json.includes(raw), raw);
      assert.match(r.people.find((p) => p.entityId === "lead1")!.phoneMasked, /3210$/);
    });

    await t("people: Active now, category filters and search", async () => {
      assert.deepEqual((await listCallPeople(owner, { filter: "active" })).people.map((p) => p.entityId), ["lead1", "app1"]);
      assert.deepEqual((await listCallPeople(owner, { filter: "interns" })).people.map((p) => p.entityId), ["lead2"]);
      assert.deepEqual((await listCallPeople(owner, { filter: "trainees" })).people.map((p) => p.entityId), ["lead5"]);
      assert.deepEqual((await listCallPeople(owner, { filter: "jobs" })).people.map((p) => p.entityId), ["app1"]);
      assert.deepEqual((await listCallPeople(owner, { q: "dev" })).people.map((p) => p.entityId), ["lead2"]);
      assert.deepEqual((await listCallPeople(owner, { q: "LEAD-5" })).people.map((p) => p.entityId), ["lead5"]);
      assert.deepEqual((await listCallPeople(owner, { q: "9876543210" })).people.map((p) => p.entityId), ["lead1"]); // stored as 098765-43210
      assert.deepEqual((await listCallPeople(owner, { q: "nobody" })).people, []);
      assert.deepEqual((await listCallPeople(owner, { q: "(.*" })).people, []); // regex characters are literal
    });

    await t("people: paginated at 30 per page", async () => {
      await db.collection("lead_records").insertMany(Array.from({ length: 40 }, (_, i) => ({ _id: `bulk${String(i).padStart(2, "0")}`, code: `B-${i}`, name: `Bulk ${String(i).padStart(2, "0")}`, phone: `+91 80000 000${String(i).padStart(2, "0")}`, email: "", type: "client", source: "manual", status: "open", doNotContact: false, deletedAt: null, createdAt: now })) as never[]);
      const p1 = await listCallPeople(owner, {});
      const p2 = await listCallPeople(owner, { page: 2 });
      const p3 = await listCallPeople(owner, { page: 3 });
      assert.equal(PEOPLE_PAGE_SIZE, 30);
      assert.equal(p1.total, 44);
      assert.equal(p1.people.length, 30);
      assert.equal(p2.people.length, 14);
      assert.equal(p3.people.length, 0);
      const ids = [...p1.people, ...p2.people].map((p) => p.key);
      assert.equal(new Set(ids).size, 44); // no duplicates across pages
      await db.collection("lead_records").deleteMany({ _id: { $regex: "^bulk" } } as never);
    });

    await t("permissions: no VIEW_LEADS sees nothing; applicants need VIEW_CAREERS", async () => {
      const none: PanelViewerCtx = { lms: lmsNone, agentos: owner.agentos };
      assert.deepEqual(await listCallPeople(none, {}), { people: [], total: 0, page: 1, pageSize: 30 });
      assert.deepEqual((await listPersonCalls(none, "lead", "lead1")).calls, []);
      assert.deepEqual(await listActiveDealflowCalls(none), []);
      assert.equal(await countActiveDealflowCalls(none), 0);
      assert.equal(await loadPanelCallDetail(none, "c1"), null);
      assert.equal(await loadCallPerson(none, "lead", "lead1"), null);
      const noCareers: PanelViewerCtx = { lms: lmsNoCareers, agentos: owner.agentos };
      assert.ok(!(await listCallPeople(noCareers, {})).people.some((p) => p.entityType === "applicant"));
      assert.deepEqual((await listPersonCalls(noCareers, "applicant", "app1")).calls, []);
      assert.equal(await loadCallPerson(noCareers, "applicant", "app1"), null);
      assert.equal((await listActiveDealflowCalls(noCareers)).some((c) => c.id === "c5"), false);
      assert.equal(await countActiveDealflowCalls(noCareers), 1);
      assert.equal(await isVisibleDealflowCall(noCareers, "c5"), false);
      assert.equal(await isVisibleDealflowCall(noCareers, "c3"), true);
      assert.equal(await isVisibleDealflowCall(owner, "x1"), false); // another product's call
      assert.equal(await isVisibleDealflowCall(owner, "x2"), false);
      assert.equal(await isVisibleDealflowCall(owner, "missing"), false);
    });

    await t("calls: each call is its own card, newest first, never merged", async () => {
      const r = await listPersonCalls(owner, "lead", "lead1");
      assert.deepEqual(r.calls.map((c) => c.id), ["c3", "c2", "c1"]);
      assert.equal(r.total, 3);
      assert.equal(r.calls[0].live, true);
      assert.equal(r.calls[0].testMode, true);
      assert.equal(r.calls[1].status, "no_answer");
      assert.equal(r.calls[2].summary, "Interested in a web app.");
      assert.deepEqual(r.calls[2].collected, [{ key: "budget", label: "Budget range", value: "5 lakh" }]);
      assert.equal(r.calls[2].agent.name, "Priya");
      assert.equal(r.calls[2].purposeLabel.length > 0, true);
      // another product's call with the same entity id is not mixed in; the same-id different type isn't either
      assert.ok(!r.calls.some((c) => c.id === "x1"));
      assert.equal((await listPersonCalls(owner, "applicant", "lead1")).calls.length, 0);
      assert.ok(r.calls.every((c) => !JSON.stringify(c).includes("9876543210")));
    });

    await t("calls: 20 per page", async () => {
      await col.insertMany(Array.from({ length: 25 }, (_, i) => call({ _id: `p${i}`, target: tgt("lead", "lead5", "Idle Ishaan"), createdAt: at(1000 + i) })) as never[]);
      const p1 = await listPersonCalls(owner, "lead", "lead5", 1);
      const p2 = await listPersonCalls(owner, "lead", "lead5", 2);
      assert.equal(CALLS_PAGE_SIZE, 20);
      assert.equal(p1.calls.length, 20);
      assert.equal(p2.calls.length, 5);
      assert.equal(p1.total, 25);
      assert.equal(new Set([...p1.calls, ...p2.calls].map((c) => c.id)).size, 25);
      await col.deleteMany({ _id: { $regex: "^p\\d" } } as never);
    });

    await t("access: the caller and managers open calls fully; others and people without AgentOS get the stored result only", async () => {
      assert.equal(canOpenCall(owner.agentos, { initiatedBy: { userId: "u1", email: "" } }), true);
      assert.equal(canOpenCall(owner.agentos, { initiatedBy: { userId: "u2", email: "" } }), false);
      assert.equal(canOpenCall(manager.agentos, { initiatedBy: { userId: "u2", email: "" } }), true);
      assert.equal(canOpenCall(null, { initiatedBy: { userId: "u1", email: "" } }), false);

      const asOwner = (await listPersonCalls(owner, "lead", "lead2")).calls[0]; // placed by u2, u1 is not a manager
      assert.equal(asOwner.access, "not_visible");
      assert.equal(asOwner.summary, "Stored summary for Dev.");
      assert.deepEqual(asOwner.collected, [{ key: "budget", label: "Budget range", value: "2 lakh" }]);
      assert.equal(asOwner.calledBy, null);
      assert.equal((await listPersonCalls(manager, "lead", "lead2")).calls[0].access, "full");
      const anon = (await listPersonCalls(noAccount, "lead", "lead2")).calls[0];
      assert.equal(anon.access, "no_account");
      assert.equal(anon.summary, "Stored summary for Dev.");
      assert.equal(anon.agent.avatarUrl, null);
      // a call with no stored result shows no summary to someone who cannot open it
      const c1 = (await listPersonCalls(noAccount, "lead", "lead1")).calls.find((c) => c.id === "c1")!;
      assert.equal(c1.summary, null);
      assert.deepEqual(c1.collected, []);
      assert.equal(c1.status, "completed");
    });

    await t("detail: transcript and recording only through AgentOS access; plain note otherwise", async () => {
      const d = await loadPanelCallDetail(owner, "c1");
      assert.ok(d && d.access === "full");
      assert.deepEqual(d!.transcript?.map((l) => [l.speaker, l.kind, l.text]), [["Priya", "ai", "Hello Asha"], ["Lead", "lead", "Hi"]]);
      assert.equal(d!.accessNote, null);
      const stranger = await loadPanelCallDetail(owner, "c4");
      assert.equal(stranger!.access, "not_visible");
      assert.equal(stranger!.transcript, null);
      assert.equal(stranger!.recording.url, null);
      assert.match(stranger!.accessNote!, /another team member/);
      assert.equal(stranger!.call.summary, "Stored summary for Dev.");
      const anon = await loadPanelCallDetail(noAccount, "c4");
      assert.equal(anon!.access, "no_account");
      assert.match(anon!.accessNote!, /AgentOS account/);
      assert.equal(anon!.transcript, null);
      assert.equal((await loadPanelCallDetail(manager, "c4"))!.access, "full");
      assert.equal(await loadPanelCallDetail(owner, "x1"), null);
      assert.equal(await loadPanelCallDetail(owner, "nope"), null);
    });

    await t("active calls: only dialing / in progress DealFlow calls, with end / live rights decided by AgentOS roles", async () => {
      const mineOrAll = await listActiveDealflowCalls(owner);
      assert.deepEqual(mineOrAll.map((c) => c.id).sort(), ["c3", "c5"]);
      const c3 = mineOrAll.find((c) => c.id === "c3")!;
      assert.equal(c3.personName, "Asha Rao");
      assert.equal(c3.agentName, "Priya");
      assert.equal(c3.testMode, true);
      assert.equal(c3.canEnd, false); // u2 placed it; u1 has no take-over / manage rights
      assert.equal(c3.canLive, false);
      const m = await listActiveDealflowCalls(manager);
      assert.equal(m.find((c) => c.id === "c3")!.canEnd, true);
      assert.equal(m.find((c) => c.id === "c3")!.canLive, true);
      assert.equal(m.find((c) => c.id === "c5")!.canLive, false); // still ringing: no live view yet
      assert.equal(m.find((c) => c.id === "c5")!.canEnd, true);
      const anon = await listActiveDealflowCalls(noAccount);
      assert.ok(anon.every((c) => !c.canEnd && !c.canLive));
      assert.equal(await countActiveDealflowCalls(owner), 2);
      await col.updateOne({ _id: "c3" }, { $set: { status: "completed" } });
      assert.equal(await countActiveDealflowCalls(owner), 1);
      await col.updateOne({ _id: "c3" }, { $set: { status: "in_progress" } });
    });

    await t("person: call spec carries target and context, explains do-not-contact and missing numbers", async () => {
      const a = await loadCallPerson(owner, "lead", "lead1");
      assert.equal(a!.callSpec.unavailable, null);
      assert.deepEqual(a!.callSpec.target, { product: "dealflow-ai", entityType: "lead", entityId: "lead1", label: "Asha Rao" });
      assert.ok(!JSON.stringify(a).includes("asha@x.test"));
      assert.match((await loadCallPerson(owner, "lead", "lead2"))!.callSpec.unavailable ?? "", /do not contact/i);
      assert.match((await loadCallPerson(owner, "lead", "lead3"))!.callSpec.unavailable ?? "", /no phone/i);
      assert.equal(await loadCallPerson(owner, "lead", "lead4"), null); // deleted
      assert.equal((await loadCallPerson(owner, "applicant", "app1"))!.callSpec.defaultPurpose, "screening");
      assert.equal(await loadCallPerson(owner, "bogus", "x"), null);
    });
  });
  await (await getPlatformDb()).dropDatabase();
  console.log("dealflow call panel: all checks passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
