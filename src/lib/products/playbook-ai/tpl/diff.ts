/**
 * What differs between two templates. Pure, client-safe.
 *
 * `diffTemplates(a, b)` lists the changes that turn `a` into `b`: metadata, the inputs form, and every section (added, removed, moved,
 * changed attributes, wording). `threeWay(base, mine, theirs)` is the starter-update view: what the platform changed since the company
 * copied the starter, what the company changed itself, and which parts both changed (the ones that need a person's decision). Nothing here
 * writes anything: a starter update is only ever shown, never applied.
 */

import { canonicalJson } from "@/lib/products/playbook-ai/doc/canonical";
import type { InputField, TemplateDef, TemplateSection } from "@/lib/products/playbook-ai/catalogue/types";

export interface TemplateChange {
  /** Stable id of the thing that changed: `meta.title`, `input.joining_date`, `section.terms`, `section.terms.ai`. */
  id: string;
  area: "meta" | "layout" | "input" | "section";
  kind: "added" | "removed" | "changed" | "moved";
  label: string;
  /** One line a person can read. */
  summary: string;
}

const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

/** Every piece of text in a skeleton (plain text and variable keys), in order. */
export function skeletonText(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => skeletonText(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.type === "text" && typeof o.text === "string") out.push(o.text);
    else if (o.type === "var" && typeof o.key === "string") out.push(`{{${o.key}}}`);
    else if (o.type === "placeholder" && typeof o.label === "string") out.push(`[${o.label}]`);
    for (const [k, v] of Object.entries(o)) if (k !== "type" && typeof v === "object") skeletonText(v, out);
  }
  return out;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

function wordDelta(a: unknown, b: unknown): { added: number; removed: number } {
  const wa = words(skeletonText(a).join(" "));
  const wb = words(skeletonText(b).join(" "));
  const count = (xs: string[]) => { const m = new Map<string, number>(); xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)); return m; };
  const ca = count(wa), cb = count(wb);
  let added = 0, removed = 0;
  for (const [w, n] of cb) added += Math.max(0, n - (ca.get(w) ?? 0));
  for (const [w, n] of ca) removed += Math.max(0, n - (cb.get(w) ?? 0));
  return { added, removed };
}

const META_FIELDS: [keyof TemplateDef, string][] = [
  ["name", "Name"], ["purpose", "Purpose"], ["title", "Document title"], ["party", "Party type"], ["audience", "Audience"], ["sign", "Signature"],
  ["esignIneligible", "E-sign ineligible"], ["retentionKey", "Retention class"], ["numberingPrefix", "Numbering prefix"],
];

function inputChanges(a: InputField, b: InputField): string[] {
  const out: string[] = [];
  for (const k of ["label", "type", "required", "help", "placeholder", "picker", "minRows", "maxRows", "min", "max", "maxLength", "defaultValue"] as const) {
    if (!same(a[k], b[k])) out.push(k === "required" ? (b.required ? "now required" : "now optional") : k);
  }
  if (!same(a.options, b.options)) out.push("options");
  if (!same(a.columns, b.columns)) out.push("columns");
  if (!same(a.bindings, b.bindings)) out.push("auto-fill bindings");
  if (!same(a.showWhen, b.showWhen)) out.push("visibility rule");
  if (!same(a.feedsSections, b.feedsSections)) out.push("sections it feeds");
  return out;
}

function sectionAttrChanges(a: TemplateSection, b: TemplateSection): string[] {
  const out: string[] = [];
  if (a.title !== b.title) out.push("title");
  if (a.aiMode !== b.aiMode) out.push(`mode (${a.aiMode} to ${b.aiMode})`);
  if (a.locked !== b.locked) out.push(b.locked ? "now locked" : "now unlocked");
  if (!!a.draftOnly !== !!b.draftOnly) out.push("draft-only");
  if (!!a.noHeading !== !!b.noHeading) out.push("heading");
  if (!same(a.dependsOn, b.dependsOn)) out.push("dependencies");
  return out;
}

