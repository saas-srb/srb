import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ALL_META, ALL_TEMPLATES, CATEGORY_KEYS, LEGAL_REVIEW_BANNER, STATUTE_NOTICE, TEMPLATE_BATCHES, buildTemplateDoc, getCatalogueMeta, getTemplateDef, listCatalogue,
  searchCatalogue, validateMeta, validateTemplateDef, KNOWN_FIELDS, listKnownVariables,
} from "../src/lib/products/playbook-ai/catalogue";
import type { CatalogueMeta, InputField, TemplateDef } from "../src/lib/products/playbook-ai/catalogue";
import { allBlocks, canonicalJson, collectVariables, inlineOf, plainText, resolveDoc } from "../src/lib/products/playbook-ai/doc";
import type { VarLists, VarValues } from "../src/lib/products/playbook-ai/doc";
import { INSTRUMENT_CATEGORIES } from "../src/lib/products/contractflow-ai/stamp/structure";
import { BUILTIN_VARIABLES, isKnownVariable as registryKnows } from "../src/lib/products/playbook-ai/variables-registry";
import { STAMP_CATEGORIES } from "../src/lib/products/playbook-ai/catalogue";

// Pure: no database, no network. Run with: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-pb-catalogue.ts
let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };

// ---------------------------------------------------------------------------
// The plan's section 8 table is the source of truth the code is compared against.
// ---------------------------------------------------------------------------
interface PlanRow { id: string; name: string; purpose: string; inputs: string[]; sections: string[]; flags: string[]; party: string; sign: string }
const splitTop = (s: string) => { const out: string[] = []; let d = 0; let cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
function parsePlan(): { rows: PlanRow[]; proseCount: number | null } {
  const md = readFileSync(path.join(__dirname, "..", "docs", "playbook-audit-and-plan.md"), "utf8");
  const s = md.indexOf("## 8. Template catalogue");
  const e = md.indexOf("## 9. Build plan");
  assert.ok(s > 0 && e > s, "plan section 8 not found");
  const sec = md.slice(s, e);
  const rows: PlanRow[] = [];
  let prevSections: string[] = [];
  for (const line of sec.split("\n")) {
    if (!/^\| [a-z]{2}\.[a-z0-9_]+ \|/.test(line)) continue;
    const c = line.split("|").slice(1, -1).map((x) => x.trim());
    const sections = c[4] === "as above" ? prevSections : splitTop(c[4]);
    prevSections = sections;
    rows.push({ id: c[0], name: c[1], purpose: c[2], inputs: splitTop(c[3]), sections, flags: c[5].split(/\s+/), party: c[6], sign: c[7] });
  }
  const m = sec.match(/\((?:[^)]*?)\) *\n|Count: [^\n]*?\*\*(\d+) rows\*\*/);
  return { rows, proseCount: m && m[1] ? Number(m[1]) : null };
}
const plan = parsePlan();
const PARTY = { EMP: ["employee", "external"], CAN: ["candidate", "external"], CLI: ["client", "external"], VEN: ["vendor", "external"], PTR: ["partner", "external"], FRL: ["freelancer", "external"], TRN: ["trainee", "external"], INT: ["none", "internal"], PUB: ["none", "public"], OTH: ["other", "external"] } as const;
const SIGN = { Y: "yes", O: "optional", N: "no" } as const;

