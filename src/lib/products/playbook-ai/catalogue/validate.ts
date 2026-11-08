/**
 * Template validators. Pure, client-safe.
 *
 *  - `validateMeta`: a catalogue metadata row.
 *  - `buildTemplateDoc`: assembles a template's sections into one PBDoc (title, sections, header and footer from the layout tokens).
 *  - `validateTemplateDef`: metadata + inputs + sections + the assembled PBDoc through the PBDoc parser + cross references.
 *
 * All return issue lists (never throw) so a test or the Library page can show every problem at once.
 */

import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import { sequentialIds } from "@/lib/products/playbook-ai/doc/ids";
import { collectVariables } from "@/lib/products/playbook-ai/doc/variables";
import { allBlocks, inlineOf, walkBlocks } from "@/lib/products/playbook-ai/doc/walk";
import { IDENT_RE } from "@/lib/products/playbook-ai/doc/limits";
import { PBDOC_SCHEMA_VERSION, type AiMode, type PBDoc } from "@/lib/products/playbook-ai/doc/types";
import { validatePage } from "@/lib/products/playbook-ai/doc/page";
import {
  AUDIENCES, CATEGORY_KEYS, FOOTER_LAYOUTS, HEADER_LAYOUTS, INPUT_TYPES, LEGAL_REVIEW_BANNER, PARTY_TYPES, PICKER_NAMESPACES, RETENTION_KEYS,
  ROW_COLUMN_TYPES, SIGN_MODES, STAMP_CATEGORIES, STAMP_RULES, STATUTE_NOTICE, TEMPLATE_AI_MODES,
  type CatalogueMeta, type InputField, type TemplateDef, type TemplateSection,
} from "@/lib/products/playbook-ai/catalogue/types";
import { footerBlocks, headerBlocks, h } from "@/lib/products/playbook-ai/catalogue/build";
import { PICKER_BACKED, isKnownVariable } from "@/lib/products/playbook-ai/catalogue/variables";

export interface CatalogueIssue { path: string; message: string }

