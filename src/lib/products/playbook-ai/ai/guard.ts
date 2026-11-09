/**
 * The FACT GUARD: checks the words the AI wrote against the facts it was given. Pure and client-safe.
 *
 * Every number, amount, percentage, date, time, e-mail address, phone number, web address, identifier (PAN, GSTIN, CIN, TAN, IFSC, document
 * numbers) and the names after a title ("Mr ...", "M/s ...", "... Pvt Ltd", "Dear ...") in the generated text must come from the fact bag.
 * Anything else is reported as an issue and can be turned into a visible `[ADD: ...]` placeholder, so a value the model made up never
 * reaches a document unnoticed.
 *
 * Recognised as NOT factual (and allowed): clause, section, article, schedule, annexure, page and form numbers ("clause 4.2", "sections 3, 4
 * and 5", "Form 16"), the numbering at the start of a block ("1.", "(a)"), and the Indian statutes in `statutes.ts`.
 *
 * Understands Indian number formats (1,00,000, lakh, crore, Rs, INR, ₹, "per cent"), amounts and counts written in words ("fifty thousand
 * rupees", "thirty days"), and dates written as 2026-11-03, 03/11/2026, 3rd November 2026, Nov 3, 2026, November 2026 and 3 November.
 *
 * Known limit, stated plainly: proper names are only checked where they are recognisable (after a title, "M/s", before a company suffix,
 * after "Dear"). A bare capitalised word cannot be judged reliably; the prompt tells the model to use a `var` node for every name.
 */

import type { Fact, FactBag, FactKind } from "@/lib/products/playbook-ai/ai/facts";
import { INDIAN_STATUTES } from "@/lib/products/playbook-ai/ai/statutes";

export type GuardKind = "number" | "money" | "percent" | "date" | "time" | "email" | "phone" | "url" | "identifier" | "name" | "unknown_fact";

export interface GuardIssue {
  kind: GuardKind;
  /** The offending text exactly as written. */
  text: string;
  start: number;
  end: number;
  reason: string;
}

export const KIND_LABEL: Record<GuardKind, string> = {
  number: "number", money: "amount", percent: "percentage", date: "date", time: "time", email: "email address", phone: "phone number",
  url: "web address", identifier: "identifier", name: "name", unknown_fact: "value",
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Numbers in words
// ---------------------------------------------------------------------------------------------------------------------------------

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, crore: 10_000_000, crores: 10_000_000, million: 1_000_000, billion: 1_000_000_000 };
const isNumberWord = (w: string) => w in UNITS || w in TENS || w in SCALES;

/** Parses a run of number words ("two lakh fifty thousand", "one hundred and five") or null when it is not a number. */
export function wordsToNumber(words: readonly string[]): number | null {
  const ws = words.map((w) => w.toLowerCase()).filter((w) => w !== "and");
  if (ws.length === 0 || !ws.every(isNumberWord)) return null;
  let total = 0;
  let current = 0;
  for (const w of ws) {
    if (w in UNITS) current += UNITS[w];
    else if (w in TENS) current += TENS[w];
    else if (w === "hundred") current = (current || 1) * 100;
    else {
      const scale = SCALES[w];
      total += (current || 1) * scale;
      current = 0;
    }
  }
  return total + current;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------------------------------------------

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthIndex = (s: string): number => {
  const w = s.toLowerCase().replace(/\.$/, "");
  const i = MONTH_NAMES.findIndex((m) => m === w || m.slice(0, 3) === w || (w === "sept" && m === "september"));
  return i + 1;
};
const MONTH_RE = "(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?";

export interface FoundDate { start: number; end: number; y: number | null; m: number; d: number | null; text: string }

const validDay = (y: number | null, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y ?? 2000, m, 0)).getUTCDate();
const year4 = (s: string): number => { const n = Number(s); return s.length === 2 ? 2000 + n : n; };