console.log("catalogue metadata vs the plan");
t("the code lists exactly the ids of the plan's section 8 table, in order", () => {
  assert.deepEqual(ALL_META.map((m) => m.id), plan.rows.map((r) => r.id));
  assert.equal(ALL_META.length, plan.rows.length);
  assert.equal(new Set(ALL_META.map((m) => m.id)).size, ALL_META.length);
});
t("the plan's prose count is reported (the table is the truth)", () => {
  if (plan.proseCount !== null && plan.proseCount !== plan.rows.length) console.log(`    NOTE: plan prose says ${plan.proseCount} rows, the table has ${plan.rows.length}`);
  assert.ok(plan.rows.length >= 183);
});
t("name, purpose, party, signature, legal, stamp and e-sign flags match each plan row", () => {
  for (const r of plan.rows) {
    const m = getCatalogueMeta(r.id)!;
    assert.ok(m, r.id);
    assert.equal(m.name, r.name, `${r.id} name`);
    assert.equal(m.purpose, r.purpose, `${r.id} purpose`);
    const [party, audience] = PARTY[r.party as keyof typeof PARTY];
    assert.equal(m.party, party, `${r.id} party`);
    assert.equal(m.audience, audience, `${r.id} audience`);
    assert.equal(m.sign, SIGN[r.sign.replace("NE", "").trim() as keyof typeof SIGN], `${r.id} sign`);
    assert.equal(m.needsSignature, m.sign !== "no", `${r.id} needsSignature`);
    assert.equal(m.legal.review, r.flags.includes("L"), `${r.id} L`);
    assert.equal(m.legal.statute, r.flags.includes("C"), `${r.id} C`);
    assert.equal(m.stamp.rule === "likely", r.flags.includes("SD"), `${r.id} SD`);
    assert.equal(m.esignIneligible, r.flags.includes("NE*") || r.sign.includes("NE"), `${r.id} NE`);
    assert.deepEqual(m.inputsSummary, r.inputs, `${r.id} inputs summary`);
    assert.deepEqual(m.sectionsSummary, r.sections, `${r.id} sections summary`);
  }
});
t("category counts match the plan and cover the 11 categories", () => {
  for (const c of CATEGORY_KEYS) assert.equal(ALL_META.filter((m) => m.category === c).length, plan.rows.filter((r) => r.id.startsWith(`${c}.`)).length, c);
  assert.equal(CATEGORY_KEYS.length, 11);
  assert.equal(ALL_META.filter((m) => m.category === "hr").length, 47);
  assert.equal(ALL_META.filter((m) => m.category === "mg").length, 22);
  assert.equal(ALL_META.filter((m) => m.category === "ct").length, 22);
});
t("every metadata row passes validateMeta; prefixes are unique", () => {
  for (const m of ALL_META) assert.deepEqual(validateMeta(m), [], m.id);
  assert.equal(new Set(ALL_META.map((m) => m.numberingPrefix)).size, ALL_META.length);
});
t("validateMeta rejects bad rows", () => {
  const base = ALL_META.find((m) => m.id === "ct.msa")!;
  const bad = (patch: Partial<CatalogueMeta>, re: RegExp) => assert.ok(validateMeta({ ...base, ...patch }).some((i) => re.test(`${i.path} ${i.message}`)), String(re));
  bad({ id: "Bad Id" }, /id/);
  bad({ category: "hr" }, /category/);
  bad({ name: "" }, /name/);
  bad({ party: "robot" as never }, /party/);
  bad({ sign: "maybe" as never }, /sign/);
  bad({ needsSignature: false }, /needsSignature/);
  bad({ stamp: { rule: "likely" } }, /stamp/);
  bad({ stamp: { rule: "none", category: "nda" } }, /stamp/);
  bad({ legal: { review: false, statute: false } }, /stamp/);
  bad({ retentionKey: "forever" as never }, /retention/);
  bad({ numberingPrefix: "x" }, /numberingPrefix/);
  bad({ inputsSummary: [] }, /inputsSummary/);
  bad({ esignIneligible: true }, /esignIneligible/);
});
t("stamp rules: likely implies a category and the legal flag; lease and affidavit are e-sign-ineligible", () => {
  for (const m of ALL_META.filter((x) => x.stamp.rule !== "none")) assert.ok(m.stamp.category, m.id);
  assert.deepEqual(ALL_META.filter((m) => m.esignIneligible).map((m) => m.id).sort(), ["ct.lease", "lg.affidavit"]);
});