const ID_RE = /^[a-z]{2}\.[a-z][a-z0-9_]{1,40}$/;
const PREFIX_RE = /^[A-Z][A-Z0-9-]{1,19}$/;
const RESERVED = ["employee", "company", "candidate", "client", "vendor", "project", "party", "doc", "date", "author", "input", "custom"];
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const nonEmpty = (v: unknown, max: number): boolean => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Maps a template AI mode to the PBDoc section mode the editor and renderers know. */
export function pbAiMode(m: TemplateSection["aiMode"]): AiMode {
  return m === "fixed" ? "fixed" : "generate";
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export function validateMeta(m: CatalogueMeta, path = "meta"): CatalogueIssue[] {
  const out: CatalogueIssue[] = [];
  const err = (p: string, message: string) => out.push({ path: path ? `${path}.${p}` : p, message });
  if (typeof m.id !== "string" || !ID_RE.test(m.id)) err("id", "id must look like hr.offer (category, dot, lower-case slug)");
  if (!oneOf(CATEGORY_KEYS, m.category)) err("category", `category must be one of ${CATEGORY_KEYS.join(", ")}`);
  else if (typeof m.id === "string" && m.id.split(".")[0] !== m.category) err("category", `category "${m.category}" does not match the id prefix`);
  if (!nonEmpty(m.name, 120)) err("name", "name is required (up to 120 characters)");
  if (!nonEmpty(m.purpose, 200)) err("purpose", "purpose is required (up to 200 characters)");
  if (!oneOf(PARTY_TYPES, m.party)) err("party", `party must be one of ${PARTY_TYPES.join(", ")}`);
  if (!oneOf(AUDIENCES, m.audience)) err("audience", `audience must be one of ${AUDIENCES.join(", ")}`);
  if ((m.audience === "internal" || m.audience === "public") && m.party !== "none") err("audience", "an internal or public document has no named external party");
  if (m.audience === "external" && m.party === "none") err("audience", "an external document needs a party type");
  if (!oneOf(SIGN_MODES, m.sign)) err("sign", `sign must be one of ${SIGN_MODES.join(", ")}`);
  if (m.needsSignature !== (m.sign !== "no")) err("needsSignature", "needsSignature must be true exactly when sign is yes or optional");
  if (!m.legal || typeof m.legal.review !== "boolean" || typeof m.legal.statute !== "boolean") err("legal", "legal needs review and statute flags");
  if (typeof m.esignIneligible !== "boolean") err("esignIneligible", "esignIneligible must be true or false");
  if (m.esignIneligible && m.sign === "yes") err("esignIneligible", "an e-sign-ineligible type cannot default to e-signature");
  if (!m.stamp || !oneOf(STAMP_RULES, m.stamp.rule)) err("stamp.rule", `stamp rule must be one of ${STAMP_RULES.join(", ")}`);
  else if (m.stamp.rule === "none" && m.stamp.category) err("stamp.category", "a type with no stamp rule has no instrument category");
  else if (m.stamp.rule !== "none" && !oneOf(STAMP_CATEGORIES, m.stamp.category)) err("stamp.category", `a stamp category is required: one of ${STAMP_CATEGORIES.join(", ")}`);
  if (m.stamp?.rule === "likely" && !m.legal?.review) err("stamp", "a type that likely needs stamp duty must carry the legal review flag");
  if (!oneOf(RETENTION_KEYS, m.retentionKey)) err("retentionKey", `retentionKey must be one of ${RETENTION_KEYS.join(", ")}`);
  if (typeof m.numberingPrefix !== "string" || !PREFIX_RE.test(m.numberingPrefix)) err("numberingPrefix", "numberingPrefix must be 2 to 20 upper-case letters, digits or hyphens");
  if (!Array.isArray(m.inputsSummary) || m.inputsSummary.length === 0 || m.inputsSummary.some((s) => !nonEmpty(s, 200))) err("inputsSummary", "inputsSummary needs at least one entry");
  if (!Array.isArray(m.sectionsSummary) || m.sectionsSummary.length === 0 || m.sectionsSummary.some((s) => !nonEmpty(s, 200))) err("sectionsSummary", "sectionsSummary needs at least one entry");
  return out;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** The unparsed PBDoc for a template: title, then each section as a PBDoc `section` block with its heading and skeleton body. */
export function buildTemplateRaw(def: TemplateDef): Record<string, unknown> {
  const body: Record<string, unknown>[] = [h(1, def.title, def.layout.titleAlign)];
  for (const s of def.sections) {
    if (def.layout.pageBreakBefore?.includes(s.key)) body.push({ type: "pageBreak" });
    const heading = s.draftOnly || s.noHeading ? [] : [h(2, s.title)];
    body.push({ type: "section", key: s.key, title: s.title, aiMode: pbAiMode(s.aiMode), locked: s.locked, children: [...heading, ...s.body] });
  }
  return { schemaVersion: PBDOC_SCHEMA_VERSION, lang: def.lang, page: def.page, header: headerBlocks(def.layout.header), footer: footerBlocks(def.layout.footer), body };
}

export type BuildResult = { ok: true; doc: PBDoc } | { ok: false; issues: CatalogueIssue[] };

/** Assembles and parses a template into a PBDoc with deterministic ids. */
export function buildTemplateDoc(def: TemplateDef): BuildResult {
  const r = parseDoc(buildTemplateRaw(def), { assignIds: true, idFactory: sequentialIds("t") });
  return r.ok ? { ok: true, doc: r.doc } : { ok: false, issues: r.issues.map((i) => ({ path: `doc.${i.path}`, message: i.message })) };
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function validateInputs(inputs: InputField[], sectionKeys: Set<string>, out: CatalogueIssue[]): void {
  const err = (path: string, message: string) => out.push({ path, message });
  const seen = new Set<string>();
  const pickers = new Set(inputs.filter((i) => i.type === "person" && i.picker).map((i) => i.picker as string));
  inputs.forEach((inp, idx) => {
    const p = `inputs[${idx}]`;
    if (typeof inp.key !== "string" || !IDENT_RE.test(inp.key)) err(`${p}.key`, "key must be a lower-case name such as joining_date");
    else if (seen.has(inp.key)) err(`${p}.key`, `duplicate input key "${inp.key}"`);
    else if (RESERVED.includes(inp.key) && inp.type !== "person") err(`${p}.key`, `"${inp.key}" is a reserved name`);
    seen.add(inp.key);
    if (!nonEmpty(inp.label, 120)) err(`${p}.label`, "label is required");
    if (!oneOf(INPUT_TYPES, inp.type)) return err(`${p}.type`, `type must be one of ${INPUT_TYPES.join(", ")}`);
    if (typeof inp.required !== "boolean") err(`${p}.required`, "required must be true or false");
    if (inp.help !== undefined && !nonEmpty(inp.help, 300)) err(`${p}.help`, "help must be 1 to 300 characters");
    if (inp.type === "select" || inp.type === "multiselect") {
      if (!inp.options || inp.options.length < 2) err(`${p}.options`, "a select needs at least two options");
      else {
        const vals = new Set<string>();
        inp.options.forEach((o, oi) => {
          if (!nonEmpty(o.value, 60) || !nonEmpty(o.label, 120)) err(`${p}.options[${oi}]`, "an option needs a value and a label");
          if (vals.has(o.value)) err(`${p}.options[${oi}]`, `duplicate option value "${o.value}"`);
          vals.add(o.value);
        });
        if (inp.defaultValue !== undefined && inp.type === "select" && !vals.has(inp.defaultValue)) err(`${p}.defaultValue`, "default is not one of the options");
      }
    } else if (inp.options) err(`${p}.options`, "only a select or multiselect has options");
    if (inp.type === "person") {
      if (!oneOf(PICKER_NAMESPACES, inp.picker)) err(`${p}.picker`, `a person input needs a picker: one of ${PICKER_NAMESPACES.join(", ")}`);
      else if (inp.key !== inp.picker) err(`${p}.key`, `a person input's key must equal its picker ("${inp.picker}") so ${inp.picker}.* variables resolve from it`);
    } else if (inp.picker) err(`${p}.picker`, "only a person input has a picker");
    if (inp.type === "rows") {
      const cols = inp.columns ?? [];
      if (cols.length === 0) err(`${p}.columns`, "a rows input needs columns");
      const ck = new Set<string>();
      cols.forEach((c, ci) => {
        if (!IDENT_RE.test(c.key ?? "")) err(`${p}.columns[${ci}].key`, "column key must be a lower-case name");
        if (ck.has(c.key)) err(`${p}.columns[${ci}].key`, `duplicate column "${c.key}"`);
        ck.add(c.key);
        if (!nonEmpty(c.label, 80)) err(`${p}.columns[${ci}].label`, "column label is required");
        if (!oneOf(ROW_COLUMN_TYPES, c.type)) err(`${p}.columns[${ci}].type`, `column type must be one of ${ROW_COLUMN_TYPES.join(", ")}`);
      });
      if (inp.minRows !== undefined && (!Number.isInteger(inp.minRows) || inp.minRows < 0)) err(`${p}.minRows`, "minRows must be a whole number");
      if (inp.maxRows !== undefined && (!Number.isInteger(inp.maxRows) || inp.maxRows < 1 || inp.maxRows > 200 || (inp.minRows ?? 0) > inp.maxRows)) err(`${p}.maxRows`, "maxRows must be 1 to 200 and not below minRows");
      if (inp.bindings?.length) err(`${p}.bindings`, "a rows input cannot be auto-filled");
    } else if (inp.columns) err(`${p}.columns`, "only a rows input has columns");
    if ((inp.type === "number" || inp.type === "money") && inp.min !== undefined && inp.max !== undefined && inp.min > inp.max) err(`${p}.min`, "min is above max");
    if (inp.type !== "number" && inp.type !== "money" && (inp.min !== undefined || inp.max !== undefined)) err(`${p}.min`, "min and max apply to number and money only");
    if (inp.maxLength !== undefined && ((inp.type !== "text" && inp.type !== "longtext") || !Number.isInteger(inp.maxLength) || inp.maxLength < 1)) err(`${p}.maxLength`, "maxLength applies to text and longtext, as a positive whole number");
    if (inp.bindings) {
      if (inp.type === "person") err(`${p}.bindings`, "a person picker is not auto-filled");
      inp.bindings.forEach((b, bi) => {
        const ns = b.split(".")[0];
        if (ns === "input") err(`${p}.bindings[${bi}]`, "a binding must come from company, party or document data, not another input");
        else if (ns !== "custom" && !isKnownVariable(b)) err(`${p}.bindings[${bi}]`, `"${b}" is not a known variable`);
        else if ((PICKER_BACKED as readonly string[]).includes(ns) && !pickers.has(ns)) err(`${p}.bindings[${bi}]`, `"${b}" needs a ${ns} person input in the template`);
      });
    }
    if (inp.showWhen) {
      const target = inputs.findIndex((x) => x.key === inp.showWhen!.key);
      if (target === -1) err(`${p}.showWhen.key`, `unknown input "${inp.showWhen.key}"`);
      else if (target >= idx) err(`${p}.showWhen.key`, "showWhen must point to an earlier input");
      if (!nonEmpty(inp.showWhen.equals, 60)) err(`${p}.showWhen.equals`, "showWhen needs a value");
    }
    inp.feedsSections?.forEach((k, ki) => { if (!sectionKeys.has(k)) err(`${p}.feedsSections[${ki}]`, `unknown section "${k}"`); });
  });
}

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

export interface TemplateValidation {
  ok: boolean;
  issues: CatalogueIssue[];
  doc?: PBDoc;
}

export function validateTemplateDef(def: TemplateDef): TemplateValidation {
  const out = validateMeta(def, "");
  const err = (path: string, message: string) => out.push({ path, message });

  if (!Number.isInteger(def.version) || def.version < 1) err("version", "version must be a whole number from 1");
  if (def.lang !== "en") err("lang", 'lang must be "en"');
  if (!nonEmpty(def.title, 200)) err("title", "title is required");
  const pg = validatePage(def.page);
  if (!pg.ok) pg.errors.forEach((m) => err("page", m));
  if (!def.layout || !oneOf(HEADER_LAYOUTS, def.layout.header) || !oneOf(FOOTER_LAYOUTS, def.layout.footer)) err("layout", "layout needs a valid header and footer token");
  if (!Array.isArray(def.disclaimers)) err("disclaimers", "disclaimers must be a list");

  if (def.legal.review && def.legalBanner !== LEGAL_REVIEW_BANNER) err("legalBanner", `a legal-review template must carry the exact notice "${LEGAL_REVIEW_BANNER}"`);
  if (!def.legal.review && def.legalBanner) err("legalBanner", "only a legal-review template carries the legal banner");
  if (def.legal.statute && def.statuteNotice !== STATUTE_NOTICE) err("statuteNotice", "a statute-sensitive template must carry the standard verification notice");
  if (!def.legal.statute && def.statuteNotice) err("statuteNotice", "only a statute-sensitive template carries the verification notice");

  const sectionKeys = new Set<string>();
  if (!Array.isArray(def.sections) || def.sections.length === 0) err("sections", "a template needs at least one section");
  def.sections?.forEach((s, i) => {
    const p = `sections[${i}]`;
    if (typeof s.key !== "string" || !IDENT_RE.test(s.key)) err(`${p}.key`, "section key must be a lower-case name");
    else if (sectionKeys.has(s.key)) err(`${p}.key`, `duplicate section key "${s.key}"`);
    sectionKeys.add(s.key);
    if (!nonEmpty(s.title, 200)) err(`${p}.title`, "section title is required");
    if (!oneOf(TEMPLATE_AI_MODES, s.aiMode)) err(`${p}.aiMode`, `aiMode must be one of ${TEMPLATE_AI_MODES.join(", ")}`);
    if (!Array.isArray(s.body) || s.body.length === 0) err(`${p}.body`, "a section needs a body skeleton");
    if (s.aiMode === "fixed") {
      if (s.ai) err(`${p}.ai`, "a fixed section has no AI instructions");
      if (s.draftOnly && !s.locked) err(`${p}.locked`, "a drafting notice must be locked");
    } else if (s.aiMode === "ai" || s.aiMode === "hybrid") {
      if (s.locked) err(`${p}.locked`, "an AI or hybrid section cannot be locked");
      const a = s.ai;
      if (!a) err(`${p}.ai`, "an AI or hybrid section needs AI instructions");
      else {
        if (!nonEmpty(a.brief, 400)) err(`${p}.ai.brief`, "brief is required");
        if (!Number.isInteger(a.minWords) || !Number.isInteger(a.maxWords) || a.minWords < 1 || a.maxWords < a.minWords || a.maxWords > 1200) err(`${p}.ai`, "word range must be whole numbers with 1 <= min <= max <= 1200");
        if (!Array.isArray(a.allowedFacts) || a.allowedFacts.length === 0) err(`${p}.ai.allowedFacts`, "list the facts the section may use");
        if (!Array.isArray(a.neverInvent) || a.neverInvent.length === 0) err(`${p}.ai.neverInvent`, "state what must never be invented");
      }
    }
  });
  def.sections?.forEach((s, i) => {
    s.dependsOn?.forEach((k, ki) => {
      if (!sectionKeys.has(k)) err(`sections[${i}].dependsOn[${ki}]`, `unknown section "${k}"`);
      else if (k === s.key) err(`sections[${i}].dependsOn[${ki}]`, "a section cannot depend on itself");
    });
  });
  def.layout?.pageBreakBefore?.forEach((k, i) => { if (!sectionKeys.has(k)) err(`layout.pageBreakBefore[${i}]`, `unknown section "${k}"`); });

  const notice = (key: string, text: string, flag: string) => {
    const s = def.sections?.find((x) => x.key === key);
    if (!s) err("sections", `a ${flag} template needs a ${key} section`);
    else if (!s.draftOnly || !s.locked || s.aiMode !== "fixed") err(`sections.${key}`, `${key} must be a fixed, locked, draft-only section`);
    else if (!JSON.stringify(s.body).includes(text)) err(`sections.${key}`, `${key} must contain the standard notice text`);
  };
  if (def.legal.review) notice("legal_notice", LEGAL_REVIEW_BANNER, "legal-review");
  if (def.legal.statute) notice("verify_notice", STATUTE_NOTICE, "statute-sensitive");

  if (!Array.isArray(def.inputs)) err("inputs", "inputs must be a list");
  else validateInputs(def.inputs, sectionKeys, out);

  const built = Array.isArray(def.sections) && def.sections.every((s) => Array.isArray(s.body)) ? buildTemplateDoc(def) : null;
  let doc: PBDoc | undefined;
  if (built && !built.ok) out.push(...built.issues);
  else if (built && built.ok && Array.isArray(def.inputs)) {
    doc = built.doc;
    crossCheck(def, doc, out);
  }
  return { ok: out.length === 0, issues: out, doc };
}

/** Variable, placeholder, condition, repeat, signature and input-usage checks over the parsed document. */
function crossCheck(def: TemplateDef, doc: PBDoc, out: CatalogueIssue[]): void {
  const err = (path: string, message: string) => out.push({ path, message });
  const inputs = new Map(def.inputs.map((i) => [i.key, i]));
  const pickers = new Set(def.inputs.filter((i) => i.type === "person" && i.picker).map((i) => i.picker as string));
  const used = new Set<string>();

  const checkKey = (key: string, where: string, allowRows = false) => {
    const [ns, ...rest] = key.split(".");
    if (ns === "input") {
      const k = rest[0];
      used.add(k);
      if (rest.length !== 1) err(where, `"${key}" is not a valid input variable`);
      else if (!inputs.has(k)) err(where, `unknown input variable "${key}" (declare input "${k}")`);
      else if (inputs.get(k)!.type === "person") err(where, `"${key}" is a person picker; use ${k}.* fields`);
      else if (inputs.get(k)!.type === "rows" && !allowRows) err(where, `"${key}" is a rows input; use a repeat`);
      return;
    }
    if (ns === "custom") return;
    if (!isKnownVariable(key)) { err(where, `unknown variable "${key}"`); return; }
    if ((PICKER_BACKED as readonly string[]).includes(ns)) {
      if (!pickers.has(ns)) err(where, `"${key}" needs a ${ns} person input in the template`);
      else used.add(ns);
    }
  };

  const c = collectVariables(doc);
  for (const v of c.variables) checkKey(v.key, `variable ${v.key}`);
  // A placeholder inside an AI or hybrid section is a slot the AI fills (or the user types), so it needs no declared input.
  const aiSlots = new Set<string>();
  for (const s of doc.body) {
    if (s.type === "section" && s.aiMode === "generate") {
      walkBlocks(s.children, (b) => { for (const n of inlineOf(b)) if (n.type === "placeholder") aiSlots.add(n.key); });
    }
  }
  for (const ph of c.placeholders) {
    if (!ph.key.startsWith("input.")) err(`placeholder ${ph.key}`, "a placeholder key must be an input.* key");
    else if (!aiSlots.has(ph.key) || inputs.has(ph.key.slice(6))) checkKey(ph.key, `placeholder ${ph.key}`);
  }
  for (const k of c.conditionKeys) checkKey(k, `condition ${k}`, true);

  walkBlocks(doc.body, (b) => {
    if (b.type !== "repeat") return;
    const inp = b.source.startsWith("input.") ? inputs.get(b.source.slice(6)) : undefined;
    if (!inp || inp.type !== "rows") { err(`repeat ${b.source}`, "a repeat source must be a declared rows input (input.<key>)"); return; }
    used.add(inp.key);
    const cols = new Set((inp.columns ?? []).map((x) => x.key));
    walkBlocks(b.children, (x) => {
      for (const n of inlineOf(x)) {
        if (n.type === "var" && n.key.startsWith(`${b.itemVar}.`) && !cols.has(n.key.slice(b.itemVar.length + 1))) err(`repeat ${b.source}`, `"${n.key}" is not a column of input "${inp.key}"`);
      }
    });
  });

  for (const inp of def.inputs) {
    if (inp.feedsSections?.length) used.add(inp.key);
    if (inp.showWhen) used.add(inp.showWhen.key);
  }
  for (const s of def.sections) {
    for (const fact of s.ai?.allowedFacts ?? []) {
      if (fact.startsWith("input.")) {
        const k = fact.slice(6);
        if (!inputs.has(k)) err(`sections.${s.key}.ai.allowedFacts`, `unknown input "${fact}"`);
        else used.add(k);
      } else if (!fact.startsWith("custom.") && !isKnownVariable(fact)) err(`sections.${s.key}.ai.allowedFacts`, `unknown fact "${fact}"`);
      else {
        const ns = fact.split(".")[0];
        if ((PICKER_BACKED as readonly string[]).includes(ns)) {
          if (!pickers.has(ns)) err(`sections.${s.key}.ai.allowedFacts`, `"${fact}" needs a ${ns} person input`);
          else used.add(ns);
        }
      }
    }
  }
  for (const inp of def.inputs) if (!used.has(inp.key)) err(`inputs.${inp.key}`, `input "${inp.key}" is never used by the document, a condition, a repeat, an AI section or another input`);

  const signed = allBlocks(doc).some((b) => b.type === "signatureBlock");
  if (def.needsSignature && !signed) err("body", "a template that needs a signature must carry signature blocks");
  if (!def.needsSignature && signed) err("body", "a template that is never signed must not carry signature blocks");
}
