import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { runDealflowAccessMigration } from "../src/lib/products/commandos/dealflow-access-migration";
import { NAV_ITEMS, resolveNav, type NavContext } from "../src/lib/products/commandos/nav";
import { accessToLegacy } from "../src/lib/access/adapter";
import { createCashAccount, updateCashAccount } from "../src/lib/products/cashflow-ai/cash-accounts";
import { createTransaction, postSystemTransaction } from "../src/lib/products/cashflow-ai/transactions";
import { createDocument, getDocument } from "../src/lib/products/playbook-ai/documents";
import { cleanItemMeta } from "../src/lib/products/playbook-ai/items-types";

// Real throwaway-database tests for: the DealFlow access migration, the CashFlow departmentId writes and the Playbook item wizard's department ids.
// Run: npm run test:leftovers
let passed = 0;
const T = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const nav = (roles: string[]): NavContext => ({ user: { roles, permissionOverrides: null }, platformAccess: false, unavailablePanels: new Set(), panels: {} });
const dealflowState = (roles: string[]) => {
  const r = resolveNav(nav(roles));
  return r.allowed.includes("product.lms") ? "open" : r.lockedKeys.includes("product.lms") ? "locked" : "hidden";
};

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  console.log("DealFlow tile follows the access matrix; existing people keep access through the migration");
  await runAsCompany("co_df", async () => {
    const users = (await getDb()).collection("admin_users");
    const mk = (email: string, roles: string[], extra: Record<string, unknown> = {}) => ({ email, name: email, roles, manualRoles: roles, status: "active", permissionOverrides: null, ...extra });
    await users.insertMany([
      mk("pms@x.test", ["pms_employee"]), mk("hr@x.test", ["hr"], { access: { hrms: { employees: "write" } } }), mk("dir@x.test", ["super_admin"]),
      mk("crm@x.test", ["lms_agent"]), mk("none@x.test", []), mk("left@x.test", ["pms_employee"], { status: "resigned" }),
    ] as never);
    await T("the tile is closed to a person with no DealFlow role (the old 'anyone' rule is gone) and open to a DealFlow role", () => {
      assert.equal(dealflowState(["pms_employee"]), "locked");
      assert.equal(dealflowState(["lms_agent"]), "open");
      assert.equal(NAV_ITEMS.find((i) => i.key === "product.lms")?.allow({ roles: ["pms_employee"], permissionOverrides: null }), false);
    });
    await T("dry-run lists exactly the people who would get DealFlow, and changes nothing", async () => {
      const r = await runDealflowAccessMigration("dry-run", "df_test_1");
      assert.deepEqual([...r.candidates].sort(), ["hr@x.test", "pms@x.test"], "not the Director, not someone who already has a DealFlow role, not someone with no roles, not someone who left");
      assert.equal(r.changed, 0);
      assert.deepEqual((await users.findOne({ email: "pms@x.test" }))?.roles, ["pms_employee"]);
    });
    await T("apply gives them the lowest DealFlow role, recomputes the saved access map and stamps the id; the tile opens for them", async () => {
      const r = await runDealflowAccessMigration("apply", "df_test_1");
      assert.equal(r.changed, 2);
      const pms = await users.findOne({ email: "pms@x.test" });
      assert.deepEqual(pms?.roles, ["pms_employee", "lms_agent"]);
      assert.equal(pms?._dealflowMigration?.id, "df_test_1");
      assert.equal(dealflowState(pms!.roles as string[]), "open");
      const hr = await users.findOne({ email: "hr@x.test" });
      const back = accessToLegacy(hr!.access as never);
      assert.ok(back.roles.includes("lms_agent") || (hr!.access as Record<string, unknown>).lms, "the access map now carries DealFlow");
      assert.deepEqual((await users.findOne({ email: "left@x.test" }))?.roles, ["pms_employee"], "a person who left is untouched");
      assert.equal((await runDealflowAccessMigration("apply", "df_test_1")).changed, 0, "a second run does nothing");
    });
    await T("revert removes exactly what the migration added and the tile closes again", async () => {
      const r = await runDealflowAccessMigration("revert", "df_test_1");
      assert.equal(r.changed, 2);
      const pms = await users.findOne({ email: "pms@x.test" });
      assert.deepEqual(pms?.roles, ["pms_employee"]);
      assert.equal(pms?._dealflowMigration, undefined);
      assert.deepEqual((await users.findOne({ email: "crm@x.test" }))?.roles, ["lms_agent"], "a role somebody already had is kept");
      assert.equal(dealflowState(pms!.roles as string[]), "locked");
    });
    await T("a bad id is refused", async () => { await assert.rejects(() => runDealflowAccessMigration("apply", "x"), /Migration id/); });
  });

  console.log("CashFlow: the department reference is written and kept (throwaway database)");
  await runAsCompany("co_cf", async () => {
    await T("a cash account stores departmentId (and null when none), and an update changes it", async () => {
      const a = await createCashAccount({ accountName: "Petty cash", location: null, department: "Finance", departmentId: "dep_fin", currency: "INR", status: "active" as never, notes: null, openingBalance: 100 }, "u1");
      const b = await createCashAccount({ accountName: "Safe", location: null, department: null, currency: "INR", status: "active" as never, notes: null, openingBalance: 0 }, "u1");
      const col = (await getDb()).collection("fms_cash_accounts");
      void col;
      assert.equal(a.departmentId, "dep_fin");
      assert.equal(b.departmentId, null);
      const upd = await updateCashAccount(a._id, { accountName: "Petty cash", location: null, department: "Sales", departmentId: "dep_sales", currency: "INR", status: "active" as never, notes: null }, "u1");
      assert.equal(upd?.departmentId, "dep_sales");
      assert.equal(upd?.department, "Sales");
      const stored = (await (await getDb()).collection("fms_cash_accounts").findOne({ _id: a._id as never })) as { departmentId?: string } | null;
      assert.equal(stored?.departmentId, "dep_sales", "it is in the database, not just in the returned object");
    });
    await T("a transaction stores departmentId through both the manual and the system posting paths, and null when omitted", async () => {
      const base = { type: "expense" as const, transactionDate: new Date("2026-05-10"), postingDate: new Date("2026-05-10"), amount: 250, currency: "INR", paymentMethod: "cash" as const, sourceModule: "fms" as const, sourceRecordId: null, customerId: null, vendorId: null, employeeId: null, projectId: null, department: "Finance", accountId: null, taxAmount: 0, referenceNumber: null, description: "test", attachments: [] };
      const manual = await createTransaction({ ...base, departmentId: "dep_fin" }, "u1", "u1@x.test");
      const system = await postSystemTransaction({ ...base, departmentId: "dep_ops" }, "u1", "u1@x.test");
      const none = await createTransaction({ ...base }, "u1", "u1@x.test");
      assert.equal(manual.departmentId, "dep_fin");
      assert.ok("_id" in system && system.departmentId === "dep_ops");
      assert.equal(none.departmentId, null);
      const rows = (await (await getDb()).collection("fms_transactions").find({}).toArray()) as unknown as { departmentId: string | null }[];
      assert.deepEqual(rows.map((r) => r.departmentId).sort((a, b) => String(a).localeCompare(String(b))), ["dep_fin", "dep_ops", null]);
    });
  });

  console.log("Playbook item wizard: department and designation ids survive clean-up and are stored (throwaway database)");
  await runAsCompany("co_pb", async () => {
    const actor = { id: "u_pb", email: "pb@x.test", name: "PB", roles: ["super_admin"], permissionOverrides: null };
    await T("cleanItemMeta keeps the ids, trims and caps them, and drops blanks and non-text", () => {
      assert.deepEqual(cleanItemMeta({ departmentId: " dep_1 ", designationId: "des_9", department: "Finance", designation: "Manager", description: " d ", reviewPeriod: "yearly" }), { departmentId: "dep_1", designationId: "des_9", department: "Finance", designation: "Manager", description: "d", reviewPeriod: "yearly" });
      assert.deepEqual(cleanItemMeta({ departmentId: "   ", designationId: 5, department: "" }), {});
      assert.equal(cleanItemMeta({ departmentId: "x".repeat(300) }).departmentId?.length, 80);
      assert.deepEqual(cleanItemMeta(null), {});
    });
    await T("createDocument stores the ids on the item, and reading it back returns them (what the wizard's Department and Designation pickers rely on)", async () => {
      const made = await createDocument(actor, { title: "Leave policy", kind: "policy" as never, meta: cleanItemMeta({ department: "Finance", departmentId: "dep_fin", designation: "Manager", designationId: "des_mgr" }) });
      assert.equal(made.ok, true, made.ok ? "" : JSON.stringify(made));
      if (!made.ok) return;
      assert.equal(made.document.meta.departmentId, "dep_fin");
      assert.equal(made.document.meta.designationId, "des_mgr");
      const raw = (await (await getDb()).collection("pb_documents").findOne({ _id: made.document._id as never })) as { meta?: Record<string, string> } | null;
      assert.deepEqual(raw?.meta, { departmentId: "dep_fin", designationId: "des_mgr", department: "Finance", designation: "Manager" });
      const got = await getDocument(actor, made.document._id);
      assert.equal(got.ok && got.document.meta.departmentId, "dep_fin");
      const plain = await createDocument(actor, { title: "No dept", kind: "policy" as never });
      assert.equal(plain.ok && Object.keys(plain.document.meta).length, 0);
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
