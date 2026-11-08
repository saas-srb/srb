import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { getRuntimeRecords } from "@/lib/products/sitecraft-ai/collections/store";
import type { Job } from "@/types/content";
import { getDb } from "@/lib/mongodb";

/**
 * Idempotent upsert of job_positions from the job listings — the CMS jobs
 * collection (jobs-data.ts plus any jobs published in the CMS). Re-run any time a role is added, removed, or its status
 * changes in code — never DELETES positions missing from code (a closed
 * role should stay referenceable by any past application), but any
 * existing position whose slug is no longer in `jobs` at all (fully
 * removed from the listing, not just marked closed/draft) gets flipped to
 * `isOpen: false` so it stops appearing as a selectable open role while
 * remaining resolvable for historical applications.
 */
async function handlePOST() {
  const lmsUser = await requireLms("MANAGE_CAREERS");
  if (!lmsUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const collection = db.collection("job_positions");
  await collection.createIndex({ slug: 1 }, { unique: true });

  const now = new Date();
  const jobs = await getRuntimeRecords<Job>("jobs");
  const currentSlugs = jobs.map((job) => job.slug);
  let upserted = 0;
  for (const job of jobs) {
    const isOpen = (job.status ?? "published") === "published";
    await collection.updateOne(
      { slug: job.slug },
      {
        $set: { slug: job.slug, title: job.title, category: job.category, isOpen, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
    upserted += 1;
  }

  const closedOrphans = await collection.updateMany(
    { slug: { $nin: currentSlugs }, isOpen: true },
    { $set: { isOpen: false, updatedAt: now } }
  );

  return NextResponse.json({ upserted, closedOrphans: closedOrphans.modifiedCount });
}

export const POST = withTransport(handlePOST);
