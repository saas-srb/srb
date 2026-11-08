import "server-only";
import { BUSINESS_CATEGORIES } from "@/lib/platform/business-taxonomy";
import type { WebsiteBrief } from "@/lib/platform/website/ai/generate";

/**
 * Domain knowledge for the website planner: one playbook per business category on the sign-up page (who its customers are, how they
 * choose, which pages fit, what must never be claimed, which words belong to other industries, what care the trade needs). The file is
 * written by `scripts/build-category-playbooks.ts` and reviewed like any other data. A company's own typed categories have no playbook;
 * the planner then relies on the general rules alone.
 */

export interface Playbook {
  name: string;
  customers: string;
  scales: string[];
  settings: string[];
  literacy: string[];
  howTheyChoose: string[];
  primaryActions: string[];
  offeringsWord: string;
  pageIdeas: { slug: string; title: string; purpose: string }[];
  homeFlow: string[];
  mustShow: string[];
  neverClaim: string[];
  avoidWords: string[];
  lookAndFeel: string[];
  toneHints: string;
  cautions: string;
}

let cache: Record<string, Playbook> | null = null;
async function all(): Promise<Record<string, Playbook>> {
  if (!cache) {
    try {
      cache = ((await import("@/lib/platform/website/ai/category-playbooks.json")) as unknown as { default: Record<string, Playbook> }).default;
    } catch {
      cache = {};
    }
  }
  return cache;
}

/** The playbooks of the categories this business chose (at most four), in the order chosen. */
export async function playbooksFor(b: WebsiteBrief): Promise<Playbook[]> {
  const book = await all();
  const out: Playbook[] = [];
  for (const name of b.categories) {
    const code = BUSINESS_CATEGORIES.find((c) => c.name === name)?.code;
    if (code && book[code] && !out.includes(book[code])) out.push(book[code]);
    if (out.length === 4) break;
  }
  return out;
}

/** The text the planner and the writer read. */
export function describePlaybooks(pbs: Playbook[]): string {
  if (pbs.length === 0) return "No playbook exists for these categories (they are the company's own wording): use the general rules and the plain meaning of the words.";
  return pbs
    .map(
      (p) => `CATEGORY PLAYBOOK: ${p.name}
- Customers: ${p.customers}
- Typical scale: ${p.scales.join(", ")}; settings: ${p.settings.join(", ")}; reading comfort: ${p.literacy.join(", ")}
- How visitors choose: ${p.howTheyChoose.join("; ")}
- First actions: ${p.primaryActions.join(", ")}; offerings are called: ${p.offeringsWord}
- Page ideas (adapt, choose only what fits THIS business): ${p.pageIdeas.map((x) => `${x.slug} "${x.title}" (${x.purpose})`).join(" | ")}
- Home flow that works: ${p.homeFlow.join(" > ")}
- The owner must add later (never invent): ${p.mustShow.join("; ")}
- NEVER claim: ${p.neverClaim.join("; ")}
- Words and ideas that do NOT belong: ${p.avoidWords.join(", ")}
- Art directions to choose from: ${p.lookAndFeel.join(" || ")}
- Tone: ${p.toneHints}
- Care required: ${p.cautions}`,
    )
    .join("\n\n");
}

/** Everything the validator must keep out of the text, from the chosen categories. */
export function bannedFromPlaybooks(pbs: Playbook[]): { claims: string[]; words: string[] } {
  // "100% organic (unless certified)" -> "100% organic"; quotes and trailing notes are dropped so the phrase can be matched in text.
  const norm = (list: string[]) => [...new Set(list.map((x) => x.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\bunless\b.*$/, "").replace(/["“”']/g, "").trim()).filter((x) => x.length >= 4))];
  return { claims: norm(pbs.flatMap((p) => p.neverClaim)), words: norm(pbs.flatMap((p) => p.avoidWords)) };
}
