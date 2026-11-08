/**
 * The "never invent facts" guard. Pure functions: they compare what the model wrote with the text it was allowed to use
 * (the person's own fields plus stored brand/company data) and list everything that is NOT in that text: figures, prices,
 * percentages, dates, phone numbers, URLs, e-mail addresses, and absolute claims ("guaranteed", "#1", "award-winning").
 */

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** ASCII digits for Hindi/Marathi numerals, lowercase, collapsed spaces, so "₹४९,९९९" and "Rs 49999" compare equal. */
export function normalizeForFacts(s: string): string {
  return s
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .toLowerCase();
}

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;

/** Claims a marketing text must not make unless the person's own text already makes them. */
export const CLAIM_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "guaranteed / guarantee", re: /\bguarantee[sd]?\b/i },
  { label: "#1 / number one", re: /(?:#\s?1\b|\bnumber\s+(?:one|1)\b|\bno\.?\s?1\b)/i },
  { label: "best in", re: /\bbest\s+in\b/i },
  { label: "award-winning", re: /\baward[- ]winning\b/i },
  { label: "certified", re: /\bcertified\b/i },
  { label: "proven", re: /\bproven\b/i },
  { label: "risk-free", re: /\brisk[- ]free\b/i },
  { label: "clinically", re: /\bclinically\b/i },
  { label: "world-class", re: /\bworld[- ]class\b/i },
  { label: "official partner", re: /\bofficial\s+partner\b/i },
  { label: "ranked / rated", re: /\b(?:top[- ]ranked|ranked\s+#?\d|rated\s+\d)/i },
];

const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
const trimNum = (n: string) => n.replace(/,/g, "").replace(/\.0+$/, "").replace(/\.$/, "");

export interface FactTokens {
  numbers: Set<string>;
  urls: Set<string>;
  emails: Set<string>;
}

export function factTokens(text: string): FactTokens {
  const t = normalizeForFacts(text);
  const urls = new Set((t.match(URL_RE) ?? []).map(trimUrl));
  const emails = new Set((t.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()));
  // Digits that are part of a URL or e-mail are covered by those tokens.
  const stripped = t.replace(URL_RE, " ").replace(EMAIL_RE, " ");
  const numbers = new Set((stripped.match(NUM_RE) ?? []).map(trimNum).filter(Boolean));
  return { numbers, urls, emails };
}

export interface FactFinding {
  kind: "number" | "url" | "email" | "claim";
  value: string;
}

/** Everything in `output` that the `allowed` texts do not contain. */
export function unsupportedFacts(output: string, allowed: string[]): FactFinding[] {
  const corpus = allowed.filter(Boolean);
  const have = factTokens(corpus.join("\n"));
  const haveText = normalizeForFacts(corpus.join("\n"));
  const out = factTokens(output);
  const found: FactFinding[] = [];
  for (const n of out.numbers) if (!have.numbers.has(n)) found.push({ kind: "number", value: n });
  for (const u of out.urls) if (!have.urls.has(u)) found.push({ kind: "url", value: u });
  for (const e of out.emails) if (!have.emails.has(e)) found.push({ kind: "email", value: e });
  for (const c of CLAIM_PATTERNS) if (c.re.test(output) && !c.re.test(haveText) && !c.re.test(corpus.join("\n"))) found.push({ kind: "claim", value: c.label });
  return found;
}

export function describeFindings(f: FactFinding[]): string {
  const vals = [...new Set(f.map((x) => (x.kind === "claim" ? `the claim "${x.value}"` : x.value)))];
  return vals.slice(0, 6).join(", ");
}
