import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { playbookCan } from "@/lib/playbook-roles";
import { recordPbAudit } from "@/lib/products/playbook-ai/pb-audit";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import { DEFAULT_BRAND, validateBrandInput, type BrandAssetKind, type BrandSettings } from "@/lib/products/playbook-ai/brand/types";
import { deleteUnreferencedAssets, getBrandAssetRecords, saveBrandImage, type BrandAssetRecord } from "@/lib/products/playbook-ai/brand/assets";

/**
 * The company's brand: one document in `pb_brand` (`_id: "main"`, a KEYED collection, so each company has its own). Server-only.
 * Reads need no special permission (every export uses the brand); changes need MANAGE_BRAND and are audited.
 */

interface BrandDoc extends Omit<BrandSettings, "revision"> {
  _id: "main";
  revision: number;
  updatedAt: Date;
  updatedBy: string | null;
}

export type BrandResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: string[] };

async function col() {
  return (await getDb()).collection<BrandDoc>(PB_COLLECTIONS.brand);
}

const strip = (d: BrandDoc | null): BrandSettings | null => {
  if (!d) return null;
  const { _id, updatedAt, updatedBy, ...rest } = d;
  void _id; void updatedAt; void updatedBy;
  return rest;
};

/** The saved brand, or the neutral defaults for a company that has not configured one. Stored values are re-validated, so a damaged row falls back to defaults rather than breaking exports. */
export async function getBrand(): Promise<BrandSettings> {
  const saved = strip(await (await col()).findOne({ _id: "main" }));
  if (!saved) return DEFAULT_BRAND;
  const v = validateBrandInput(saved);
  return v.ok ? { ...v.value, revision: saved.revision } : DEFAULT_BRAND;
}

export async function getBrandMeta(): Promise<{ updatedAt: Date | null; updatedBy: string | null }> {
  const d = await (await col()).findOne({ _id: "main" });
  return { updatedAt: d?.updatedAt ?? null, updatedBy: d?.updatedBy ?? null };
}

const referencedIds = (b: BrandSettings): string[] => [b.logo.assetId, ...b.signatories.map((s) => s.assetId)].filter((x): x is string => !!x);

/** Checks every referenced image exists for this company and is of the right kind. */
async function checkAssets(b: BrandSettings): Promise<string | null> {
  const ids = referencedIds(b);
  const found = new Map((await getBrandAssetRecords(ids)).map((r) => [r._id, r]));
  const need = (id: string | null, kinds: BrandAssetKind[], what: string) => {
    if (!id) return null;
    const r = found.get(id);
    return !r || !kinds.includes(r.kind) ? `The ${what} image is missing. Upload it again.` : null;
  };
  const err = need(b.logo.assetId, ["logo"], "logo") ?? b.signatories.map((s) => need(s.assetId, [s.kind], `${s.label}`)).find(Boolean) ?? null;
  return err;
}

/** Validates and saves the brand. Needs MANAGE_BRAND. The revision goes up by one and the change is written to the audit trail. */
export async function saveBrand(actor: PbActor, input: unknown): Promise<BrandResult<{ brand: BrandSettings }>> {
  if (!playbookCan(actor, "MANAGE_BRAND")) return { ok: false, error: "You don't have permission to change the brand." };
  const v = validateBrandInput(input);
  if (!v.ok) return { ok: false, error: v.errors[0], errors: v.errors };
  const missing = await checkAssets(v.value);
  if (missing) return { ok: false, error: missing };
  const c = await col();
  const before = await c.findOne({ _id: "main" });
  const revision = (before?.revision ?? 0) + 1;
  const doc: BrandDoc = { ...v.value, _id: "main", revision, updatedAt: new Date(), updatedBy: actor.id };
  await c.replaceOne({ _id: "main" }, doc, { upsert: true });
  await deleteUnreferencedAssets(new Set(referencedIds(v.value))).catch(() => {});
  const changed = diffSummary(strip(before), v.value);
  await recordPbAudit({ actor, action: "brand_change", entity: "brand", entityId: "main", summary: changed.length ? `Changed ${changed.join(", ")}` : "Saved the brand", metadata: { revision, changed } });
  return { ok: true, brand: { ...v.value, revision } };
}

/** Names of the settings that differ, for the audit summary. */
export function diffSummary(a: BrandSettings | null, b: BrandSettings): string[] {
  const x = a ?? DEFAULT_BRAND;
  const out: string[] = [];
  const same = (p: unknown, q: unknown) => JSON.stringify(p) === JSON.stringify(q);
  if (!same(x.colors, b.colors)) out.push("colours");
  if (x.fontPair !== b.fontPair) out.push("font pair");
  if (!same(x.logo, b.logo)) out.push("logo");
  if (x.letterhead !== b.letterhead) out.push("letterhead pages");
  if (!same(x.headerLines, b.headerLines)) out.push("header lines");
  if (!same(x.footerLines, b.footerLines) || !same(x.footer, b.footer)) out.push("footer");
  if (!same(x.page, b.page)) out.push("margins");
  if (!same(x.watermarks, b.watermarks)) out.push("watermark words");
  if (!same(x.signatories, b.signatories)) out.push("signatories");
  return out;
}

/** Stores a new brand image (logo, signature or stamp). Needs MANAGE_BRAND. The image is attached when the brand is saved. */
export async function uploadBrandImage(actor: PbActor, kind: BrandAssetKind, bytes: Uint8Array): Promise<BrandResult<{ asset: BrandAssetRecord }>> {
  if (!playbookCan(actor, "MANAGE_BRAND")) return { ok: false, error: "You don't have permission to change the brand." };
  const r = await saveBrandImage(kind, bytes, actor.id);
  if (!r.ok) return r;
  await recordPbAudit({ actor, action: "brand_asset", entity: "brand", entityId: r.asset._id, summary: `Uploaded a ${kind} image`, metadata: { kind, sha256: r.asset.sha256, bytes: r.asset.bytes } });
  return r;
}
