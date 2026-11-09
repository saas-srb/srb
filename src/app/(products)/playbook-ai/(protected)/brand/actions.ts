"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/products/playbook-ai/viewer";
import { playbookCan } from "@/lib/playbook-roles";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import { getBrandAsset } from "@/lib/products/playbook-ai/brand/assets";
import { saveBrand, uploadBrandImage } from "@/lib/products/playbook-ai/brand/store";
import { renderBrandPreview } from "@/lib/products/playbook-ai/brand/preview";
import { validateBrandInput, type BrandAssetKind } from "@/lib/products/playbook-ai/brand/types";

/**
 * Server actions for the Brand page. Every one re-checks the MANAGE_BRAND permission on the server (hiding the page is never the security
 * boundary) and returns a plain result object instead of throwing for expected problems.
 */

async function actor(): Promise<PbActor | null> {
  const v = await requireViewer();
  const a: PbActor = { id: v.userId, email: v.email, name: v.name, roles: v.roles, permissionOverrides: v.overrides };
  return playbookCan(a, "MANAGE_BRAND") ? a : null;
}

const DENIED = { ok: false as const, error: "You don't have permission to change the brand." };

export async function saveBrandAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string; errors?: string[] }> {
  const a = await actor();
  if (!a) return DENIED;
  const r = await saveBrand(a, input);
  if (!r.ok) return r;
  revalidatePath("/playbook-ai/brand");
  return { ok: true };
}

export async function uploadBrandImageAction(form: FormData): Promise<{ ok: true; assetId: string; widthPx: number; heightPx: number; dataUri: string } | { ok: false; error: string }> {
  const a = await actor();
  if (!a) return DENIED;
  const kind = form.get("kind");
  const file = form.get("file");
  if (kind !== "logo" && kind !== "signature" && kind !== "stamp") return { ok: false, error: "Unknown image type." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image file." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "Use an image under 2 MB." };
  const r = await uploadBrandImage(a, kind as BrandAssetKind, new Uint8Array(await file.arrayBuffer()));
  if (!r.ok) return r;
  const stored = await getBrandAsset(r.asset._id);
  return { ok: true, assetId: r.asset._id, widthPx: r.asset.widthPx, heightPx: r.asset.heightPx, dataUri: stored ? `data:image/png;base64,${stored.bytes.toString("base64")}` : "" };
}

/** Renders the sample document with the brand being edited (not saved) through the real PDF renderer. */
export async function previewBrandAction(input: unknown, state: "draft" | "unreviewed" | "final", itemId?: string): Promise<{ ok: true; pdfBase64: string; pages: number; warnings: string[] } | { ok: false; error: string }> {
  const a = await actor();
  if (!a) return DENIED;
  const v = validateBrandInput(input);
  if (!v.ok) return { ok: false, error: v.errors[0] };
  try {
    const p = await renderBrandPreview(v.value, state === "draft" || state === "unreviewed" ? state : "final", itemId ? String(itemId).slice(0, 80) : undefined);
    return { ok: true, pdfBase64: p.pdf.toString("base64"), pages: p.pages, warnings: p.warnings };
  } catch {
    return { ok: false, error: "The preview could not be drawn. Check the settings and try again." };
  }
}
