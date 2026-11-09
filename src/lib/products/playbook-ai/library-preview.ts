import "server-only";
import { playbookCan } from "@/lib/playbook-roles";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getBrandMeta } from "@/lib/products/playbook-ai/brand/store";
import { getTemplateDef } from "@/lib/products/playbook-ai/catalogue/registry";
import { renderLibraryDocument, type LibraryKind, type LibraryRender } from "@/lib/products/playbook-ai/library-render";
import type { PbActor, PbResult } from "@/lib/products/playbook-ai/documents-types";

/**
 * Library preview and blank-template downloads for people. Permission check, a short-lived cache per (company, kind, id, template version,
 * brand version, format) so repeated previews are instant, a 55 s time limit, and at most two renders at once per instance.
 */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 60;
const cache = new Map<string, { at: number; value: Extract<LibraryRender, { ok: true }> }>();
let running = 0;

export async function previewLibraryFile(actor: PbActor, kind: LibraryKind, id: string, format: "pdf" | "docx"): Promise<PbResult<{ bytes: Buffer; pages: number | null; filename: string; cached: boolean }>> {
  if (!playbookCan(actor, "VIEW")) return { ok: false, error: { code: "forbidden", message: "You are not allowed to view documents." } };
  if (kind !== "document" && kind !== "sop" && kind !== "kpi") return { ok: false, error: { code: "invalid", message: "Unknown library.", issues: [] } };
  const [companyId, brand] = await Promise.all([currentCompanyId(), getBrandMeta().catch(() => ({ updatedAt: null as Date | null }))]);
  const version = kind === "document" ? getTemplateDef(id)?.version ?? 0 : 1;
  const key = `${companyId}|${kind}|${id}|v${version}|b${brand.updatedAt ? brand.updatedAt.getTime() : 0}|${format}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { ok: true, bytes: hit.value.bytes, pages: hit.value.pages, filename: hit.value.filename, cached: true };
  if (running >= 2) return { ok: false, error: { code: "busy", message: "Other previews are being made. Try again in a few seconds." } };
  running++;
  try {
    const r = await Promise.race([
      renderLibraryDocument(kind, String(id).slice(0, 80), format),
      new Promise<LibraryRender>((resolve) => setTimeout(() => resolve({ ok: false, message: "The preview took too long. Try again." }), 55_000)),
    ]);
    if (!r.ok) return { ok: false, error: { code: "render_failed", message: r.message } };
    if (cache.size >= MAX_ENTRIES) { const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (oldest) cache.delete(oldest[0]); }
    cache.set(key, { at: Date.now(), value: r });
    return { ok: true, bytes: r.bytes, pages: r.pages, filename: r.filename, cached: false };
  } finally {
    running--;
  }
}
