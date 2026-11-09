import "server-only";
import { applyBrandToDoc, brandRenderOptions, loadBrand } from "@/lib/products/playbook-ai/brand/apply";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import type { BrandSettings } from "@/lib/products/playbook-ai/brand/types";
import { getTemplateDef } from "@/lib/products/playbook-ai/catalogue/registry";
import { listCatalogue } from "@/lib/products/playbook-ai/catalogue/registry";
import { buildTemplateDoc } from "@/lib/products/playbook-ai/catalogue/validate";
import { renderDocx } from "@/lib/products/playbook-ai/doc/render/docx";
import { renderPdf } from "@/lib/products/playbook-ai/doc/render/pdf";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { VarValues } from "@/lib/products/playbook-ai/doc/variables";
import { buildLibraryDoc, listLibrary } from "@/lib/products/playbook-ai/item-library";
import { layoutInputFor } from "@/lib/products/playbook-ai/items-layout";
import { stripDraftOnly } from "@/lib/products/playbook-ai/tpl/strip";
import { builtinVariable } from "@/lib/products/playbook-ai/variables-registry";

/**
 * Renders a library item (a catalogue template, a SOP or a KPI sheet) as the blank template a company would start from: the company letterhead
 * and company data are filled in, today's date is set, and every value that is not known yet (an input the user will type, a person's name) is
 * shown as a highlighted fill-in blank such as "[ Notice period ]". It never blocks on missing values and carries no DRAFT watermark; the PDF
 * footer says "Template preview". Used by the library Preview and Download buttons and by `scripts/audit-pb-library.ts`.
 */
export type LibraryKind = "document" | "sop" | "kpi";
export type LibraryRender = { ok: true; bytes: Buffer; pages: number | null; filename: string } | { ok: false; message: string };

export function listRenderTargets(): { kind: LibraryKind; id: string }[] {
  return [
    ...listCatalogue({ withContent: true }).map((e) => ({ kind: "document" as const, id: e.meta.id })),
    ...listLibrary("sop").map((e) => ({ kind: "sop" as const, id: e.id })),
    ...listLibrary("kpi").map((e) => ({ kind: "kpi" as const, id: e.id })),
  ];
}

const humanize = (key: string): string => { const last = key.split(".").pop() ?? key; const t = last.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const present = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== "";

/** Replaces every variable or placeholder that has no value with highlighted bracketed text. Inside a repeat block nothing is replaced. */
export function fillBlanks(doc: PBDoc, values: VarValues, labelOf: (key: string) => string): PBDoc {
  const walk = (n: unknown, inRepeat: boolean): unknown => {
    if (Array.isArray(n)) {
      const out: unknown[] = [];
      for (const x of n) {
        const o = x as Record<string, unknown> | null;
        if (!inRepeat && o && typeof o === "object" && o.type === "var" && typeof o.key === "string" && !present(values[o.key]) && !o.fallback) out.push({ type: "text", text: `[ ${labelOf(o.key)} ]`, marks: [{ type: "highlight", color: "yellow" }] });
        else if (!inRepeat && o && typeof o === "object" && o.type === "placeholder") out.push({ type: "text", text: `[ ${String(o.label ?? o.key)} ]`, marks: [{ type: "highlight", color: "yellow" }] });
        else out.push(walk(x, inRepeat));
      }
      return out;
    }
    if (typeof n !== "object" || n === null) return n;
    const o = n as Record<string, unknown>;
    const rep = inRepeat || o.type === "repeat";
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) res[k] = typeof v === "object" ? walk(v, rep) : v;
    return res;
  };
  return walk(doc, false) as PBDoc;
}

const todayIso = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 70) || "template";

export async function renderLibraryDocument(kind: LibraryKind, id: string, format: "pdf" | "docx", opts: { company?: VarValues; brandSettings?: BrandSettings; docNumber?: string; watermark?: string | null } = {}): Promise<LibraryRender> {
  const labels = new Map<string, string>(); const defaults: VarValues = {}; let doc: PBDoc, title: string, docTypeId: string | null = null, meta: { department?: string; designation?: string; description?: string; reviewPeriod?: string } = {};
  if (kind === "document") {
    const def = getTemplateDef(id);
    if (!def) return { ok: false, message: "That template does not exist." };
    const built = buildTemplateDoc(def);
    if (!built.ok) return { ok: false, message: `The template is not valid: ${built.issues[0]?.message ?? "invalid"}` };
    doc = stripDraftOnly(built.doc);
    title = def.name; docTypeId = def.id;
    for (const i of def.inputs) { labels.set(`input.${i.key}`, i.label); if (i.defaultValue !== undefined) defaults[`input.${i.key}`] = i.type === "number" || i.type === "money" ? Number(i.defaultValue) : i.defaultValue; }
  } else {
    const b = buildLibraryDoc(id);
    if (!b) return { ok: false, message: "That library entry does not exist." };
    doc = b.doc; title = b.info.title; meta = b.meta;
  }
  const brand = await loadBrand(opts.brandSettings);
  const company = opts.company ?? (await loadCompanyValues());
  const values: VarValues = { ...company, "date.today": todayIso(), ...defaults };
  const filled = fillBlanks(doc, values, (k) => labels.get(k) ?? builtinVariable(k)?.label ?? humanize(k));
  const layoutKind = kind === "document" ? "document" : kind;
  const withBrand = applyBrandToDoc(filled, brand.settings, values, { docNumber: opts.docNumber, layout: layoutInputFor({ kind: layoutKind, title, docTypeId, meta, authorName: null }) });
  const ro = { meta: { title, dateIso: todayIso(), ...(opts.docNumber ? { docNumber: opts.docNumber } : {}) }, values, brand: brandRenderOptions(brand, "Template preview"), watermark: (opts.watermark ?? null) as string | null, allowUnresolved: true };
  try {
    if (format === "pdf") { const o = await renderPdf(withBrand, ro); return { ok: true, bytes: o.buffer, pages: o.pages, filename: `${safe(title)}-template.pdf` }; }
    const o = await renderDocx(withBrand, ro);
    return { ok: true, bytes: o.buffer, pages: o.estimatedPages, filename: `${safe(title)}-template.docx` };
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message ? `The ${format.toUpperCase()} could not be made: ${e.message}` : `The ${format.toUpperCase()} could not be made.` };
  }
}
