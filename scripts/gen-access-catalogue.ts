/**
 * Generates src/lib/access/catalogue.generated.ts: the access feature catalogue, derived from every src/lib/*-roles.ts by IMPORTING it
 * and scanning its source for descriptions and override keys. Re-run after a role file changes:
 *   npx tsx scripts/gen-access-catalogue.ts --write        (without --write it only prints a summary)
 * scripts/test-access-parity.ts fails when the generated file is stale or a capability is missing.
 * No database, no network.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LIB = join(process.cwd(), "src", "lib");
const OUT = join(process.cwd(), "src", "lib", "access", "catalogue.generated.ts");

/** role file base -> product slug (the product as the Director knows it) and a readable product name. */
export const FILES: Record<string, { product: string; name: string }> = {
  hrms: { product: "talentos", name: "TalentOS (HR)" },
  pms: { product: "sprintos", name: "SprintOS (Projects)" },
  lms: { product: "dealflow-ai", name: "DealFlow AI (CRM & Leads)" },
  fms: { product: "cashflow-ai", name: "CashFlow AI (Finance)" },
  prms: { product: "spendiq", name: "SpendIQ (Procurement & Expenses)" },
  tms: { product: "cohort-ai", name: "CohortAI (Training)" },
  messenger: { product: "huddle-ai", name: "Huddle AI (Team chat)" },
  sop: { product: "playbook-ai", name: "Playbook AI (SOP roles)" },
  playbook: { product: "playbook-ai", name: "Playbook AI (authoring roles)" },
  lpms: { product: "contractflow-ai", name: "ContractFlow AI (Legal)" },
  dlms: { product: "cybervault", name: "CyberVault" },
  ots: { product: "evaliq", name: "EvalIQ (Online tests)" },
  aibots: { product: "agentos", name: "AgentOS" },
  intelligence: { product: "databrain-ai", name: "DataBrain AI" },
  smms: { product: "viralpulse-ai", name: "ViralPulse AI (Social media)" },
  seo: { product: "rankmax-ai", name: "RankMax AI (SEO)" },
  cms: { product: "sitecraft-ai", name: "SiteCraft AI (Website)" },
  portal: { product: "clientos", name: "ClientOS (Client & student portal)" },
  workspace: { product: "commandos", name: "CommandOS (Workspace)" },
  admin: { product: "commandos", name: "CommandOS (Workspace admin)" },
};

const WRITE = /(manage|create|edit|update|delete|publish|assign|archive|approve|reject|run|send|issue|refund|reconcile|import|upload|post|moderate|configure|write|generate|launch|connect|restore|reveal|takeover|take_over|place|call|invite|grant|revoke|export_all)/i;
const READ = /(^view|_view|view_|read|download|export|use$|^use|acknowledge|list|see|audit|report|analytics|access)/i;
function level(name: string, doc: string): "read" | "write" {
  const w = WRITE.test(name), r = READ.test(name);
  if (w && !r) return "write";
  if (r && !w) return "read";
  if (/view|read|see/i.test(doc.slice(0, 60)) && !/manage|create|edit|delete|approve/i.test(doc)) return "read";
  return "write"; // mixed or unclear: treated as write, so it is a separate, deliberate grant (owner decision D4)
}

type Ctx = { roles: string[]; permissionOverrides: null };
export interface Entry {
  key: string; product: string; source: string; kind: "perm" | "pred" | "tier"; fn: string; perm: string | null;
  overrideKey: string | null; level: "read" | "write"; label: string; description: string;
}

