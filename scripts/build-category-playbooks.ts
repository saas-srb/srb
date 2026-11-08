/**
 * Writes src/lib/platform/website/ai/category-playbooks.json: for EVERY business category on the sign-up page, what a good website for
 * that kind of business needs (who its customers are, how they choose, which pages fit, what must never be claimed, which words belong to
 * other industries). The website planner is grounded in these, so a new category or a new country never starts from nothing.
 *
 *   OPENAI_API_KEY=... node --experimental-strip-types scripts/build-category-playbooks.ts [--force]
 *
 * Resumable: categories already in the file are skipped (use --force to redo them all). Review the JSON in a diff before committing.
 */
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
// @ts-ignore -- run with node's type stripping, which needs the explicit .ts extension
import { BUSINESS_CATEGORIES } from "../src/lib/platform/business-taxonomy.ts";

const OUT = path.resolve("src/lib/platform/website/ai/category-playbooks.json");
const MODEL = process.env.PLAYBOOK_MODEL || "gpt-4.1";
const KINDS = ["services-grid", "features", "checklist", "why", "steps", "faq", "text", "cta"];
const SCALES = ["individual", "micro", "small", "medium", "large", "enterprise", "institution", "nonprofit", "government", "creator", "student"];
const SETTINGS = ["village", "town", "city", "online", "regional", "global"];
const ACTIONS = ["call", "whatsapp", "book", "order", "visit", "enquire"];

const str = { type: "string" } as const;
const en = (v: string[]) => ({ type: "string", enum: v }) as const;
const arr = (items: unknown) => ({ type: "array", items }) as const;
const obj = (p: Record<string, unknown>) => ({ type: "object", properties: p, required: Object.keys(p), additionalProperties: false }) as const;
const SCHEMA = obj({
  customers: str,
  scales: arr(en(SCALES)),
  settings: arr(en(SETTINGS)),
  literacy: arr(en(["low", "mixed", "high", "professional"])),
  howTheyChoose: arr(str),
  primaryActions: arr(en(ACTIONS)),
  offeringsWord: str,
  pageIdeas: arr(obj({ slug: str, title: str, purpose: str })),
  homeFlow: arr(en(KINDS)),
  mustShow: arr(str),
  neverClaim: arr(str),
  avoidWords: arr(str),
  lookAndFeel: arr(str),
  toneHints: str,
  cautions: str,
});

const SYSTEM = `You are a local-market researcher and web strategist with worldwide experience. For ONE business category you write a practical playbook for planning the website of any business in it, anywhere in the world, from a one-person street or home business to a large company or institution, for visitors who read well or hardly at all.

Rules:
- customers: who actually uses or buys from this kind of business, in plain words, covering different countries and literacy levels.
- scales / settings / literacy: every value that realistically occurs for this category (more than one is normal).
- howTheyChoose: 3 to 6 things a visitor wants to know before they contact or buy from this kind of business.
- primaryActions: the 1 to 3 first actions visitors take.
- offeringsWord: the plain English word(s) for what this business offers ("fresh produce", "treatments", "packages", "projects", "rooms", "classes"...).
- pageIdeas: 4 to 8 pages that could suit businesses in this category (slug lowercase kebab-case ASCII, title, one-sentence purpose). Pages must be buildable from words alone: never a gallery, photo or video page, never pages that need facts nobody has (live prices, schedules, availability) unless the page only invites visitors to ask. Do not list contact or privacy pages.
- homeFlow: the 4 to 7 block kinds that make a good home page flow, in order. Kinds: ${KINDS.join(", ")}.
- mustShow: what information the owner will need to add later to make the site complete (address, hours, prices, licence...), because the site must never invent these.
- neverClaim: 6 to 12 specific claims that would be risky or false to make about a business of this kind without evidence (for example "genuine medicines", "organic", "licensed", "guaranteed results", "cheapest", "same-day delivery", "hallmarked", "certified", "100% safe", "cure"), including claims regulators watch in this trade.
- avoidWords: words and ideas that belong to OTHER industries and must not appear (for example software, apps, students, courses, rewards for a vegetable seller).
- lookAndFeel: 3 clearly different art directions (mood, named colours, type feel, imagery) that suit this trade and its culture.
- toneHints: how the writing should sound for its typical visitors.
- cautions: any legal, ethical, health, safety, age or financial care the website must take (medical advice, alcohol and tobacco, financial promises, children, legal advice, religious sensitivity, political neutrality), or "none".
Be concrete and specific to the category; do not write generic advice. Return minified JSON on a single line.`;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 2 });
const force = process.argv.includes("--force");
const store: Record<string, unknown> = fs.existsSync(OUT) && !force ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = BUSINESS_CATEGORIES.filter((c) => !store[c.code]);
console.log(`${BUSINESS_CATEGORIES.length} categories, ${todo.length} to write`);

async function one(c: (typeof BUSINESS_CATEGORIES)[number]) {
  const examples = c.subs.slice(0, 14).map((s) => s.name).join("; ");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model: MODEL,
        temperature: attempt ? 0.4 : 0.6,
        max_completion_tokens: 3500,
        response_format: { type: "json_schema", json_schema: { name: "playbook", strict: true, schema: SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `Category: ${c.name}\nExamples of what businesses in it do: ${examples}\n\nWrite the playbook.` }],
      });
      const j = JSON.parse(res.choices[0]?.message?.content ?? "");
      if (j.pageIdeas?.length >= 3 && j.homeFlow?.length >= 3 && j.neverClaim?.length >= 3) return { name: c.name, ...j };
    } catch (e) {
      console.error("  retry", c.name, e instanceof Error ? e.message.slice(0, 80) : e);
    }
  }
  return null;
}

let done = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const c = queue.shift()!;
      const pb = await one(c);
      if (pb) store[c.code] = pb;
      done++;
      if (done % 10 === 0 || !pb) console.log(`  ${done}/${todo.length}${pb ? "" : `  FAILED ${c.name}`}`);
      fs.writeFileSync(OUT, JSON.stringify(store));
    }
  }),
);
const missing = BUSINESS_CATEGORIES.filter((c) => !store[c.code]).map((c) => c.name);
console.log(missing.length ? `Missing ${missing.length}: ${missing.join(" | ")}` : "All categories have a playbook.");
