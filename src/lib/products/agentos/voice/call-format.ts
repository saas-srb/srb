/**
 * Pure helpers for the Calls area (no database, no server-only): safe to import from client components and unit-tested in
 * scripts/test-agentos-calls.ts.
 */

export type CallState = "connected" | "processing" | "failed" | "not_connected";

export const CALL_STATE_LABEL: Record<CallState, string> = {
  connected: "Connected",
  processing: "Processing",
  failed: "Failed",
  not_connected: "Not connected",
};

export const CALL_STATES = Object.keys(CALL_STATE_LABEL) as CallState[];

/** One word for where a call stands. A call with no ElevenLabs conversation never connected, whatever its stored status. */
export function callState(c: { connected: boolean; status: "started" | "processing" | "done" | "failed" }): CallState {
  if (!c.connected) return "not_connected";
  if (c.status === "done") return "connected";
  if (c.status === "failed") return "failed";
  return "processing";
}

export const formatClock = (secs: number | null | undefined): string => {
  if (secs === null || secs === undefined || !Number.isFinite(secs) || secs < 0) return "0:00";
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

/** Date and time in Indian Standard Time, whatever the server or browser zone is (so server and client render the same text). */
export const formatIst = (iso: string | Date): string =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

// ---------------------------------------------------------------------------
// HTTP Range (RFC 9110 section 14) for the audio route
// ---------------------------------------------------------------------------

export type ByteRange = { start: number; end: number };

/**
 * A single `bytes=` range against a body of `size` bytes. Returns the inclusive range, `null` when the header is absent or not
 * something to honour (the whole body is sent with 200), or `"unsatisfiable"` (416).
 * Multiple ranges are not served (the whole body is sent instead, which the RFC allows).
 */
export function parseRange(header: string | null | undefined, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m) return null;
  const [, a, b] = m;
  if (a === "" && b === "") return null;
  if (size <= 0) return "unsatisfiable";
  if (a === "") {
    // suffix: the last N bytes
    const n = Number(b);
    if (!Number.isSafeInteger(n) || n <= 0) return "unsatisfiable";
    return { start: Math.max(size - n, 0), end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isSafeInteger(start) || start >= size) return "unsatisfiable";
  let end = b === "" ? size - 1 : Number(b);
  if (!Number.isSafeInteger(end) || end < start) return null; // invalid range spec: ignore the header
  end = Math.min(end, size - 1);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export interface TranscriptLine {
  role: "agent" | "user";
  text: string;
  atSecs: number | null;
}

/** Indexes of the lines containing `query` (case-insensitive, whitespace trimmed). Empty query matches nothing. */
export function searchTranscript(lines: readonly TranscriptLine[], query: string): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (l.text.toLowerCase().includes(q)) out.push(i);
  });
  return out;
}

/** Splits `text` into pieces, flagging the ones equal to `query` (case-insensitive), for highlighting. */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const out: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) out.push({ text: text.slice(from, at), match: false });
    out.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), match: false });
  return out.length ? out : [{ text, match: false }];
}

/** The plain-text transcript used for copy and the .txt download: a header, then `[m:ss] Speaker: text` per line. */
export function transcriptToText(lines: readonly TranscriptLine[], meta: { agentName: string; callerName: string; startedAt: string; durationSecs: number | null }): string {
  const head = [`Call with ${meta.agentName}`, `Caller: ${meta.callerName}`, `Started: ${formatIst(meta.startedAt)} IST`, meta.durationSecs ? `Duration: ${formatClock(meta.durationSecs)}` : null].filter(Boolean);
  const body = lines.map((l) => `${l.atSecs === null ? "" : `[${formatClock(l.atSecs)}] `}${l.role === "user" ? meta.callerName : meta.agentName}: ${l.text}`);
  return `${head.join("\n")}\n\n${body.join("\n")}\n`;
}

/** A safe .txt/.mp3 file name stem for a call. */
export function callFileStem(agentName: string, startedAt: string): string {
  const day = new Date(startedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const name = agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agent";
  return `call-${name}-${day}`;
}

/** Index of the line being spoken at `t` seconds: the last line that starts at or before it. -1 before the first. */
export function activeLineIndex(lines: readonly TranscriptLine[], t: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].atSecs;
    if (at === null) continue;
    if (at <= t) idx = i;
    else break;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export const CALLS_PAGE_SIZE = 20;

export interface CallFilters {
  bot: string;
  status: CallState | "";
  q: string;
  /** YYYY-MM-DD, inclusive, IST. */
  from: string;
  to: string;
  /** Oversight users only: "mine" limits to their own calls. */
  scope: "all" | "mine";
  page: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: unknown): string => {
  if (typeof v !== "string" || !DAY.test(v)) return "";
  return Number.isNaN(new Date(`${v}T00:00:00+05:30`).getTime()) ? "" : v;
};

/** Reads the URL's query string into trusted filters (unknown or malformed values fall away). */
export function parseCallFilters(sp: Record<string, string | string[] | undefined>): CallFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const status = one("status");
  const page = Math.floor(Number(one("page")));
  return {
    bot: one("bot").slice(0, 64),
    status: (CALL_STATES as string[]).includes(status) ? (status as CallState) : "",
    q: one("q").trim().slice(0, 80),
    from: validDay(one("from")),
    to: validDay(one("to")),
    scope: one("scope") === "mine" ? "mine" : "all",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** Inclusive IST day range -> [start, end) instants. */
export function istRange(from: string, to: string): { gte?: Date; lt?: Date } {
  const out: { gte?: Date; lt?: Date } = {};
  if (from) out.gte = new Date(`${from}T00:00:00+05:30`);
  if (to) out.lt = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000);
  return out;
}

export const pageCount = (total: number, size = CALLS_PAGE_SIZE) => Math.max(Math.ceil(total / size), 1);

const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The MongoDB filter for a call list. `userId` is set for people without oversight (their own calls only) and for oversight users who
 * chose "mine"; leaving it out is the oversight view. Tenant scoping comes from the collection itself.
 */
export function buildCallQuery(f: CallFilters, scopeUserId: string | null): Record<string, unknown> {
  const and: Record<string, unknown>[] = [{ voiceCall: { $exists: true } }, { deletedAt: null }];
  if (scopeUserId) and.push({ userId: scopeUserId });
  if (f.bot) and.push({ botId: f.bot });
  const { gte, lt } = istRange(f.from, f.to);
  if (gte || lt) and.push({ createdAt: { ...(gte ? { $gte: gte } : {}), ...(lt ? { $lt: lt } : {}) } });
  if (f.status === "not_connected") and.push({ "voiceCall.conversationId": null });
  else if (f.status) {
    and.push({ "voiceCall.conversationId": { $type: "string" } });
    and.push(f.status === "connected" ? { "voiceCall.status": "done" } : f.status === "failed" ? { "voiceCall.status": "failed" } : { "voiceCall.status": { $in: ["started", "processing"] } });
  }
  if (f.q) {
    const r = new RegExp(rx(f.q), "i");
    and.push({ $or: [{ userEmail: r }, { "voiceCall.summary": r }, { "voiceCall.summaryTitle": r }] });
  }
  return { $and: and };
}
