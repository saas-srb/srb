"use server";

import { run } from "@/lib/products/viralpulse-ai/run";
import { can, ForbiddenError } from "@/lib/products/viralpulse-ai/viewer";
import { listMedia, toMediaCard } from "@/lib/products/viralpulse-ai/media";

/** AI-made assets (generated images and UGC videos) for the shared AssetPicker. Real library rows only. */
export async function listAiAssetsAction(input: { kind: "image" | "video"; q?: string; page?: number }) {
  return run([], async (v) => {
    if (!can(v, "MANAGE_POSTS") && !can(v, "CREATE_ADS") && !can(v, "MANAGE_MEDIA")) throw new ForbiddenError();
    const kind = input?.kind === "video" ? "video" : "image";
    const page = Math.min(Math.max(Math.floor(Number(input?.page)) || 1, 1), 200);
    const r = await listMedia({ q: String(input?.q ?? "").slice(0, 100), kind, source: "ai", page, pageSize: 24 });
    return { items: r.items.map(toMediaCard), totalPages: r.totalPages, total: r.total };
  }, { revalidate: false });
}
