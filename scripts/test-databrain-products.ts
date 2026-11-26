/**
 * DataBrain comes with every workspace: each product bought on its own gives it records to answer from (Huddle's chats
 * are never read), nothing from another product shows, and secrets are never offered. Throwaway database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { listPlans } from "@/lib/platform/billing/plans";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { ownedModules, SELLABLE_PRODUCTS } from "@/lib/platform/products/selection";
import { buildCatalogView, clearCatalogStatsCache } from "@/lib/products/databrain-ai/catalog/view";
import { runPlan } from "@/lib/products/databrain-ai/query/execute";
import { exampleQuestions } from "@/lib/products/databrain-ai/prompt";

let checks = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++; };

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  await listPlans();
  const now = new Date();
  const admin = { roles: ["super_admin"], permissionOverrides: null };
  for (const product of SELLABLE_PRODUCTS) {
    const id = randomUUID();
    await db.collection("companies").insertOne({ _id: id as never, slug: `d-${product}`, name: product, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
    await updateCompanySubscription(id, { planId: "growth", status: "active" });
    ok((await setCompanyProducts(id, { products: product }, { id: "t" })).ok, `${product}: set`);
    clearCatalogStatsCache();
    const view = await runAsCompany(id, () => buildCatalogView(admin));
    const owned = ownedModules({ mode: "selected", keys: [product] })!;
    const keys = [...view.entities.keys()];
    assert.deepEqual([...view.entities.values()].filter((e) => !owned.has(e.def.module)).map((e) => e.def.key), [], `${product}: another product's records`);
    // Huddle's conversations are private and never read: DataBrain says so instead.
    if (product === "messenger") ok(keys.length === 0, `Huddle alone: nothing to read (${keys})`);
    else {
      ok(keys.length > 0, `${product} alone: DataBrain has records to answer from`);
      ok(exampleQuestions(view).length > 0, `${product}: suggests a question`);
    }
    // Every dataset answers a real query (field paths, filters and joins are accepted by the planner and the database).
    for (const e of view.entities.values()) {
      const fields = [...e.fields.keys()];
      const r = await runAsCompany(id, () => runPlan(view, { entity: e.def.key, select: [...fields.map((field) => ({ field })), ...[...e.relations.values()].slice(0, 2).map((rel) => ({ field: `${rel.key}.${[...view.entities.get(rel.to)!.fields.keys()][0]}` }))].slice(-8), limit: 5 }, "q"));
      assert.ok(r.ok, `${product} / ${e.def.key}: ${r.ok ? "" : r.error}`);
      const count = await runAsCompany(id, () => runPlan(view, { entity: e.def.key, aggregates: [{ op: "count" }] }, "c"));
      assert.ok(count.ok, `${e.def.key} count`);
      assert.deepEqual(fields.filter((f) => /passw|secret|token|phone|mobile|transcript|notes|address$|email/i.test(f)), [], `${e.def.key}: a private field is offered`);
      checks++;
    }
  }
  console.log(`databrain products: all ${checks} checks passed`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => { const c = await clientPromise; await c.db().dropDatabase(); await c.close(); process.exit(process.exitCode ?? 0); });