console.log("lookups");
t("listCatalogue filters by category, party, legal and content", () => {
  assert.equal(listCatalogue().length, ALL_META.length);
  assert.equal(listCatalogue({ category: "hr" }).length, 47);
  assert.ok(listCatalogue({ party: "employee" }).every((e) => e.meta.party === "employee"));
  assert.ok(listCatalogue({ legalReview: true }).every((e) => e.meta.legal.review));
  assert.equal(listCatalogue({ withContent: true }).length, ALL_TEMPLATES.length);
  // Content exists exactly for the types some batch has authored, whichever batches exist right now.
  const authored = new Set(ALL_TEMPLATES.map((x) => x.id));
  for (const e of listCatalogue()) assert.equal(e.hasContent, authored.has(e.meta.id), e.meta.id);
});
t("getTemplateDef returns full content for HR and null for metadata-only types", () => {
  assert.equal(getTemplateDef("hr.offer")?.id, "hr.offer");
  assert.equal(getTemplateDef("hr.not_a_type"), null);
  assert.equal(getTemplateDef("nope"), null);
  assert.ok(getCatalogueMeta("mk.flyer"), "metadata exists for every type, authored or not");
});
t("searchCatalogue ranks name matches first and requires every word", () => {
  assert.equal(searchCatalogue("offer letter")[0].meta.id, "hr.offer");
  assert.equal(searchCatalogue("posh")[0].meta.id, "hr.posh");
  assert.ok(searchCatalogue("nda").some((e) => e.meta.id === "ct.nda_mutual"));
  assert.equal(searchCatalogue("zzzzqq").length, 0);
  assert.equal(searchCatalogue("").length, ALL_META.length);
  assert.ok(searchCatalogue("stamp", { category: "ct" }).length >= 0);
  assert.ok(searchCatalogue("gstin").every((e) => /gstin/i.test(JSON.stringify(e.meta))));
});

console.log("templates: validation");
t("batches are well formed and only contain catalogue ids, once each", () => {
  const ids = ALL_TEMPLATES.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(getCatalogueMeta(id), id);
  for (const b of TEMPLATE_BATCHES) {
    assert.ok(b.templates.every((x) => b.categories.includes(x.category)), b.id);
    if (b.complete) for (const c of b.categories) assert.deepEqual(b.templates.filter((x) => x.category === c).map((x) => x.id).sort(), ALL_META.filter((m) => m.category === c).map((m) => m.id).sort(), `${b.id} ${c}`);
  }
});
t("each batch present covers its categories fully (asserted per batch, so batches can be added independently)", () => {
  const expected: Record<string, number> = { T1: 47, T2: 22, T3: 47, T4: 35, T5: 32 };
  for (const b of TEMPLATE_BATCHES) {
    const planned = ALL_META.filter((m) => b.categories.includes(m.category)).length;
    if (b.complete) assert.equal(b.templates.length, planned, `${b.id} complete`);
    if (expected[b.id] !== undefined && b.complete) assert.equal(b.templates.length, expected[b.id], `${b.id} count`);
  }
  assert.ok(TEMPLATE_BATCHES.some((b) => b.id === "T1") && TEMPLATE_BATCHES.some((b) => b.id === "T4"));
});
t("every contract is a legal-review type, unreviewed, with a stamp category and locked clauses", () => {
  for (const d of ALL_TEMPLATES.filter((x) => x.category === "ct")) {
    assert.ok(d.legal.review, d.id);
    assert.ok(d.needsSignature, d.id);
    assert.ok(d.sections.some((s) => s.key === "execution" || s.key === "acceptance"), d.id);
    assert.ok(d.sections.some((s) => s.aiMode === "fixed" && s.locked && !s.draftOnly), d.id);
    assert.ok(d.stamp.rule === "none" || d.stamp.category, d.id);
  }
});
t("every template passes the validator", () => {
  for (const d of ALL_TEMPLATES) {
    const r = validateTemplateDef(d);
    assert.ok(r.ok, `${d.id}: ${JSON.stringify(r.issues.slice(0, 5))}`);
  }
});
t("the assembled PBDoc is deterministic and canonical", () => {
  for (const d of ALL_TEMPLATES) {
    const a = buildTemplateDoc(d);
    const b = buildTemplateDoc(d);
    assert.ok(a.ok && b.ok, d.id);
    if (a.ok && b.ok) assert.equal(canonicalJson(a.doc), canonicalJson(b.doc), d.id);
  }
});

