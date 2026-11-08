/**
 * Wake detection: which AI agents does a spoken or typed line address? Pure (no I/O, no clock, no server imports) so the browser and the
 * tests share it. Speech-to-text spells Indian names many ways (Arjun/Arjoon, Meera/Mira/Meeraa, Devanagari), so a mention is matched by
 * exact normalised form, then by a phonetic key, then by a small edit distance, and always on whole words.
 *
 * Rules that matter for safety:
 *  - an agent's own line, or any line spoken by an agent, never wakes anyone (no agent-to-agent chatter);
 *  - a name inside someone else's full name ("Meera Sharma", a guest) is that person, not the agent;
 *  - two agents with similar names: the best match must beat the runner-up by a margin, otherwise nobody is woken;
 *  - a third-person mention ("I told Meera yesterday") scores below the trigger threshold, a vocative ("Meera, ...", "hey Meera",
 *    "Meera ji") scores high;
 *  - "everyone" style calls only work when the host enabled them.
 */
import type { ParticipantKind } from "@/lib/dealflow-ai/meetings/types";

export interface WakeAgent {
  id: string;
  name: string;
  aliases?: string[];
}

export interface FollowUp {
  agentId: string;
  /** When the agent finished answering (ms). */
  at: number;
  /** The human the answer was for. */
  toSpeakerId: string;
}

export interface WakeInput {
  text: string;
  speaker: { id: string; kind: ParticipantKind };
  /** The agents currently active in the room (muted or removed ones are simply not passed). */
  agents: WakeAgent[];
  now: number;
  followUps?: FollowUp[];
  followUpWindowSecs: number;
  /** Host setting: "all agents, ..." wakes every agent. */
  allowEveryone?: boolean;
  /** Full names of the humans in the room, so a name inside one of them is not taken as the agent. */
  humanNames?: string[];
}

export interface WakeResult {
  agentIds: string[];
  confidence: number;
  reason: string;
}

export const WAKE_THRESHOLD = 0.6;
export const WAKE_MARGIN = 0.1;

const NONE = (reason: string): WakeResult => ({ agentIds: [], confidence: 0, reason });

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const DEV_CONS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n", ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n", प: "p", फ: "ph", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", व: "v", श: "sh",
  ष: "sh", स: "s", ह: "h", ळ: "l", क्ष: "ksh", ज्ञ: "gy",
};
const DEV_VOWEL: Record<string, string> = { अ: "a", आ: "aa", इ: "i", ई: "ee", उ: "u", ऊ: "oo", ऋ: "ri", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o" };
const DEV_MATRA: Record<string, string> = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o" };

const isDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

/** Devanagari to rough Latin ("मीरा" -> "meeraa"). Latin text passes through. */
export function transliterate(word: string): string {
  if (!isDevanagari(word)) return word;
  const chars = [...word.normalize("NFC").replace(/[़]/g, "")];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (DEV_CONS[c] !== undefined) {
      out += DEV_CONS[c];
      const next = chars[i + 1];
      const hasMatra = next !== undefined && (DEV_MATRA[next] !== undefined || next === "्");
      // Inherent "a" except at the end of a word or when a matra/virama follows.
      if (!hasMatra && i < chars.length - 1 && DEV_CONS[next ?? ""] !== undefined) out += "a";
      else if (!hasMatra && i < chars.length - 1 && (next === "ं" || next === "ँ")) out += "a";
    } else if (DEV_VOWEL[c] !== undefined) out += DEV_VOWEL[c];
    else if (DEV_MATRA[c] !== undefined) out += DEV_MATRA[c];
    else if (c === "ं" || c === "ँ") out += "n";
    else if (c === "ः") out += "h";
    else if (c === "्") continue;
    else out += c;
  }
  return out;
}

/** Lower case, accents removed, curly quotes straightened. */
function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase();
}

export interface Tok {
  /** Normalised word (Latin, lower case, possessive removed). */
  w: string;
  /** Original start/end index in the folded text. */
  start: number;
  end: number;
  possessive: boolean;
}

const TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:'[\p{L}]+)?/gu;

export function tokenize(text: string): { toks: Tok[]; folded: string } {
  const folded = fold(text);
  const toks: Tok[] = [];
  for (const m of folded.matchAll(TOKEN_RE)) {
    let raw = m[0];
    let possessive = false;
    const ap = raw.indexOf("'");
    if (ap > 0) {
      const tail = raw.slice(ap + 1);
      if (tail === "s") possessive = true;
      raw = raw.slice(0, ap);
    }
    const w = transliterate(raw);
    if (!w) continue;
    toks.push({ w, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, possessive });
  }
  return { toks, folded };
}

