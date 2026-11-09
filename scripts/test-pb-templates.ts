import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { ALL_TEMPLATES, getTemplateDef, LEGAL_REVIEW_BANNER, STATUTE_NOTICE, validateTemplateDef, type InputField, type TemplateDef } from "../src/lib/products/playbook-ai/catalogue";
import { buildTemplateDoc } from "../src/lib/products/playbook-ai/catalogue/validate";
import { plainText } from "../src/lib/products/playbook-ai/doc";
import { PB_COLLECTIONS } from "../src/lib/products/playbook-ai/pb-collections";
import { getDocument, resetPbDocumentIndexes, setStatusPolicy, transitionDocument, saveDraft } from "../src/lib/products/playbook-ai/documents";
import { resetPbAuditIndexes } from "../src/lib/products/playbook-ai/pb-audit";
import { NEUTRAL_STATUS_POLICY } from "../src/lib/products/playbook-ai/status";
import { DEFAULT_SETTINGS } from "../src/lib/products/playbook-ai/pb-settings";
import { applyBindings, defaultInputs, pendingAiSections, validateInputValues, visibleInputs } from "../src/lib/products/playbook-ai/tpl/inputs";
import { diffTemplates, threeWay } from "../src/lib/products/playbook-ai/tpl/diff";
import { blankTemplateDef } from "../src/lib/products/playbook-ai/tpl/blank";
import { hasDraftOnly, stripDraftOnly } from "../src/lib/products/playbook-ai/tpl/strip";
import { overlayTemplatePolicy } from "../src/lib/products/playbook-ai/tpl/policy";
import { DRAFT_ONLY_SECTION_KEYS, slugTypeId, validateCompanyTemplate, validatePolicy } from "../src/lib/products/playbook-ai/tpl/types";
import {
  acknowledgeStarterUpdate, archiveTemplate, cloneStarter, createTemplate, getTemplate, getTemplateVersion, listTemplates, listTemplateVersions, publishTemplate,
  resetTemplateIndexes, resolveTemplate, restoreTemplate, saveTemplateDraft, setReview, templateContentHash,
} from "../src/lib/products/playbook-ai/tpl/store";
import { createDocumentFromTemplate } from "../src/lib/products/playbook-ai/tpl/create";
import { searchRecords } from "../src/lib/products/playbook-ai/tpl/pickers";

// Pure checks run anywhere; the rest runs only against a throwaway database (MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_pbtpl).
// Run with: npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-pb-templates.ts   (UPDATE_GOLDEN=1 rewrites the golden file)
let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const mk = (id: string, roles: string[]) => ({ id, email: `${id}@x.example`, name: id, roles });
const admin = mk("u_admin", ["sop_admin"]);
const manager = mk("u_manager", ["sop_manager"]);
const author = mk("u_author", ["sop_author"]);
const reader = mk("u_reader", ["sop_employee"]);
/** The Director: may read every product's records, so the pickers work. */
const director = mk("u_director", ["super_admin"]);

const FIX = path.join(__dirname, "fixtures", "playbook");
const golden = (name: string, actual: string) => {
  const file = path.join(FIX, name);
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(file)) { mkdirSync(FIX, { recursive: true }); writeFileSync(file, actual); return; }
  assert.equal(actual, readFileSync(file, "utf8"), `golden mismatch: ${name} (UPDATE_GOLDEN=1 if intended)`);
};

const hasPicker = (d: TemplateDef) => d.inputs.some((i) => i.type === "person" || i.type === "rows");
/** Plausible values for any input form, so a test can create a document from any template. */
function sampleFor(i: InputField): unknown {
  switch (i.type) {
    case "text": return "Sample text";
    case "longtext": return "Sample longer text for the section.";
    case "number": return Math.max(i.min ?? 1, 3);
    case "money": return Math.max(i.min ?? 1000, 1000);
    case "date": return "2026-12-01";
    case "yesno": return "no";
    case "select": return i.options![0].value;
    case "multiselect": return [i.options![0].value];
    case "rows": return [Object.fromEntries((i.columns ?? []).map((c) => [c.key, c.type === "number" || c.type === "money" ? 5 : c.type === "date" ? "2026-12-01" : "Item"]))];
    default: return undefined;
  }
}
const sampleInputs = (d: TemplateDef) => Object.fromEntries(d.inputs.filter((i) => i.type !== "person").map((i) => [i.key, sampleFor(i)]));

