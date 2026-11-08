// AI Bots demo data: four logins (admin / manager / user / limited user), a starter set of bots (as DATA — the app renders
// every one through the same pages), chats with their usage ledger, and an activity log.
//
// With an OpenAI client (OPENAI_API_KEY set) it also creates the OpenAI side exactly like the app does:
//   • one vector store per bot, with that bot's demo knowledge documents uploaded and attached;
//   • one OpenAI Conversation per chat, pre-filled with the chat's messages (transcripts live in OpenAI, never in Mongo).
// Without a client, chats are seeded as metadata only (the app starts a fresh Conversation on their next message) and bots
// have no knowledge files.
//
// Idempotent: every row it creates has a `demo-aibots-` id and is replaced on each run; the OpenAI objects created by the
// previous run (vector stores, files, conversations) are deleted first.
import { ObjectId } from "mongodb";
import { toFile } from "openai";
import { hashPassword } from "./lib.mjs";
import { KNOWLEDGE, CHATS, EXTRA_RUN_PATTERN } from "./aibots-content.mjs";

const PASSWORD = "Demo@12345";
const D = "demo-aibots-";
const GENERAL = "general"; // reserved botId of "Start New Chat" (GENERAL_BOT_ID in the app)
const MODEL = "gpt-4.1-mini";
const PRICE = { input: 0.4, output: 1.6 }; // USD per 1M tokens — matches the default price table in the app
const DAY = 86400000;
const NOW = Date.now();

export const AIBOTS_DEMO_ACCOUNTS = [
  { email: "demo.aibots.admin@example.com", label: "AI Bots Admin (everything)", roles: ["aibots_admin"] },
  { email: "demo.aibots.manager@example.com", label: "AI Bots Manager (build bots, review chats)", roles: ["aibots_manager"] },
  { email: "demo.aibots.user@example.com", label: "AI Bots User (sales — sees sales bots)", roles: ["aibots_user", "lms_agent"] },
  { email: "demo.aibots.limited@example.com", label: "AI Bots User (only open bots)", roles: ["aibots_user"] },
];

const BOTS = [
  {
    key: "discovery", name: "Discovery Call AI", icon: "phone", color: "sky", category: "Pre-sales",
    description: "Prepares discovery-call agendas and questions, then turns call notes into a structured summary.",
    instructions: "You are Discovery Call AI for Demo Company. Help the sales team prepare for and follow up on client discovery calls.\n- Before a call: produce an agenda and 10–15 probing questions tailored to the client's industry, drawing on the discovery question bank.\n- After a call: turn raw notes into Summary, Pain points, Goals, Budget/Timeline signals, Risks and Next steps.\n- Ask for missing context (client, industry, call goal) before guessing.",
    starterPrompts: ["Prepare a discovery call for a mid-size logistics company", "Summarise these call notes into next steps"],
  },
  {
    key: "meeting", name: "Meeting Assistant AI", icon: "calendar", color: "violet", category: "Delivery",
    description: "Turns meeting notes or transcripts into minutes, decisions and action items with owners.",
    instructions: "You are Meeting Assistant AI. Convert meeting notes or transcripts into minutes using the house style in your knowledge base: Attendees, Key discussion points, Decisions, Action items (owner, due date), Open questions. Be concise and never invent owners or dates — mark them TBD.",
    starterPrompts: ["Write minutes from these notes", "List action items with owners"],
  },
  {
    key: "proposal", name: "ProposalGPT", icon: "file-text", color: "indigo", category: "Sales", allowAttachments: true,
    description: "Drafts client proposals from Demo Company's company profile, services, case studies and pricing.",
    instructions: "You are ProposalGPT, Demo Company's proposal writer. Use the knowledge base (company profile, services, case studies, pricing) as the source of truth.\nStructure: Executive summary, Understanding of requirements, Proposed solution, Approach & timeline, Team, Commercials, Why Demo Company.\nNever invent prices or case studies that aren't in the knowledge base — say what is missing.",
    starterPrompts: ["Draft a proposal for a healthcare appointment app", "Which case studies fit a fintech client?"],
    access: { mode: "restricted", roles: ["lms_agent", "lms_manager"], userIds: [] },
  },
  {
    key: "requirements", name: "Requirement Analyzer AI", icon: "search", color: "emerald", category: "Business Analysis", allowAttachments: true,
    description: "Reviews requirements for gaps, ambiguity and conflicts against BRD templates, guidelines and business rules.",
    instructions: "You are Requirement Analyzer AI. Review the requirements the user provides against the templates, guidelines and business rules in your knowledge base. Report: Ambiguities, Missing requirements, Conflicts, Non-functional gaps, and Clarifying questions — each with a short rationale and a suggested rewrite.",
    starterPrompts: ["Review these requirements for gaps", "What questions should I ask the client?"],
  },
  {
    key: "brd", name: "BRD Generator AI", icon: "clipboard", color: "amber", category: "Business Analysis",
    description: "Generates a Business Requirements Document from discovery notes using the standard BRD template.",
    instructions: "You are BRD Generator AI. Produce a Business Requirements Document following the BRD template in your knowledge base: Background, Objectives, Scope (in/out), Stakeholders, numbered Business requirements with priority and acceptance criteria, Business rules, Assumptions, Constraints, Success metrics.",
    starterPrompts: ["Create a BRD from these discovery notes"],
  },
  {
    key: "sow", name: "SOW Generator AI", icon: "scale", color: "rose", category: "Sales", status: "inactive",
    description: "Drafts statements of work — scope, deliverables, milestones and acceptance criteria. (Inactive demo bot.)",
    instructions: "You are SOW Generator AI. Draft a Statement of Work following the SOW template in your knowledge base: Scope, Deliverables, Milestones, Acceptance criteria, Assumptions, Change control, Commercial terms.",
    starterPrompts: [],
  },
];

