import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, getObject, deleteObject } from "@/lib/storage/blob";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { playbookCan } from "@/lib/playbook-roles";
import { sha256Hex } from "@/lib/products/playbook-ai/doc/hash";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { VarLists, VarValues } from "@/lib/products/playbook-ai/doc/variables";
import { RENDER_LIMITS, RenderBlockedError, type RenderOptions } from "@/lib/products/playbook-ai/doc/render/prepare";
import { renderPdf } from "@/lib/products/playbook-ai/doc/render/pdf";
import { renderDocx } from "@/lib/products/playbook-ai/doc/render/docx";
import { applyBrandToDoc, brandRenderOptions, brandWatermark, loadBrand } from "@/lib/products/playbook-ai/brand/apply";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import { getBrandAsset } from "@/lib/products/playbook-ai/brand/assets";
import { getDocument, attachSealedExport } from "@/lib/products/playbook-ai/documents";
import { getVersionByNumber } from "@/lib/products/playbook-ai/versions";
import { loadVariableValues } from "@/lib/products/playbook-ai/variables-adapters";
import { indiaDateParts } from "@/lib/products/playbook-ai/variables-registry";
import { layoutInputFor } from "@/lib/products/playbook-ai/items-layout";
import { recordPbAudit } from "@/lib/products/playbook-ai/pb-audit";
import type { PbActor, PbDocumentRecord, PbError, PbResult, PbVersionRecord, TemplateRef } from "@/lib/products/playbook-ai/documents-types";

/**
 * PDF and Word export of a document version.
 *
 *  - An ISSUED version is rendered ONCE from its frozen variable snapshot, with no watermark, stored in private Blob with its SHA-256 and
 *    recorded on the version (`attachSealedExport`, set once). Every later download serves exactly the stored bytes, after checking the hash.
 *  - Anything else (draft, in review, approved, an older version) is rendered live from current data, always watermarked: DRAFT, or
 *    UNREVIEWED when the template has not been legally reviewed. Unfilled values are highlighted instead of blocking the download.
 *  - Documents over the page cap (120 pages, owner decision) are refused with a clear message instead of being rendered.
 *  - At most `MAX_CONCURRENT_RENDERS` renders run at once per server instance and each has a time limit, so a burst of exports cannot
 *    exhaust memory or hold the function open.
 */

export type ExportFormat = "pdf" | "docx";
export const EXPORT_FORMATS: readonly ExportFormat[] = ["pdf", "docx"];
export const MAX_PAGES = RENDER_LIMITS.maxEstimatedPages;
export const MAX_CONCURRENT_RENDERS = 2;
export const RENDER_TIMEOUT_MS = 55_000;

const MIME: Record<ExportFormat, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

// ---------------------------------------------------------------------------------------------------------------------------------
// Hooks (storage, images, template review): replaceable so tests never touch a real provider and A7/A9 can plug in
// ---------------------------------------------------------------------------------------------------------------------------------

export interface SealedExportStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const blobStore: SealedExportStore = {
  async put(key, bytes, contentType) {
    const i = key.lastIndexOf("/");
    await putObject(key.slice(0, i), key.slice(i + 1), bytes, contentType);
  },
  async get(key) {
    const obj = await getObject(key);
    if (!obj) return null;
    const chunks: Uint8Array[] = [];
    const reader = obj.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  },
  async delete(key) {
    await deleteObject(key);
  },
};
let storeOverride: SealedExportStore | null = null;
/** Test hook: replace the storage (null restores the real private Blob store). */
export function setSealedExportStore(s: SealedExportStore | null): void {
  storeOverride = s;
}
const store = () => storeOverride ?? blobStore;

export type ImageLoader = (doc: PBDoc) => Promise<Record<string, Uint8Array>>;
/** Default: image blocks may point at an uploaded brand image. The editor's image storage replaces this with `setImageLoader`. */
let imageLoader: ImageLoader = async (doc) => {
  const ids = new Set<string>();
  const walk = (blocks: readonly unknown[]) => {
    for (const b of blocks as { type?: string; fileId?: string; children?: unknown[]; content?: unknown[]; items?: { content: unknown[] }[]; rows?: { cells: { content: unknown[] }[] }[] }[]) {
      if (b.type === "image" && b.fileId) ids.add(b.fileId);
      if (b.children) walk(b.children);
      if (b.type === "callout" && b.content) walk(b.content);
      if (b.items) b.items.forEach((i) => walk(i.content));
      if (b.rows) b.rows.forEach((r) => r.cells.forEach((c) => walk(c.content)));
    }
  };
  walk(doc.body); walk(doc.header); walk(doc.footer);
  const out: Record<string, Uint8Array> = {};
  for (const id of ids) { const a = await getBrandAsset(id); if (a) out[id] = a.bytes; }
  return out;
};
export function setImageLoader(fn: ImageLoader): void {
  imageLoader = fn;
}

