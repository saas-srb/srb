/**
 * P0 audit (read-only): the feature catalogue of every product, derived from the role files in src/lib/*-roles.ts by IMPORTING them and
 * EVALUATING every capability for every role (nothing is guessed), plus a source scan for each predicate's description and permission key.
 *   npx tsx scripts/audit-catalogue.ts            prints markdown (also writes docs/commandos-audit-catalogue.md with --write)
 * No database, no network, no production access.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Ctx = { roles: string[]; permissionOverrides: null };
const LIB = join(process.cwd(), "src", "lib");

/** role file -> product (registry key, public slug, product name) */
const PRODUCTS: Record<string, { key: string; slug: string; name: string }> = {
  hrms: { key: "hrms", slug: "talentos", name: "TalentOS (HR)" },
  pms: { key: "pms", slug: "sprintos", name: "SprintOS (Projects)" },
  lms: { key: "lms", slug: "dealflow-ai", name: "DealFlow AI (CRM & Leads)" },
  fms: { key: "fms", slug: "cashflow-ai", name: "CashFlow AI (Finance)" },
  prms: { key: "prms", slug: "spendiq", name: "SpendIQ (Procurement & Expenses)" },
  tms: { key: "tms", slug: "cohort-ai", name: "CohortAI (Training)" },
  messenger: { key: "messenger", slug: "huddle-ai", name: "Huddle AI (Team chat)" },
  sop: { key: "sop", slug: "playbook-ai", name: "Playbook AI (legacy SOP roles)" },
  playbook: { key: "sop", slug: "playbook-ai", name: "Playbook AI (new authoring roles)" },
  lpms: { key: "lpms", slug: "contractflow-ai", name: "ContractFlow AI (Legal)" },
  dlms: { key: "dlms", slug: "cybervault", name: "CyberVault" },
  ots: { key: "ots", slug: "evaliq", name: "EvalIQ (Online tests)" },
  aibots: { key: "aibots", slug: "agentos", name: "AgentOS" },
  intelligence: { key: "intelligence", slug: "databrain-ai", name: "DataBrain AI" },
  smms: { key: "smms", slug: "viralpulse-ai", name: "ViralPulse AI (Social media)" },
  seo: { key: "seo", slug: "rankmax-ai", name: "RankMax AI (SEO)" },
  cms: { key: "cms", slug: "sitecraft-ai", name: "SiteCraft AI (Website)" },
  portal: { key: "portal", slug: "clientos", name: "ClientOS (Client & student portal)" },
  workspace: { key: "workspace", slug: "commandos", name: "CommandOS (Workspace)" },
  admin: { key: "workspace", slug: "commandos", name: "CommandOS (Workspace admin)" },
};

const WRITE = /(manage|create|edit|update|delete|publish|assign|archive|approve|reject|run|send|issue|refund|reconcile|import|upload|post|moderate|configure|settings_manage|write|generate|launch|connect|pay|record|submit|reply|take_over|moderat)/i;
const READ = /(^view|_view|view_|read|download|export|use$|^use|acknowledge|list|see|audit|report|analytics|access)/i;
/** read | write | split (mixes both or can't be told from the name: needs a human decision) */
function level(name: string, doc: string): "read" | "write" | "split" {
  const w = WRITE.test(name), r = READ.test(name);
  if (w && !r) return "write";
  if (r && !w) return "read";
  if (/view|read|see/i.test(doc.slice(0, 60)) && !/manage|create|edit|delete|approve/i.test(doc)) return "read";
  return w && r ? "split" : /manage|create|edit/i.test(doc) ? "write" : "split";
}