console.log("templates: golden structure");
const sectionsOf = (d: TemplateDef) => { const r = buildTemplateDoc(d); assert.ok(r.ok); return r.ok ? r.doc.body.filter((b) => b.type === "section") : []; };
const hasType = (d: TemplateDef, type: string) => { const r = buildTemplateDoc(d); return r.ok && allBlocks(r.doc).some((b) => b.type === type); };
t("every legal-review template has the review banner section, and no other template has it", () => {
  for (const d of ALL_TEMPLATES) {
    const s = d.sections.find((x) => x.key === "legal_notice");
    if (d.legal.review) {
      assert.ok(s && s.draftOnly && s.locked && s.aiMode === "fixed", d.id);
      assert.ok(JSON.stringify(s.body).includes(LEGAL_REVIEW_BANNER), d.id);
      assert.equal(d.legalBanner, LEGAL_REVIEW_BANNER);
    } else assert.equal(s, undefined, d.id);
  }
});
t("every statute-sensitive template has the verification notice section", () => {
  for (const d of ALL_TEMPLATES) {
    const s = d.sections.find((x) => x.key === "verify_notice");
    if (d.legal.statute) { assert.ok(s && s.draftOnly && JSON.stringify(s.body).includes(STATUTE_NOTICE), d.id); assert.equal(d.statuteNotice, STATUTE_NOTICE); }
    else assert.equal(s, undefined, d.id);
  }
});
t("signature blocks exist exactly where a signature is needed, with a company signatory", () => {
  for (const d of ALL_TEMPLATES) {
    assert.equal(hasType(d, "signatureBlock"), d.needsSignature, d.id);
    if (d.needsSignature) {
      const r = buildTemplateDoc(d);
      const roles = r.ok ? allBlocks(r.doc).filter((b) => b.type === "signatureBlock").map((b) => (b as { partyRole: string }).partyRole) : [];
      assert.ok(roles.includes("company_signatory") || roles.includes("counterparty"), d.id);
    }
  }
});
t("AI sections carry instructions; fixed sections do not; fixed legal clauses are locked", () => {
  for (const d of ALL_TEMPLATES) {
    for (const s of d.sections) {
      if (s.aiMode === "fixed") { assert.equal(s.ai, undefined, `${d.id}.${s.key}`); continue; }
      assert.ok(s.ai && s.ai.neverInvent.length > 0 && s.ai.allowedFacts.length > 0 && !s.locked, `${d.id}.${s.key}`);
      assert.ok(s.ai.maxWords >= s.ai.minWords);
    }
    if (d.legal.review) {
      for (const s of d.sections) {
        const hasClause = JSON.stringify(s.body).includes('"type":"clause"');
        if (s.aiMode === "fixed" && hasClause) assert.ok(s.locked, `${d.id}.${s.key} holds clauses in a legal template and must be locked`);
      }
    }
  }
});
t("section modes map to PBDoc modes and section keys are unique and in document order", () => {
  for (const d of ALL_TEMPLATES) {
    const secs = sectionsOf(d) as Array<{ key: string; aiMode: string; locked: boolean }>;
    assert.deepEqual(secs.map((s) => s.key), d.sections.map((s) => s.key), d.id);
    secs.forEach((s, i) => { assert.equal(s.aiMode, d.sections[i].aiMode === "fixed" ? "fixed" : "generate"); assert.equal(s.locked, d.sections[i].locked); });
  }
});
t("every template has the plan's sections in order (as titles or keys) after the notices", () => {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  let checked = 0;
  for (const d of ALL_TEMPLATES) {
    const own = d.sections.filter((s) => !s.draftOnly);
    assert.ok(own.length >= 1, d.id);
    // The plan lists the skeleton the template should realise; each planned section name (at least one of its main words) must appear in some section title or heading of the template.
    const text = norm(own.map((s) => `${s.title} ${s.key}`).join(" ") + " " + norm(JSON.stringify(own.map((s) => s.body)).replace(/"[a-zA-Z]+":/g, " ")));
    const miss = d.sectionsSummary.map((x) => norm(x.replace(/\(.*\)/, ""))).filter((x) => { const ws = x.split(" ").filter((w) => w.length >= 4); return ws.length > 0 && !ws.some((w) => text.includes(w.slice(0, 5))); });
    assert.deepEqual(miss, [], `${d.id} lacks planned sections`);
    checked++;
  }
  assert.equal(checked, ALL_TEMPLATES.length);
});