function docs(src: string) {
  const out = new Map<string, { doc: string; key: string | null }>();
  const re = /(?:\/\*\*([\s\S]*?)\*\/\s*)?export function (\w+)\s*\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g;
  for (const m of src.matchAll(re)) {
    out.set(m[2], { doc: (m[1] ?? "").replace(/^\s*\* ?/gm, "").replace(/\s+/g, " ").trim(), key: /resolvePermission\([^,]+,\s*["']([^"']+)["']/.exec(m[4])?.[1] ?? null });
  }
  return out;
}
/** The short names the role files use, in the product names people know. */
const BRAND: Record<string, string> = { aibots: "AgentOS", pms: "SprintOS", lms: "DealFlow", fms: "CashFlow", prms: "SpendIQ", tms: "CohortAI", lpms: "ContractFlow", dlms: "CyberVault", ots: "EvalIQ", smms: "ViralPulse", seo: "RankMax", cms: "SiteCraft", sop: "Playbook", hrms: "TalentOS" };
const humanize = (s: string) => {
  const spaced = s.replace(/^(can|is|has)(?=[A-Z])/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  const words = spaced.split(" ").map((w) => BRAND[w.toLowerCase()] ?? w.toLowerCase());
  const t = words.join(" ");
  return t.replace(/^./, (c) => c.toUpperCase());
};

export async function discover(): Promise<{ entries: Entry[]; roles: Record<string, string[]>; notes: string[] }> {
  const entries: Entry[] = [];
  const roles: Record<string, string[]> = {};
  const notes: string[] = [];
  for (const f of readdirSync(LIB).filter((x) => x.endsWith("-roles.ts")).sort()) {
    const base = f.replace("-roles.ts", "");
    const prod = FILES[base];
    if (!prod) { notes.push(`no product mapping for ${f}`); continue; }
    const src = readFileSync(join(LIB, f), "utf8");
    const mod = (await import(join(LIB, f))) as Record<string, unknown>;
    const d = docs(src);
    let rolesArr = (Object.entries(mod).find(([k, v]) => /_ROLES$/.test(k) && Array.isArray(v) && !/STAFF|TEST_TAKER/.test(k))?.[1] as string[] | undefined) ?? [];
    if (base === "playbook" && !rolesArr.length) rolesArr = [...((await import(join(LIB, "sop-roles.ts"))) as { SOP_ROLES: string[] }).SOP_ROLES];
    roles[base] = rolesArr.length ? [...rolesArr] : ["super_admin"];
    const ctxOf = (r: string[]): Ctx => ({ roles: r, permissionOverrides: null });
    void ctxOf;
    const permArr = Object.entries(mod).find(([k, v]) => /_PERMISSIONS$/.test(k) && Array.isArray(v) && !/^MANAGE_/.test(k))?.[1] as string[] | undefined;
    const permMeta = Object.entries(mod).find(([k]) => /_PERMISSION_META$/.test(k))?.[1] as Record<string, { label: string; description: string }> | undefined;
    const permKey = Object.entries(mod).find(([k]) => /_PERMISSION_KEY$/.test(k))?.[1] as Record<string, string> | undefined;
    const canName = Object.entries(mod).find(([k, v]) => /Can$/.test(k) && typeof v === "function")?.[0];
    if (permArr && canName) {
      for (const p of permArr) {
        entries.push({ key: `${base}.${p}`, product: prod.product, source: base, kind: "perm", fn: canName, perm: p, overrideKey: permKey?.[p] ?? null, level: level(p, permMeta?.[p]?.description ?? ""), label: permMeta?.[p]?.label ?? humanize(p), description: permMeta?.[p]?.description ?? "" });
      }
    }
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== "function" || !/^(can|is|has)[A-Z]/.test(name) || /Role$|Roles$/.test(name) || name === "isLearner") continue;
      if (name === canName) continue;
      const info = d.get(name);
      const at = src.indexOf(`function ${name}`);
      const arrayStyle = /^has\w*(Access|StaffRole)$|^is\w*(Only|Tier)$|^isSuperAdmin$/.test(name) && !/\(user/.test(src.slice(at, at + 80));
      if (arrayStyle) {
        entries.push({ key: `${base}.${name}`, product: prod.product, source: base, kind: "tier", fn: name, perm: null, overrideKey: null, level: "read", label: humanize(name), description: info?.doc || "Who can open this area" });
        continue;
      }
      if ((fn as { length: number }).length !== 1) continue;
      entries.push({ key: `${base}.${name}`, product: prod.product, source: base, kind: "pred", fn: name, perm: null, overrideKey: info?.key ?? null, level: level(name, info?.doc ?? ""), label: humanize(name), description: info?.doc ?? "" });
    }
  }
  return { entries, roles, notes };
}

async function main() {
  const { entries, roles, notes } = await discover();
  const byProduct = new Map<string, number>();
  for (const e of entries) byProduct.set(e.product, (byProduct.get(e.product) ?? 0) + 1);
  console.log(`${entries.length} features in ${byProduct.size} products; ${notes.length} notes`);
  for (const n of notes) console.log("  note:", n);
  if (!process.argv.includes("--write")) return;
  const body = `// GENERATED by scripts/gen-access-catalogue.ts. Do not edit by hand; re-run the generator after a role file changes.\n` +
    `import type { CatalogueEntry } from "./types";\n\n` +
    `export const FILE_PRODUCTS: Record<string, string> = ${JSON.stringify(Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, v.product])), null, 2)};\n\n` +
    `export const PRODUCT_NAMES: Record<string, string> = ${JSON.stringify(Object.fromEntries(Object.values(FILES).map((v) => [v.product, v.name.replace(/ \((SOP roles|authoring roles|Workspace admin)\)$/, "")])), null, 2)};\n\n` +
    `/** Every role of each role file (used by the parity harness and the legacy adapter). */\nexport const FILE_ROLES: Record<string, string[]> = ${JSON.stringify(roles, null, 2)};\n\n` +
    `export const CATALOGUE: CatalogueEntry[] = ${JSON.stringify(entries, null, 2)};\n`;
  writeFileSync(OUT, body);
  console.log("wrote", OUT);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
