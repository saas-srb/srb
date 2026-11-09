import { writeFileSync } from "node:fs";
import { ALL_TEMPLATES } from "../src/lib/products/playbook-ai/catalogue/templates";
import { buildTemplateDoc, validateTemplateDef } from "../src/lib/products/playbook-ai/catalogue/validate";
import type { RawBlock, TemplateDef, TemplateSection } from "../src/lib/products/playbook-ai/catalogue/types";
import { DEFAULT_BRAND } from "../src/lib/products/playbook-ai/brand/types";
import { standardFor } from "../src/lib/products/playbook-ai/catalogue/standards";
import { buildLibraryDoc, listLibrary } from "../src/lib/products/playbook-ai/item-library";

/**
 * Library audit. Pure (no database). Usage:
 *   npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/audit-pb-library.ts            content audit of all templates, SOPs and KPI sheets
 *   ... scripts/audit-pb-library.ts --render [--only=<prefix>] [--limit=<n>]                       also renders every item to PDF and DOCX
 * With MONGODB_URI set to a throwaway database name (the renderer imports the data layer, nothing is read or written).
 */
const SAMPLE_COMPANY = { "company.name": "Northwind Demo", "company.legal_name": "Northwind Demo Private Limited", "company.address": "12 Example Road, Pune, India", "company.email": "hello@example.test" };
const RENDER = process.argv.includes("--render");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? "0");

function textOf(n: unknown, out: string[] = []): string[] {
  if (Array.isArray(n)) { n.forEach((x) => textOf(x, out)); return out; }
  if (typeof n !== "object" || n === null) return out;
  const o = n as Record<string, unknown>;
  if (o.type === "text" && typeof o.text === "string") out.push(o.text);
  else if (o.type === "var" && typeof o.key === "string") out.push(`{{${o.key}}}`);
  else if (o.type === "placeholder") out.push(`[${String(o.label ?? o.key)}]`);
  else if (o.type === "signatureBlock") out.push(`(signature ${String(o.label)})`);
  for (const v of Object.values(o)) if (typeof v === "object") textOf(v, out);
  return out;
}
const hasType = (n: unknown, t: string): boolean => JSON.stringify(n).includes(`"type":"${t}"`);
const plain = (b: RawBlock[]) => textOf(b).join(" ").replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

const STUB = /\b(TBD|TBC|lorem|ipsum|to be (written|added|completed|drafted)|\[AI|AI will|write here|insert (text|details|content) here|xxx+|placeholder text|coming soon)\b/i;
const STAT_FIGURE = /(₹|\bRs\.?\s*\d|\bINR\b|\d+\s*%|\bper ?cent\b)/i;

interface Finding { id: string; level: "fail" | "warn"; msg: string }
const findings: Finding[] = [];
const bad = (id: string, msg: string) => findings.push({ id, level: "fail", msg });
const warn = (id: string, msg: string) => findings.push({ id, level: "warn", msg });

const CT_EXPECT: [string, RegExp][] = [["parties or definitions", /part(y|ies)|definit|interpret|background|recital/i], ["scope or services or subject", /scope|services|subject|purpose|engagement|deliverable|grant|licen|supply|work/i], ["term or termination", /term|terminat|duration|expiry/i], ["governing law or disputes", /governing|law|jurisdiction|dispute|arbitrat/i], ["execution or signature", /execut|signature|sign|witness/i]];

function auditSection(def: TemplateDef, s: TemplateSection) {
  const id = `${def.id}#${s.key}`;
  const t = plain(s.body);
  if (STUB.test(t)) bad(id, `stub wording: ${t.slice(0, 80)}`);
  const structural = hasType(s.body, "signatureBlock") || hasType(s.body, "repeat") || hasType(s.body, "conditional") || hasType(s.body, "table") || hasType(s.body, "callout") || s.draftOnly || (hasType(s.body, "table") && t.length >= 60) || hasType(s.body, "pageBreak");
  const w = words(t.replace(/\{\{[^}]*\}\}/g, "x"));
  if (s.aiMode !== "fixed") {
    if (!structural && s.key !== "headline" && (t.length < 150 || w < 20)) bad(id, `AI section default body too thin (${t.length} chars, ${w} words)`);
    if (!s.ai) bad(id, "AI section has no instructions");
  } else if (!structural && t.length < 60 && !s.noHeading) bad(id, `fixed section very short (${t.length} chars)`);
  if (!s.draftOnly && STAT_FIGURE.test(t.replace(/\{\{[^}]*\}\}/g, ""))) warn(id, `literal figure in wording: ${(STAT_FIGURE.exec(t) ?? [""])[0]}`);
  if (/(^|\s)\.\.\.(\s|$)/.test(t)) bad(id, "contains '...'");
}

