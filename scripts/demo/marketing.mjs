// Campaign import history for /dealflow-ai/campaigns (campaigns + metrics come from the base seeder).
import { rint, pick, chance, ago, insertAll } from "./lib.mjs";

const FILES = {
  meta: ["meta-ads-report", "meta-lead-export"], google: ["google-ads-campaigns", "google-ads-leads"], linkedin: ["linkedin-campaign-performance", "linkedin-lead-gen-forms"],
};

export async function seedMarketing(db) {
  const admin = await db.collection("admin_users").findOne({ email: "admin@example.com" });
  if (!admin) return;
  await db.collection("campaign_imports").deleteMany({ _demo: true });
  const imports = [];
  for (let i = 0; i < 14; i++) {
    const platform = pick(["meta", "google", "linkedin"]);
    const kind = chance(0.7) ? "performance" : "leads";
    const total = rint(60, 420);
    const errors = chance(0.25) ? rint(1, 6) : 0;
    const skipped = rint(0, 8);
    const status = i === 3 ? "failed" : i === 9 ? "reverted" : errors ? "completed_with_errors" : "completed";
    const imported = status === "failed" ? 0 : Math.max(0, total - errors - skipped - rint(0, 20));
    imports.push({
      _demo: true, adminId: admin._id, platform, kind, filename: `${FILES[platform][kind === "leads" ? 1 : 0]}-${new Date(Date.now() - (i * 9 + 3) * 86400000).toISOString().slice(0, 10)}.csv`,
      fileSize: rint(12000, 380000), status, rowsTotal: total, rowsImported: imported, rowsUpdated: status === "failed" ? 0 : rint(0, 30), rowsSkipped: skipped, rowsError: errors,
      errors: Array.from({ length: errors }, (_, k) => ({ row: rint(2, total), message: pick(["Invalid date format", "Spend is not a number", "Unknown campaign name", "Missing required column: Impressions"]) })),
      currency: "INR", undoable: false, ...(kind === "leads" ? { leadsMatched: rint(20, 150), leadsUnmatched: rint(0, 25), unmatchedSample: [] } : {}), createdAt: ago(i * 9 + 3),
    });
  }
  await insertAll(db.collection("campaign_imports"), imports);
  console.log(`  ✓ Campaign import history: ${imports.length} imports`);
}