/**
 * A spelling-independent key: "Meera"/"Mira"/"Meeraa" -> "mira", "Arjun"/"Arjoon" -> "arjun". Deliberately lossy on vowels length and on the
 * aspirated/non-aspirated pairs Indian-English speech blurs; two different agent names are told apart by the margin rule, not by the key.
 */
export function phoneticKey(word: string): string {
  let s = fold(word).replace(/[^a-z]/g, "");
  s = s
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/chh/g, "ch")
    .replace(/(sh|ss|ts)/g, "s")
    .replace(/([bdgkpt])h/g, "$1")
    .replace(/x/g, "ks")
    .replace(/q/g, "k")
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/(ee|ii|ie|ea)/g, "i")
    .replace(/(oo|uu|ou)/g, "u")
    .replace(/aa/g, "a")
    .replace(/(ai|ay|ei)/g, "e")
    .replace(/y/g, "i")
    .replace(/c(?!h)/g, "k")
    .replace(/(.)\1+/g, "$1");
  // Trailing h/a/i variants: "Sitha"/"Sita", "Priyah"; keep a final vowel so "Arjun"/"Arjuna" stay close but not identical.
  s = s.replace(/h$/, "");
  return s;
}

/** Optimal-string-alignment distance (insert, delete, substitute, transpose). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const d: number[][] = Array.from({ length: al + 1 }, (_, i) => [i, ...Array(bl).fill(0)]);
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[al][bl];
}

// ---------------------------------------------------------------------------
// Word lists
// ---------------------------------------------------------------------------

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** Words that are part of a title, not a name ("Sales Assistant Arjun"): never matched alone. */
const GENERIC = set("agent assistant bot ai the virtual voice digital mr mrs ms miss dr prof sir madam sales support team helper expert manager advisor");
/** Greetings and fillers that can precede a name. */
const GREETING = set("hey hi hello hii heyy ok okay oye arre are ae aye dear excuse namaste namaskar hello yo so well and now listen please sorry");
const HONORIFIC_AFTER = set("ji jee sir madam mam maam bhai bhaiya didi sahab sahib saab");
const SECOND_PERSON = set(
  "you your yours aap apka apki apke tum tumhara tu please pls can could would will should kya bataiye batao bataiyega boliye bolo suniye suno tell explain what how why share give show help"
);
/** A name preceded by one of these is being talked about, not addressed. */
const THIRD_PERSON_BEFORE = set("told said says say from with by about than like of for to as tell asked asking spoke speaking met called calling");
const COMMON_WORDS = set("will mark may grace hope joy art bill rose sunny max sam ray jack bob rob ben don pat sue ann amy eve tim tom");
const BACKCHANNEL = set("ok okay hmm hm haan ha yes yeah yep no nahi nope thanks thank you thanku thankyou theek thik accha achha acha right sure good great cool hai ji bye fine nice");
const EVERYONE_PHRASES = [/\ball (?:the )?(?:ai )?agents\b/, /\bevery (?:ai )?agent\b/, /\bboth (?:the )?agents\b/, /\bai agents\b/, /\bagents,/, /\bsab agents\b/, /\bsabhi agents\b/];

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

interface Candidate {
  agentId: string;
  tokens: string[];
  keys: string[];
  weight: number;
  single: boolean;
}

function nameTokens(name: string): string[] {
  return tokenize(name).toks.map((t) => t.w);
}

export function buildCandidates(agents: WakeAgent[]): Candidate[] {
  const out: Candidate[] = [];
  const push = (agentId: string, tokens: string[], weight: number) => {
    if (!tokens.length) return;
    const joined = tokens.join(" ");
    if (out.some((c) => c.agentId === agentId && c.tokens.join(" ") === joined)) return;
    out.push({ agentId, tokens, keys: tokens.map(phoneticKey), weight, single: tokens.length === 1 });
  };
  for (const a of agents) {
    const sources = [a.name, ...(a.aliases ?? [])].filter((s) => typeof s === "string" && s.trim());
    sources.forEach((src, i) => {
      const toks = nameTokens(src);
      const informative = toks.filter((t) => !GENERIC.has(t));
      const use = informative.length ? informative : toks;
      push(a.id, use, 1);
      if (use.length > 1) {
        use.forEach((t, idx) => {
          if (t.length >= 3 && i === 0) push(a.id, [t], idx === 0 ? 0.97 : 0.88);
          else if (t.length >= 3 && i > 0) push(a.id, [t], 0.9);
        });
      }
    });
  }
  return out;
}

