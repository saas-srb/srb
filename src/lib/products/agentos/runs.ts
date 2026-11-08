import { mongoTimeZone } from "@/lib/timezone";
import "server-only";
import { COLLECTIONS, aibotsCollection, newId, notDeleted } from "@/lib/products/agentos/db";
import { avatarUrlFor } from "@/lib/products/agentos/avatar-shared";
import { chatsCollection, toListItem, type ChatListItem } from "@/lib/products/agentos/chats";
import { botsCollection, listUsableBots, GENERAL_BOT_ID, GENERAL_BOT_NAME } from "@/lib/products/agentos/bots";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";

/**
 * One row per OpenAI execution (a user message, or a regenerate). This is the
 * usage ledger behind the dashboard — ids, tokens, cost, status, timing. It
 * never stores prompt or reply text.
 */

export type RunStatus = "completed" | "failed" | "stopped";

export interface RunDoc {
  _id: string;
  chatId: string;
  botId: string;
  userId: string;
  model: string;
  responseId: string | null;
  status: RunStatus;
  regenerate: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  /** Short, scrubbed error text for failed runs. */
  error: string | null;
  createdAt: Date;
}

let indexesEnsured = false;
async function runsCollection() {
  const col = await aibotsCollection<RunDoc>(COLLECTIONS.runs);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      col.createIndex({ createdAt: -1 }).catch(() => {}),
      col.createIndex({ userId: 1, createdAt: -1 }).catch(() => {}),
      col.createIndex({ botId: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return col;
}

export async function recordRun(run: Omit<RunDoc, "_id" | "createdAt">): Promise<void> {
  try {
    const col = await runsCollection();
    await col.insertOne({ ...run, _id: newId(), error: run.error ? run.error.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 300) : null, createdAt: new Date() });
  } catch {
    // The usage ledger must never break a reply.
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function countUserRunsToday(userId: string): Promise<number> {
  const col = await runsCollection();
  return col.countDocuments({ userId, createdAt: { $gte: startOfToday() } });
}

export interface DashboardData {
  scope: "all" | "mine";
  totalBots: number;
  activeBots: number;
  totalChats: number;
  chatsToday: number;
  runs30: number;
  failed30: number;
  inputTokens30: number;
  outputTokens30: number;
  cost30: number;
  daily: { date: string; runs: number; tokens: number; cost: number; failed: number }[];
  topBots: { botId: string; name: string; icon: string; color: string; avatarUrl: string | null; runs: number; tokens: number; cost: number }[];
  recentChats: (ChatListItem & { botName: string })[];
  recentFailures: { botName: string; model: string; error: string | null; createdAt: string }[];
}

/** Manager tier sees platform-wide numbers; everyone else sees their own usage. */
export async function getDashboard(viewer: AibotsViewer, filters: { from?: string; to?: string } = {}): Promise<DashboardData> {
  const mine = !viewer.seesAll;
  // Day buckets use the server's timezone on both sides (Mongo defaults to UTC).
  const tz = mongoTimeZone();
  const who = mine ? { userId: viewer.userId } : {};
  // Default window is the last 30 days; the dashboard's From / To filters override it (capped at a year).
  const validDate = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(`${v}T00:00:00`) : null);
  const until = validDate(filters.to);
  if (until) until.setHours(23, 59, 59, 999);
  const since = validDate(filters.from) ?? new Date((until ?? new Date()).getTime() - 29 * 86400000);
  since.setHours(0, 0, 0, 0);
  const dayCount = Math.min(366, Math.max(1, Math.round(((until ?? new Date()).getTime() - since.getTime()) / 86400000) + 1));
  const window = { $gte: since, ...(until ? { $lte: until } : {}) };
  const [bots, chats, runs] = await Promise.all([botsCollection(), chatsCollection(), runsCollection()]);

  const [allBots, usable, totalChats, chatsToday, totals, daily, top, recent, failures] = await Promise.all([
    bots.find(notDeleted, { projection: { name: 1, icon: 1, color: 1, status: 1 } }).toArray(),
    // A user's bot counts cover only the bots they can use (all active); managers see every bot.
    mine ? listUsableBots(viewer) : Promise.resolve(null),
    chats.countDocuments({ ...notDeleted, ...who }),
    chats.countDocuments({ ...notDeleted, ...who, createdAt: { $gte: startOfToday() } }),
    runs
      .aggregate<{ runs: number; failed: number; inT: number; outT: number; cost: number }>([
        { $match: { ...who, createdAt: window } },
        { $group: { _id: null, runs: { $sum: 1 }, failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } }, inT: { $sum: "$inputTokens" }, outT: { $sum: "$outputTokens" }, cost: { $sum: "$costUsd" } } },
      ])
      .toArray(),
    runs
      .aggregate<{ _id: string; runs: number; tokens: number; cost: number; failed: number }>([
        { $match: { ...who, createdAt: window } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
            runs: { $sum: 1 },
            tokens: { $sum: { $add: ["$inputTokens", "$outputTokens"] } },
            cost: { $sum: "$costUsd" },
            failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    runs
      .aggregate<{ _id: string; runs: number; tokens: number; cost: number }>([
        { $match: { ...who, createdAt: window } },
        { $group: { _id: "$botId", runs: { $sum: 1 }, tokens: { $sum: { $add: ["$inputTokens", "$outputTokens"] } }, cost: { $sum: "$costUsd" } } },
        { $sort: { runs: -1 } },
        { $limit: 6 },
      ])
      .toArray(),
    chats.find({ ...notDeleted, ...who }).sort({ lastMessageAt: -1 }).limit(8).toArray(),
    runs.find({ ...who, status: "failed" }).sort({ createdAt: -1 }).limit(5).toArray(),
  ]);

  const botById = new Map<string, { _id?: string; name: string; icon: string; color: string; avatarKey?: string | null }>(allBots.map((b) => [b._id, b]));
  botById.set(GENERAL_BOT_ID, { name: GENERAL_BOT_NAME, icon: "sparkles", color: "indigo" });
  const byDay = new Map(daily.map((d) => [d._id, d]));
  const days: DashboardData["daily"] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const row = byDay.get(key);
    days.push({ date: key, runs: row?.runs ?? 0, tokens: row?.tokens ?? 0, cost: row?.cost ?? 0, failed: row?.failed ?? 0 });
  }
  const t = totals[0];
  return {
    scope: mine ? "mine" : "all",
    totalBots: usable ? usable.length : allBots.length,
    activeBots: usable ? usable.length : allBots.filter((b) => b.status === "active").length,
    totalChats,
    chatsToday,
    runs30: t?.runs ?? 0,
    failed30: t?.failed ?? 0,
    inputTokens30: t?.inT ?? 0,
    outputTokens30: t?.outT ?? 0,
    cost30: t?.cost ?? 0,
    daily: days,
    topBots: top.map((r) => {
      const b = botById.get(r._id);
      return { botId: r._id, name: b?.name ?? "Deleted bot", icon: b?.icon ?? "bot", color: b?.color ?? "slate", avatarUrl: b?._id ? avatarUrlFor(b._id, b.avatarKey) : null, runs: r.runs, tokens: r.tokens, cost: r.cost };
    }),
    recentChats: recent.map((c) => ({ ...toListItem(c), botName: botById.get(c.botId)?.name ?? "Deleted bot" })),
    recentFailures: failures.map((f) => ({ botName: botById.get(f.botId)?.name ?? "Deleted bot", model: f.model, error: f.error, createdAt: f.createdAt.toISOString() })),
  };
}