export type TemplateReviewLookup = (ref: TemplateRef | null, docTypeId: string | null) => Promise<boolean | null>;
let reviewLookup: TemplateReviewLookup = async () => null;
/** A9 installs this: true = the template carries a legal reviewed-by stamp, false = unreviewed, null = not known (no UNREVIEWED mark). */
export function setTemplateReviewLookup(fn: TemplateReviewLookup): void {
  reviewLookup = fn;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------------------------

/** `{docNumber}-{title}-v{n}.pdf`, safe on every operating system and in a Content-Disposition header. */
export function exportFilename(p: { docNumber: string | null; title: string; version: number | null; ext: ExportFormat; draft: boolean }): string {
  const clean = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9._ -]+/g, "-").replace(/[\s_]+/g, " ").trim().replace(/ /g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  const parts = [p.docNumber ? clean(p.docNumber) : p.draft ? "DRAFT" : "", clean(p.title).slice(0, 70), p.version ? `v${p.version}` : ""].filter(Boolean);
  const base = (parts.join("-") || "document").slice(0, 120).replace(/[-.]+$/g, "");
  return `${base || "document"}.${p.ext}`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------------------------------------------------------------

let running = 0;
async function guarded<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: PbError }> {
  if (running >= MAX_CONCURRENT_RENDERS) return { ok: false, error: { code: "busy", message: "Other documents are being prepared right now. Try again in a few seconds." } };
  running++;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), RENDER_TIMEOUT_MS); }),
    ]);
    return { ok: true, value };
  } catch (e) {
    if (e instanceof RenderBlockedError) return { ok: false, error: mapBlocked(e) };
    if (e instanceof Error && e.message === "timeout") return { ok: false, error: { code: "render_failed", message: "Preparing this document took too long. Try again, or split it into smaller parts." } };
    return { ok: false, error: { code: "render_failed", message: "The document could not be prepared. Try again; if it keeps failing, contact support." } };
  } finally {
    if (timer) clearTimeout(timer);
    running--;
  }
}

