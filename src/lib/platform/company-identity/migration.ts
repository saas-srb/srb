import "server-only";
import { publishConfigChange } from "@/lib/platform/config-events";
import { IDENTITY_COLLECTION, IDENTITY_ID, IDENTITY_SCOPE, getStoredIdentity, readLegacyIdentity, type StoredIdentity } from "@/lib/platform/company-identity";
import { IDENTITY_FIELDS, validateIdentity, type CompanyIdentity, type IdentityField } from "@/lib/platform/company-identity/shared";
import { getDb } from "@/lib/mongodb";

/**
 * Moves the company identity that used to be kept in several places into the ONE company identity document. Additive and reversible:
 *  - `dry-run` (default) reports what would be copied and where the old stores DISAGREE (so a person can decide before anything changes)
 *  - `apply` fills only the fields the document does not have yet, taking the first old source that has a value (trust order in `readLegacyIdentity`),
 *    and stamps the document with the migration id. Nothing is deleted from the old stores: they stay as the fallback until the owner confirms.
 *  - `revert` removes exactly what that id filled (a field the owner has edited since is left alone); a document the migration created is deleted.
 *
 * MAPPING (old store, field to company identity field)
 *   TalentOS company details (hrms_company/org):   name to brandName, legalName, addressLine1/2, city, state, postalCode, country, email, phone, website, pan, gstin, cin
 *   Company registry (platform companies):          name to brandName, profile.country to country, profile.currency to currency, timezone to timeZone, branding.logoUrl to logoUrl
 *   SpendIQ company block (prms_settings/config):   name to brandName, addressLine to addressLine1, city, gstin, pan, email, phone, website
 *   Cohort AI institute block (training_settings):  name to brandName, addressLine to addressLine1, city, email, phone, website
 *   SiteCraft (cms_settings/default):               companyLegalName to legalName
 *   Billing details (subscription.billingDetails):  legalName, gstin, address to addressLine1, state, email
 * Fiscal year start and language had no old store: they keep their defaults (April, English) until set in Company setup.
 */
export interface IdentityMigrationReport {
  mode: "dry-run" | "apply" | "revert";
  id: string;
  /** Fields that would be / were copied, with the old store each came from. */
  fill: { field: IdentityField; value: string | number; from: string }[];
  /** Fields where two old stores hold different values: the first (most trusted) wins; listed so a person can check. */
  conflicts: { field: IdentityField; values: { from: string; value: string }[] }[];
  /** Fields reverted (revert only). */
  reverted: IdentityField[];
  skipped: string[];
}

const idOk = (id: string) => /^[A-Za-z0-9_-]{4,40}$/.test(id);

export async function runIdentityMigration(mode: IdentityMigrationReport["mode"], id: string): Promise<IdentityMigrationReport> {
  if (!idOk(id)) throw new Error("Migration id must be 4-40 letters, digits, - or _.");
  const report: IdentityMigrationReport = { mode, id, fill: [], conflicts: [], reverted: [], skipped: [] };
  const col = (await getDb()).collection<StoredIdentity>(IDENTITY_COLLECTION);

  if (mode === "revert") {
    const doc = await col.findOne({ "_identityMigration.id": id } as never);
    if (!doc?._identityMigration) { report.skipped.push("Nothing was migrated with this id."); return report; }
    const stamp = doc._identityMigration;
    if (stamp.created) { await col.deleteOne({ _id: IDENTITY_ID }); report.reverted = [...stamp.filled]; await publishConfigChange(IDENTITY_SCOPE); return report; }
    const unset: Record<string, ""> = {};
    for (const f of stamp.filled) {
      // Only what the migration wrote and nobody has changed since: an edited value belongs to the owner now.
      if (String(doc.values?.[f] ?? "") !== String(stamp.filledValues?.[f] ?? "")) { report.skipped.push(`${f} was edited after the migration and was left as it is.`); continue; }
      unset[`values.${f}`] = "";
      report.reverted.push(f);
    }
    await col.updateOne({ _id: IDENTITY_ID }, { $unset: { ...unset, _identityMigration: "" } } as never);
    await publishConfigChange(IDENTITY_SCOPE);
    return report;
  }

  const own = await getStoredIdentity();
  if (own?._identityMigration && own._identityMigration.id !== id) report.skipped.push(`A previous migration (${own._identityMigration.id}) already filled this document; revert it first to re-run.`);
  const legacy = await readLegacyIdentity();
  const have = (f: IdentityField) => { const v = own?.values?.[f]; return v !== undefined && v !== null && String(v).trim() !== ""; };
  const toSave: Partial<CompanyIdentity> = {};
  for (const f of IDENTITY_FIELDS) {
    const hits = legacy.map((l) => ({ from: l.source, value: l.values[f] })).filter((h) => h.value !== undefined && h.value !== null && String(h.value).trim() !== "");
    if (hits.length === 0) continue;
    const distinct = new Set(hits.map((h) => String(h.value).trim().toLowerCase()));
    if (distinct.size > 1) report.conflicts.push({ field: f, values: hits.map((h) => ({ from: h.from, value: String(h.value) })) });
    if (have(f)) continue;
    // The most trusted source whose value is valid wins; a value that fails validation (a malformed GSTIN) is skipped and reported.
    for (const h of hits) {
      const checked = validateIdentity({ [f]: h.value });
      if (checked.ok) { (toSave as Record<string, unknown>)[f] = checked.value[f]; report.fill.push({ field: f, value: checked.value[f] as string | number, from: h.from }); break; }
      report.skipped.push(`${f}: "${String(h.value).slice(0, 30)}" from ${h.from} is not valid and was not copied.`);
    }
  }
  if (mode === "apply" && report.fill.length) {
    const set = Object.fromEntries(Object.entries(toSave).map(([k, v]) => [`values.${k}`, v]));
    await col.updateOne(
      { _id: IDENTITY_ID },
      { $set: { ...set, updatedAt: new Date(), updatedBy: `migration:${id}`, _identityMigration: { id, at: new Date(), filled: report.fill.map((x) => x.field), filledValues: Object.fromEntries(report.fill.map((x) => [x.field, x.value])), created: !own } } } as never,
      { upsert: true },
    );
    await publishConfigChange(IDENTITY_SCOPE);
  }
  return report;
}
