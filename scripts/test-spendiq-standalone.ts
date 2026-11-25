/**
 * A company with SpendIQ alone buys from an empty start (department → vendor → bill → approval → payment), without a
 * link into another product; and DataBrain, added beside it, reads only SpendIQ's data. Runs against a throwaway database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { hrefAvailable } from "@/lib/platform/products/routes";
import { createDepartment } from "@/lib/platform/organization/store";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { saveVendorRecord } from "@/lib/products/spendiq/vendor-write";
import { saveBillRecord, decideBill } from "@/lib/products/spendiq/bill-write";
import { recordPayment } from "@/lib/products/spendiq/payments";
import { getInvoice } from "@/lib/products/spendiq/invoices";
import { buildCatalogView } from "@/lib/products/databrain-ai/catalog/view";

let checks = 0;
function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  checks++;
}
function eq<T>(a: T, b: T, msg: string) {
  assert.deepEqual(a, b, msg);
  checks++;
}
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx$/.test(e.name) ? [join(dir, e.name)] : []));

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  for (const f of ["spendiq", "databrain-ai"].flatMap((p) => files(`src/app/(products)/${p}`).concat(files(`src/components/products/${p}`)))) {
    const bad = readFileSync(f, "utf8").split("\n").filter((l) => /<(Link|a)\s[^>]*href=\{?[`"]\/(cashflow-ai|talentos|sprintos|cohort-ai|dealflow-ai|playbook-ai|contractflow-ai|evaliq|agentos|clientos)\b/.test(l));
    assert.deepEqual(bad, [], `${f}: plain link into another product`);
  }
  checks++;

  await listPlans();
  const now = new Date();
  const id = randomUUID();
  await db.collection("companies").insertOne({ _id: id as never, slug: "buyers", name: "Buyers Only", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
  await updateCompanySubscription(id, { planId: "growth", status: "active" });
  ok((await setCompanyProducts(id, { products: "prms" }, { id: "tester" })).ok, "SpendIQ only");

  const userId = new ObjectId();
  const user = { id: String(userId), email: "buy@buyers.test" };
  await runAsCompany(id, async () => {
    await (await getDb()).collection("admin_users").insertOne({ _id: userId, email: user.email, roles: ["super_admin"], status: "active", createdAt: now });
    const hidden = await unavailablePanelKeys(id);
    for (const p of ["/spendiq", "/spendiq/vendors", "/spendiq/invoices", "/spendiq/expenses", "/spendiq/purchase-orders", "/spendiq/requisitions", "/commandos/settings/organization/departments"]) ok(hrefAvailable(p, hidden), `${p} is open`);

    const dept = await createDepartment({ name: "Operations", code: "OPS" } as never, user.id);
    ok((dept as { ok?: boolean }).ok !== false, `department ${JSON.stringify(dept).slice(0, 150)}`);
    ok((await listDepartments()).some((d) => d.name === "Operations"), "departments come from CommandOS");
    eq((await listProjectOptions()).length, 0, "no projects without SprintOS");

    const vendor = await saveVendorRecord(user, { companyName: "Paper Co", category: "other", status: "active", paymentTerms: "net_30", currency: "INR" });
    ok(vendor.ok, "vendor");
    const day = now.toISOString().slice(0, 10);
    const bill = await saveBillRecord(user, { vendorId: vendor.id, vendorInvoiceNumber: "PC-1", invoiceDate: day, subtotal: 1000, gstAmount: 180, currency: "INR" });
    ok(bill.ok, `bill ${JSON.stringify(bill)}`);
    ok((await decideBill(user, bill.id!, "approved")).ok, "approved");
    const paid = await recordPayment({ invoiceId: bill.id!, amount: 1180, paymentDate: day, method: "bank_transfer", transactionReference: "UTR1", tdsDeducted: 0, status: "processed", notes: null }, user.id);
    ok(paid.ok, `paid ${JSON.stringify(paid)}`);
    eq((await getInvoice(bill.id!))?.status, "paid", "bill is paid without CashFlow");
    const notices = await (await getDb()).collection<{ link: string | null }>("panel_notifications").find({}).toArray();
    ok(notices.every((n) => !n.link || hrefAvailable(n.link, hidden)), "notification links");
  });

  // --- DataBrain beside it ---------------------------------------------------------
  ok(!(await setCompanyProducts(id, { products: "intelligence" }, { id: "tester" })).ok, "DataBrain alone refused");
  ok((await setCompanyProducts(id, { products: ["prms", "intelligence"] }, { id: "tester" })).ok, "added beside SpendIQ");
  await runAsCompany(id, async () => {
    const view = await buildCatalogView({ roles: ["super_admin"], permissionOverrides: null });
    const modules = [...new Set([...view.entities.values()].map((e) => e.def.module))];
    eq(modules, ["prms"], "reads only SpendIQ's data");
    ok(view.entities.size > 0 && view.restricted.every((r) => r.key), "has something to answer about");
  });

  console.log(`spendiq standalone: all ${checks} checks passed`);
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
