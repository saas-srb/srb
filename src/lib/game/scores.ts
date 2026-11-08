import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";

/**
 * Scores of the mini-game on the 404, no-workspace and maintenance pages. One row per player per scope in the platform-level
 * `game_scores` collection: the scope is the company whose address the player is on, or "global" where no company owns the address.
 * A player is an anonymous id the browser keeps (no account needed); only a nickname is stored. Everything arriving from the browser
 * is validated, and a score has to be believable for the time it took.
 */

const COLLECTION = "game_scores";
export const MAX_SCORE = 99_999;
/** The game awards at most this many points a second at its top speed. */
const MAX_POINTS_PER_SECOND = 28;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GAME_PAGES = ["404", "no-workspace", "maintenance"] as const;
export type GamePage = (typeof GAME_PAGES)[number];

interface ScoreDoc {
  _id: string;
  scope: string;
  playerId: string;
  name: string;
  best: number;
  bestDurationMs: number;
  last: number;
  plays: number;
  page: GamePage;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaderboardRow {
  name: string;
  score: number;
  you: boolean;
}

export interface GameState {
  best: number;
  plays: number;
  top: LeaderboardRow[];
}

let indexed = false;
async function scores() {
  const col = (await getPlatformDb()).collection<ScoreDoc>(COLLECTION);
  if (!indexed) {
    indexed = true;
    await col.createIndex({ scope: 1, best: -1 }).catch(() => {});
  }
  return col;
}

const scopeOf = (companyId: string | null) => companyId ?? "global";
export const isPlayerId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A short, safe nickname: letters, digits, spaces, "_" and "-", at most 16 characters; "Guest 1234" when empty. */
export function cleanName(raw: unknown, playerId: string): string {
  const name = String(raw ?? "").replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16);
  return name || `Guest ${playerId.slice(0, 4).toUpperCase()}`;
}

export async function getGameState(companyId: string | null, playerId: string | null): Promise<GameState> {
  const col = await scores();
  const scope = scopeOf(companyId);
  const [top, mine] = await Promise.all([
    col.find({ scope, best: { $gt: 0 } }).sort({ best: -1, updatedAt: 1 }).limit(5).toArray(),
    playerId ? col.findOne({ _id: `${scope}:${playerId}` }) : Promise.resolve(null),
  ]);
  return { best: mine?.best ?? 0, plays: mine?.plays ?? 0, top: top.map((r) => ({ name: r.name, score: r.best, you: r.playerId === playerId })) };
}

export type SubmitResult = { ok: true; state: GameState; newBest: boolean } | { ok: false; error: string };

export async function submitScore(input: { companyId: string | null; playerId: unknown; name: unknown; score: unknown; durationMs: unknown; page: unknown }): Promise<SubmitResult> {
  if (!isPlayerId(input.playerId)) return { ok: false, error: "Unknown player." };
  const score = Math.floor(Number(input.score));
  const durationMs = Math.floor(Number(input.durationMs));
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return { ok: false, error: "That score isn't valid." };
  if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > 60 * 60 * 1000) return { ok: false, error: "That run isn't valid." };
  // Believable for the time it took (the game cannot award more than this).
  if (score > (durationMs / 1000) * MAX_POINTS_PER_SECOND + 5) return { ok: false, error: "That score isn't believable." };
  const page = (GAME_PAGES as readonly string[]).includes(String(input.page)) ? (String(input.page) as GamePage) : "404";
  const scope = scopeOf(input.companyId);
  const name = cleanName(input.name, input.playerId);
  const _id = `${scope}:${input.playerId.toLowerCase()}`;
  const col = await scores();
  const before = await col.findOne({ _id }, { projection: { best: 1, updatedAt: 1 } });
  // One saved run every two seconds per player, whatever the client does.
  if (before && Date.now() - before.updatedAt.getTime() < 2000) return { ok: false, error: "Slow down a little." };
  const now = new Date();
  const newBest = score > (before?.best ?? 0);
  await col.updateOne(
    { _id },
    {
      $set: { scope, playerId: input.playerId.toLowerCase(), name, last: score, page, updatedAt: now, ...(newBest ? { best: score, bestDurationMs: durationMs } : {}) },
      $inc: { plays: 1 },
      $setOnInsert: { createdAt: now, ...(newBest ? {} : { best: score, bestDurationMs: durationMs }) },
    },
    { upsert: true },
  );
  return { ok: true, newBest, state: await getGameState(input.companyId, input.playerId.toLowerCase()) };
}