const botId = (key) => (key === GENERAL ? GENERAL : `${D}${key}`);
/** A time `days` ago, `minutes` earlier still — always in the past. */
const at = (days, minutes = 0) => new Date(NOW - days * DAY - minutes * 60000);
const tokens = (text) => Math.max(1, Math.round(text.length / 4));
const cost = (inT, outT) => (inT * PRICE.input + outT * PRICE.output) / 1_000_000;

/** Filter for this seeder's rows. Matched by id list, not a regex: keyed collections store `<companyId>::<id>`, which an `^id` regex cannot match. */
async function demoRows(db, collection) {
  const ids = (await db.collection(collection).find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id).filter((id) => String(id).startsWith(D));
  return { _id: { $in: ids } };
}

/** Deletes the OpenAI objects the previous run created. Best-effort — they may already be gone. */
async function cleanupOpenAI(db, openai) {
  const bots = await db.collection("aibots_bots").find(await demoRows(db, "aibots_bots"), { projection: { vectorStoreId: 1 } }).toArray();
  const files = await db.collection("aibots_files").find(await demoRows(db, "aibots_files"), { projection: { openaiFileId: 1 } }).toArray();
  const chats = await db.collection("aibots_chats").find(await demoRows(db, "aibots_chats"), { projection: { conversationId: 1 } }).toArray();
  let n = 0;
  const drop = (p) => p.then(() => n++).catch(() => {});
  await Promise.all([
    ...files.filter((f) => f.openaiFileId).map((f) => drop(openai.files.delete(f.openaiFileId))),
    ...bots.filter((b) => b.vectorStoreId).map((b) => drop(openai.vectorStores.delete(b.vectorStoreId))),
    ...chats.filter((c) => c.conversationId).map((c) => drop(openai.conversations.delete(c.conversationId))),
  ]);
  return n;
}

/**
 * @param {import("mongodb").Db} db
 * @param {{ openai?: import("openai").default | null, log?: (msg: string) => void }} [opts]
 */
