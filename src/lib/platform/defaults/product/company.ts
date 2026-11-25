import "server-only";
import { getDb } from "@/lib/mongodb";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { applyPlatform, companyPatch, describeValue, docQuery, getPath, sourceOf, type SettingSource } from "@/lib/platform/defaults/product/model";
import { productSpec, settingsDoc } from "@/lib/platform/defaults/product/specs";
import { platformDefaults } from "@/lib/platform/defaults/product/store";

/**
 * THE resolver a product's settings module uses (company's own > platform default > code default). `scripts/test-product-defaults.ts` fails the
 * build when a converted product reads its settings document anywhere else.
 */

/** `merged` is the product's code defaults overlaid with the company's stored document `raw` (or just the defaults when there is none). */
export async function resolveSettings<T>(product: string, collection: string, merged: T, raw: unknown): Promise<T> {
  return applyPlatform(settingsDoc(product, collection), merged, raw, await platformDefaults(product));
}

/** The `$set` of a company saving its form; `codeDefaults` is what the product shows a company that stored nothing. */
export async function settingsPatch(product: string, collection: string, raw: unknown, data: object, codeDefaults: unknown): Promise<Record<string, unknown>> {
  return companyPatch(settingsDoc(product, collection), raw, data, await resolveSettings(product, collection, codeDefaults, null));
}

export interface SettingState { key: string; label: string; section: string; value: string; defaultValue: string; source: SettingSource }

/** For the company's own settings screen: each default-able setting, whether it is the company's own, and what the default would be. */
export async function companySettingStates(product: string): Promise<SettingState[]> {
  const spec = productSpec(product);
  if (!spec) return [];
  const platform = await platformDefaults(product);
  const out: SettingState[] = [];
  for (const d of spec.docs) {
    const raw = await (await getDb()).collection<{ _id: string }>(d.collection).findOne(docQuery(d) as never);
    for (const s of d.settings) {
      const inherited = s.key in platform ? platform[s.key] : s.builtIn;
      const source = sourceOf(s, raw, platform);
      out.push({ key: s.key, label: s.label, section: d.title, source, value: describeValue(s, source === "own" ? getPath(raw, s.key) : inherited), defaultValue: describeValue(s, inherited) });
    }
  }
  return out;
}

/** "Reset to default": removes the company's own value, so it follows the default from now on. */
export async function resetCompanySetting(product: string, key: string, actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const doc = productSpec(product)?.docs.find((d) => d.settings.some((s) => s.key === key));
  if (!doc) return { ok: false, error: "That setting has no default." };
  const res = await (await getDb()).collection<{ _id: string }>(doc.collection).updateOne(docQuery(doc) as never, { $unset: { [key]: "" }, $set: { updatedAt: new Date(), updatedBy: actorId } });
  if (res.matchedCount) await recordPlatformAudit({ actorId, action: "settings.product_default.reset", companyId: await currentCompanyId(), target: { type: "company_settings", id: `${product}:${key}` } });
  return { ok: true };
}