export function diffTemplates(a: TemplateDef, b: TemplateDef): TemplateChange[] {
  const out: TemplateChange[] = [];
  for (const [k, label] of META_FIELDS) {
    if (!same(a[k], b[k])) out.push({ id: `meta.${String(k)}`, area: "meta", kind: "changed", label, summary: `${label} changed` });
  }
  if (!same(a.legal, b.legal)) out.push({ id: "meta.legal", area: "meta", kind: "changed", label: "Legal flags", summary: "Legal review or statute flags changed" });
  if (!same(a.stamp, b.stamp)) out.push({ id: "meta.stamp", area: "meta", kind: "changed", label: "Stamp duty", summary: "Stamp duty rule changed" });
  if (!same(a.disclaimers, b.disclaimers)) out.push({ id: "meta.disclaimers", area: "meta", kind: "changed", label: "Notes", summary: "Standing notes changed" });
  if (!same(a.page, b.page)) out.push({ id: "layout.page", area: "layout", kind: "changed", label: "Page", summary: "Page size or margins changed" });
  if (!same(a.layout, b.layout)) out.push({ id: "layout.tokens", area: "layout", kind: "changed", label: "Layout", summary: "Header, footer or title layout changed" });

  const ai = new Map(a.inputs.map((i) => [i.key, i]));
  const bi = new Map(b.inputs.map((i) => [i.key, i]));
  for (const [k, inp] of bi) {
    const old = ai.get(k);
    if (!old) out.push({ id: `input.${k}`, area: "input", kind: "added", label: inp.label, summary: `New input "${inp.label}"${inp.required ? " (required)" : ""}` });
    else {
      const ch = inputChanges(old, inp);
      if (ch.length) out.push({ id: `input.${k}`, area: "input", kind: "changed", label: inp.label, summary: `Input "${inp.label}": ${ch.join(", ")}` });
    }
  }
  for (const [k, inp] of ai) if (!bi.has(k)) out.push({ id: `input.${k}`, area: "input", kind: "removed", label: inp.label, summary: `Input "${inp.label}" removed` });

  const as = new Map(a.sections.map((s) => [s.key, s]));
  const bs = new Map(b.sections.map((s) => [s.key, s]));
  const commonOrderA = a.sections.filter((s) => bs.has(s.key)).map((s) => s.key);
  const commonOrderB = b.sections.filter((s) => as.has(s.key)).map((s) => s.key);
  for (const [k, sec] of bs) {
    const old = as.get(k);
    if (!old) { out.push({ id: `section.${k}`, area: "section", kind: "added", label: sec.title, summary: `New section "${sec.title}"` }); continue; }
    const attrs = sectionAttrChanges(old, sec);
    if (attrs.length) out.push({ id: `section.${k}`, area: "section", kind: "changed", label: sec.title, summary: `Section "${sec.title}": ${attrs.join(", ")}` });
    if (!same(old.body, sec.body)) {
      const d = wordDelta(old.body, sec.body);
      out.push({ id: `section.${k}.body`, area: "section", kind: "changed", label: sec.title, summary: `Wording of "${sec.title}" changed (${d.added} words added, ${d.removed} removed)` });
    }
    if (!same(old.ai, sec.ai)) out.push({ id: `section.${k}.ai`, area: "section", kind: "changed", label: sec.title, summary: `AI instructions of "${sec.title}" changed` });
    const ia = commonOrderA.indexOf(k), ib = commonOrderB.indexOf(k);
    if (ia !== ib) out.push({ id: `section.${k}.order`, area: "section", kind: "moved", label: sec.title, summary: `Section "${sec.title}" moved` });
  }
  for (const [k, sec] of as) if (!bs.has(k)) out.push({ id: `section.${k}`, area: "section", kind: "removed", label: sec.title, summary: `Section "${sec.title}" removed` });
  return out;
}

export interface ThreeWay {
  /** What the platform changed in the starter since the company copied it. */
  starterChanges: TemplateChange[];
  /** What the company changed in its copy. */
  yourChanges: TemplateChange[];
  /** Ids changed on both sides: these need a decision. */
  conflicts: string[];
}

/** Ids of the same part: `section.terms.body` conflicts with `section.terms`, and the reverse. */
const overlaps = (x: string, y: string) => x === y || x.startsWith(`${y}.`) || y.startsWith(`${x}.`);

export function threeWay(base: TemplateDef, mine: TemplateDef, starterNow: TemplateDef): ThreeWay {
  const starterChanges = diffTemplates(base, starterNow);
  const yourChanges = diffTemplates(base, mine);
  const conflicts = starterChanges.filter((s) => yourChanges.some((m) => overlaps(s.id, m.id))).map((s) => s.id);
  return { starterChanges, yourChanges, conflicts };
}