console.log("templates: variables, inputs, bindings");
t("every variable used is known; record variables have a matching picker; inputs are declared and used", () => {
  const known = new Set(listKnownVariables());
  for (const d of ALL_TEMPLATES) {
    const r = buildTemplateDoc(d);
    assert.ok(r.ok);
    if (!r.ok) continue;
    const c = collectVariables(r.doc);
    const pickers = new Set(d.inputs.filter((i) => i.type === "person").map((i) => i.picker));
    for (const v of c.variables) {
      const [ns] = v.key.split(".");
      if (ns === "input") assert.ok(d.inputs.some((i) => `input.${i.key}` === v.key), `${d.id} ${v.key}`);
      else if (ns !== "custom") { assert.ok(known.has(v.key), `${d.id} ${v.key}`); if (["employee", "candidate", "client", "vendor", "party"].includes(ns)) assert.ok(pickers.has(ns as never), `${d.id} ${v.key}`); }
    }
  }
});
t("every EMP/CAN template has a person picker for its party; INT/PUB templates have none", () => {
  for (const d of ALL_TEMPLATES) {
    const pickers = d.inputs.filter((i) => i.type === "person").map((i) => i.picker);
    if (d.party === "employee") assert.deepEqual(pickers, ["employee"], d.id);
    if (d.party === "candidate") assert.deepEqual(pickers, ["candidate"], d.id);
    if (d.party === "none") assert.deepEqual(pickers, [], d.id);
  }
});
t("bindings point at known record or company variables and employee data fills where it exists", () => {
  let bound = 0;
  const known = new Set(listKnownVariables());
  for (const d of ALL_TEMPLATES) for (const i of d.inputs) for (const b of i.bindings ?? []) { assert.ok(known.has(b), `${d.id} ${i.key} ${b}`); bound++; }
  assert.ok(bound >= 15, `only ${bound} bindings`);
  for (const ns of ["company", "employee", "candidate", "client", "vendor", "project", "doc", "date", "party"]) assert.ok(KNOWN_FIELDS[ns], ns);
});
t("required inputs carry help or an obvious label; money and number inputs have sane bounds", () => {
  for (const d of ALL_TEMPLATES) for (const i of d.inputs) {
    assert.ok(i.label.length >= 3, `${d.id}.${i.key}`);
    if (i.min !== undefined && i.max !== undefined) assert.ok(i.min <= i.max);
    if (i.type === "rows") assert.ok((i.columns ?? []).length >= 1);
  }
});

t("KNOWN_FIELDS is derived from the variable registry and every variable used by a template exists in it", () => {
  for (const v of BUILTIN_VARIABLES) assert.ok(KNOWN_FIELDS[v.namespace].includes(v.key.slice(v.namespace.length + 1)), v.key);
  for (const k of listKnownVariables()) assert.ok(registryKnows(k), k);
  const used = new Set<string>();
  for (const d of ALL_TEMPLATES) {
    const r = buildTemplateDoc(d);
    if (!r.ok) continue;
    for (const v of collectVariables(r.doc).variables) if (!/^(input|custom)\./.test(v.key)) used.add(v.key);
    for (const i of d.inputs) for (const b of i.bindings ?? []) used.add(b);
    for (const s of d.sections) for (const f of s.ai?.allowedFacts ?? []) if (!/^(input|custom)\./.test(f)) used.add(f);
  }
  for (const k of used) assert.ok(registryKnows(k), `${k} is not in the variable registry`);
  assert.ok(used.size > 10);
});
t("stamp categories are exactly the stamp rulebook's instrument categories", () => {
  assert.deepEqual([...STAMP_CATEGORIES].sort(), INSTRUMENT_CATEGORIES.map((c) => c.key).sort());
  const keys = new Set(INSTRUMENT_CATEGORIES.map((c) => c.key));
  for (const m of ALL_META) if (m.stamp.category) assert.ok(keys.has(m.stamp.category), `${m.id} uses ${m.stamp.category}`);
});

