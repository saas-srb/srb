/**
 * Platform roles & permissions, platform users, and audit-log queries,
 * against a throwaway database that is dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/roles_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-platform-roles.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { hasPermission, coversPermissions, effectivePermissions, ALL_PERMISSIONS, VIEWER_PERMISSIONS } from "@/lib/platform/console/permissions";
import {
  listRoles,
  getRole,
  resolvePlatformAccess,
  getPlatformAccessForUser,
  listPlatformUsers,
  listEligibleHubUsers,
  assignPlatformRole,
  revokePlatformAccess,
  createRole,
  updateRole,
  deleteRole,
  countPlatformOwners,
  type Actor,
} from "@/lib/platform/console/roles";
import { recordPlatformAudit, PLATFORM_AUDIT_COLLECTION } from "@/lib/platform/audit";
import { queryAuditLog, listActionPrefixes, listAuditActors, exportAuditCsv, ensureAuditIndexes, AUDIT_PAGE_SIZE } from "@/lib/platform/console/audit-log";

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = <T>(a: T, b: T, msg: string) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  const now = new Date();
  const owner = randomUUID();
  const acme = randomUUID();
  await db.collection("companies").insertMany([
    { _id: owner as never, slug: "owner", name: "Owner Co", status: "active", isPlatformOwner: true, createdAt: now, updatedAt: now },
    { _id: acme as never, slug: "acme", name: "Acme Widgets", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
  ]);

  // ── Pure permission checks ──
  ok(hasPermission(["*"], "plans.manage"), "* grants everything");
  ok(hasPermission(["plans.manage"], "plans.read"), "manage implies read");
  ok(hasPermission(["companies.status"], "companies.read"), "any verb implies read");
  ok(!hasPermission(["companies.status"], "companies.manage"), "status doesn't imply manage");
  ok(hasPermission(["companies.manage"], "companies.status"), "manage implies status");
  ok(!hasPermission(["plans.read"], "plans.manage"), "read doesn't imply manage");
  ok(!hasPermission([], "audit.read") && !hasPermission(null, "audit.read"), "nothing grants nothing");
  ok(!hasPermission(["planss.manage"], "plans.read"), "area prefix must match exactly");
  ok(coversPermissions(["*"], ["*"]) && !coversPermissions(["plans.manage"], ["*"]), "only * covers *");
  ok(coversPermissions(["plans.manage"], ["plans.read", "plans.manage"]) && !coversPermissions(["plans.manage"], ["coupons.read"]), "covers");
  ok(!coversPermissions(["*"].slice(1), ["bogus.key"]), "unknown keys aren't covered");
  eq(effectivePermissions(["*"]).length, ALL_PERMISSIONS.length, "* expands to the catalogue");
  ok(VIEWER_PERMISSIONS.every((p) => p.endsWith(".read")) && VIEWER_PERMISSIONS.includes("audit.read"), "viewer is read-only");

  await runAsCompany(owner, async () => {
    // ── Built-in roles ──
    const roles = await listRoles();
    eq(roles.slice(0, 4).map((r) => r._id), ["owner", "billing", "support", "viewer"], "built-ins seeded in order");
    ok(roles.every((r) => r.builtIn), "all built-in");
    eq((await getRole("owner"))?.permissions, ["*"], "owner = *");
    const billing = (await getRole("billing"))!;
    ok(hasPermission(billing.permissions, "coupons.manage") && hasPermission(billing.permissions, "revenue.read") && !hasPermission(billing.permissions, "users.manage"), "billing manager scope");
    const support = (await getRole("support"))!;
    ok(hasPermission(support.permissions, "companies.status") && hasPermission(support.permissions, "signups.manage") && hasPermission(support.permissions, "domains.read"), "support scope");
    ok(!hasPermission(support.permissions, "domains.manage") && !hasPermission(support.permissions, "plans.read"), "support can't manage domains or see plans");
    await listRoles();
    eq(await (await getPlatformDb()).collection("platform_roles").countDocuments({}), 4, "seeding is idempotent");

    // ── Accounts in the owner company ──
    const users = (await getDb()).collection("admin_users");
    const A = new ObjectId();
    const B = new ObjectId();
    const C = new ObjectId();
    const D = new ObjectId();
    await users.insertMany([
      { _id: A, email: "alice@owner.test", name: "Alice", roles: ["super_admin"], createdAt: now },
      { _id: B, email: "bob@owner.test", name: "Bob", roles: ["employee"], createdAt: now },
      { _id: C, email: "carol@owner.test", roles: ["super_admin"], createdAt: now },
      { _id: D, email: "dave@owner.test", roles: ["hr"], createdAt: now },
    ]);
    const a = A.toString(), b = B.toString(), c = C.toString(), d = D.toString();

    // Legacy fallback
    const accA = await getPlatformAccessForUser(a);
    ok(accA?.legacy && accA.roleId === "owner" && accA.permissions.includes("*"), "legacy super_admin = Platform Owner");
    eq(await getPlatformAccessForUser(b), null, "plain employee has no access");
    eq(await resolvePlatformAccess({ roles: ["super_admin"], platformRevokedAt: new Date() }), null, "revoked super_admin loses the fallback");
    eq((await resolvePlatformAccess({ roles: ["employee"], platformRoleId: "gone" })), null, "missing role, not super_admin → none");
    ok((await resolvePlatformAccess({ roles: ["super_admin"], platformRoleId: "gone" }))?.legacy, "missing role on a super_admin → legacy");
    eq(await countPlatformOwners(), 2, "two legacy owners (A, C)");
    eq((await listEligibleHubUsers()).map((u) => u.email), ["bob@owner.test", "dave@owner.test"], "eligible = no access yet");

    const actorA: Actor = { id: a, permissions: ["*"] };
    // Grant Support to Bob
    ok((await assignPlatformRole(b, "support", actorA)).ok, "grant support to Bob");
    const accB = (await getPlatformAccessForUser(b))!;
    ok(accB.roleId === "support" && !accB.legacy, "Bob is Support");
    ok(hasPermission(accB.permissions, "companies.status") && !hasPermission(accB.permissions, "plans.manage"), "Bob's permissions");

    // Privilege escalation guards
    const actorB: Actor = { id: b, permissions: accB.permissions };
    ok(!(await assignPlatformRole(d, "billing", actorB)).ok, "Support can't grant Billing Manager");
    ok(!(await assignPlatformRole(a, "viewer", actorB)).ok, "Support can't change an Owner");
    ok(!(await revokePlatformAccess(a, actorB)).ok, "Support can't revoke an Owner");
    ok(!(await createRole({ name: "Sneaky", permissions: ["users.manage"] }, actorB)).ok, "can't create a role beyond your own permissions");

    // Last-owner protection: make C a Viewer → A is the last owner
    ok((await assignPlatformRole(c, "viewer", actorA)).ok, "C becomes Viewer (A still owner)");
    eq(await countPlatformOwners(), 1, "one owner left");
    const lastRevoke = await revokePlatformAccess(a, actorA);
    ok(!lastRevoke.ok && /last Platform Owner/.test(lastRevoke.error), "can't revoke the last owner");
    ok(!(await assignPlatformRole(a, "viewer", actorA)).ok, "can't demote the last owner");
    ok((await assignPlatformRole(a, "owner", actorA)).ok, "last owner can be re-assigned Owner explicitly");
    eq((await getPlatformAccessForUser(a))?.legacy, false, "A now holds the Owner role explicitly");
    ok((await assignPlatformRole(c, "owner", actorA)).ok, "C promoted to Owner");
    ok((await revokePlatformAccess(a, { id: c, permissions: ["*"] })).ok, "with two owners, one can be revoked");
    eq(await getPlatformAccessForUser(a), null, "A (a super_admin) has no access after revoke — fallback blocked");
    ok(!(await revokePlatformAccess(c, { id: c, permissions: ["*"] })).ok, "C is now the last owner");
    ok((await assignPlatformRole(a, "owner", { id: c, permissions: ["*"] })).ok, "re-granting clears the revocation");
    ok((await getPlatformAccessForUser(a))?.roleId === "owner", "A is back");

    // Built-ins are fixed
    ok(!(await deleteRole("viewer", actorA)).ok, "built-in can't be deleted");
    ok(!(await updateRole("support", { name: "Support", permissions: ["plans.manage"] }, actorA)).ok, "built-in can't be edited");

    // Custom roles
    ok(!(await createRole({ name: "x", permissions: ["plans.read"] }, actorA)).ok, "name too short");
    ok(!(await createRole({ name: "Empty", permissions: [] }, actorA)).ok, "needs a permission");
    ok(!(await createRole({ name: "Bad", permissions: ["plans.fly"] }, actorA)).ok, "unknown permission rejected");
    ok(!(await createRole({ name: "viewer", permissions: ["plans.read"] }, actorA)).ok, "name clash with a built-in (case-insensitive)");
    const created = await createRole({ name: "Tax Desk", description: "GST only", permissions: ["tax.manage", "invoices.read", "tax.manage"] }, actorA);
    ok(created.ok, "custom role created");
    const id = created.ok ? created.id : "";
    eq((await getRole(id))?.permissions, ["invoices.read", "tax.manage"], "deduped, catalogue order");
    ok((await updateRole(id, { name: "Tax Desk", permissions: ["tax.manage", "revenue.read"] }, actorA)).ok, "custom role updated");
    ok((await assignPlatformRole(d, id, actorA)).ok, "Dave gets the custom role");
    const accD = (await getPlatformAccessForUser(d))!;
    ok(hasPermission(accD.permissions, "tax.read") && hasPermission(accD.permissions, "revenue.read") && !hasPermission(accD.permissions, "invoices.read"), "custom role permissions apply");
    const inUse = await deleteRole(id, actorA);
    ok(!inUse.ok && /has this role/.test(inUse.error), "role in use can't be deleted");
    ok((await revokePlatformAccess(d, actorA)).ok, "Dave revoked");
    ok((await deleteRole(id, actorA)).ok, "unused custom role deleted");
    eq(await getRole(id), null, "gone");

    eq((await listPlatformUsers()).map((u) => `${u.email}:${u.roleId}`), ["alice@owner.test:owner", "bob@owner.test:support", "carol@owner.test:owner"], "platform user list");

    // Every change was audited
    const log = await (await getPlatformDb()).collection(PLATFORM_AUDIT_COLLECTION).find({}).toArray();
    const actions = new Set(log.map((l) => l.action));
    for (const act of ["platform_user.grant", "platform_user.role_change", "platform_user.revoke", "platform_role.create", "platform_role.update", "platform_role.delete"]) ok(actions.has(act), `audited: ${act}`);
    ok(log.every((l) => l.at instanceof Date && l.actorId), "entries have at + actor");
    ok(!log.some((l) => l.action.startsWith("platform") && l.details === undefined), "details present");

    // ── Audit log queries ──
    await (await getPlatformDb()).collection(PLATFORM_AUDIT_COLLECTION).deleteMany({});
    await ensureAuditIndexes();
    const idx = (await (await getPlatformDb()).collection(PLATFORM_AUDIT_COLLECTION).indexes()).map((i) => Object.keys(i.key).join(","));
    for (const k of ["at", "action,at", "companyId,at", "actorId,at"]) ok(idx.includes(k), `index on ${k}`);

    await recordPlatformAudit({ actorId: a, action: "company.suspend", target: { type: "company", id: acme }, companyId: acme, details: { to: "suspended" } });
    await recordPlatformAudit({ actorId: a, action: "company.activate", target: { type: "company", id: acme }, companyId: acme });
    await recordPlatformAudit({ actorId: b, action: "companyx.weird", target: { type: "x", id: "1" } });
    await recordPlatformAudit({ actorId: "system", action: "subscription.renew", target: { type: "subscription", id: acme }, companyId: acme, details: { note: "=HYPERLINK(\"x\")" } });
    await recordPlatformAudit({ actorId: b, action: "settings.billing.update", target: { type: "platform_settings", id: "billing" }, details: { changed: ["tax.gstRatePercent"] } });
    // Backdate one entry
    await (await getPlatformDb()).collection(PLATFORM_AUDIT_COLLECTION).updateOne({ action: "company.activate" }, { $set: { at: new Date("2026-01-15T10:00:00Z") } });

    eq((await queryAuditLog({})).total, 5, "all");
    eq((await queryAuditLog({ actorId: b })).total, 2, "actor filter");
    eq((await queryAuditLog({ actionPrefix: "company" })).rows.map((r) => r.action).sort(), ["company.activate", "company.suspend"], "prefix matches whole segments only");
    eq((await queryAuditLog({ actionPrefix: "company.suspend" })).total, 1, "exact action");
    eq((await queryAuditLog({ actionPrefix: "settings." })).total, 1, "trailing dot tolerated");
    eq((await queryAuditLog({ companyId: acme })).total, 3, "company filter");
    eq((await queryAuditLog({ from: "2026-01-15", to: "2026-01-15" })).rows.map((r) => r.action), ["company.activate"], "date range inclusive of the end day");
    eq((await queryAuditLog({ to: "2026-01-14" })).total, 0, "before");
    eq((await queryAuditLog({ q: "acme wid" })).total, 3, "search by company name");
    eq((await queryAuditLog({ q: "bob@owner" })).total, 2, "search by actor email");
    eq((await queryAuditLog({ q: "gstRate" })).total, 0, "details aren't searched (not indexed)");
    eq((await queryAuditLog({ q: "BILLING" })).total, 1, "case-insensitive action/target search");
    eq((await queryAuditLog({ q: "(.*" })).total, 0, "regex input is escaped");
    const first = (await queryAuditLog({})).rows[0];
    ok(first.at >= (await queryAuditLog({})).rows[4].at, "newest first");
    const sys = (await queryAuditLog({ actorId: "system" })).rows[0];
    ok(sys.actorLabel === "System" && sys.companyName === "Acme Widgets", "labels: system + company name");
    eq((await queryAuditLog({ actorId: a })).rows[0].actorLabel, "alice@owner.test", "actor email resolved");
    eq(await listActionPrefixes(), ["company", "company.activate", "company.suspend", "companyx", "companyx.weird", "settings", "settings.billing", "settings.billing.update", "subscription", "subscription.renew"], "action prefixes");
    ok((await listAuditActors()).some((x) => x.id === "system" && x.label === "System"), "actors list");

    // Pagination
    await (await getPlatformDb()).collection(PLATFORM_AUDIT_COLLECTION).insertMany(
      Array.from({ length: AUDIT_PAGE_SIZE + 3 }, (_, i) => ({ actorId: "system", action: "bulk.item", target: { type: "t", id: String(i) }, companyId: null, at: new Date(Date.now() - i * 1000) })),
    );
    const p1 = await queryAuditLog({ actionPrefix: "bulk" });
    const p2 = await queryAuditLog({ actionPrefix: "bulk", page: 2 });
    ok(p1.rows.length === AUDIT_PAGE_SIZE && p2.rows.length === 3 && p1.totalPages === 2, "paged 25 + 3");
    ok(!p1.rows.some((r) => p2.rows.some((s) => s.id === r.id)), "no overlap between pages");
    eq((await queryAuditLog({ actionPrefix: "bulk", page: 99 })).page, 2, "page clamped");

    // CSV
    const csv = await exportAuditCsv({ actorId: "system", actionPrefix: "subscription" });
    const lines = csv.csv.trim().split("\n");
    eq(lines.length, 2, "header + 1 row");
    ok(lines[0].startsWith("At (UTC),Actor"), "csv header");
    ok(lines[1].includes("Acme Widgets") && lines[1].includes("\"{\"\"note\"\":"), "details JSON quoted");
    ok(!csv.truncated, "not truncated");
  });

  console.log(`platform roles: all ${checks} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const db = await getPlatformDb();
    if (/test/.test(db.databaseName)) await db.dropDatabase();
    await (await clientPromise).close();
  });