export async function seedAibots(db, { openai = null, log = () => {} } = {}) {
  const passwordHash = hashPassword(PASSWORD);

  // ── Logins ────────────────────────────────────────────────────────────
  const users = {};
  const emails = {};
  for (const a of AIBOTS_DEMO_ACCOUNTS) {
    const local = a.email.split("@")[0].replace("demo.aibots.", "");
    const userId = (await db.collection("admin_users").findOne({ email: a.email }, { projection: { _id: 1 } }))?._id ?? new ObjectId();
    await db.collection("admin_users").updateOne(
      { email: a.email },
      { $set: { email: a.email, passwordHash, roles: a.roles, permissionOverrides: {}, userType: "employee", employeeId: null, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null }, $setOnInsert: { _id: userId, createdAt: new Date() } },
      { upsert: true }
    );
    users[local] = userId.toString();
    emails[local] = a.email;
  }

  // ── Reset previous demo rows (and their OpenAI objects) ──────────────
  const cleaned = openai ? await cleanupOpenAI(db, openai) : 0;
  if (cleaned) log(`   removed ${cleaned} OpenAI object(s) from the previous run`);
  for (const c of ["aibots_bots", "aibots_files", "aibots_chats", "aibots_runs", "aibots_activity_logs"]) await db.collection(c).deleteMany(await demoRows(db, c));

  // Settings are admin-owned: only create the defaults when none exist yet.
  await db.collection("aibots_settings").updateOne(
    { _id: "main" },
    { $setOnInsert: { models: [{ id: "gpt-4.1-mini", label: "GPT-4.1 mini", input: 0.4, output: 1.6 }, { id: "gpt-4.1", label: "GPT-4.1", input: 2, output: 8 }, { id: "gpt-4.1-nano", label: "GPT-4.1 nano", input: 0.1, output: 0.4 }, { id: "gpt-4o-mini", label: "GPT-4o mini", input: 0.15, output: 0.6 }, { id: "gpt-4o", label: "GPT-4o", input: 2.5, output: 10 }, { id: "o4-mini", label: "o4-mini (reasoning)", input: 1.1, output: 4.4 }], defaultModel: MODEL, maxOutputTokens: 4000, dailyMessageLimit: 200, updatedAt: at(40), updatedBy: users.admin } },
    { upsert: true }
  );

  // ── Bots ──────────────────────────────────────────────────────────────
  const created = at(35);
  const bots = BOTS.map((b) => ({
    _id: botId(b.key),
    name: b.name,
    icon: b.icon,
    color: b.color,
    description: b.description,
    category: b.category,
    instructions: b.instructions,
    model: MODEL,
    temperature: 0.4,
    allowAttachments: b.allowAttachments ?? false,
    starterPrompts: b.starterPrompts,
    access: b.access ?? { mode: "all", roles: [], userIds: [] },
    status: b.status ?? "active",
    vectorStoreId: null,
    createdAt: created,
    updatedAt: created,
    createdBy: users.manager,
    updatedBy: users.manager,
    deletedAt: null,
  }));
  await db.collection("aibots_bots").insertMany(bots);

  const audit = [];
  let a = 0;
  const addAudit = (e) => audit.push({ _id: `${D}log-${++a}`, actorEmail: null, entityLabel: null, botId: null, summary: null, metadata: null, ...e });
  for (const b of bots) addAudit({ actorId: users.manager, actorEmail: emails.manager, action: "create", entity: "bot", entityId: b._id, entityLabel: b.name, botId: b._id, summary: `${b.model} · ${b.access.mode === "all" ? "all users" : "restricted"}`, createdAt: b.createdAt });
  addAudit({ actorId: users.admin, actorEmail: emails.admin, action: "deactivate", entity: "bot", entityId: botId("sow"), entityLabel: "SOW Generator AI", botId: botId("sow"), createdAt: at(21) });

  // ── Knowledge bases (OpenAI only) ─────────────────────────────────────
  const fileRows = [];
  if (openai) {
    let f = 0;
    for (const b of BOTS) {
      const docs = KNOWLEDGE[b.key] ?? [];
      if (docs.length === 0) continue;
      const id = botId(b.key);
      const store = await openai.vectorStores.create({ name: `Demo Company AI Bot · ${b.name}`.slice(0, 120), metadata: { app: "demo-aibots", bot_id: id, demo: "true" } });
      await db.collection("aibots_bots").updateOne({ _id: id }, { $set: { vectorStoreId: store.id } });
      for (const doc of docs) {
        const _id = `${D}file-${++f}`;
        const uploaded = await openai.files.create({ file: await toFile(Buffer.from(doc.body, "utf-8"), doc.filename, { type: "text/markdown" }), purpose: "assistants" });
        const vsFile = await openai.vectorStores.files.create(store.id, { file_id: uploaded.id, attributes: { source: "aibots", bot_id: id, doc_id: _id, title: doc.title, category: doc.category } });
        const when = at(34, f * 7);
        fileRows.push({
          _id, botId: id, title: doc.title, description: doc.description, category: doc.category, filename: doc.filename, extension: "md",
          size: Buffer.byteLength(doc.body), converted: false,
          // The app polls OpenAI for the final status when the knowledge page or a chat loads.
          status: vsFile.status === "completed" ? "ready" : vsFile.status === "in_progress" ? "processing" : "failed",
          enabled: true, openaiFileId: uploaded.id, vectorStoreFileId: vsFile.id, usageBytes: null, lastError: null, version: 1,
          createdAt: when, updatedAt: when, createdBy: users.manager, updatedBy: users.manager, deletedAt: null,
        });
        addAudit({ actorId: users.manager, actorEmail: emails.manager, action: "upload", entity: "file", entityId: _id, entityLabel: doc.title, botId: id, summary: `${b.name}: ${doc.filename}`, createdAt: when });
      }
    }
    if (fileRows.length) await db.collection("aibots_files").insertMany(fileRows);
  }

  // ── Chats + usage ledger ──────────────────────────────────────────────
  const chats = [];
  const runs = [];
  let r = 0;
  let c = 0;
  let transcripts = 0;
  for (const chat of CHATS) {
    const _id = `${D}chat-${++c}`;
    const id = botId(chat.bot);
    const start = at(chat.days, 60 + chat.turns.length * 6);
    let conversationId = null;
    if (openai) {
      const items = chat.turns.flatMap(([q, ans]) => [
        { type: "message", role: "user", content: q },
        { type: "message", role: "assistant", content: ans },
      ]);
      const conv = await openai.conversations.create({ items: items.slice(0, 20), metadata: { app: "demo-aibots", bot_id: id, user_id: users[chat.user], demo: "true" } });
      conversationId = conv.id;
      transcripts++;
    }
    let history = 0;
    chat.turns.forEach(([q, ans], i) => {
      const when = new Date(start.getTime() + i * 6 * 60000);
      const inT = 900 + history + tokens(q) + (chat.bot === GENERAL ? 0 : 1500); // knowledge-grounded bots pull file_search chunks
      const outT = tokens(ans);
      history += tokens(q) + outT;
      runs.push({ _id: `${D}run-${++r}`, chatId: _id, botId: id, userId: users[chat.user], model: MODEL, responseId: null, status: "completed", regenerate: false, inputTokens: inT, outputTokens: outT, costUsd: cost(inT, outT), durationMs: 1800 + outT * 12, error: null, createdAt: when });
    });
    const last = new Date(start.getTime() + (chat.turns.length - 1) * 6 * 60000 + 30000);
    chats.push({ _id, botId: id, userId: users[chat.user], userEmail: emails[chat.user], title: chat.title, titleLocked: true, conversationId, turns: chat.turns.length, lastMessageAt: last, createdAt: start, updatedAt: last, deletedAt: null });
  }
  addAudit({ actorId: users.user, actorEmail: emails.user, action: "rename", entity: "chat", entityId: `${D}chat-1`, entityLabel: CHATS[0].title, botId: botId(CHATS[0].bot), createdAt: at(CHATS[0].days, 5) });
  addAudit({ actorId: users.manager, actorEmail: emails.manager, action: "view", entity: "chat", entityId: `${D}chat-1`, entityLabel: CHATS[0].title, botId: botId(CHATS[0].bot), summary: `Chat of ${emails.user}`, createdAt: at(1, 30) });

  // Older usage (no chat content) so the dashboard shows a month of activity, including failures and a stopped reply.
  for (const [days, key, user, status] of EXTRA_RUN_PATTERN) {
    const inT = status === "completed" ? 1400 + (days % 5) * 350 : 0;
    const outT = status === "completed" ? 250 + (days % 4) * 120 : 0;
    runs.push({
      _id: `${D}run-${++r}`, chatId: `${D}archived`, botId: botId(key), userId: users[user], model: MODEL, responseId: null, status, regenerate: false,
      inputTokens: inT, outputTokens: outT, costUsd: cost(inT, outT), durationMs: status === "completed" ? 2400 : 900,
      error: status === "failed" ? "Rate limit reached for gpt-4.1-mini. Please try again in 20s. (demo)" : null, createdAt: at(days, 120 + (days % 7) * 40),
    });
  }

  await db.collection("aibots_chats").insertMany(chats);
  await db.collection("aibots_runs").insertMany(runs);
  await db.collection("aibots_activity_logs").insertMany(audit);

  return {
    bots: bots.length,
    active: bots.filter((b) => b.status === "active").length,
    files: fileRows.length,
    chats: chats.length,
    transcripts,
    runs: runs.length,
    audit: audit.length,
    openai: Boolean(openai),
  };
}