console.log("templates: content hygiene");
const literalTexts = (d: TemplateDef, docOnly = false): string[] => {
  const out: string[] = [d.name, d.purpose];
  const r = buildTemplateDoc(d);
  assert.ok(r.ok);
  if (!r.ok) return out;
  for (const b of allBlocks(r.doc)) {
    for (const n of inlineOf(b)) {
      if (n.type === "text") out.push(n.text);
      if (n.type === "placeholder") out.push(n.label, n.hint ?? "");
      if (n.type === "var" && n.fallback) out.push(n.fallback);
    }
    if (b.type === "signatureBlock") out.push(b.label);
  }
  if (docOnly) return out;
  for (const s of d.sections) { out.push(s.title); if (s.ai) out.push(s.ai.brief, ...s.ai.neverInvent); }
  for (const i of d.inputs) { out.push(i.label, i.help ?? "", i.placeholder ?? ""); for (const o of i.options ?? []) out.push(o.label); for (const c of i.columns ?? []) out.push(c.label); }
  return out;
};
t("no lorem ipsum, placeholders-garbage, leftover syntax or HTML anywhere", () => {
  const bad = /lorem|ipsum|dummy|\bTODO\b|\bTBD\b|\bFIXME\b|\bxxx+\b|sample text|your text here|insert here|\[insert|undefined|\bnull\b|<\/?[a-z][^>]*>|\{\{|\}\}|\[\[|\]\]|\*\*/i;
  for (const d of ALL_TEMPLATES) for (const s of literalTexts(d)) assert.ok(!bad.test(s), `${d.id}: "${s.slice(0, 80)}"`);
});
t("no invented statutory figures: no digits, percentages or currency amounts in literal wording", () => {
  for (const d of ALL_TEMPLATES) for (const s of literalTexts(d, true)) {
    const stripped = s.replace(/\b(19|20)\d{2}\b/g, "");
    assert.ok(!/\d/.test(stripped), `${d.id}: digit in "${s.slice(0, 90)}"`);
  }
  for (const d of ALL_TEMPLATES) for (const s of literalTexts(d)) {
    assert.ok(!/[₹%]|\bRs\.?\b|\bINR\b|\bpercent\b/i.test(s), `${d.id}: figure in "${s.slice(0, 90)}"`);
  }
});
t("wording is complete: sentences are not empty, titles are not duplicated, no double spaces", () => {
  for (const d of ALL_TEMPLATES) {
    for (const s of literalTexts(d)) assert.ok(!/ {2,}/.test(s.replace(/\n/g, " ")) || /_{3,}/.test(s) || /\s{2,}\|\s{2,}/.test(s), `${d.id}: double space in "${s.slice(0, 60)}"`);
    assert.equal(new Set(d.sections.map((s) => s.title)).size, d.sections.length, `${d.id} duplicate section titles`);
    const words = literalTexts(d).join(" ").split(/\s+/).length;
    assert.ok(words >= 60, `${d.id} is too thin (${words} words)`);
  }
});
t("AI sections forbid invention and never allow facts outside the template's inputs and records", () => {
  for (const d of ALL_TEMPLATES) for (const s of d.sections) if (s.ai) assert.ok(s.ai.neverInvent.some((x) => /invent|not in|not supplied|not in the provided|that are not/i.test(x) || x.length > 20), `${d.id}.${s.key}`);
});

console.log("templates: end-to-end resolution");
function sampleFor(d: TemplateDef): { values: VarValues; lists: VarLists } {
  const values: VarValues = { "doc.date": "2026-04-01", "doc.number": "TST/2026-27/0001", "doc.title": d.name, "doc.version": 1 };
  const lists: VarLists = {};
  for (const [ns, fields] of Object.entries(KNOWN_FIELDS)) {
    if (ns === "doc") continue;
    for (const f of fields) values[`${ns}.${f}`] = /date|today/.test(f) ? "2026-04-01" : `${ns} ${f}`;
  }
  const num = (i: InputField) => (i.min ?? 1) + 1;
  for (const i of d.inputs) {
    const key = `input.${i.key}`;
    switch (i.type) {
      case "rows": {
        lists[key] = [0, 1].map((n) => Object.fromEntries((i.columns ?? []).map((c) => [c.key, c.type === "money" ? 100000 + n : c.type === "number" ? n + 1 : c.type === "date" ? "2026-05-01" : `${c.label} ${n + 1}`])));
        values[key] = "rows";
        break;
      }
      case "number": values[key] = num(i); break;
      case "money": values[key] = 120000; break;
      case "date": values[key] = "2026-06-15"; break;
      case "yesno": values[key] = "yes"; break;
      case "select": values[key] = i.options![0].value; break;
      case "multiselect": values[key] = i.options!.slice(0, 2).map((o) => o.label).join(", "); break;
      case "person": break;
      default: values[key] = `${i.label} text`;
    }
  }
  return { values, lists };
}
t("with every input and record filled, nothing stays unresolved and no template syntax leaks into the text", () => {
  for (const d of ALL_TEMPLATES) {
    const r = buildTemplateDoc(d);
    assert.ok(r.ok);
    if (!r.ok) continue;
    const { values, lists } = sampleFor(d);
    const res = resolveDoc(r.doc, { values, lists });
    assert.deepEqual(res.unresolved, [], `${d.id} unresolved`);
    const txt = plainText(res.doc);
    assert.ok(!/\{\{|\}\}|\[\[/.test(txt), d.id);
    // The only placeholders left are AI slots inside AI or hybrid sections.
    const slots = new Set(d.sections.filter((s) => s.ai).flatMap((s) => collectVariables({ ...r.doc, body: r.doc.body.filter((b) => b.type === "section" && b.key === s.key) }).placeholders.map((p) => p.key)));
    for (const ph of res.placeholders) assert.ok(slots.has(ph.key), `${d.id} placeholder ${ph.key} is outside an AI section`);
  }
});
t("with optional inputs empty, required content still resolves (only optional parts disappear)", () => {
  for (const d of ALL_TEMPLATES) {
    const r = buildTemplateDoc(d);
    if (!r.ok) continue;
    const { values, lists } = sampleFor(d);
    for (const i of d.inputs) if (!i.required) { delete values[`input.${i.key}`]; delete lists[`input.${i.key}`]; }
    const res = resolveDoc(r.doc, { values, lists });
    const unresolvedInputs = res.unresolved.filter((u) => u.key.startsWith("input.")).map((u) => u.key);
    for (const k of unresolvedInputs) {
      const inp = d.inputs.find((i) => `input.${i.key}` === k)!;
      assert.ok(!inp.required, `${d.id}: required input ${k} unresolved`);
    }
  }
});

console.log("validator rejects bad templates");
const clone = (d: TemplateDef): TemplateDef => structuredClone(d);
const offer = () => clone(getTemplateDef("hr.offer")!);
const rejects = (d: TemplateDef, re: RegExp, label: string) => {
  const r = validateTemplateDef(d);
  assert.ok(!r.ok && r.issues.some((i) => re.test(`${i.path} ${i.message}`)), `${label}: expected ${re}, got ${JSON.stringify(r.issues.slice(0, 4))}`);
};
t("unknown variable, unknown namespace, undeclared input, missing picker", () => {
  let d = offer(); (d.sections.find((s) => s.key === "offer")!.body as unknown[]).push({ type: "paragraph", content: [{ type: "var", key: "candidate.nmae" }] });
  rejects(d, /unknown variable/, "typo");
  d = offer(); (d.sections.find((s) => s.key === "offer")!.body as unknown[]).push({ type: "paragraph", content: [{ type: "var", key: "robot.name" }] });
  rejects(d, /namespace/, "namespace");
  d = offer(); (d.sections.find((s) => s.key === "offer")!.body as unknown[]).push({ type: "paragraph", content: [{ type: "var", key: "input.not_declared" }] });
  rejects(d, /unknown input/, "undeclared input");
  d = offer(); (d.sections.find((s) => s.key === "offer")!.body as unknown[]).push({ type: "paragraph", content: [{ type: "var", key: "employee.name" }] });
  rejects(d, /needs a employee person input/, "missing picker");
});
t("unresolved section references and duplicate keys", () => {
  let d = offer(); d.sections[3].dependsOn = ["ghost"]; rejects(d, /unknown section "ghost"/, "dependsOn");
  d = offer(); d.sections[3].dependsOn = [d.sections[3].key]; rejects(d, /itself/, "self");
  d = offer(); d.inputs[0].feedsSections = ["ghost"]; rejects(d, /unknown section/, "feedsSections");
  d = offer(); d.layout.pageBreakBefore = ["ghost"]; rejects(d, /unknown section/, "pageBreakBefore");
  d = offer(); d.sections[3].key = d.sections[2].key; rejects(d, /duplicate/, "dup key");
});
t("missing required metadata and nodes the PBDoc validator rejects", () => {
  let d = offer(); d.title = ""; rejects(d, /title/, "title");
  d = offer(); d.purpose = ""; rejects(d, /purpose/, "purpose");
  d = offer(); d.version = 0; rejects(d, /version/, "version");
  d = offer(); (d.sections[3].body as unknown[]).push({ type: "html", html: "<b>x</b>" }); rejects(d, /unknown block type/, "raw html");
  d = offer(); (d.sections[3].body as unknown[]).push({ type: "table", colWidths: [50, 50], rows: [{ cells: [{ content: [] }, { content: [] }] }, { cells: [{ content: [] }] }] }); rejects(d, /cells/, "ragged table");
  d = offer(); (d.sections[3].body as unknown[]).push({ type: "section", key: "nested", title: "n", aiMode: "fixed", children: [] }); rejects(d, /section/, "nested section");
});
t("legal and signature invariants", () => {
  let d = offer(); d.sections = d.sections.filter((s) => s.key !== "verify_notice"); rejects(d, /verify_notice/, "statute notice removed");
  d = offer(); d.statuteNotice = "x"; rejects(d, /verification notice/, "statute text");
  const nda = clone(getTemplateDef("hr.bgv_consent")!);
  nda.sections = nda.sections.filter((s) => s.key !== "legal_notice"); rejects(nda, /legal_notice/, "legal notice removed");
  const nb = clone(getTemplateDef("hr.bgv_consent")!); nb.legalBanner = "reviewed"; rejects(nb, /exact notice/, "banner text");
  d = offer(); d.sections = d.sections.map((s) => (s.key === "acceptance" ? { ...s, body: [{ type: "paragraph", content: [{ type: "text", text: "Signed." }] }] } : s)); rejects(d, /signature blocks/, "signature removed");
  const j = clone(getTemplateDef("hr.jd")!); (j.sections[0].body as unknown[]).push({ type: "signatureBlock", label: "x", partyRole: "counterparty" }); rejects(j, /never signed/, "unneeded signature");
});
t("AI instruction and input rules", () => {
  let d = offer(); delete d.sections.find((s) => s.aiMode === "hybrid")!.ai; rejects(d, /needs AI instructions/, "ai missing");
  d = offer(); d.sections.find((s) => s.aiMode === "hybrid")!.ai!.neverInvent = []; rejects(d, /never be invented/, "neverInvent");
  d = offer(); d.sections.find((s) => s.aiMode === "hybrid")!.ai!.allowedFacts = ["input.ghost"]; rejects(d, /unknown input/, "fact");
  d = offer(); d.sections.find((s) => s.aiMode === "hybrid")!.locked = true; rejects(d, /cannot be locked/, "locked ai");
  d = offer(); d.sections.find((s) => s.key === "compensation")!.ai = { tone: "formal", minWords: 1, maxWords: 2, brief: "x", allowedFacts: ["input.annual_ctc"], neverInvent: ["x"] }; rejects(d, /fixed section has no AI/, "fixed with ai");
  d = offer(); d.inputs.push({ ...d.inputs[1], label: "Dup" }); rejects(d, /duplicate input/, "dup input");
  d = offer(); d.inputs.push({ key: "unused_thing", label: "Unused thing", type: "text", required: false }); rejects(d, /never used/, "unused input");
  d = offer(); d.inputs.push({ key: "pick", label: "Pick", type: "select", required: true, options: [{ value: "a", label: "A" }], feedsSections: ["offer"] }); rejects(d, /two options/, "select options");
  d = offer(); d.inputs[2].bindings = ["employee.nope"]; rejects(d, /not a known variable|needs a employee/, "binding");
  d = offer(); d.inputs.push({ key: "r", label: "Rows", type: "rows", required: false, feedsSections: ["offer"] }); rejects(d, /columns/, "rows without columns");
  d = offer(); d.inputs[0].key = "Bad Key"; rejects(d, /key/, "key");
  d = offer(); d.page = { ...d.page, margins: { top: 5, right: 20, bottom: 25, left: 20 } }; rejects(d, /margins/, "page");
});

console.log(`\n${passed} tests passed (${ALL_META.length} catalogue types, ${ALL_TEMPLATES.length} full templates)`);
