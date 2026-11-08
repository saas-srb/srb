// Messenger (Team Chat) — direct conversations + messages, project & group channels, announcements, meetings, shared files.
// The base seeder's DM / announcement docs used a different shape (they crash /huddle-ai/dm and never appeared in the announcements hub).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { rint, pick, chance, weighted, shuffle, ago, fromNow, audit, insertAll } from "./lib.mjs";

const LINES = [
  "Morning! Did you get a chance to review the latest build?", "Yes — a couple of small comments, will drop them in the thread.", "Can we push the client demo to Thursday?", "Works for me. I'll update the invite.",
  "Deployment finished, all checks are green ✅", "Great work team!", "Reminder: sprint review at 4 PM today.", "I'll share the updated estimates by EOD.", "Can someone pick up the API timeout bug?", "On it — will raise a PR shortly.",
  "Invoice for the last milestone has been sent to the client.", "Thanks, noted. Following up on the payment.", "New batch onboarding starts Monday.", "Docs updated in the shared drive.", "Let's sync on the hiring plan after lunch.",
];

export async function seedMessenger(db, pms) {
  const wipe = (name) => db.collection(name).deleteMany({ _id: /^demo-/ });
  // legacy-shaped docs from the base seeder
  await db.collection("direct_conversations").deleteMany({ readSeqByUser: { $exists: false }, _id: { $not: /^demo-/ } });
  await db.collection("direct_messages").deleteMany({ seq: { $exists: false }, _id: { $not: /^demo-/ } });
  await db.collection("messenger_announcements").deleteMany({});

  const users = await db.collection("chat_users").find({ deletedAt: null }).project({ _id: 1, displayName: 1 }).limit(60).toArray();
  if (users.length < 4) {
    console.log("  ⚠ Messenger: no chat users found. Skipped.");
    return;
  }
  const adminUser = await db.collection("chat_users").findOne({ email: "admin@example.com" }, { projection: { _id: 1, displayName: 1 } });
  if (adminUser && !users.some((u) => String(u._id) === String(adminUser._id))) users.unshift(adminUser);
  const ids = [...(adminUser ? [String(adminUser._id)] : []), ...users.map((u) => String(u._id)).filter((x) => !adminUser || x !== String(adminUser._id))];
  const nameOf = new Map(users.map((u) => [String(u._id), u.displayName ?? "Team member"]));

  const channels = [];
  const members = [];
  const messages = [];
  const conversations = [];
  const dms = [];
  const files = [];
  const announcements = [];
  const meetings = [];
  const participants = [];
  let mid = 0;

  const filesDir = path.join(process.cwd(), "uploads", "messenger-files");
  await mkdir(filesDir, { recursive: true });

  const addChannel = async (id, kind, name, desc, memberIdsIn, extra = {}) => {
    const memberIds = [ids[0], ...memberIdsIn.filter((x) => x !== ids[0])]; // the super admin is in every channel so the demo login always sees content
    const created = ago(rint(20, 120));
    const n = rint(14, 32);
    let last = created;
    const ch = { _id: id, kind, slug: `demo-${id.slice(5)}`, name, description: desc, topic: null, avatarUrl: null, visibility: kind === "team" ? "public" : "private", projectId: null, pinnedMessageIds: [], archivedAt: null, lastActivityAt: created, lastMessagePreview: null, ...audit(created), ...extra };
    for (let i = 0; i < n; i++) {
      const at = new Date(created.getTime() + ((Date.now() - created.getTime()) * (i + 1)) / (n + 1));
      const m = { _id: `demo-cm-${++mid}`, seq: i + 1, channelId: id, authorId: pick(memberIds), body: pick(LINES), attachments: [], mentions: [], parentId: null, forwardedFrom: null, callMeta: null, editedAt: null, deletedAt: null, createdAt: at, updatedAt: at };
      messages.push(m);
      last = at;
      ch.lastMessagePreview = m.body;
    }
    ch.lastActivityAt = last;
    channels.push(ch);
    memberIds.forEach((uid, k) => members.push({ _id: `demo-mem-${id.slice(5)}-${k}`, channelId: id, userId: uid, role: k === 0 ? "owner" : "member", joinedAt: created, lastReadSeq: rint(Math.max(0, n - 6), n), mutedUntil: null, notificationPref: "all", ...audit(created) }));
    // a couple of shared files per channel
    for (const [nm, body] of [["Requirements-v2.txt", "Requirements draft — demo file."], ["Sprint-notes.txt", "Sprint notes — demo file."]].slice(0, rint(1, 2))) {
      const key = `demo-file-${files.length + 1}.txt`;
      await writeFile(path.join(filesDir, key), `${body}\n`);
      files.push({ _id: `demo-file-${files.length + 1}`, name: nm, contentType: "text/plain", size: body.length + 1, storageKey: key, kind: "file", scopeType: "channel", scopeId: id, messageId: messages[messages.length - 1]._id, uploadedBy: pick(memberIds), category: "Documents", createdAt: ago(rint(1, 30)), deletedAt: null });
    }
  };

  // project channels — one per PMS project (first 8)
  for (const [i, p] of pms.projects.slice(0, 8).entries()) await addChannel(`demo-chan-proj-${i + 1}`, "project", `${p.projectCode.toLowerCase()} · ${p.name}`, `Delivery channel for ${p.name}`, shuffle(ids).slice(0, rint(4, 8)), { projectId: p._id });
  // group channels
  for (const [i, [name, desc]] of [["Design Guild", "UX and design reviews"], ["Hiring Product", "Interview coordination"], ["Release Managers", "Release readiness and go/no-go"], ["Customer Success", "Client health and escalations"]].entries()) await addChannel(`demo-chan-grp-${i + 1}`, "group", name, desc, shuffle(ids).slice(0, rint(4, 7)));
  // team channels
  for (const [i, [name, desc]] of [["engineering", "Engineering discussions"], ["announcements-discuss", "Chat about company announcements"], ["random", "Water-cooler talk"]].entries()) await addChannel(`demo-chan-team-${i + 1}`, "team", name, desc, shuffle(ids).slice(0, rint(8, 16)));

  // direct conversations
  const seenPairs = new Set();
  for (let i = 0; i < 44; i++) {
    const [a, b] = (i < 12 ? [ids[0], pick(ids.slice(1))] : shuffle(ids).slice(0, 2)).sort();
    if (seenPairs.has(a + b)) continue;
    seenPairs.add(a + b);
    const id = `demo-dm-${conversations.length + 1}`;
    const n = rint(4, 14);
    const start = ago(rint(5, 60));
    let lastAt = start;
    let preview = null;
    let lastAuthor = null;
    for (let k = 0; k < n; k++) {
      const at = new Date(start.getTime() + ((Date.now() - start.getTime()) * (k + 1)) / (n + 1));
      const author = chance(0.5) ? a : b;
      const body = pick(LINES);
      dms.push({ _id: `demo-dmsg-${dms.length + 1}`, seq: k + 1, conversationId: id, authorId: author, body, attachments: [], mentions: [], parentId: null, forwardedFrom: null, callMeta: null, editedAt: null, deletedAt: null, createdAt: at, updatedAt: at });
      lastAt = at; preview = body; lastAuthor = author;
    }
    conversations.push({ _id: id, participantIds: [a, b], createdAt: start, lastMessageAt: lastAt, lastMessagePreview: preview, lastMessageAuthorId: lastAuthor, readSeqByUser: { [a]: n, [b]: rint(Math.max(0, n - 3), n) } });
  }

  // announcements
  const ANN = [["Q4 goals & OKRs are live", "important"], ["Diwali holiday schedule", "normal"], ["Security reminder: enable 2FA", "critical"], ["New hires joining next week", "normal"], ["Office maintenance this Saturday", "normal"], ["Client Acme Labs go-live — all hands", "important"], ["Quarterly town hall on Friday", "normal"], ["Updated leave policy", "important"]];
  ANN.forEach(([title, priority], i) => announcements.push({ _id: `demo-ann-${i + 1}`, title, body: `${title}. Please read the details and reach out to HR or your manager with any questions.`, priority, attachments: [], audience: { kind: "everyone" }, authorId: ids[0], status: "published", scheduledFor: null, publishedAt: ago(rint(1, 40)), requireConfirmation: priority === "critical", crossPost: false, recipientCount: ids.length, ...audit(ago(rint(1, 40))) }));

  // meetings
  const MEET = [["Sprint planning", -2], ["Client demo — Acme Labs", 1], ["Design review", 2], ["Hiring sync", 3], ["Weekly all-hands", -7], ["Retro", -5], ["Architecture deep-dive", 5], ["Training batch kickoff", 6], ["Finance close review", -3], ["Product roadmap", 8]];
  MEET.forEach(([title, dayOffset], i) => {
    const past = dayOffset < 0;
    const start = fromNow(dayOffset, rint(10, 17));
    const host = pick(ids);
    meetings.push({ _id: `demo-meet-${i + 1}`, title, description: null, hostId: host, kind: "scheduled", startAt: start, durationMins: pick([30, 45, 60]), status: past ? "ended" : "scheduled", channelId: null, joinCode: `DEMO${1000 + i}`, recordingEnabled: chance(0.3), screenShareEnabled: true, transport: "local", roomId: `demo-room-${i + 1}`, reminderSentAt: null, endedAt: past ? new Date(start.getTime() + 3600000) : null, ...audit(ago(Math.abs(dayOffset) + 3)) });
    [ids[0], ...shuffle(ids).slice(0, rint(4, 9))].concat(host).filter((v, k, a) => a.indexOf(v) === k).forEach((uid, k) => participants.push({ _id: `demo-mp-${i + 1}-${k}`, meetingId: `demo-meet-${i + 1}`, userId: uid, role: uid === host ? "host" : "attendee", rsvp: past ? "yes" : pick(["yes", "yes", "maybe", null]), invitedAt: ago(Math.abs(dayOffset) + 3), joinedAt: past ? new Date(start.getTime() + rint(0, 5) * 60000) : null, leftAt: null }));
  });

  for (const c of ["chat_channels", "channel_members", "channel_messages", "direct_conversations", "direct_messages", "chat_shared_files", "chat_announcements", "chat_meetings", "meeting_participants"]) await wipe(c);
  await insertAll(db.collection("chat_channels"), channels);
  await insertAll(db.collection("channel_members"), members);
  await insertAll(db.collection("channel_messages"), messages);
  await insertAll(db.collection("direct_conversations"), conversations);
  await insertAll(db.collection("direct_messages"), dms);
  await insertAll(db.collection("chat_shared_files"), files);
  await insertAll(db.collection("chat_announcements"), announcements);
  await insertAll(db.collection("chat_meetings"), meetings);
  await insertAll(db.collection("meeting_participants"), participants);
  const counters = db.collection("chat_counters");
  for (const c of channels) await counters.updateOne({ _id: `channel:${c._id}` }, { $set: { seq: messages.filter((m) => m.channelId === c._id).length } }, { upsert: true });
  for (const c of conversations) await counters.updateOne({ _id: `dm:${c._id}` }, { $set: { seq: dms.filter((m) => m.conversationId === c._id).length } }, { upsert: true });
  void nameOf;
  console.log(`  ✓ Messenger: ${channels.length} channels (project/group/team), ${messages.length} channel messages, ${conversations.length} DMs / ${dms.length} DM messages, ${files.length} shared files, ${announcements.length} announcements, ${meetings.length} meetings`);
}