function auditTemplate(def: TemplateDef) {
  const v = validateTemplateDef(def);
  const issues = (v as unknown as { issues?: { path: string; message: string }[]; ok: boolean }).issues ?? [];
  for (const i of issues.slice(0, 5)) bad(def.id, `invalid: ${i.path} ${i.message}`);
  const built = buildTemplateDoc(def);
  if (!built.ok) bad(def.id, `does not build: ${built.issues[0]?.message}`);
  if (!def.title?.trim()) bad(def.id, "no title");
  const body = def.sections.filter((s) => !s.draftOnly);
  const total = plain(body.flatMap((s) => s.body));
  const min = def.category === "ct" ? 1500 : 350;
  if (total.length < min) bad(def.id, `whole document is short (${total.length} chars; expected at least ${min})`);
  if (body.length < 3 && total.length < (def.category === "ct" ? 3000 : 500)) bad(def.id, `only ${body.length} sections and ${total.length} chars`);
  if (def.needsSignature && !hasType(body.flatMap((s) => s.body), "signatureBlock")) bad(def.id, "needs a signature but has no signature block");
  if (def.legal.review && (!def.legalBanner || !def.sections.some((s) => s.key === "legal_notice"))) bad(def.id, "legal type without the review banner section");
  if (def.category === "ct") for (const [what, re] of CT_EXPECT) if (!body.some((s) => re.test(s.title) || re.test(plain(s.body).slice(0, 400)))) warn(def.id, `contract has no ${what}`);
  if (!def.inputs.length) warn(def.id, "no inputs");
  const std = standardFor(def.id);
  const wordsAll = words(total.replace(/\{\{[^}]*\}\}/g, "x"));
  if (wordsAll < std.minWords) bad(def.id, `below the ${std.cls} standard: ${wordsAll} words, needs ${std.minWords}`);
  for (const r of std.required) if (r.name !== "body" && r.name !== "detail or content" && r.name !== "details" && !body.some((s) => r.re.test(s.title) || r.re.test(plain(s.body).slice(0, 600)))) bad(def.id, `missing ${r.name}`);
  for (const s of def.sections) auditSection(def, s);
}

for (const def of ALL_TEMPLATES) auditTemplate(def);
{
  const seen = new Map<string, Set<string>>();
  for (const d of ALL_TEMPLATES) for (const sec of d.sections) { if (sec.draftOnly) continue; for (const b of sec.body) { if (b.type !== "paragraph" && b.type !== "clause") continue; const t = plain([b]).replace(/\{\{[^}]*\}\}/g, "x").toLowerCase(); if (t.length < 80) continue; (seen.get(t) ?? seen.set(t, new Set()).get(t)!).add(d.id); } }
  for (const [t, ids] of seen) if (ids.size >= 5 && ![...ids].some((i) => i.startsWith("ct."))) bad([...ids][0], `generic text reused in ${ids.size} templates (${[...ids].slice(0, 4).join(", ")}): ${t.slice(0, 60)}`);
}
const SOP_SECTIONS = ["Purpose", "Scope", "Roles", "Definitions", "Prerequisites", "Procedure", "Controls", "Records", "Performance", "Exceptions", "References"];
const KPI_SECTIONS = ["Role purpose", "Key performance indicators", "Scoring", "Review cadence", "Rating scale", "Improvement plan", "sign-off"];
for (const kind of ["sop", "kpi"] as const) for (const e of listLibrary(kind)) {
  const b = buildLibraryDoc(e.id);
  if (!b) { bad(e.id, "does not build"); continue; }
  const t = JSON.stringify(b.doc.body);
  if (STUB.test(t)) bad(e.id, "stub wording");
  const heads = (b.doc.body as unknown as { type: string; content?: { text?: string }[] }[]).filter((x) => x.type === "heading").map((x) => (x.content ?? []).map((c) => c.text ?? "").join(""));
  for (const need of kind === "sop" ? SOP_SECTIONS : KPI_SECTIONS) if (!heads.some((h) => h.toLowerCase().includes(need.toLowerCase()))) bad(e.id, `missing section ${need}`);
  const wc = words(textOf(b.doc.body).join(" ").replace(/\{\{[^}]*\}\}/g, "x"));
  if (wc < (kind === "sop" ? 350 : 330)) bad(e.id, `only ${wc} words`);
  if (kind === "sop" && !/\|/.test(JSON.stringify(b.doc.body)) && !t.includes('"table"')) bad(e.id, "no procedure table");
}

