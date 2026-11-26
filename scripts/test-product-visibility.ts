/**
 * A company with one product sees no link to another: CommandOS menus, Setup progress, dashboard figures, People &
 * access, integration cards, settings lists and the assistant's guide. Runs against a throwaway database that is dropped at the end.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { INCLUDED_WITH, SELLABLE_PRODUCTS } from "@/lib/platform/products/selection";
import { hrefAvailable, productRuleFor } from "@/lib/platform/products/routes";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import { resolveNav } from "@/lib/products/commandos/nav";
import { loadNavContext } from "@/lib/products/commandos/access";
import { getSetupProgress } from "@/lib/platform/setup-progress";
import { getCompanyKpis } from "@/lib/platform/dashboard";
import { accessUiFor, checkAccess, isHiddenAccessProduct } from "@/lib/products/commandos/people";
import { buildAccessUi } from "@/lib/access/ui-model";
import { connectionRelevant } from "@/lib/platform/connections/cards";
import { PDF_TYPES } from "@/lib/pdf/catalog";
import { PROMPTS } from "@/lib/prompts/registry";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { onlyAvailable } from "@/lib/platform/products/routes";
import { panelGuide } from "@/lib/ai/agent/guide/guide";

let checks = 0;
function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  checks++;
}

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  await listPlans();
  const now = new Date();

  for (const product of SELLABLE_PRODUCTS) {
    const id = randomUUID();
    await db.collection("companies").insertOne({ _id: id as never, slug: `solo-${product}`, name: `Solo ${product}`, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
    await updateCompanySubscription(id, { planId: "growth", status: "active" });
    ok((await setCompanyProducts(id, { products: product }, { id: "tester" })).ok, `${product}: set`);

    await runAsCompany(id, async () => {
      const userId = new ObjectId();
      await (await getDb()).collection("admin_users").insertOne({ _id: userId, email: "d@solo.test", roles: ["super_admin"], status: "active", createdAt: now });
      const hidden = await unavailablePanelKeys(id);
      const bad = (href: string) => !hrefAvailable(href, hidden);

      // CommandOS: sidebar, settings cards, product tiles, analytics
      const nav = resolveNav(await loadNavContext({ id: String(userId), roles: ["super_admin"], permissionOverrides: null }));
      const items = nav.sections.flatMap((s) => s.items);
      assert.deepEqual(items.filter((i) => bad(i.href)).map((i) => i.href), [], `${product}: menu links into another product`);
      assert.deepEqual(items.filter((i) => i.key.startsWith("product.") && i.key !== `product.${product}` && i.key !== "product.intelligence" && !(INCLUDED_WITH[product] ?? []).some((k) => i.key === `product.${k}`)).map((i) => i.key), [], `${product}: only its own product tile`);
      const names = new Map((await listPanels()).map((p) => [p.key, p.name]));
      const forbidden = [...hidden].filter((k) => k !== "website").map((k) => names.get(k)).filter(Boolean) as string[];
      assert.deepEqual(items.filter((i) => forbidden.includes(i.group ?? "") || forbidden.includes(i.label)).map((i) => `${i.group} / ${i.label}`), [], `${product}: menu names another product`);
      checks += 3;

      // Setup progress
      const progress = await getSetupProgress({ fresh: true });
      const open = progress.steps.filter((s) => s.status !== "notApplicable");
      assert.deepEqual(open.map((s) => (s as unknown as { href: string }).href).filter(Boolean).filter(bad), [], `${product}: setup steps link into another product`);
      checks++;

      const named = (text: string) => forbidden.filter((n) => text.includes(n));
      assert.deepEqual(progress.steps.flatMap((s) => named(`${s.title} ${s.description}`).map((n) => `${s.id}: ${n}`)), [], `${product}: setup steps name another product`);
      checks++;

      // Dashboard figures
      assert.deepEqual((await getCompanyKpis({ id: String(userId), email: "d@solo.test", roles: ["super_admin"] })).map((k) => k.href).filter(bad), [], `${product}: dashboard figures of another product`);
      checks++;

      // People & access
      const ui = accessUiFor(hidden);
      ok(ui.products.every((p) => !isHiddenAccessProduct(p.key, hidden)) && ui.products.some((p) => p.key === "commandos"), `${product}: access screen offers only its products`);
      const hr = buildAccessUi().products.find((p) => p.key === "talentos")!;
      const check = checkAccess({ talentos: { [hr.features[0].key]: "read" } }, { hidden });
      ok(check.summary.every((s) => !isHiddenAccessProduct((s as unknown as { key: string }).key, hidden)), `${product}: preview talks about its products only`);
      ok(product === "hrms" || Object.keys(check.access).includes("talentos"), `${product}: access already saved for another product is kept`);

      // Settings lists
      ok(onlyAvailable(PDF_TYPES, (t) => t.product, hidden).every((t) => !hidden.has(t.product)), `${product}: documents`);
      ok(onlyAvailable(PROMPTS, (p) => p.product, hidden).some((p) => p.product === "platform"), `${product}: platform prompts stay`);
      ok(onlyAvailable(ROLE_GROUPS, (g) => g.panel, hidden).every((g) => !hidden.has(g.panel)), `${product}: notification audiences`);

      // Integrations
      const registry = await listPanels();
      for (const key of ["openai", "dealflow-sync", "razorpay", "meta", "elevenlabs"]) {
        const consumers = key === "dealflow-sync" ? ["lms", "hrms"] : registry.filter((p) => p.connections.includes(key)).map((p) => p.key);
        ok(connectionRelevant(key, registry, hidden) === consumers.some((c) => !hidden.has(c)), `${product}: ${key} card`);
      }

      // Assistant guide: no "connects to" a product it doesn't have
      const guide = panelGuide(product, undefined, [...hidden]).text;
      ok(guide.length > 0 && ![...hidden].some((k) => guide.includes(`\n- ${k}: `)), `${product}: guide connects only to its products`);
    });
  }
  ok(productRuleFor("/commandos/users") === null, "company screens belong to no product");
  console.log(`product visibility: all ${checks} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    await c.db().dropDatabase();
    await c.close();
    process.exit(process.exitCode ?? 0);
  });