function docs(src: string): Map<string, { doc: string; key: string | null; body: string }> {
  const out = new Map<string, { doc: string; key: string | null; body: string }>();
  const re = /(?:\/\*\*([\s\S]*?)\*\/\s*)?export function (\w+)\s*\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g;
  for (const m of src.matchAll(re)) {
    const doc = (m[1] ?? "").replace(/^\s*\* ?/gm, "").replace(/\s+/g, " ").trim();
    const key = /resolvePermission\([^,]+,\s*["']([^"']+)["']/.exec(m[4])?.[1] ?? null;
    out.set(m[2], { doc, key, body: m[4].replace(/\s+/g, " ").trim() });
  }
  return out;
}

interface Feature { uses: number; useFiles: string[]; product: string; slug: string; name: string; source: string; id: string; key: string | null; description: string; level: "read" | "write" | "split"; roles: string[]; defaultExpr: string }
const features: Feature[] = [];
const roleInfo: { file: string; role: string; label: string; description: string }[] = [];
const notes: string[] = [];

async function main() {
  const files = readdirSync(LIB).filter((f) => f.endsWith("-roles.ts")).sort();
  for (const f of files) {
    const base = f.replace("-roles.ts", "");
    const prod = PRODUCTS[base];
    if (!prod) { notes.push(`no product mapping for ${f}`); continue; }
    const src = readFileSync(join(LIB, f), "utf8");
    const mod = (await import(join(LIB, f))) as Record<string, unknown>;
    const d = docs(src);
    const rolesArr = Object.entries(mod).find(([k, v]) => /_ROLES$/.test(k) && Array.isArray(v) && !/STAFF|TEST_TAKER/.test(k))?.[1] as string[] | undefined ?? [];
    const meta = Object.entries(mod).find(([k]) => /_ROLE_META$/.test(k))?.[1] as Record<string, { label: string; description: string }> | undefined;
    for (const r of rolesArr) roleInfo.push({ file: f, role: r, label: meta?.[r]?.label ?? r, description: meta?.[r]?.description ?? "" });
    // Evaluate with every role alone (and a couple of combinations that the code treats specially).
    const ctxOf = (roles: string[]): Ctx => ({ roles, permissionOverrides: null });
    if (base === "playbook" && !rolesArr.length) { const sopMod = (await import(join(LIB, "sop-roles.ts"))) as Record<string, unknown>; rolesArr.push(...(sopMod.SOP_ROLES as string[])); for (const r of rolesArr) roleInfo.push({ file: f, role: r, label: (sopMod.SOP_ROLE_META as Record<string, { label: string; description: string }>)[r]?.label ?? r, description: "(same roles as the legacy SOP file)" }); }
    const rolesToTry = rolesArr.length ? rolesArr : ["super_admin"];

    // Style B: permission enums.
    const permArr = Object.entries(mod).find(([k, v]) => /_PERMISSIONS$/.test(k) && Array.isArray(v) && !/^MANAGE_/.test(k))?.[1] as string[] | undefined;
    const permMeta = Object.entries(mod).find(([k]) => /_PERMISSION_META$/.test(k))?.[1] as Record<string, { label: string; description: string }> | undefined;
    const permKey = Object.entries(mod).find(([k]) => /_PERMISSION_KEY$/.test(k))?.[1] as Record<string, string> | undefined;
    const canFn = Object.entries(mod).find(([k, v]) => /Can$/.test(k) && typeof v === "function")?.[1] as ((u: Ctx, p: string) => boolean) | undefined;
    if (permArr && canFn) {
      for (const p of permArr) {
        const holders = rolesToTry.filter((r) => { try { return canFn(ctxOf([r]), p); } catch { return false; } });
        features.push({ uses: 0, useFiles: [], product: prod.name, slug: prod.slug, name: prod.name, source: f, id: p, key: permKey?.[p] ?? null, description: permMeta?.[p]?.description ?? permMeta?.[p]?.label ?? "", level: level(p, permMeta?.[p]?.description ?? ""), roles: holders, defaultExpr: "role -> permission table" });
      }
    }
    // Style A: predicates (functions taking a RoleContext).
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== "function" || !/^(can|is|has)[A-Z]/.test(name) || /Role$|Roles$/.test(name) || name === "isLearner") continue;
      const info = d.get(name);
      const arrayStyle = /^has\w*(Access|StaffRole)$|^hasAny\w*Role$|^is\w*(Only|Tier)$/.test(name) && !/\(user/.test(src.slice(src.indexOf(`function ${name}`), src.indexOf(`function ${name}`) + 80));
      if (arrayStyle) {
        const holders = rolesToTry.filter((r) => { try { return Boolean((fn as (a: string[]) => boolean)([r])); } catch { return false; } });
        features.push({ uses: 0, useFiles: [], product: prod.name, slug: prod.slug, name: prod.name, source: f, id: name, key: null, description: info?.doc || "Tier gate", level: "read", roles: holders, defaultExpr: "tier gate (who can open the product / which area)" });
        continue;
      }
      if ((fn as { length: number }).length !== 1 && name !== "canMoveRefund") continue;
      if (name === "canMoveRefund") continue;
      const holders = rolesToTry.filter((r) => { try { return Boolean((fn as (u: Ctx) => boolean)(ctxOf([r]))); } catch { return false; } });
      features.push({ uses: 0, useFiles: [], product: prod.name, slug: prod.slug, name: prod.name, source: f, id: name, key: info?.key ?? null, description: info?.doc || "", level: level(name, info?.doc ?? ""), roles: holders, defaultExpr: info?.body.replace(/^return /, "").slice(0, 110) ?? "" });
    }
  }
}

