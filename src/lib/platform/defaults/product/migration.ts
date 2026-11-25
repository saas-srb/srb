import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getPath, sameValue } from "@/lib/platform/defaults/product/model";
import { PRODUCT_SPECS } from "@/lib/platform/defaults/product/specs";
import { companiesFilter, platformDefaults } from "@/lib/platform/defaults/product/store";

/**
 * The additive migration of product-setting defaults. No stored value is ever changed or removed: every stored field IS the company's own, so
 * behaviour is the same before and after. `apply` adds a rollback snapshot (`_defaultsBaseline`: what each document stored at that moment);
 * `revert` puts back snapshot fields that have been reset since, and removes the snapshot. `dry-run` writes nothing.
 */
export type MigrationMode = "dry-run" | "apply" | "revert";

export interface MigrationRow {
  product: string;
  collection: string;
  /** Companies that have a settings document, and how many default-able fields they stored (all their own). */
  documents: number;
  ownValues: number;
  /** Fields those documents do not store, which a platform default (differing from the built-in one) now supplies. */
  followingPlatform: number;
  /** Documents written (apply: snapshot added; revert: snapshot removed), and fields put back by revert. */
  written: number;
  restored: number;
}

export async function productDefaultsMigration(mode: MigrationMode): Promise<MigrationRow[]> {
  const db = await getPlatformDb();
  const companies = (await db.collection<{ _id: string }>("companies").find({}, { projection: { _id: 1 } }).toArray()).map((c) => c._id);
  const rows: MigrationRow[] = [];
  for (const spec of PRODUCT_SPECS) {
    const platform = await platformDefaults(spec.key);
    for (const d of spec.docs) {
      const filter = companiesFilter(d, companies);
      const col = db.collection(d.collection);
      const row: MigrationRow = { product: spec.key, collection: d.collection, documents: 0, ownValues: 0, followingPlatform: 0, written: 0, restored: 0 };
      for (const doc of await col.find(filter as never).toArray()) {
        const stored = d.settings.filter((s) => getPath(doc, s.key) !== undefined);
        row.documents++;
        row.ownValues += stored.length;
        row.followingPlatform += d.settings.filter((s) => !stored.includes(s) && s.key in platform && !sameValue(platform[s.key], s.builtIn)).length;
        const here = { _id: doc._id, companyId: doc.companyId };
        const baseline = doc._defaultsBaseline as { k: string; v: unknown }[] | undefined;
        if (mode === "apply" && !baseline) {
          const res = await col.updateOne({ ...here, _defaultsBaseline: { $exists: false } }, { $set: { _defaultsBaseline: stored.map((s) => ({ k: s.key, v: getPath(doc, s.key) })) } });
          row.written += res.modifiedCount;
        }
        if (mode === "revert" && baseline) {
          const back = Object.fromEntries(baseline.filter((b) => getPath(doc, b.k) === undefined).map((b) => [b.k, b.v]));
          await col.updateOne(here, { ...(Object.keys(back).length ? { $set: back } : {}), $unset: { _defaultsBaseline: "" } });
          row.written++;
          row.restored += Object.keys(back).length;
        }
      }
      rows.push(row);
    }
  }
  return rows;
}
