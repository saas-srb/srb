import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { setAccess, subjectFromRow } from "../src/lib/access/server";
import { can as accessCan } from "../src/lib/access/can";
import { legacyToAccess, accessToLegacy, completeAccess } from "../src/lib/access/adapter";
import { legacyAnswers } from "../src/lib/access/legacy";
import { microOf } from "../src/lib/access/micro";
import { prmsCan, prmsScope, prmsMayOpen, prmsMayChange } from "../src/lib/prms-access";
import { buildAccessUi } from "../src/lib/access/ui-model";

// SpendIQ: Director vs partial vs old roles vs Read only vs own-only vs staff, with the record-level rules. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "spendiq";
const k = (s: string) => `${P}.${s}`;

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_prms", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const mk = (roles: string[]) => ({ _id: new ObjectId(), email: `${roles.join("_")}@x`, roles });
    const rows = { employee: mk(["prms_employee"]), dept: mk(["dept_manager"]), finance: mk(["finance"]), proc: mk(["procurement_manager"]), admin: mk(["prms_admin"]), director: mk(["super_admin"]), partial: mk(["employee"]), readOnly: mk(["employee"]) };
    await people.insertMany(Object.values(rows) as never);
    const holder = async (row: { _id: ObjectId }) => { const r = (await people.findOne({ _id: row._id })) as never as { roles: string[] }; return { id: String(row._id), roles: r.roles, subject: subjectFromRow(r as never) }; };
    const set = async (row: { _id: ObjectId }, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(row._id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };

    await T("parity: old SpendIQ roles give exactly the micro features their legacy capabilities give; round trip with nothing widened or withheld in SpendIQ", async () => {
      for (const [roles, ov] of [[["prms_employee"], null], [["dept_manager"], null], [["finance"], null], [["procurement_manager"], null], [["prms_admin"], null], [["finance"], { "prms.canManageProcurement": true }]] as const) {
        const legacy = legacyAnswers({ roles: [...roles], permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles: [...roles], permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles}`);
        const d = accessToLegacy(completeAccess(access));
        assert.deepEqual(d.widened.filter((x) => x.startsWith("prms.")), [], `widened ${roles}`);
        assert.deepEqual(d.withheld.filter((x) => x.startsWith("prms.")), [], `withheld ${roles}`);
      }
    });
    await T("Director: every micro feature and everyone's scope", async () => {
      const d = await holder(rows.director);
      for (const m of microOf(P)) assert.ok(prmsCan(d, m.key.slice(P.length + 1)), m.key);
      assert.equal(prmsScope(d, "requisitions"), "all");
    });
    await T("own-only employee: raises and tracks their own requisitions and claims, opens nobody else's, and sees no vendors, orders, invoices or reports", async () => {
      const e = await holder(rows.employee);
      assert.equal(prmsScope(e, "requisitions"), "own");
      assert.ok(prmsMayOpen(e, "requisitions", e.id, e.id) && !prmsMayOpen(e, "requisitions", "someone-else", e.id));
      assert.ok(prmsMayOpen(e, "expenses", e.id, e.id) && !prmsMayOpen(e, "expenses", "someone-else", e.id));
      assert.ok(prmsMayChange(e, "requisitions", e.id, e.id) && !prmsMayChange(e, "requisitions", "someone-else", e.id), "may edit own, never another's");
      for (const f of ["vendors.view", "purchaseorders.view", "invoices.view", "reports.export", "requisitions.approve", "requisitions.manage", "expenses.manage"]) assert.equal(prmsCan(e, f), false, f);
    });
    await T("staff: every staff role sees everyone's requisitions, but only the procurement right changes another person's requisition and only the expense right acts on claims (a finance or department-manager role no longer edits or deletes anyone's requisition)", async () => {
      const dept = await holder(rows.dept), fin = await holder(rows.finance), proc = await holder(rows.proc);
      for (const x of [dept, fin, proc]) { assert.equal(prmsScope(x, "requisitions"), "all"); assert.ok(prmsMayOpen(x, "requisitions", "someone-else", x.id)); }
      assert.equal(prmsMayChange(dept, "requisitions", "someone-else", dept.id), false);
      assert.equal(prmsMayChange(fin, "requisitions", "someone-else", fin.id), false);
      assert.ok(prmsMayChange(proc, "requisitions", "someone-else", proc.id));
      assert.ok(prmsCan(dept, "requisitions.approve") && !prmsCan(fin, "requisitions.approve"));
      assert.ok(prmsCan(fin, "invoices.manage") && !prmsCan(proc, "invoices.manage") && prmsCan(proc, "vendors.manage") && !prmsCan(fin, "vendors.manage"));
      assert.ok(prmsCan(fin, "expenses.manage") && !prmsCan(dept, "expenses.manage"));
    });
    await T("admin: everything including settings and the audit log", async () => {
      const a = await holder(rows.admin);
      for (const f of ["settings.manage", "audit.view", "vendors.manage", "invoices.manage", "requisitions.approve", "expenses.manage", "reports.export"]) assert.ok(prmsCan(a, f), f);
    });
    await T("Read only is truly read only: no write feature in the preset, and a person with exactly it can look but raise, change or approve nothing", async () => {
      const pre = buildAccessUi().presets[P];
      assert.ok(pre.readLabel.startsWith("Read only"));
      await set(rows.readOnly, Object.fromEntries(pre.read.map((x) => [x, "read" as const])));
      const h = await holder(rows.readOnly);
      for (const m of microOf(P)) if (m.level === "write") assert.equal(accessCan(h.subject, P, m.key, "write"), false, `${m.key} must not come with Read only`);
      for (const f of ["requisitions.submit", "expenses.submit", "vendors.manage", "invoices.manage"]) assert.equal(prmsCan(h, f), false, f);
      assert.equal(prmsMayChange(h, "requisitions", h.id, h.id), false, "even their own record cannot be changed without the submit feature");
    });
    await T("partial person gets only what was picked and loses it on the next request", async () => {
      await set(rows.partial, { [k("requisitions.view")]: "read", [k("requisitions.submit")]: "write", [k("vendors.view")]: "read" });
      let h = await holder(rows.partial);
      assert.ok(prmsCan(h, "requisitions.submit") && prmsCan(h, "vendors.view"));
      for (const f of ["vendors.manage", "invoices.view", "expenses.submit", "requisitions.approve"]) assert.equal(prmsCan(h, f), false, f);
      await set(rows.partial, { [k("requisitions.view")]: "read" });
      h = await holder(rows.partial);
      assert.equal(prmsCan(h, "requisitions.submit"), false);
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