/** Enforcement call sites: how many places outside the role files call each capability (text scan of src). */
function countUses() {
  const files: { path: string; text: string }[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(tsx?)$/.test(f.name) && !/-roles\.ts$/.test(f.name)) files.push({ path: p.replace(process.cwd() + "/", ""), text: readFileSync(p, "utf8") }); } };
  walk(join(process.cwd(), "src"));
  for (const f of features) {
    const re = f.defaultExpr === "role -> permission table" ? new RegExp(`Can\\([^,)]+,\\s*["']${f.id}["']`) : new RegExp(`\\b${f.id}\\(`);
    const keyRe = f.key ? new RegExp(`["']${f.key.replace(/\./g, "\\.")}["']`) : null;
    const base = f.source.replace("-roles.ts", "");
    const loose = f.defaultExpr === "role -> permission table" ? new RegExp(`[\"']${f.id}[\"']`) : null;
    const inProduct = (path: string) => path.includes(`/${f.slug}/`) || path.includes(`/${base}`) || path.includes(`/${base}-`) || path.includes(`${f.slug}`);
    for (const file of files) if (re.test(file.text) || (keyRe && keyRe.test(file.text) && !/permission-catalog/.test(file.path)) || (loose && inProduct(file.path) && loose.test(file.text))) { f.uses++; if (f.useFiles.length < 3) f.useFiles.push(file.path.replace("src/", "")); }
  }
}

function md(): string {
  const byProduct = new Map<string, Feature[]>();
  for (const f of features) (byProduct.get(`${f.product} (/${f.slug})`) ?? byProduct.set(`${f.product} (/${f.slug})`, []).get(`${f.product} (/${f.slug})`)!).push(f);
  const lines: string[] = [
    "# CommandOS audit: generated feature catalogue (P0)",
    "",
    "Generated by `npx tsx scripts/audit-catalogue.ts --write` by IMPORTING every `src/lib/*-roles.ts` and EVALUATING every capability for every role (read-only; no database, no production access). Do not edit by hand.",
    "",
    "Columns: **feature** = the exported capability (permission enum value or predicate); **override key** = the key a Director can toggle today in Users & roles (`permissionOverrides`); **R/W** = proposed level for the new two-level model (`read`, `write`, or `split` = cannot be expressed as one of the two, see the main audit doc section 1.4); **roles holding it by default** = the legacy roles for which the capability is true.",
    "",
  ];
  let total = 0;
  lines.push("## Summary", "", "| Product | Roles | Capabilities | read | write | split | with 0 call sites |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const [p, fs] of byProduct) {
    const roles = new Set(roleInfo.filter((r) => fs.some((f) => f.source === r.file)).map((r) => r.role));
    lines.push(`| ${p} | ${roles.size} | ${fs.length} | ${fs.filter((f) => f.level === "read").length} | ${fs.filter((f) => f.level === "write").length} | ${fs.filter((f) => f.level === "split").length} | ${fs.filter((f) => f.uses === 0).length} |`);
    total += fs.length;
  }
  lines.push(`| **Total** | ${roleInfo.length} | **${total}** | ${features.filter((f) => f.level === "read").length} | ${features.filter((f) => f.level === "write").length} | ${features.filter((f) => f.level === "split").length} | ${features.filter((f) => f.uses === 0).length} |`, "");
  for (const [p, fs] of byProduct) {
    lines.push(`## ${p}`, "");
    const files = [...new Set(fs.map((f) => f.source))];
    for (const file of files) {
      lines.push(`Roles in \`${file}\`: ` + roleInfo.filter((r) => r.file === file).map((r) => `**${r.role}** (${r.label}): ${r.description}`).join(" | "), "");
    }
    lines.push("| Feature | Override key | What it allows today | R/W | Roles holding it by default | Call sites (files) |", "| --- | --- | --- | --- | --- | --- |");
    for (const f of fs) lines.push(`| \`${f.id}\` | ${f.key ? `\`${f.key}\`` : "-"} | ${(f.description || f.defaultExpr || "-").replace(/\|/g, "/")} | ${f.level} | ${f.roles.join(", ") || "-"} | ${f.uses === 0 ? "**0 (no enforcement found)**" : f.uses} |`);
    lines.push("");
  }
  if (notes.length) lines.push("## Notes", "", ...notes.map((n) => `- ${n}`), "");
  return lines.join("\n");
}

main().then(() => {
  countUses();
  const out = md();
  if (process.argv.includes("--write")) writeFileSync("docs/commandos-audit-catalogue.md", out);
  else console.log(out);
  console.error(`features: ${features.length}, roles: ${roleInfo.length}`);
}).catch((e) => { console.error(e); process.exit(1); });
