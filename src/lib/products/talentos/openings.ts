import "server-only";
import { getDb } from "@/lib/mongodb";
import type { JobPosition } from "@/lib/career-applications";

/**
 * Job openings (`job_positions`) kept by hand, for a company whose website isn't with us (otherwise they come from the
 * website's job listings). The hosted careers form lists the open ones.
 */
const collection = async () => (await getDb()).collection<Omit<JobPosition, "_id">>("job_positions");
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function listOpenings(): Promise<{ slug: string; title: string; category: string; isOpen: boolean }[]> {
  const rows = await (await collection()).find({}).sort({ isOpen: -1, title: 1 }).limit(200).toArray();
  return rows.map((r) => ({ slug: r.slug, title: r.title, category: r.category, isOpen: r.isOpen }));
}

export async function addOpening(input: { title?: unknown; category?: unknown }): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const title = clean(input.title, 120);
  if (title.length < 2) return { ok: false, error: "Enter the job title." };
  const category = clean(input.category, 60) || "General";
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "role";
  const col = await collection();
  await col.createIndex({ slug: 1 }, { unique: true });
  const now = new Date();
  for (let n = 1; n <= 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (await col.findOne({ slug })) continue;
    await col.insertOne({ slug, title, category, isOpen: true, createdAt: now, updatedAt: now });
    return { ok: true, slug };
  }
  return { ok: false, error: "You already have many openings with this title." };
}

/** Closed openings stay (past applications name them); they just stop taking applications. */
export async function setOpeningOpen(slug: string, isOpen: boolean): Promise<{ ok: boolean }> {
  const res = await (await collection()).updateOne({ slug: String(slug) }, { $set: { isOpen: Boolean(isOpen), updatedAt: new Date() } });
  return { ok: res.matchedCount === 1 };
}