function mapBlocked(e: RenderBlockedError): PbError {
  const tooLarge = e.reasons.find((r) => r.code === "too_large");
  if (tooLarge) return { code: "too_large", message: `This document is too long to export in one step (${tooLarge.detail.replace(/;.*$/, "")}). Documents over ${MAX_PAGES} pages are not exported directly: split it into parts and export each part.` };
  if (e.unresolved.length || e.placeholders.length) {
    const names = [...e.unresolved.map((u) => u.key), ...e.placeholders.map((p) => p.label)].slice(0, 8).join(", ");
    return { code: "render_failed", message: `Some values are still missing: ${names}.` };
  }
  return { code: "render_failed", message: e.reasons[0]?.detail ?? e.message };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------------------------------------------

export interface ExportOk {
  bytes: Buffer;
  contentType: string;
  filename: string;
  sha256: string;
  pages: number | null;
  /** True when the bytes are the stored, sealed export of an issued version. */
  sealed: boolean;
  watermark: string | null;
  version: number | null;
  warnings: string[];
}

async function renderNow(format: ExportFormat, doc: PBDoc, opts: RenderOptions): Promise<{ buffer: Buffer; pages: number | null; warnings: string[]; watermark: string | null }> {
  if (format === "pdf") {
    const r = await renderPdf(doc, opts);
    return { buffer: r.buffer, pages: r.pages, warnings: r.warnings, watermark: r.watermark };
  }
  const r = await renderDocx(doc, opts);
  return { buffer: r.buffer, pages: r.estimatedPages, warnings: r.warnings, watermark: r.watermark };
}

const sealedKey = (companyId: string, documentId: string, version: number, format: ExportFormat) =>
  `playbook-exports/${companyId}/${documentId}/v${version}-${randomUUID()}.${format}`;

async function buildRenderInput(
  actor: PbActor, d: PbDocumentRecord, version: PbVersionRecord | null, sealed: boolean,
): Promise<{ doc: PBDoc; values: VarValues; lists: VarLists; docNumber: string | null; versionNo: number | null; dateIso: string; title: string }> {
  const source = version?.pbdoc ?? d.pbdoc;
  const title = version?.title ?? d.title;
  const docNumber = version?.docNumber ?? d.docNumber;
  if (sealed && version?.variableSnapshot) {
    const base = await loadCompanyValues();
    return { doc: source, values: { ...base, ...version.variableSnapshot.values }, lists: version.variableSnapshot.lists, docNumber, versionNo: version.number, dateIso: indiaDateParts(version.createdAt).iso, title };
  }
  const versionNo = version?.number ?? d.versionSeq + 1;
  const loaded = await loadVariableValues(actor, { doc: { title, docNumber, version: versionNo, status: d.status, issuedAt: d.issuedAt, authorId: d.createdBy }, links: d.links, inputs: d.inputs });
  const company = await loadCompanyValues();
  return { doc: source, values: { ...company, ...loaded.values }, lists: d.lists, docNumber, versionNo: version?.number ?? null, dateIso: indiaDateParts(new Date()).iso, title };
}

export interface ExportInput {
  id: string;
  format: ExportFormat;
  /** A version number, "draft" for the current editable content, or omitted for the issued version (or the draft when nothing is issued). */
  version?: number | "draft";
}

export async function exportDocument(actor: PbActor, input: ExportInput): Promise<PbResult<{ file: ExportOk }>> {
  if (!EXPORT_FORMATS.includes(input.format)) return { ok: false, error: { code: "invalid", message: "Choose PDF or Word.", issues: [] } };
  if (!playbookCan(actor, "EXPORT")) return { ok: false, error: { code: "forbidden", message: "You are not allowed to download documents." } };
  const got = await getDocument(actor, input.id);
  if (!got.ok) return got;
  if (!got.capabilities.export) return { ok: false, error: { code: "forbidden", message: "You are not allowed to download this document." } };
  const d = got.document;

  let version: PbVersionRecord | null = null;
  if (typeof input.version === "number") {
    version = await getVersionByNumber(d._id, input.version);
    if (!version) return { ok: false, error: { code: "not_found", message: "That version does not exist." } };
  } else if (input.version === undefined && d.status === "issued" && d.issuedVersion !== null) {
    version = await getVersionByNumber(d._id, d.issuedVersion);
  }
  const sealed = version?.kind === "issue" && !!version.variableSnapshot;
  const t0 = Date.now();

  let file: ExportOk;
  if (sealed && version) {
    const r = await sealedFile(actor, d, version, input.format);
    if (!r.ok) return r;
    file = r.file;
  } else {
    const live = await liveFile(actor, d, version, input.format);
    if (!live.ok) return live;
    file = live.file;
  }
  await recordPbAudit({
    actor, action: "export", entity: "document", entityId: d._id,
    summary: `Downloaded ${input.format.toUpperCase()}${file.version ? ` of version ${file.version}` : " of the current draft"}${file.sealed ? " (sealed)" : ""}`,
    metadata: { format: input.format, version: file.version, sealed: file.sealed, sha256: file.sha256, pages: file.pages, watermark: file.watermark, ms: Date.now() - t0 },
  });
  return { ok: true, file };
}

async function sealedFile(actor: PbActor, d: PbDocumentRecord, v: PbVersionRecord, format: ExportFormat): Promise<PbResult<{ file: ExportOk }>> {
  const filename = exportFilename({ docNumber: v.docNumber, title: v.title, version: v.number, ext: format, draft: false });
  const make = (bytes: Buffer, sha: string, pages: number | null, warnings: string[]): PbResult<{ file: ExportOk }> =>
    ({ ok: true, file: { bytes, contentType: MIME[format], filename, sha256: sha, pages, sealed: true, watermark: null, version: v.number, warnings } });

  const stored = async (ref: { key: string; sha256: string }): Promise<PbResult<{ file: ExportOk }>> => {
    const bytes = await store().get(ref.key);
    if (!bytes) return { ok: false, error: { code: "render_failed", message: "The sealed copy of this document could not be read from storage. Contact support; the document itself is unchanged." } };
    if (sha256Hex(bytes) !== ref.sha256) return { ok: false, error: { code: "render_failed", message: "The sealed copy of this document does not match its recorded fingerprint, so it was not served. Contact support." } };
    return make(bytes, ref.sha256, null, []);
  };

  const existing = v.exports?.[format];
  if (existing) return stored(existing);

  const rendered = await guarded(async () => {
    const input = await buildRenderInput(actor, d, v, true);
    const brand = await loadBrand();
    const doc = applyBrandToDoc(input.doc, brand.settings, input.values, { docNumber: input.docNumber, layout: layoutInputFor({ kind: d.kind, title: input.title, docTypeId: d.docTypeId, docNumber: input.docNumber, meta: d.meta, version: v.number, authorName: v.authorName, dateIso: input.dateIso }) });
    return renderNow(format, doc, {
      meta: { title: input.title, docNumber: input.docNumber ?? "", version: String(v.number), dateIso: input.dateIso },
      values: input.values, lists: input.lists, images: await imageLoader(doc), brand: brandRenderOptions(brand), watermark: null,
    });
  });
  if (!rendered.ok) return { ok: false, error: rendered.error };
  const bytes = rendered.value.buffer;
  const sha = sha256Hex(bytes);
  const key = sealedKey(await currentCompanyId(), d._id, v.number, format);
  await store().put(key, bytes, MIME[format]);
  if (await attachSealedExport(d._id, v.number, format, { key, sha256: sha })) return make(bytes, sha, rendered.value.pages, rendered.value.warnings);
  // Someone else sealed this version first: their copy is the one on record. Remove ours and serve theirs.
  await store().delete(key).catch(() => {});
  const fresh = await getVersionByNumber(d._id, v.number);
  const ref = fresh?.exports?.[format];
  return ref ? stored(ref) : { ok: false, error: { code: "render_failed", message: "The sealed copy could not be recorded. Try again." } };
}

async function liveFile(actor: PbActor, d: PbDocumentRecord, v: PbVersionRecord | null, format: ExportFormat): Promise<PbResult<{ file: ExportOk }>> {
  const reviewed = await reviewLookup(d.templateRef, d.docTypeId);
  const rendered = await guarded(async () => {
    const input = await buildRenderInput(actor, d, v, false);
    const brand = await loadBrand();
    // Never an unmarked copy: a document that is not issued is a draft, whatever its status, and unreviewed legal wording says so.
    const ownContent = (d.kind === "sop" || d.kind === "kpi" || (d.kind === "document" && !d.docTypeId)) && reviewed !== false;
    const watermark = ownContent ? null : brandWatermark(brand.settings, reviewed === false ? "unreviewed" : "draft") ?? (reviewed === false ? "UNREVIEWED" : "DRAFT");
    const doc = applyBrandToDoc(input.doc, brand.settings, input.values, { docNumber: input.docNumber, layout: layoutInputFor({ kind: d.kind, title: input.title, docTypeId: d.docTypeId, docNumber: input.docNumber, meta: d.meta, version: input.versionNo ?? d.versionSeq + 1, authorName: d.lastEditor?.name ?? null, dateIso: input.dateIso }) });
    return renderNow(format, doc, {
      meta: { title: input.title, docNumber: input.docNumber ?? "", version: input.versionNo ? String(input.versionNo) : "", dateIso: input.dateIso },
      values: input.values, lists: input.lists, images: await imageLoader(doc), brand: brandRenderOptions(brand), watermark, allowUnresolved: true,
    });
  });
  if (!rendered.ok) return { ok: false, error: rendered.error };
  const r = rendered.value;
  const bytes = r.buffer;
  return {
    ok: true,
    file: {
      bytes, contentType: MIME[format], sha256: sha256Hex(bytes), pages: r.pages, sealed: false, watermark: r.watermark, version: v?.number ?? null, warnings: r.warnings,
      filename: exportFilename({ docNumber: v?.docNumber ?? d.docNumber, title: v?.title ?? d.title, version: v?.number ?? null, ext: format, draft: true }),
    },
  };
}

/**
 * Renders and stores the sealed PDF and Word copies of the current issued version, so the bytes on record are fixed at issue time (the
 * letterhead and company details of that day) instead of whenever somebody first downloads. Call it right after issuing. Idempotent.
 */
export async function sealIssuedVersion(actor: PbActor, id: string): Promise<PbResult<{ version: number; sealed: ExportFormat[] }>> {
  const got = await getDocument(actor, id);
  if (!got.ok) return got;
  const d = got.document;
  if (d.status !== "issued" || d.issuedVersion === null) return { ok: false, error: { code: "bad_status", message: "Only an issued document has a sealed copy.", status: d.status } };
  const sealed: ExportFormat[] = [];
  for (const format of EXPORT_FORMATS) {
    const r = await exportDocument(actor, { id, format });
    if (!r.ok) return r;
    sealed.push(format);
  }
  return { ok: true, version: d.issuedVersion, sealed };
}