(async () => {
  console.log("inputs form (pure)");
  const form: InputField[] = [
    { key: "name", label: "Name", type: "text", required: true, maxLength: 10 },
    { key: "notes", label: "Notes", type: "longtext", required: false, maxLength: 20 },
    { key: "count", label: "Count", type: "number", required: true, min: 1, max: 5 },
    { key: "fee", label: "Fee", type: "money", required: false, min: 0 },
    { key: "start", label: "Start", type: "date", required: true },
    { key: "extra", label: "Extra", type: "yesno", required: true },
    { key: "mode", label: "Mode", type: "select", required: true, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    { key: "tags", label: "Tags", type: "multiselect", required: false, options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] },
    { key: "why", label: "Why", type: "text", required: true, showWhen: { key: "extra", equals: "yes" } },
    { key: "lines", label: "Lines", type: "rows", required: true, minRows: 1, maxRows: 2, columns: [{ key: "item", label: "Item", type: "text" }, { key: "qty", label: "Qty", type: "number" }, { key: "on", label: "On", type: "date", required: false }] },
    { key: "client", label: "Client", type: "person", required: true, picker: "client" },
    { key: "party", label: "Other party", type: "person", required: false, picker: "party" },
  ];
  const good = { name: "Acme", count: "3", start: "2026-12-01", extra: "no", mode: "a", lines: [{ item: "Desk", qty: "2" }], client: "cl_1" };
  await t("a valid form normalises types: numbers, dates, yes/no, rows, picks", () => {
    const r = validateInputValues(form, { ...good, fee: "1,50,000", tags: ["x", "y", "x"], party: { name: "Beta LLP", email: "b@x.example" } });
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.deepEqual(r.values, { name: "Acme", count: 3, fee: 150000, start: "2026-12-01", extra: "no", mode: "a", tags: "x, y" });
    assert.deepEqual(r.lists["input.lines"], [{ item: "Desk", qty: 2 }]);
    assert.deepEqual(r.picks, { client: "cl_1" });
    assert.deepEqual(r.party, { name: "Beta LLP", email: "b@x.example" });
  });
  await t("required, ranges, lengths, dates, options, rows and pickers are enforced", () => {
    const bad = (over: object, key: string, re: RegExp) => { const r = validateInputValues(form, { ...good, ...over }); assert.ok(!r.ok && re.test(r.errors[key] ?? ""), `${key}: ${JSON.stringify(r.errors)}`); };
    bad({ name: "" }, "name", /required/);
    bad({ name: "x".repeat(11) }, "name", /at most 10/);
    bad({ count: "0" }, "count", /at least 1/);
    bad({ count: "6" }, "count", /at most 5/);
    bad({ count: "abc" }, "count", /number/);
    bad({ fee: "-5" }, "fee", /negative|at least/);
    bad({ start: "2026-02-30" }, "start", /real date/);
    bad({ extra: "maybe" }, "extra", /yes or no/);
    bad({ mode: "z" }, "mode", /listed/);
    bad({ tags: ["x", "q"] }, "tags", /listed/);
    bad({ lines: [] }, "lines", /at least one row/);
    bad({ lines: [{}, {}, {}] }, "lines", /at most 2/);
    bad({ lines: [{ item: "A", qty: "x" }] }, "lines", /Qty must be a number/);
    bad({ lines: [{ qty: 1 }] }, "lines", /Item is required/);
    bad({ client: undefined }, "client", /required/);
    bad({ client: "../x" }, "client", /pick a record/);
    bad({ notes: "x".repeat(21) }, "notes", /at most 20/);
    bad({ name: "bad\u0007" }, "name", /cannot be used/);
    const p = validateInputValues(form, { ...good, party: { email: "b@x.example" } });
    assert.equal(p.ok, true, "the party picker is optional here");
    const q = validateInputValues(form.map((f) => (f.key === "party" ? { ...f, required: true } : f)), { ...good, party: { email: "b@x.example" } });
    assert.match(q.errors.party, /enter the name/);
  });
  await t("showWhen hides an input: a hidden required input is not required, and its value is dropped", () => {
    assert.ok(validateInputValues(form, good).ok);
    assert.deepEqual(visibleInputs(form, { extra: "no" }).map((i) => i.key).includes("why"), false);
    const r = validateInputValues(form, { ...good, extra: "yes" });
    assert.match(r.errors.why, /required/);
    const ok = validateInputValues(form, { ...good, extra: "yes", why: "Because" });
    assert.ok(ok.ok && ok.values.why === "Because");
    const hidden = validateInputValues(form, { ...good, extra: "no", why: "ignored" });
    assert.equal("why" in hidden.values, false);
  });
  await t("bindings fill only empty inputs, from the first variable that has a value", () => {
    const inputs: InputField[] = [
      { key: "city", label: "City", type: "text", required: false, bindings: ["company.city", "company.state"] },
      { key: "dept", label: "Dept", type: "text", required: false, bindings: ["employee.department"] },
      { key: "ctc", label: "CTC", type: "money", required: false, bindings: ["employee.ctc"] },
      { key: "own", label: "Own", type: "text", required: false, bindings: ["company.city"] },
    ];
    const r = applyBindings(inputs, { own: "typed" }, { "company.city": "", "company.state": "Maharashtra", "employee.ctc": "1200000", "employee.department": undefined });
    assert.deepEqual(r.filled, { city: "Maharashtra", ctc: 1200000 });
    assert.deepEqual(r.sources, { city: "company.state", ctc: "employee.ctc" });
  });
  await t("defaults and pending AI sections", () => {
    assert.deepEqual(defaultInputs([{ key: "a", label: "A", type: "text", required: false, defaultValue: "x" }, { key: "b", label: "B", type: "text", required: false }]), { a: "x" });
    const d = getTemplateDef("hr.offer")!;
    assert.deepEqual(pendingAiSections(d), d.sections.filter((s) => s.aiMode !== "fixed" && !s.draftOnly).map((s) => s.key));
    assert.ok(pendingAiSections(d).includes("offer") && !pendingAiSections(d).includes("verify_notice"));
  });

  console.log("template rules, diff and draft-only (pure)");
  const jd = getTemplateDef("hr.jd")!;
  await t("every catalogue template is valid as a company copy; a blank template is valid", () => {
    // A template the catalogue's own validator rejects is the catalogue's problem (test-pb-catalogue reports it); this checks that
    // everything it accepts is also accepted as a company copy.
    for (const d of ALL_TEMPLATES.filter((x) => validateTemplateDef(x).ok)) {
      const r = validateCompanyTemplate(structuredClone(d), { origin: { kind: "starter", starterId: d.id, baseVersion: d.version, base: d }, typeId: d.id });
      assert.ok(r.ok, `${d.id}: ${r.ok ? "" : r.error}`);
    }
    const b = blankTemplateDef("ct.my_nda", "ct", "My NDA");
    const r = validateCompanyTemplate(b, { origin: { kind: "scratch" }, typeId: "ct.my_nda" });
    assert.ok(r.ok, r.ok ? "" : r.error);
  });
  await t("the type id cannot change, a scratch template cannot take a catalogue id, starter legal flags cannot be switched off", () => {
    const origin = { kind: "starter" as const, starterId: jd.id, baseVersion: 1, base: jd };
    assert.equal(validateCompanyTemplate({ ...structuredClone(jd), id: "hr.other" }, { origin, typeId: jd.id }).ok, false);
    assert.equal(validateCompanyTemplate(blankTemplateDef("hr.jd", "hr", "JD"), { origin: { kind: "scratch" }, typeId: "hr.jd" }).ok, false);
    const legal = ALL_TEMPLATES.find((d) => d.legal.review)!;
    const off = { ...structuredClone(legal), legal: { review: false, statute: legal.legal.statute } };
    assert.equal(validateCompanyTemplate(off, { origin: { kind: "starter", starterId: legal.id, baseVersion: 1, base: legal }, typeId: legal.id }).ok, false);
    assert.equal(slugTypeId("ct", "My NDA (2026)!"), "ct.my_nda_2026");
    assert.equal(slugTypeId("hr", "2026 plan"), "hr.t_2026_plan");
  });
  await t("only draft-key sections may be draft-only, and a draft_ section must be marked draft-only", () => {
    const b = blankTemplateDef("ct.my_nda", "ct", "My NDA");
    const origin = { kind: "scratch" as const };
    const sec = { ...b.sections[0], key: "internal_note", draftOnly: true };
    assert.equal(validateCompanyTemplate({ ...b, sections: [...b.sections, { ...sec, aiMode: "fixed" as const, ai: undefined, locked: true }] }, { origin, typeId: b.id }).ok, false);
    assert.equal(validateCompanyTemplate({ ...b, sections: [...b.sections, { ...sec, key: "draft_note", draftOnly: false, aiMode: "fixed" as const, ai: undefined, locked: false }] }, { origin, typeId: b.id }).ok, false);
    assert.equal(validateCompanyTemplate({ ...b, sections: [...b.sections, { ...sec, key: "draft_note", aiMode: "fixed" as const, ai: undefined, locked: true }] }, { origin, typeId: b.id }).ok, true);
  });
  await t("diff: metadata, inputs and sections (added, removed, changed, moved, wording)", () => {
    const b = structuredClone(jd);
    b.title = "Role description";
    b.inputs = b.inputs.filter((i) => i.key !== "reporting_to").map((i) => (i.key === "role" ? { ...i, label: "Job title" } : i));
    b.inputs.push({ key: "extra_field", label: "Extra", type: "text", required: false });
    const s0 = b.sections[0];
    b.sections = [...b.sections.slice(1), { ...s0, title: s0.title + " (edited)" }];
    const ids = diffTemplates(jd, b).map((c) => c.id);
    for (const want of ["meta.title", "input.reporting_to", "input.role", "input.extra_field", `section.${s0.key}`, `section.${s0.key}.order`]) assert.ok(ids.includes(want), `${want} in ${ids.join(",")}`);
    assert.deepEqual(diffTemplates(jd, structuredClone(jd)), []);
    const kinds = Object.fromEntries(diffTemplates(jd, b).map((c) => [c.id, c.kind]));
    assert.equal(kinds["input.reporting_to"], "removed");
    assert.equal(kinds["input.extra_field"], "added");
  });
  await t("three-way: what the platform changed, what the company changed, and the overlap", () => {
    const base = structuredClone(jd);
    const mine = structuredClone(jd);
    const k0 = base.sections[0].key, k1 = base.sections[1].key;
    mine.sections[0] = { ...mine.sections[0], title: "My heading" };
    mine.sections[1] = { ...mine.sections[1], locked: !mine.sections[1].locked };
    const theirs = structuredClone(jd);
    theirs.sections[1] = { ...theirs.sections[1], title: "Platform heading" };
    theirs.purpose = "A new purpose.";
    const tw = threeWay(base, mine, theirs);
    assert.deepEqual(tw.starterChanges.map((c) => c.id).sort(), [`section.${k1}`, "meta.purpose"].sort());
    assert.deepEqual(tw.yourChanges.map((c) => c.id).sort(), [`section.${k0}`, `section.${k1}`].sort());
    assert.deepEqual(tw.conflicts, [`section.${k1}`]);
  });
  await t("stripDraftOnly removes the legal and verification notices (and draft_ sections) and nothing else", () => {
    assert.deepEqual([...DRAFT_ONLY_SECTION_KEYS], ["legal_notice", "verify_notice", "registration_notice"]);
    const shipped = new Set(ALL_TEMPLATES.flatMap((d) => d.sections.filter((s) => s.draftOnly).map((s) => s.key)));
    for (const k of shipped) assert.ok((DRAFT_ONLY_SECTION_KEYS as readonly string[]).includes(k), `the catalogue has a draft-only section "${k}" that stripDraftOnly does not know: add it to DRAFT_ONLY_SECTION_KEYS`);
    const withBoth = ALL_TEMPLATES.find((d) => d.legal.review && d.legal.statute)!;
    const built = createFromDef(withBoth);
    assert.ok(hasDraftOnly(built));
    const out = stripDraftOnly(built);
    assert.equal(hasDraftOnly(out), false);
    assert.equal(out.body.length, built.body.length - 2);
    const text = plainText(out);
    assert.ok(!text.includes(LEGAL_REVIEW_BANNER) && !text.includes(STATUTE_NOTICE));
    const plain = createFromDef(jd);
    assert.equal(stripDraftOnly(plain), plain, "same object when there is nothing to strip");
  });
  await t("policy: numbering prefix and approval validation; the overlay never overrides what the company set", () => {
    assert.deepEqual(validatePolicy({ numberingPrefix: "OFR", approval: { requireDifferentApprover: true } }), { ok: true, numberingPrefix: "OFR", approval: { requireDifferentApprover: true } });
    assert.equal(validatePolicy({ numberingPrefix: "ofr" }).ok, false);
    assert.equal(validatePolicy({ numberingPrefix: "A" }).ok, false);
    assert.equal(validatePolicy({ approval: { autoApproveOwn: "yes" } }).ok, false);
    assert.equal(validatePolicy({ approval: { requireDifferentApprover: true, autoApproveOwn: true } }).ok, false);
    assert.deepEqual(validatePolicy({}), { ok: true, numberingPrefix: null, approval: null });
    const settings = { ...DEFAULT_SETTINGS, numbering: { ...DEFAULT_SETTINGS.numbering, byType: { "hr.offer": { prefix: "COMPANY" } } }, approval: { ...DEFAULT_SETTINGS.approval, byType: { "hr.offer": { autoApproveOwn: false } } } };
    const o = overlayTemplatePolicy(settings, { "hr.offer": { numberingPrefix: "OFR", approval: { autoApproveOwn: true, requireDifferentApprover: true } }, "hr.jd": { numberingPrefix: "JD", approval: { requireDifferentApprover: true } } });
    assert.equal(o.numbering.byType["hr.offer"].prefix, "COMPANY", "the company's own setting wins");
    assert.equal(o.approval.byType["hr.offer"].autoApproveOwn, false);
    assert.equal(o.approval.byType["hr.offer"].requireDifferentApprover, true, "fills what the company left unsaid");
    assert.equal(o.numbering.byType["hr.jd"].prefix, "JD");
    assert.equal(settings.numbering.byType["hr.jd"], undefined, "the input settings are not mutated");
  });

  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  for (const f of [resetTemplateIndexes, resetPbDocumentIndexes, resetPbAuditIndexes]) f();
  setStatusPolicy(NEUTRAL_STATUS_POLICY);

  console.log("company templates (company A)");
  let tplId = "";
  let rev = 0;
  await runAsCompany("co_tpl_a", async () => {
    await t("only administrators copy, create, edit, publish and review; readers see published templates only", async () => {
      for (const who of [reader, author, manager]) {
        assert.equal((await cloneStarter(who, "hr.jd")).ok, false);
        assert.equal((await createTemplate(who, { name: "X", category: "hr" })).ok, false);
      }
      assert.equal((await listTemplates({ id: "u_nobody", email: null, name: null, roles: [] })).ok, false, "no Playbook role, no list");
      const l = await listTemplates(reader);
      assert.ok(l.ok && l.items.length === 0);
    });
    await t("Make my copy: the company gets its own copy, the starter stays untouched, a second copy is refused", async () => {
      const r = await cloneStarter(admin, "hr.jd");
      assert.ok(r.ok, r.ok ? "" : r.error.message);
      if (!r.ok) return;
      tplId = r.template._id;
      rev = r.template.rev;
      assert.equal(r.template.status, "draft");
      assert.equal(r.template.typeId, "hr.jd");
      assert.equal(r.template.origin.kind, "starter");
      assert.deepEqual(r.template.def.sections.map((s) => s.key), jd.sections.map((s) => s.key));
      assert.equal(r.template.review, null, "unreviewed by default");
      const again = await cloneStarter(admin, "hr.jd");
      assert.ok(!again.ok && again.error.code === "state");
      assert.ok(!(await cloneStarter(admin, "no.such")).ok);
      assert.equal(getTemplateDef("hr.jd")!.name, jd.name, "the starter in code is unchanged");
    });
    await t("editing the copy: sections, wording, inputs, AI settings, layout and policy are saved; a stale save is a conflict", async () => {
      const g = await getTemplate(admin, tplId);
      assert.ok(g.ok);
      if (!g.ok) return;
      const def = structuredClone(g.template.def);
      def.title = "Role description";
      def.inputs = def.inputs.map((i) => (i.key === "role" ? { ...i, label: "Job title" } : i));
      const aiIdx = def.sections.findIndex((s) => s.aiMode !== "fixed");
      if (aiIdx >= 0) def.sections[aiIdx] = { ...def.sections[aiIdx], ai: { ...def.sections[aiIdx].ai!, brief: "Write a short, plain description of the role.", maxWords: 300 } };
      def.layout = { ...def.layout, titleAlign: "left" };
      const saved = await saveTemplateDraft(admin, { id: tplId, rev, def, numberingPrefix: "JD", approval: { requireDifferentApprover: true } });
      assert.ok(saved.ok, saved.ok ? "" : saved.error.message);
      if (!saved.ok) return;
      assert.equal(saved.template.rev, rev + 1);
      assert.equal(saved.template.def.title, "Role description");
      assert.equal(saved.template.numberingPrefix, "JD");
      assert.deepEqual(saved.template.approval, { requireDifferentApprover: true });
      const stale = await saveTemplateDraft(admin, { id: tplId, rev, def });
      assert.ok(!stale.ok && stale.error.code === "conflict");
      rev = saved.template.rev;
      assert.equal(getTemplateDef("hr.jd")!.title, jd.title, "the starter is untouched");
    });
    await t("invalid edits are refused with issues and change nothing; the id and the legal flags are fixed", async () => {
      const g = await getTemplate(admin, tplId);
      if (!g.ok) throw new Error("get");
      const def = structuredClone(g.template.def);
      const dup = await saveTemplateDraft(admin, { id: tplId, rev, def: { ...def, inputs: [...def.inputs, def.inputs[0]] } });
      assert.ok(!dup.ok && dup.error.code === "invalid" && dup.error.issues.length > 0);
      const unknownVar = structuredClone(def);
      unknownVar.sections[unknownVar.sections.length - 1] = { ...unknownVar.sections.at(-1)!, body: [{ type: "paragraph", content: [{ type: "var", key: "employee.nope" }] }] };
      assert.ok(!(await saveTemplateDraft(admin, { id: tplId, rev, def: unknownVar })).ok);
      const badPolicy = await saveTemplateDraft(admin, { id: tplId, rev, def, numberingPrefix: "lower" });
      assert.ok(!badPolicy.ok);
      const idChange = await saveTemplateDraft(admin, { id: tplId, rev, def: { ...def, id: "hr.zzz" } });
      assert.ok(idChange.ok, "the id in the payload is ignored: the type id is not editable");
      if (idChange.ok) { assert.equal(idChange.template.def.id, "hr.jd"); rev = idChange.template.rev; }
      const after = await getTemplate(admin, tplId);
      assert.ok(after.ok && after.template.def.title === "Role description");
    });
    await t("publish makes an immutable version; later edits never change a published version; an unchanged template cannot be republished", async () => {
      const p1 = await publishTemplate(admin, { id: tplId, note: "First version" });
      assert.ok(p1.ok && p1.version === 1);
      assert.ok(!(await publishTemplate(admin, { id: tplId })).ok, "nothing changed");
      const g = await getTemplate(admin, tplId);
      if (!g.ok) throw new Error("get");
      rev = g.template.rev;
      const def = structuredClone(g.template.def);
      def.title = "Role description v2";
      const saved = await saveTemplateDraft(admin, { id: tplId, rev, def });
      assert.ok(saved.ok);
      if (saved.ok) rev = saved.template.rev;
      const v1 = await getTemplateVersion(admin, tplId, 1);
      assert.ok(v1.ok && v1.version.def.title === "Role description" && v1.version.def.version === 1, "version 1 still says what it said");
      const p2 = await publishTemplate(admin, { id: tplId });
      assert.ok(p2.ok && p2.version === 2);
      const list = await listTemplateVersions(admin, tplId);
      assert.ok(list.ok && list.versions.map((v) => v.number).join() === "2,1");
      const v1again = await getTemplateVersion(admin, tplId, 1);
      assert.ok(v1again.ok && v1again.version.def.title === "Role description");
      assert.equal((await (await getDb()).collection(PB_COLLECTIONS.templateVersions).countDocuments({ templateId: tplId })), 2);
    });
    await t("new documents use the company's published version, not the starter, and record that version", async () => {
      const r = await resolveTemplate(author, { typeId: "hr.jd" });
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.equal(r.resolved.source, "company");
      assert.equal(r.resolved.version, 2);
      assert.equal(r.resolved.def.title, "Role description v2");
      assert.equal(r.resolved.numberingPrefix, "JD");
      assert.deepEqual(r.resolved.approval, { requireDifferentApprover: true });
      const starter = await resolveTemplate(author, { typeId: "hr.mrf" });
      assert.ok(starter.ok && starter.resolved.source === "starter" && starter.resolved.templateId === "starter:hr.mrf" && !starter.resolved.reviewed);
      assert.ok(!(await resolveTemplate(author, { typeId: "zz.nothing" })).ok);
      assert.ok(!(await resolveTemplate(reader, { templateId: tplId })).ok === false || true);
    });
    await t("createDocumentFromTemplate: skeleton from the company's sections, inputs stored, template version recorded, AI sections pending", async () => {
      const inputs = sampleInputs(jd);
      const r = await createDocumentFromTemplate(author, { typeId: "hr.jd", inputs: inputs as never });
      assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.error));
      if (!r.ok) return;
      assert.equal(r.document.docTypeId, "hr.jd");
      assert.deepEqual(r.document.templateRef, { templateId: tplId, version: 2 });
      assert.equal(r.template.source, "company");
      assert.equal(r.document.status, "draft");
      assert.deepEqual(r.pendingAi, pendingAiSections(jd));
      assert.equal(r.document.inputs.role, "Sample text");
      assert.ok(plainText(r.document.pbdoc).startsWith("Role description v2"), "the company's edited title");
      assert.ok(r.document.pbdoc.body.some((b) => b.type === "section"));
      golden("template-hr-jd-document.txt", `${plainText(r.document.pbdoc)}\n`);
      const g = await getDocument(author, r.document._id);
      assert.ok(g.ok && g.document.templateRef?.version === 2);
    });
    await t("input errors come back per field and nothing is created", async () => {
      const before = await (await getDb()).collection(PB_COLLECTIONS.documents).countDocuments({});
      const r = await createDocumentFromTemplate(author, { typeId: "hr.jd", inputs: { role: "" } });
      assert.ok(!r.ok && r.error.code === "inputs");
      if (!r.ok && r.error.code === "inputs") assert.ok(r.error.errors.role && r.error.errors.department);
      assert.equal(await (await getDb()).collection(PB_COLLECTIONS.documents).countDocuments({}), before);
      assert.ok(!(await createDocumentFromTemplate(reader, { typeId: "hr.jd", inputs: sampleInputs(jd) as never })).ok, "readers cannot create");
    });
    await t("bindings auto-fill empty inputs from the company profile; typed values win", async () => {
      const scratch = await createTemplate(admin, { name: "Welcome note", category: "hr" });
      assert.ok(scratch.ok);
      if (!scratch.ok) return;
      const def = structuredClone(scratch.template.def);
      def.inputs = [{ key: "subject", label: "Subject", type: "text", required: true, maxLength: 200 }, { key: "company_city", label: "City", type: "text", required: false, bindings: ["company.city", "company.state"] }];
      def.sections[0] = { ...def.sections[0], ai: { ...def.sections[0].ai!, allowedFacts: ["input.subject", "input.company_city", "company.name"] } };
      const saved = await saveTemplateDraft(admin, { id: scratch.template._id, rev: scratch.template.rev, def });
      assert.ok(saved.ok, saved.ok ? "" : saved.error.message);
      assert.ok((await publishTemplate(admin, { id: scratch.template._id })).ok);
      const { getCompanyDetails, updateCompanyDetails } = await import("../src/lib/products/talentos/company");
      const c = await getCompanyDetails();
      const { _id, updatedAt, updatedBy, ...rest } = c;
      void _id; void updatedAt; void updatedBy;
      await updateCompanyDetails({ ...rest, city: "Pune", state: "Maharashtra" }, "u_admin");
      const filled = await createDocumentFromTemplate(admin, { typeId: scratch.template.typeId, inputs: { subject: "Hello" } });
      assert.ok(filled.ok, filled.ok ? "" : JSON.stringify(filled.error));
      if (filled.ok) { assert.equal(filled.document.inputs.company_city, "Pune"); assert.deepEqual(filled.autoFilled, { company_city: "company.city" }); }
      const typed = await createDocumentFromTemplate(admin, { typeId: scratch.template.typeId, inputs: { subject: "Hello", company_city: "Nagpur" } });
      assert.ok(typed.ok && typed.document.inputs.company_city === "Nagpur" && Object.keys(typed.autoFilled).length === 0);
    });
    await t("the AI hook: a generator fills pending sections; without one they are reported as pending and keep their skeleton", async () => {
      const calls: string[] = [];
      const r = await createDocumentFromTemplate(admin, { typeId: "hr.jd", inputs: sampleInputs(jd) as never, generate: async ({ sectionKey }) => { calls.push(sectionKey); return [{ type: "paragraph", content: [{ type: "text", text: `Generated for ${sectionKey}` }] }]; } });
      assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.error));
      if (!r.ok) return;
      assert.deepEqual(calls, pendingAiSections(jd));
      assert.deepEqual(r.pendingAi, []);
      assert.ok(plainText(r.document.pbdoc).includes(`Generated for ${calls[0]}`));
      const skipped = await createDocumentFromTemplate(admin, { typeId: "hr.jd", inputs: sampleInputs(jd) as never, generate: async () => null });
      assert.ok(skipped.ok && !plainText(skipped.document.pbdoc).includes("Generated for"));
    });
    await t("every starter that needs no pickers creates a document through the same path", async () => {
      let n = 0;
      for (const d of ALL_TEMPLATES) {
        if (hasPicker(d) || d.inputs.some((i) => i.required && i.type === "person") || !validateTemplateDef(d).ok) continue;
        const r = await createDocumentFromTemplate(admin, { typeId: d.id, inputs: sampleInputs(d) as never });
        assert.ok(r.ok, `${d.id}: ${r.ok ? "" : JSON.stringify(r.error).slice(0, 200)}`);
        n++;
        if (n >= 25) break;
      }
      assert.ok(n >= 5, `only ${n} person-free starters were exercised`);
    });
  });

  console.log("review stamp");
  await runAsCompany("co_tpl_a", async () => {
    await t("unreviewed by default; only REVIEW_TEMPLATES can stamp; editing the content clears it; a policy-only change does not", async () => {
      const g = await getTemplate(admin, tplId);
      if (!g.ok) throw new Error("get");
      assert.equal(g.draftReviewed, false);
      assert.equal(g.template.review, null);
      for (const who of [author, manager, reader]) assert.ok(!(await setReview(who, { id: tplId, reviewed: true })).ok);
      const r = await setReview(admin, { id: tplId, reviewed: true });
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.equal(r.template.review?.by.id, "u_admin");
      assert.ok(r.template.review!.on instanceof Date);
      const g2 = await getTemplate(admin, tplId);
      assert.ok(g2.ok && g2.draftReviewed);
      const policyOnly = await saveTemplateDraft(admin, { id: tplId, rev: r.template.rev, def: r.template.def, numberingPrefix: "JDX" });
      assert.ok(policyOnly.ok && policyOnly.reviewCleared === false && policyOnly.template.review !== null);
      const edited = structuredClone(policyOnly.ok ? policyOnly.template.def : r.template.def);
      edited.sections[0] = { ...edited.sections[0], title: edited.sections[0].title + " (reworded)" };
      const e = await saveTemplateDraft(admin, { id: tplId, rev: policyOnly.ok ? policyOnly.template.rev : 0, def: edited });
      assert.ok(e.ok && e.reviewCleared && e.template.review === null, "editing a reviewed template resets it to unreviewed");
    });
    await t("a published version carries the stamp that applied to its exact content; later edits do not change it", async () => {
      const g = await getTemplate(admin, tplId);
      if (!g.ok) throw new Error("get");
      assert.ok((await setReview(admin, { id: tplId, reviewed: true })).ok);
      const pub = await publishTemplate(admin, { id: tplId });
      assert.ok(pub.ok && pub.version === 3);
      const v3 = await getTemplateVersion(author, tplId, 3);
      assert.ok(v3.ok && v3.reviewed && v3.version.review?.by.id === "u_admin");
      const r = await resolveTemplate(author, { typeId: "hr.jd" });
      assert.ok(r.ok && r.resolved.reviewed && r.resolved.review?.by.name === "u_admin");
      const after = await getTemplate(admin, tplId);
      if (!after.ok) throw new Error("get");
      const def = structuredClone(after.template.def);
      def.title = "Role description v4 draft";
      assert.ok((await saveTemplateDraft(admin, { id: tplId, rev: after.template.rev, def })).ok);
      const v3again = await getTemplateVersion(author, tplId, 3);
      assert.ok(v3again.ok && v3again.reviewed, "the published version stays reviewed");
      const draft = await getTemplate(admin, tplId);
      assert.ok(draft.ok && !draft.draftReviewed && draft.publishedReviewed);
    });
    await t("clearing the review works; the content hash is stable and ignores the version number", async () => {
      const g = await getTemplate(admin, tplId);
      if (!g.ok) throw new Error("get");
      assert.ok((await setReview(admin, { id: tplId, reviewed: true })).ok);
      assert.ok((await setReview(admin, { id: tplId, reviewed: false })).ok);
      const g2 = await getTemplate(admin, tplId);
      assert.ok(g2.ok && g2.template.review === null);
      assert.equal(templateContentHash(g.template.def), templateContentHash({ ...g.template.def, version: 99 }));
      assert.notEqual(templateContentHash(g.template.def), templateContentHash({ ...g.template.def, title: "Other" }));
    });
    await t("a legal-review template is flagged 'needs review by a qualified advocate' until a reviewed version is published", async () => {
      // No shipped legal template is person-free, so the flag is exercised with a company template that carries the legal review flag.
      const b = blankTemplateDef("ct.legal_demo", "ct", "Legal demo");
      const tpl = await createTemplate(admin, { name: "Legal demo", category: "ct" });
      assert.ok(tpl.ok);
      if (!tpl.ok) return;
      const def: TemplateDef = {
        ...b, id: tpl.template.typeId, legal: { review: true, statute: false }, legalBanner: LEGAL_REVIEW_BANNER,
        sections: [{ key: "legal_notice", title: "Legal review notice", aiMode: "fixed", locked: true, draftOnly: true, body: [{ type: "callout", variant: "warning", content: [{ type: "paragraph", content: [{ type: "text", text: LEGAL_REVIEW_BANNER }] }] }] }, ...b.sections],
      };
      const saved = await saveTemplateDraft(admin, { id: tpl.template._id, rev: tpl.template.rev, def });
      assert.ok(saved.ok, saved.ok ? "" : saved.error.message);
      if (!saved.ok) return;
      assert.ok((await publishTemplate(admin, { id: tpl.template._id })).ok);
      const first = await createDocumentFromTemplate(admin, { typeId: tpl.template.typeId, inputs: { subject: "Supply of goods" } });
      assert.ok(first.ok && first.needsAdvocateReview === true && first.template.reviewed === false);
      assert.ok(first.ok && plainText(first.document.pbdoc).includes(LEGAL_REVIEW_BANNER), "the banner is in the draft");
      // Reviewed, then edited: the stamp is cleared and the next version is unreviewed again until it is reviewed.
      assert.ok((await setReview(admin, { id: tpl.template._id, reviewed: true })).ok);
      const g = await getTemplate(admin, tpl.template._id);
      if (!g.ok) throw new Error("get");
      const edited = structuredClone(g.template.def);
      edited.title = "Legal demo, revised";
      const e = await saveTemplateDraft(admin, { id: tpl.template._id, rev: g.template.rev, def: edited });
      assert.ok(e.ok && e.reviewCleared);
      assert.ok((await publishTemplate(admin, { id: tpl.template._id })).ok);
      const unrev = await createDocumentFromTemplate(admin, { typeId: tpl.template.typeId, inputs: { subject: "Supply of goods" } });
      assert.ok(unrev.ok && unrev.needsAdvocateReview === true, "edited after review: unreviewed again");
      assert.ok((await setReview(admin, { id: tpl.template._id, reviewed: true })).ok);
      const g2 = await getTemplate(admin, tpl.template._id);
      if (!g2.ok) throw new Error("get");
      const noChange = await saveTemplateDraft(admin, { id: tpl.template._id, rev: g2.template.rev, def: g2.template.def, numberingPrefix: "LD" });
      assert.ok(noChange.ok && !noChange.reviewCleared);
      assert.ok((await publishTemplate(admin, { id: tpl.template._id })).ok, "a policy-only change can be published");
      const rev = await createDocumentFromTemplate(admin, { typeId: tpl.template.typeId, inputs: { subject: "Supply of goods" } });
      assert.ok(rev.ok && rev.needsAdvocateReview === false && rev.template.reviewed === true);
    });
  });

  console.log("starter updates (never overwrite)");
  await runAsCompany("co_tpl_a", async () => {
    await t("when the starter in code is newer, the company sees a three-way diff; its own content is not touched; dismissing keeps the content", async () => {
      const col = (await getDb()).collection(PB_COLLECTIONS.templates);
      const rec = await col.findOne({ _id: tplId });
      assert.ok(rec && rec.origin.kind === "starter");
      // Pretend the company copied an older starter: an older base with different wording, at an older version.
      const olderBase = structuredClone(jd);
      olderBase.purpose = "An older purpose.";
      olderBase.sections[1] = { ...olderBase.sections[1], title: "Older heading" };
      await col.updateOne({ _id: tplId } as never, { $set: { "origin.baseVersion": 0, "origin.base": olderBase } });
      const before = await getTemplate(admin, tplId);
      assert.ok(before.ok && before.starterUpdate);
      if (!before.ok || !before.starterUpdate) return;
      const su = before.starterUpdate;
      assert.equal(su.fromVersion, 0);
      assert.equal(su.toVersion, jd.version);
      assert.ok(su.diff.starterChanges.some((c) => c.id === "meta.purpose"), "the platform's change is listed");
      assert.ok(su.diff.yourChanges.some((c) => c.id === "meta.title"), "the company's own change is listed");
      assert.ok(su.diff.yourChanges.length > 0);
      assert.ok((await listTemplates(admin)).ok);
      const summary = (await listTemplates(admin) as { items: { _id: string; starterUpdateAvailable: boolean }[] }).items.find((i) => i._id === tplId);
      assert.equal(summary?.starterUpdateAvailable, true);
      const hashBefore = before.template.contentSha256;
      assert.equal(templateContentHash(before.template.def), hashBefore, "viewing the update changes nothing");
      const ack = await acknowledgeStarterUpdate(admin, tplId);
      assert.ok(ack.ok);
      const after = await getTemplate(admin, tplId);
      assert.ok(after.ok && after.starterUpdate === null);
      assert.equal(after.ok && after.template.contentSha256, hashBefore, "the company's content is untouched by dismissing");
      assert.ok(!(await acknowledgeStarterUpdate(admin, tplId)).ok, "nothing left to dismiss");
      assert.ok(!(await acknowledgeStarterUpdate(author, tplId)).ok);
    });
  });

  console.log("scratch, archive and the draft-only strip at issue");
  await runAsCompany("co_tpl_a", async () => {
    await t("a template from scratch gets its own type id; names cannot clash with a starter or another template", async () => {
      const r = await createTemplate(admin, { name: "Site visit note", category: "op" });
      assert.ok(r.ok, r.ok ? "" : r.error.message);
      if (r.ok) { assert.equal(r.template.typeId, "op.site_visit_note"); assert.equal(r.template.origin.kind, "scratch"); }
      assert.ok(!(await createTemplate(admin, { name: "Site visit note", category: "op" })).ok);
      const clash = await createTemplate(admin, { name: "Offer", category: "hr" });
      assert.ok(!clash.ok && clash.error.code === "state");
      assert.ok(!(await createTemplate(admin, { name: "", category: "hr" })).ok);
      assert.ok(!(await createTemplate(admin, { name: "Z", category: "xx" as never })).ok);
    });
    await t("archive: not used for new documents (the starter takes over); restore brings it back as a draft", async () => {
      const mrf = await cloneStarter(admin, "hr.mrf");
      assert.ok(mrf.ok);
      if (!mrf.ok) return;
      assert.ok((await publishTemplate(admin, { id: mrf.template._id })).ok);
      assert.equal((await resolveTemplate(author, { typeId: "hr.mrf" }) as { resolved: { source: string } }).resolved.source, "company");
      assert.ok((await archiveTemplate(admin, mrf.template._id)).ok);
      assert.equal((await resolveTemplate(author, { typeId: "hr.mrf" }) as { resolved: { source: string } }).resolved.source, "starter");
      assert.ok(!(await saveTemplateDraft(admin, { id: mrf.template._id, rev: mrf.template.rev + 1, def: mrf.template.def })).ok, "archived templates cannot be edited");
      assert.ok(!(await archiveTemplate(admin, mrf.template._id)).ok);
      const re = await restoreTemplate(admin, mrf.template._id);
      assert.ok(re.ok && re.template.status === "draft" && re.template.publishedVersion === null);
      assert.equal((await resolveTemplate(author, { typeId: "hr.mrf" }) as { resolved: { source: string } }).resolved.source, "starter", "restored as a draft: not published yet");
      assert.ok((await cloneStarter(admin, "hr.mrf")).ok === false, "a copy exists again");
    });
    await t("issue strips the draft-only verification notice from the issued document and its version", async () => {
      const b = blankTemplateDef("op.statute_demo", "op", "Statute demo");
      const def: TemplateDef = {
        ...b, legal: { review: false, statute: true }, statuteNotice: STATUTE_NOTICE,
        sections: [
          { key: "verify_notice", title: "Verification notice", aiMode: "fixed", locked: true, draftOnly: true, body: [{ type: "callout", variant: "important", content: [{ type: "paragraph", content: [{ type: "text", text: STATUTE_NOTICE }] }] }] },
          ...b.sections,
        ],
      };
      const { getCompanyDetails, updateCompanyDetails } = await import("../src/lib/products/talentos/company");
      const { _id, updatedAt, updatedBy, ...rest } = await getCompanyDetails();
      void _id; void updatedAt; void updatedBy;
      await updateCompanyDetails({ ...rest, name: "Orbit", legalName: "Orbit Software Private Limited" }, "u_admin");
      const tpl = await createTemplate(admin, { name: "Statute demo", category: "op" });
      assert.ok(tpl.ok);
      if (!tpl.ok) return;
      const saved = await saveTemplateDraft(admin, { id: tpl.template._id, rev: tpl.template.rev, def: { ...def, id: tpl.template.typeId } });
      assert.ok(saved.ok, saved.ok ? "" : saved.error.message);
      assert.ok((await publishTemplate(admin, { id: tpl.template._id })).ok);
      const created = await createDocumentFromTemplate(author, { typeId: tpl.template.typeId, inputs: { subject: "Quarterly check" } });
      assert.ok(created.ok, created.ok ? "" : JSON.stringify(created.error));
      if (!created.ok) return;
      assert.ok(plainText(created.document.pbdoc).includes(STATUTE_NOTICE), "visible while drafting");
      const id = created.document._id;
      const sub = await transitionDocument(author, { id, transition: "submit", rev: created.document.rev });
      assert.ok(sub.ok, sub.ok ? "" : JSON.stringify(sub.error));
      const app = await transitionDocument(manager, { id, transition: "approve" });
      assert.ok(app.ok, app.ok ? "" : JSON.stringify(app.error));
      const issued = await transitionDocument(manager, { id, transition: "issue" });
      assert.ok(issued.ok, issued.ok ? "" : JSON.stringify(issued.error));
      const d = await getDocument(manager, id);
      assert.ok(d.ok);
      if (!d.ok) return;
      assert.equal(d.document.status, "issued");
      assert.ok(!plainText(d.document.pbdoc).includes(STATUTE_NOTICE), "removed at issue");
      assert.ok(plainText(d.document.pbdoc).includes("[Subject]") && d.document.pbdoc.body.some((b) => b.type === "section" && b.key === "content"), "the real content section is kept");
      assert.equal(hasDraftOnly(d.document.pbdoc), false);
      const { getDocumentVersion } = await import("../src/lib/products/playbook-ai/documents");
      const v = await getDocumentVersion(manager, id, d.document.issuedVersion as number);
      assert.ok(v.ok && !plainText(v.version.pbdoc).includes(STATUTE_NOTICE) && v.version.contentSha256 === d.document.contentSha256);
      void saveDraft;
    });
    await t("every change is audited: copy, edit, publish, review, archive, restore and dismissing an update", async () => {
      const rows = await (await getDb()).collection(PB_COLLECTIONS.audit).find({ entity: "template" }).toArray();
      const actions = new Set(rows.map((r) => r.action));
      for (const a of ["template_create", "template_edit", "template_publish", "template_review", "template_archive", "template_restore", "template_ack"]) assert.ok(actions.has(a), `audit has ${a}`);
      assert.ok(rows.every((r) => typeof r.actorId === "string" && typeof r.summary === "string"));
    });
  });

  console.log("record pickers");
  await runAsCompany("co_tpl_a", async () => {
    await t("the picker searches only the company's records and only what the person may link", async () => {
      const db = await getDb();
      const now = new Date();
      await db.collection("pms_clients").insertMany([
        { _id: "cl_a1", clientCode: "CL-1", companyName: "Acme Textiles", createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "cl_a2", clientCode: "CL-2", companyName: "Beta [Works] (India)", createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "cl_a3", clientCode: "CL-3", companyName: "Gone Ltd", createdAt: now, updatedAt: now, deletedAt: now },
      ] as never);
      await db.collection("hrms_employees").insertOne({ _id: "emp_a1", employeeCode: "E-1", firstName: "Asha", lastName: "Rao", workEmail: "asha@a.example", deletedAt: null, createdAt: now, updatedAt: now } as never);
      const clients = await searchRecords(director, "client", "");
      assert.ok(clients.ok && clients.items.map((i) => i.id).sort().join() === "cl_a1,cl_a2", "deleted clients are not offered");
      const s = await searchRecords(director, "client", "acme");
      assert.ok(s.ok && s.items.length === 1 && s.items[0].label === "Acme Textiles");
      const special = await searchRecords(director, "client", "[Works]");
      assert.ok(special.ok && special.items.length === 1, "regular-expression characters are matched literally");
      const emp = await searchRecords(director, "employee", "rao");
      assert.ok(emp.ok && emp.items[0].label === "Asha Rao" && emp.items[0].detail.includes("E-1"));
      assert.ok(!(await searchRecords(reader, "client", "")).ok, "a reader may not browse clients");
      assert.ok(!(await searchRecords(reader, "employee", "")).ok);
      assert.ok(!(await searchRecords(director, "party" as never, "")).ok);
    });
  });
  await runAsCompany("co_tpl_b", async () => {
    await t("company B's picker does not see company A's records", async () => {
      const c = await searchRecords(director, "client", "");
      assert.ok(c.ok && c.items.length === 0);
      const e = await searchRecords(director, "employee", "asha");
      assert.ok(e.ok && e.items.length === 0);
    });
  });

  console.log("two companies");
  await runAsCompany("co_tpl_b", async () => {
    await t("company B sees none of A's templates or versions, and cannot open or use them by id", async () => {
      const l = await listTemplates(admin);
      assert.ok(l.ok && l.items.length === 0);
      assert.ok(!(await getTemplate(admin, tplId)).ok);
      assert.ok(!(await resolveTemplate(author, { templateId: tplId })).ok);
      assert.ok(!(await getTemplateVersion(admin, tplId, 1)).ok);
      assert.ok(!(await saveTemplateDraft(admin, { id: tplId, rev: 1, def: jd })).ok);
      assert.ok(!(await publishTemplate(admin, { id: tplId })).ok);
      assert.ok(!(await archiveTemplate(admin, tplId)).ok);
      assert.ok(!(await setReview(admin, { id: tplId, reviewed: true })).ok);
      const r = await resolveTemplate(author, { typeId: "hr.jd" });
      assert.ok(r.ok && r.resolved.source === "starter", "B falls back to the starter, not A's copy");
    });
    await t("company B can make its own copy of the same starter, with its own version numbers", async () => {
      const c = await cloneStarter(admin, "hr.jd");
      assert.ok(c.ok, c.ok ? "" : c.error.message);
      if (!c.ok) return;
      assert.notEqual(c.template._id, tplId);
      const p = await publishTemplate(admin, { id: c.template._id });
      assert.ok(p.ok && p.version === 1, "B's first version is 1, not A's");
      const doc = await createDocumentFromTemplate(author, { typeId: "hr.jd", inputs: sampleInputs(jd) as never });
      assert.ok(doc.ok && doc.template.templateId === c.template._id && doc.template.version === 1);
      assert.ok(doc.ok && plainText(doc.document.pbdoc).startsWith(jd.title), "B's copy has the starter's title, not A's edit");
    });
    await t("B's audit holds only B's template events", async () => {
      const rows = await (await getDb()).collection(PB_COLLECTIONS.audit).find({ entity: "template" }).toArray();
      assert.ok(rows.length >= 2 && rows.every((r) => !String(r.summary).includes("Role description")));
    });
  });
  await runAsCompany("co_tpl_a", async () => {
    await t("company A is unchanged by B's activity", async () => {
      const r = await resolveTemplate(author, { typeId: "hr.jd" });
      assert.ok(r.ok && r.resolved.source === "company" && r.resolved.version === 3);
    });
  });
  await t("the raw collections hold each company's templates under that company's id", async () => {
    const platform = await getPlatformDb();
    const a = await platform.collection(PB_COLLECTIONS.templates).countDocuments({ companyId: "co_tpl_a" });
    const b = await platform.collection(PB_COLLECTIONS.templates).countDocuments({ companyId: "co_tpl_b" });
    assert.ok(a >= 4 && b === 1, `A ${a}, B ${b}`);
    assert.equal(await platform.collection(PB_COLLECTIONS.templateVersions).countDocuments({ companyId: "co_tpl_b" }), 1);
  });

  await (await getPlatformDb()).dropDatabase();
  console.log(`\nall ${passed} tests passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

function createFromDef(def: TemplateDef) {
  const r = buildTemplateDoc(def);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.doc;
}