/** Dates written in any of the supported formats, in order of appearance. Day-month-year is read Indian style (03/11/2026 is 3 November). */
export function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  const taken: Array<[number, number]> = [];
  const free = (s: number, e: number) => taken.every(([a, b]) => e <= a || s >= b);
  const add = (s: number, e: number, y: number | null, m: number, d: number | null) => {
    if (!free(s, e)) return;
    taken.push([s, e]);
    out.push({ start: s, end: e, y, m, d, text: text.slice(s, e) });
  };
  const run = (re: RegExp, f: (m: RegExpExecArray) => [number | null, number, number | null] | null) => {
    for (const m of text.matchAll(re)) {
      const r = f(m as RegExpExecArray);
      if (r) add(m.index!, m.index! + m[0].length, r[0], r[1], r[2]);
    }
  };
  run(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => (validDay(+m[1], +m[2], +m[3]) ? [+m[1], +m[2], +m[3]] : null));
  run(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, (m) => (validDay(year4(m[3]), +m[2], +m[1]) ? [year4(m[3]), +m[2], +m[1]] : null));
  run(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE}),?\\s+(\\d{4})\\b`, "gi"), (m) => (monthIndex(m[2]) && validDay(+m[3], monthIndex(m[2]), +m[1]) ? [+m[3], monthIndex(m[2]), +m[1]] : null));
  run(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"), (m) => (monthIndex(m[1]) && validDay(+m[3], monthIndex(m[1]), +m[2]) ? [+m[3], monthIndex(m[1]), +m[2]] : null));
  run(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{4})\\b`, "gi"), (m) => (monthIndex(m[1]) ? [+m[2], monthIndex(m[1]), null] : null));
  run(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})(?![\\w.]*\\s*,?\\s*\\d{4})`, "gi"), (m) => (monthIndex(m[2]) && validDay(null, monthIndex(m[2]), +m[1]) ? [null, monthIndex(m[2]), +m[1]] : null));
  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// The allow-list built from the facts
// ---------------------------------------------------------------------------------------------------------------------------------

export interface AllowSet {
  numbers: Set<string>;
  datesFull: Set<string>;
  datesYm: Set<string>;
  datesMd: Set<string>;
  emails: Set<string>;
  urls: Set<string>;
  phones: Set<string>;
  ids: Set<string>;
  /** Lower-case letters, digits and single spaces of every text-like fact, for name checks. */
  nameBlob: string;
  times: Set<string>;
  /** Lower-case text values (4+ characters) that may be copied verbatim, whatever digits they contain (an address, a code). */
  literals: string[];
}

const numKey = (n: number): string => String(Math.round(n * 10_000) / 10_000);
const normName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const normUrl = (s: string) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/.,;:]+$/, "");
const phoneKey = (s: string): string | null => { const d = s.replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : null; };

const MULT: Record<string, number> = { lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, crs: 1e7, thousand: 1e3, k: 1e3, million: 1e6, billion: 1e9, bn: 1e9, mn: 1e6 };

/** Every number written in digits in a text (commas ignored, lakh/crore applied). Used to read facts like "30 days" or "₹ 50,000". */
function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(lakhs?|lacs?|crores?|crs?|thousand|million|billion|bn|mn|k)\b)?/gi)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    out.push(n);
    if (m[2]) out.push(n * (MULT[m[2].toLowerCase()] ?? 1));
  }
  return out;
}

function wordNumbersIn(text: string): number[] {
  const out: number[] = [];
  for (const run of numberWordRuns(text)) { const v = wordsToNumber(run.words); if (v !== null) out.push(v); }
  return out;
}

/** What the guard accepts, built from the facts. Numbers are taken only from numeric facts, so a text value cannot widen the list. */
export function buildAllowSet(bag: FactBag | readonly Fact[], extraTexts: readonly string[] = []): AllowSet {
  const facts = "facts" in bag ? bag.facts : bag;
  const a: AllowSet = { numbers: new Set(), datesFull: new Set(), datesYm: new Set(), datesMd: new Set(), emails: new Set(), urls: new Set(), phones: new Set(), ids: new Set(), nameBlob: "", times: new Set(), literals: [] };
  const names: string[] = [];
  const NUMERIC: FactKind[] = ["number", "money"];
  const addValueTokens = (text: string, kind: FactKind, trusted: boolean) => {
    for (const e of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) a.emails.add(e.toLowerCase());
    for (const u of text.match(/\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi) ?? []) a.urls.add(normUrl(u));
    for (const d of findDates(text)) {
      if (d.y !== null && d.d !== null) a.datesFull.add(`${d.y}-${d.m}-${d.d}`);
      if (d.y !== null) a.datesYm.add(`${d.y}-${d.m}`);
      if (d.d !== null) a.datesMd.add(`${d.m}-${d.d}`);
      if (d.y !== null) a.numbers.add(numKey(d.y));
    }
    if (kind === "phone" || /\d[\d\s().-]{8,}\d/.test(text)) { for (const p of text.match(/\+?\d[\d\s().-]{8,}\d/g) ?? []) { const k = phoneKey(p); if (k) a.phones.add(k); } }
    if (kind === "id" || kind === "address") for (const t of text.split(/[\s,;]+/)) if (t.length >= 4 && /\d/.test(t)) a.ids.add(t.toUpperCase().replace(/[.,;:]+$/, ""));
    for (const t of text.match(/\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b/gi) ?? []) a.times.add(t.toLowerCase().replace(/\s+/g, ""));
    if (kind === "address") for (const pin of text.match(/\b[1-9]\d{5}\b/g) ?? []) a.numbers.add(numKey(Number(pin)));
    if (trusted) {
      for (const n of numbersIn(text)) a.numbers.add(numKey(n));
      for (const n of wordNumbersIn(text)) a.numbers.add(numKey(n));
    }
  };
  for (const f of facts) {
    const text = String(f.value);
    const trusted = !f.suspicious && NUMERIC.includes(f.kind);
    if (typeof f.value === "number") a.numbers.add(numKey(f.value));
    if (!f.suspicious) names.push(normName(text));
    if (!f.suspicious && typeof f.value === "string" && text.trim().length >= 4 && f.kind !== "number" && f.kind !== "money" && f.kind !== "date") a.literals.push(text.trim().toLowerCase());
    if (!f.suspicious || f.kind === "email" || f.kind === "phone" || f.kind === "id") addValueTokens(f.suspicious ? "" : text, f.kind, trusted);
    if (f.kind === "id" && !f.suspicious) a.ids.add(text.toUpperCase());
  }
  // Text the author already wrote (improve, shorten, tone): what is there stays acceptable.
  for (const t of extraTexts) { addValueTokens(t, "text", true); names.push(normName(t)); }
  a.literals.sort((x, y) => y.length - x.length);
  a.nameBlob = ` ${names.join(" ")} `;
  return a;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------------------------------------------------------------

interface WordRun { start: number; end: number; words: string[]; text: string }

/** Maximal runs of number words ("two lakh fifty thousand"), allowing "and" and hyphens between the words. */
function numberWordRuns(text: string): WordRun[] {
  const toks = [...text.matchAll(/[A-Za-z]+/g)].map((m) => ({ w: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
  const runs: WordRun[] = [];
  let i = 0;
  while (i < toks.length) {
    if (!isNumberWord(toks[i].w)) { i++; continue; }
    let j = i;
    const words = [toks[i].w];
    while (j + 1 < toks.length && /^[\s-]+$/.test(text.slice(toks[j].end, toks[j + 1].start))) {
      const n = toks[j + 1].w;
      if (isNumberWord(n)) { words.push(n); j++; continue; }
      if (n === "and" && j + 2 < toks.length && isNumberWord(toks[j + 2].w) && /^[\s-]+$/.test(text.slice(toks[j + 1].end, toks[j + 2].start))) { words.push("and", toks[j + 2].w); j += 2; continue; }
      break;
    }
    runs.push({ start: toks[i].start, end: toks[j].end, words, text: text.slice(toks[i].start, toks[j].end) });
    i = j + 1;
  }
  return runs;
}

const WORD_UNIT = /^\s*(?:\(\s*\d[\d,]*\s*\)\s*)?(?:rupees?|inr|rs\b|days?|months?|years?|weeks?|hours?|minutes?|per\s?cent|percent|%|working\s+days?|calendar\s+days?|business\s+days?|times)\b/i;
const WORD_CURRENCY_BEFORE = /(?:rupees?|inr|rs\.?)\s*$/i;

const REF_WORDS = "(?:clauses?|sub-?clauses?|sections?|sub-?sections?|articles?|schedules?|annexures?|appendix|appendices|exhibits?|paragraphs?|paras?|pages?|parts?|items?|steps?|figures?|tables?|rules?|regulations?|chapters?|points?|forms?|rows?|columns?|annex)";
const REF_BEFORE = new RegExp(`\\b${REF_WORDS}\\s*(?:no\\.?|nos\\.?|number)?\\s*(?:[\\dA-Za-z.()]+\\s*(?:,|and|&|to|or|-|–)\\s*)*$`, "i");

function isReferenceNumber(text: string, start: number): boolean {
  return REF_BEFORE.test(text.slice(Math.max(0, start - 60), start));
}

function overlaps(spans: Array<[number, number]>, s: number, e: number): boolean {
  return spans.some(([a, b]) => s < b && e > a);
}

export interface GuardOptions {
  /** Statute names that may appear (default: the Indian statutes in `statutes.ts`). */
  statutes?: readonly string[];
}

const SALUTATION_OK = new Set(["sir", "madam", "sirs", "team", "all", "colleague", "colleagues", "friends", "customer", "client", "candidate", "employee", "applicant", "sir madam", "madam sir"]);
const COMPANY_SUFFIX = "(?:Pvt\\.?\\s+Ltd\\.?|Private\\s+Limited|Limited|Ltd\\.?|LLP|Inc\\.?|Corporation|Corp\\.?|Technologies|Solutions|Enterprises|Industries)";

function nameKnown(candidate: string, allow: AllowSet): boolean {
  const n = normName(candidate);
  if (!n) return true;
  if (allow.nameBlob.includes(` ${n} `) || allow.nameBlob.includes(n)) return true;
  const words = n.split(" ");
  return words.every((w) => allow.nameBlob.includes(` ${w} `));
}

/** Checks one piece of text. `atBlockStart` lets a leading "1." or "(a)" through as numbering. */
export function checkText(text: string, allow: AllowSet, opts: GuardOptions = {}, atBlockStart = false): GuardIssue[] {
  const issues: GuardIssue[] = [];
  const claimed: Array<[number, number]> = [];
  const claim = (s: number, e: number) => claimed.push([s, e]);
  const flag = (kind: GuardKind, s: number, e: number, reason: string) => { issues.push({ kind, text: text.slice(s, e), start: s, end: e, reason }); claim(s, e); };

  // 0. Things that are not facts: block numbering, statute names.
  if (atBlockStart) {
    const lead = /^\s*(?:\(?[0-9]+(?:\.[0-9]+)*[.)]|[0-9]+(?:\.[0-9]+)+|\([a-zA-Z]{1,4}\)|\(?[ivxlcdm]{1,6}[.)])\s/.exec(text);
    if (lead) claim(0, lead[0].length);
  }
  for (const s of opts.statutes ?? INDIAN_STATUTES) {
    let from = 0;
    const lower = text.toLowerCase();
    const needle = s.toLowerCase();
    for (let i = lower.indexOf(needle, from); i >= 0; i = lower.indexOf(needle, from)) { claim(i, i + needle.length); from = i + needle.length; }
  }

  // 0b. A fact copied word for word (an address, a code, a name) is the fact itself, whatever digits it holds.
  const lowerText = text.toLowerCase();
  for (const lit of allow.literals) {
    for (let i = lowerText.indexOf(lit); i >= 0; i = lowerText.indexOf(lit, i + lit.length)) claim(i, i + lit.length);
  }

  // 1. E-mail, web addresses.
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const s = m.index!, e = s + m[0].length;
    if (overlaps(claimed, s, e)) continue;
    if (allow.emails.has(m[0].toLowerCase())) claim(s, e); else flag("email", s, e, "this email address is not one of the given facts");
  }
  for (const m of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi)) {
    const raw = m[0].replace(/[.,;:!?]+$/, "");
    const s = m.index!, e = s + raw.length;
    if (overlaps(claimed, s, e)) continue;
    if (allow.urls.has(normUrl(raw))) claim(s, e); else flag("url", s, e, "this web address is not one of the given facts");
  }

  // 2. Identifiers with a known shape, then any code-like token with letters and digits.
  const idRes: Array<[RegExp, string]> = [
    [/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, "GSTIN"], [/\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/g, "CIN"], [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "PAN"],
    [/\b[A-Z]{4}\d{5}[A-Z]\b/g, "TAN"], [/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "IFSC"],
    [/\b(?=[A-Z0-9/_-]*\d)(?=[A-Z0-9/_-]*[A-Z])[A-Z0-9][A-Z0-9/_-]{4,}\b/g, "reference"],
  ];
  for (const [re, label] of idRes) {
    for (const m of text.matchAll(re)) {
      const s = m.index!, e = s + m[0].length;
      if (overlaps(claimed, s, e)) continue;
      if (allow.ids.has(m[0].toUpperCase())) claim(s, e); else flag("identifier", s, e, `this ${label} is not one of the given facts`);
    }
  }

  // 3. Phone numbers: ten or more digits with separators.
  for (const m of text.matchAll(/(?:\+\d{1,3}[\s-]?)?\(?\d[\d\s().-]{8,}\d/g)) {
    const s = m.index!, e = s + m[0].length;
    if (overlaps(claimed, s, e)) continue;
    const key = phoneKey(m[0]);
    const digits = m[0].replace(/\D/g, "").length;
    if (!key || digits < 10 || digits > 13) continue;
    if (allow.phones.has(key)) claim(s, e); else flag("phone", s, e, "this phone number is not one of the given facts");
  }

  // 4. Dates.
  for (const d of findDates(text)) {
    if (overlaps(claimed, d.start, d.end)) continue;
    const okFull = d.y !== null && d.d !== null && allow.datesFull.has(`${d.y}-${d.m}-${d.d}`);
    const okYm = d.y !== null && d.d === null && allow.datesYm.has(`${d.y}-${d.m}`);
    const okMd = d.y === null && d.d !== null && allow.datesMd.has(`${d.m}-${d.d}`);
    if (okFull || okYm || okMd) claim(d.start, d.end); else flag("date", d.start, d.end, "this date is not one of the given facts");
  }

  // 5. Times of day.
  for (const m of text.matchAll(/\b\d{1,2}[:.]\d{2}\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/gi)) {
    const s = m.index!, e = s + m[0].length;
    if (overlaps(claimed, s, e)) continue;
    if (allow.times.has(m[0].toLowerCase().replace(/\s+/g, ""))) claim(s, e); else flag("time", s, e, "this time is not one of the given facts");
  }

  // 6. Numbers in words with a unit ("thirty days", "fifty thousand rupees").
  for (const run of numberWordRuns(text)) {
    if (overlaps(claimed, run.start, run.end)) continue;
    const value = wordsToNumber(run.words);
    if (value === null) continue;
    const after = text.slice(run.end, run.end + 40);
    const before = text.slice(Math.max(0, run.start - 12), run.start);
    const money = WORD_CURRENCY_BEFORE.test(before) || /^\s*(?:rupees?|inr|rs\b)/i.test(after);
    if (!WORD_UNIT.test(after) && !money) continue;
    if (allow.numbers.has(numKey(value))) { claim(run.start, run.end); continue; }
    const kind: GuardKind = money ? "money" : /^\s*(?:per\s?cent|percent|%)/i.test(after) ? "percent" : "number";
    flag(kind, run.start, run.end, `"${run.text}" is not a value in the given facts`);
  }

  // 7. Numbers in digits, with currency, multiplier, percent and ordinal suffixes.
  const numRe = /(₹|\bRs\.?|\bINR\b|\bRupees?\b)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(lakhs?|lacs?|crores?|crs?|thousand|million|billion|bn|mn|k)\b)?(\s*(?:%|per\s?cent\b|percent\b))?(?:st|nd|rd|th)?(?:\s*(rupees|INR\b|Rs\b))?/gi;
  for (const m of text.matchAll(numRe)) {
    const cur = m[1], numTxt = m[2], mult = m[3], pct = m[4], curSuffix = m[5];
    const numStart = m.index! + m[0].indexOf(numTxt, cur ? cur.length : 0);
    const s = cur ? m.index! + m[0].search(/\S/) : numStart;
    const e = m.index! + m[0].length;
    if (overlaps(claimed, numStart, e)) continue;
    if (!cur && !curSuffix && isReferenceNumber(text, numStart)) { claim(numStart, e); continue; }
    // A letter glued to the number ("80C", "5th") is a reference or ordinal marker, not a quantity, unless it is an ordinal.
    const value = Number(numTxt.replace(/,/g, "")) * (mult ? MULT[mult.toLowerCase()] ?? 1 : 1);
    if (!Number.isFinite(value)) continue;
    const kind: GuardKind = pct ? "percent" : cur || curSuffix ? "money" : "number";
    const okValue = allow.numbers.has(numKey(value)) || allow.numbers.has(numKey(Number(numTxt.replace(/,/g, ""))));
    if (okValue) claim(s, e); else flag(kind, s, e, `${kind === "money" ? "this amount" : kind === "percent" ? "this percentage" : "this number"} is not a value in the given facts`);
  }

  // 8. Names after a title, "M/s", before a company suffix, or after "Dear".
  const nameRes: Array<[RegExp, number]> = [
    [/\b(?:Mr|Mrs|Ms|Miss|Dr|Shri|Smt|Sri|Prof)\.?\s+((?:[A-Z][a-zA-Z'’-]+(?:\s+|$)){1,4})/g, 1],
    [/\bM\/s\.?\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,4})/g, 1],
    [new RegExp(`\\b((?:[A-Z][\\w&'-]*\\s+){1,5}${COMPANY_SUFFIX})`, "g"), 1],
    [/\bDear\s+((?:[A-Z][a-z]+)(?:[ /][A-Z][a-z]+){0,3})/g, 1],
  ];
  for (const [re, g] of nameRes) {
    for (const m of text.matchAll(re)) {
      const cand = m[g].trim();
      const s = m.index! + m[0].indexOf(cand), e = s + cand.length;
      if (overlaps(claimed, s, e)) continue;
      if (SALUTATION_OK.has(normName(cand))) continue;
      if (/^(?:the|this|that|these|each|any|such|either|both)\b/i.test(cand)) continue;
      if (nameKnown(cand, allow)) claim(s, e); else flag("name", s, e, "this name is not one of the given facts");
    }
  }

  return mergeIssues(issues, text);
}

/** Joins issues of the same kind that sit next to each other ("thirty (30) days"), so one placeholder replaces both. */
function mergeIssues(issues: GuardIssue[], text = ""): GuardIssue[] {
  const sorted = [...issues].sort((a, b) => a.start - b.start);
  const out: GuardIssue[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && last.kind === i.kind && /^[\s()-]*$/.test(text.slice(last.end, i.start)) && i.start - last.end <= 4) {
      out[out.length - 1] = { ...last, end: i.end, text: text.slice(last.start, i.end) };
    } else out.push(i);
  }
  return out;
}

/** Replaces the issues in `text` with `[ADD: kind]` markers. Used for the plain-text view; blocks use `scrubInline`. */
export function scrubText(text: string, issues: readonly GuardIssue[]): string {
  let out = "";
  let at = 0;
  for (const i of [...issues].sort((a, b) => a.start - b.start)) {
    if (i.start < at) continue;
    out += text.slice(at, i.start) + `[ADD: ${KIND_LABEL[i.kind]}]`;
    at = i.end;
  }
  return out + text.slice(at);
}

/** True when nothing in the text is outside the facts. */
export const isClean = (text: string, allow: AllowSet, opts?: GuardOptions): boolean => checkText(text, allow, opts, false).length === 0;