if (process.argv.includes("--checklist")) {
  const { classOf, standardFor: sf } = require("../src/lib/products/playbook-ai/catalogue/standards") as typeof import("../src/lib/products/playbook-ai/catalogue/standards");
  void classOf;
  const bad = new Set(findings.filter((f) => f.level === "fail").map((f) => f.id.split("#")[0]));
  let md = "# Library content checklist\n\nGenerated by `scripts/audit-pb-library.ts --checklist`. One row per library item: its class, the minimum default words it must have, the sections an industry-standard version of that type must contain (class sections plus type-specific ones), the words it has now, and whether it passes the audit. Indian-law references are by name only; no section numbers, rates or amounts are stated in any default text, and every figure comes from an input.\n\n| Item | Class | Min words | Words now | Required sections | Status |\n|---|---|---|---|---|---|\n";
  for (const d of ALL_TEMPLATES) {
    const st = sf(d.id);
    const wn = words(plain(d.sections.filter((x) => !x.draftOnly).flatMap((x) => x.body)).replace(/\{\{[^}]*\}\}/g, "x"));
    md += `| ${d.id} ${d.name} | ${st.cls} | ${st.minWords} | ${wn} | ${st.required.filter((r) => !["body", "detail or content", "details"].includes(r.name)).map((r) => r.name).join("; ")} | ${bad.has(d.id) ? "FAIL" : "pass"} |\n`;
  }
  for (const kind of ["sop", "kpi"] as const) for (const e of listLibrary(kind)) {
    const b = buildLibraryDoc(e.id)!;
    const wn = words(textOf(b.doc.body).join(" ").replace(/\{\{[^}]*\}\}/g, "x"));
    md += `| ${e.id} ${e.title} | ${kind} | ${kind === "sop" ? 350 : 330} | ${wn} | ${(kind === "sop" ? SOP_SECTIONS : KPI_SECTIONS).join("; ")} | ${bad.has(e.id) ? "FAIL" : "pass"} |\n`;
  }
  writeFileSync("docs/library-content-checklist.md", md);
  console.log("checklist written");
}

const fails = findings.filter((f) => f.level === "fail");
const warns = findings.filter((f) => f.level === "warn");
const failIds = new Set(fails.map((f) => f.id.split("#")[0]));
const thinAi = fails.filter((f) => f.msg.startsWith("AI section default body too thin")).length;
console.log(`templates ${ALL_TEMPLATES.length}, sops ${listLibrary("sop").length}, kpis ${listLibrary("kpi").length}`);
console.log(`FAIL ${fails.length} findings in ${failIds.size} items (thin AI sections: ${thinAi}); WARN ${warns.length}`);
for (const f of fails.slice(0, Number(process.env.SHOW ?? 400))) console.log("  FAIL", f.id, "-", f.msg);
if (process.env.WARN) for (const f of warns) console.log("  warn", f.id, "-", f.msg);
writeFileSync(process.env.AUDIT_OUT ?? "/tmp/audit-pb-library.json", JSON.stringify({ fails, warns }, null, 1));

async function renderAll() {
  const { renderPdf } = await import("../src/lib/products/playbook-ai/doc/render/pdf");
  const { renderDocx } = await import("../src/lib/products/playbook-ai/doc/render/docx");
  const { renderLibraryDocument, listRenderTargets } = await import("../src/lib/products/playbook-ai/library-render");
  void renderPdf; void renderDocx;
  let targets = listRenderTargets();
  if (only) targets = targets.filter((t) => t.id.startsWith(only));
  if (limit) targets = targets.slice(0, limit);
  const problems: string[] = [];
  let n = 0;
  for (const t of targets) {
    n++;
    for (const format of ["pdf", "docx"] as const) {
      const t0 = Date.now();
      try {
        const r = await Promise.race([renderLibraryDocument(t.kind, t.id, format, { company: SAMPLE_COMPANY, brandSettings: DEFAULT_BRAND }), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout 60s")), 60_000))]);
        const ms = Date.now() - t0;
        if (!r.ok) problems.push(`${t.id} ${format}: ${r.message}`);
        else if (format === "pdf" && (r.pages ?? 0) > 100) problems.push(`${t.id} pdf: ${r.pages} pages`);
        if (ms > 20_000) problems.push(`${t.id} ${format}: slow ${ms} ms`);
        if (n % 10 === 0 && format === "pdf") console.log(`  rendered ${n}/${targets.length} (${t.id}: ${r.ok ? r.pages : "?"} pages, ${ms} ms)`);
      } catch (e) {
        problems.push(`${t.id} ${format}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  console.log(`render: ${targets.length} items, ${problems.length} problems`);
  for (const p of problems) console.log("  RENDER FAIL", p);
}

(RENDER ? renderAll() : Promise.resolve()).then(() => process.exit(fails.length || (RENDER && false) ? 1 : 0)).catch((e) => { console.error(e); process.exit(2); });