function scoreGram(gram: string[], cand: Candidate): number {
  if (gram.length !== cand.tokens.length) return 0;
  const joined = gram.join(" ");
  if (joined === cand.tokens.join(" ")) return cand.weight;
  const keys = gram.map(phoneticKey);
  if (keys.every((k, i) => k && k === cand.keys[i])) return 0.9 * cand.weight;
  const a = keys.join("");
  const b = cand.keys.join("");
  if (!a || !b) return 0;
  const len = Math.min(a.length, b.length);
  const dist = editDistance(a, b);
  if (len >= 8 && dist <= 2) return (dist === 1 ? 0.78 : 0.7) * cand.weight;
  if (len >= 5 && dist <= 1) return 0.78 * cand.weight;
  return 0;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface Mention {
  agentId: string;
  /** index of first token */
  at: number;
  len: number;
  score: number;
  confidence: number;
  how: string;
}

/** The sentence a token belongs to: [first token index, last token index]. */
function sentenceBounds(folded: string, toks: Tok[]): Array<[number, number]> {
  const bounds: Array<[number, number]> = [];
  let startIdx = 0;
  for (let i = 0; i < toks.length - 1; i++) {
    const gap = folded.slice(toks[i].end, toks[i + 1].start);
    if (/[.?!।;\n]/.test(gap)) {
      bounds.push([startIdx, i]);
      startIdx = i + 1;
    }
  }
  if (toks.length) bounds.push([startIdx, toks.length - 1]);
  return bounds;
}

export function detectAddressed(input: WakeInput): WakeResult {
  const { speaker, agents } = input;
  if (speaker.kind === "agent") return NONE("agent speech never wakes an agent");
  const text = typeof input.text === "string" ? input.text.slice(0, 2000) : "";
  const { toks, folded } = tokenize(text);
  if (!toks.length || !agents.length) return NONE("nothing to match");

  const cands = buildCandidates(agents);
  const sentences = sentenceBounds(folded, toks);
  const sentenceOf = (i: number) => sentences.find(([s, e]) => i >= s && i <= e) ?? [0, toks.length - 1];

  // Names of other people in the room: tokens inside a multi-word human name are that person.
  const protectedIdx = new Set<number>();
  const humanSingles = new Set<string>();
  for (const hn of input.humanNames ?? []) {
    const ht = nameTokens(hn);
    if (ht.length === 1) humanSingles.add(phoneticKey(ht[0]));
    if (ht.length < 2) continue;
    for (let i = 0; i + ht.length <= toks.length; i++) {
      if (ht.every((w, k) => toks[i + k].w === w)) for (let k = 0; k < ht.length; k++) protectedIdx.add(i + k);
    }
  }

  const mentions: Mention[] = [];
  const consumed = new Set<number>();
  const weak = new Set<string>(); // agents mentioned only in a way that does not address them
  let ambiguous = false;

  for (let i = 0; i < toks.length; i++) {
    if (consumed.has(i)) continue;
    for (const n of [3, 2, 1]) {
      if (i + n > toks.length) continue;
      const gram = toks.slice(i, i + n).map((t) => t.w);
      if (gram.some((w) => w.length < 2)) continue;
      if (n === 1 && GENERIC.has(gram[0])) continue;
      const perAgent = new Map<string, number>();
      for (const c of cands) {
        const s = scoreGram(gram, c);
        if (s > (perAgent.get(c.agentId) ?? 0)) perAgent.set(c.agentId, s);
      }
      const ranked = [...perAgent.entries()].sort((a, b) => b[1] - a[1]);
      const [best, second] = [ranked[0], ranked[1]];
      if (!best || best[1] < 0.65) continue;
      if (second && best[1] - second[1] < WAKE_MARGIN) {
        ambiguous = true;
        consumed.add(i);
        break;
      }
      let inProtected = false;
      for (let k = 0; k < n; k++) if (protectedIdx.has(i + k)) inProtected = true;
      if (inProtected) {
        consumed.add(i);
        break;
      }
      // Context of the mention.
      const [ss, se] = sentenceOf(i);
      const last = i + n - 1;
      const posInSentence = (() => {
        let p = i - ss;
        // greetings in front do not count as words before the name
        for (let k = ss; k < i; k++) if (GREETING.has(toks[k].w)) p--;
        return p;
      })();
      const prev = i > ss ? toks[i - 1].w : "";
      const next = last < se ? toks[last + 1].w : "";
      const gapAfter = last < toks.length - 1 ? folded.slice(toks[last].end, toks[last + 1].start) : folded.slice(toks[last].end);
      const commaAfter = /,/.test(gapAfter) && !/[.?!।;]/.test(gapAfter);
      const greetedBefore = i > ss && GREETING.has(prev);
      const honorific = HONORIFIC_AFTER.has(next);
      const isSingleCommon = n === 1 && COMMON_WORDS.has(gram[0]);
      let ctx: number;
      let how: string;
      if (toks[last].possessive) {
        ctx = 0.4;
        how = "possessive";
      } else if (greetedBefore || honorific || (commaAfter && posInSentence <= 3)) {
        ctx = 1;
        how = "vocative";
      } else if (posInSentence <= 0) {
        ctx = 0.97;
        how = "sentence start";
      } else if (last === se) {
        ctx = THIRD_PERSON_BEFORE.has(prev) && !SECOND_PERSON.has(prev) ? 0.45 : 0.9;
        how = ctx > 0.5 ? "sentence end" : "third person";
      } else if (THIRD_PERSON_BEFORE.has(prev) && !SECOND_PERSON.has(prev)) {
        ctx = 0.4;
        how = "third person";
      } else if (toks.slice(ss, se + 1).some((t) => SECOND_PERSON.has(t.w))) {
        ctx = 0.8;
        how = "mid sentence with a request";
      } else {
        ctx = 0.55;
        how = "mid sentence";
      }
      if (isSingleCommon && ctx < 0.97) ctx = Math.min(ctx, 0.5);
      if (humanSingles.has(phoneticKey(gram.join(""))) && ctx < 0.97) ctx = Math.min(ctx, 0.5);
      const confidence = Math.round(best[1] * ctx * 100) / 100;
      if (confidence >= WAKE_THRESHOLD) mentions.push({ agentId: best[0], at: i, len: n, score: best[1], confidence, how });
      else weak.add(best[0]);
      for (let k = 0; k < n; k++) consumed.add(i + k);
      break;
    }
  }

  if (mentions.length) {
    const ordered: Mention[] = [];
    for (const m of mentions.sort((a, b) => a.at - b.at)) if (!ordered.some((o) => o.agentId === m.agentId)) ordered.push(m);
    const names = ordered.map((m) => agents.find((a) => a.id === m.agentId)?.name ?? m.agentId).join(", ");
    return { agentIds: ordered.map((m) => m.agentId), confidence: Math.max(...ordered.map((m) => m.confidence)), reason: `named ${names} (${ordered[0].how})` };
  }

  if (input.allowEveryone && EVERYONE_PHRASES.some((re) => re.test(folded))) {
    return { agentIds: agents.map((a) => a.id), confidence: 0.75, reason: "addressed all agents" };
  }

  // Follow-up continuity: the same person speaking again soon after an agent answered them.
  const nameBlocked = ambiguous || weak.size > 0;
  const windowMs = Math.max(0, input.followUpWindowSecs) * 1000;
  const ups = (input.followUps ?? [])
    .filter((f) => f.toSpeakerId === speaker.id && input.now - f.at >= -1000 && input.now - f.at <= windowMs && agents.some((a) => a.id === f.agentId))
    .sort((a, b) => b.at - a.at);
  if (ups.length && !(nameBlocked && [...weak].some((id) => id !== ups[0].agentId))) {
    const meaningful = toks.filter((t) => !BACKCHANNEL.has(t.w));
    if (meaningful.length === 0 || toks.length < 2 && BACKCHANNEL.has(toks[0].w)) return NONE("short acknowledgement, no follow-up needed");
    return { agentIds: [ups[0].agentId], confidence: 0.62, reason: "follow-up to the previous answer" };
  }
  if (ambiguous) return NONE("name matches several agents about equally");
  if (weak.size) return NONE("agent mentioned but not addressed");
  return NONE("no agent named");
}

/**
 * Where does the first agent name appear? Used to order several addressed agents by their place in the sentence.
 * Kept separate so callers can sort a result they got elsewhere.
 */
export function orderByMention(text: string, agentIds: string[], agents: WakeAgent[]): string[] {
  const { toks } = tokenize(text);
  const cands = buildCandidates(agents.filter((a) => agentIds.includes(a.id)));
  const pos = (id: string) => {
    for (let i = 0; i < toks.length; i++) for (const n of [3, 2, 1]) {
      const gram = toks.slice(i, i + n).map((t) => t.w);
      if (gram.length === n && cands.some((c) => c.agentId === id && scoreGram(gram, c) >= 0.65)) return i;
    }
    return Number.MAX_SAFE_INTEGER;
  };
  return [...agentIds].sort((a, b) => pos(a) - pos(b));
}
