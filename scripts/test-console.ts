/**
 * Tests for the platform owner console (`src/lib/platform/console/`) and the
 * sign-up approval queue (`src/lib/platform/signup.ts`), against a real
 * MongoDB in a THROWAWAY database that is dropped at the end:
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/console_test_$(date +%s) EMAIL_PROVIDER=console PLATFORM_ROOT_DOMAIN=localhost \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-console.ts
 *
 * Refuses to run unless MONGODB_URI is a local database whose name contains
 * "test" — it creates and drops whole collections.
 *
 * Three companies (one the platform owner) are provisioned through the real
 * `createCompanyWithOwner`, then the console's listing, detail, suspension
 * (and its effect on host routing) and approve/reject are exercised.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, forgetCompanyRouting, resolveCompanyIdByHost } from "@/lib/platform/tenancy/companies";
import { createCompanyWithOwner } from "@/lib/platform/tenancy/provisioning";
import { getCompanyDetail, getPlatformKpis, listCompanies, setCompanyStatus } from "@/lib/platform/console/companies";
import { approveSignup, countAwaitingApproval, listAwaitingApproval, rejectSignup } from "@/lib/platform/signup";
import { setSignupMode, getSignupMode } from "@/lib/platform/settings";
import { hashPassword } from "@/lib/lms-auth";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("/").pop()?.split("?")[0] ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri) || !dbName.includes("test")) {
  console.error(`Refusing to run: MONGODB_URI must be a local throwaway database with "test" in its name (got "${dbName}").`);
  process.exit(1);
}
if (process.env.EMAIL_PROVIDER !== "console") {
  console.error("Refusing to run: set EMAIL_PROVIDER=console so no real email is sent.");
  process.exit(1);
}

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Capture what the console email adapter prints instead of sending.
const sentEmails: string[] = [];
const origLog = console.log;
console.log = (...args: unknown[]) => {
  const line = args.map(String).join(" ");
  if (line.includes("[email:console]")) sentEmails.push(line);
  else origLog(...args);
};
const emailsTo = (addr: string) => sentEmails.filter((e) => e.includes(`to=${addr}`));

async function provision(name: string, slug: string, email: string) {
  const res = await createCompanyWithOwner({ name, slug, owner: { email, name: `${name} Owner`, passwordHash: hashPassword("correct-horse-battery"), mustChangePassword: false } });
  if (!res.ok) throw new Error(`provisioning ${slug} failed: ${res.error}`);
  return res;
}

async function addPendingApproval(slug: string, email: string, companyName: string): Promise<string> {
  const db = await getPlatformDb();
  const id = randomUUID();
  const now = new Date();
  await db.collection("pending_signups").insertOne({
    _id: id as never,
    tokenHash: randomUUID(),
    email,
    name: "Requester",
    companyName,
    slug,
    passwordHash: hashPassword("another-long-password"),
    status: "awaiting_approval",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  });
  return id;
}

async function run() {
  const db = await getPlatformDb();
  const users = db.collection("admin_users");

  // The platform owner, provisioned like any company and then flagged (as the migration does).
  const owner = await provision("Demo Company", "demo", "root@demo.test");
  await db.collection(COMPANIES_COLLECTION).updateOne({ _id: owner.companyId as never }, { $set: { isPlatformOwner: true, createdAt: new Date(Date.now() - 90 * 86400_000) } });
  const acme = await provision("Acme Labs", "acme", "founder@acme.test");
  const globex = await provision("Globex", "globex", "boss@globex.test");
  // Distinct creation dates so "newest first" is deterministic.
  await db.collection(COMPANIES_COLLECTION).updateOne({ _id: acme.companyId as never }, { $set: { createdAt: new Date(Date.now() - 20 * 86400_000) } });
  await db.collection(COMPANIES_COLLECTION).updateOne({ _id: globex.companyId as never }, { $set: { createdAt: new Date(Date.now() - 2 * 86400_000) } });
  // Acme: two more users (one a later Super Admin), a sign-in, and 2 of 5 onboarding steps.
  const lastLogin = new Date(Date.now() - 3600_000);
  await users.insertMany([
    { companyId: acme.companyId, email: "second-admin@acme.test", roles: ["super_admin"], createdAt: new Date(Date.now() + 1000), lastLoginAt: null },
    { companyId: acme.companyId, email: "staff@acme.test", roles: ["hrms_employee"], createdAt: new Date(), lastLoginAt: lastLogin },
  ]);
  await db.collection(COMPANIES_COLLECTION).updateOne({ _id: acme.companyId as never }, { $set: { onboarding: { completedSteps: ["profile", "team"], completedAt: null, dismissedAt: null }, enabledModules: ["workspace", "hrms"] } });
  forgetCompanyRouting();

  console.log("listCompanies");
  await check("lists all three companies, newest first", async () => {
    const res = await listCompanies();
    assert.equal(res.total, 3);
    assert.deepEqual(res.rows.map((r) => r.slug), ["globex", "acme", "demo"]);
  });
  await check("per-company owner, user count, domains, onboarding progress", async () => {
    const { rows } = await listCompanies();
    const a = rows.find((r) => r.slug === "acme")!;
    assert.equal(a.ownerEmail, "founder@acme.test", "owner is the FIRST Super Admin");
    assert.equal(a.userCount, 3);
    assert.deepEqual(a.domains, ["acme.localhost"]);
    assert.equal(a.onboarding.done, 2);
    assert.equal(a.onboarding.total, 5);
    const g = rows.find((r) => r.slug === "globex")!;
    assert.equal(g.userCount, 1);
    assert.equal(g.onboarding.done, 0);
    assert.equal(rows.find((r) => r.slug === "demo")!.isPlatformOwner, true);
  });
  await check("search by name, slug and owner email (case-insensitive)", async () => {
    assert.deepEqual((await listCompanies({ q: "ACME lab" })).rows.map((r) => r.slug), ["acme"]);
    assert.deepEqual((await listCompanies({ q: "glob" })).rows.map((r) => r.slug), ["globex"]);
    assert.deepEqual((await listCompanies({ q: "boss@globex" })).rows.map((r) => r.slug), ["globex"]);
    assert.deepEqual((await listCompanies({ q: "second-admin@acme" })).rows.map((r) => r.slug), ["acme"]);
    assert.equal((await listCompanies({ q: "staff@acme.test" })).total, 0, "non-admin emails don't match");
    assert.equal((await listCompanies({ q: "(.*" })).total, 0, "regex characters are escaped");
  });
  await check("pagination", async () => {
    const p1 = await listCompanies({ pageSize: 2, page: 1 });
    const p2 = await listCompanies({ pageSize: 2, page: 2 });
    assert.equal(p1.totalPages, 2);
    assert.equal(p1.rows.length, 2);
    assert.equal(p2.rows.length, 1);
    assert.equal(p2.rows[0].slug, "demo");
    assert.equal((await listCompanies({ pageSize: 2, page: 99 })).page, 2, "page is clamped");
  });

  await check("platform KPIs", async () => {
    assert.deepEqual(await getPlatformKpis(), { total: 3, active: 3, suspended: 0, createdLast7Days: 1, createdLast30Days: 2, pendingApprovals: 0 });
  });

  console.log("getCompanyDetail");
  await check("detail: products, domains, last sign-in", async () => {
    const d = (await getCompanyDetail(acme.companyId))!;
    assert.deepEqual(d.enabledPanels, ["Staff Hub", "HR & Payroll"]);
    assert.equal(d.domainRecords[0].host, "acme.localhost");
    assert.equal(d.domainRecords[0].kind, "subdomain");
    assert.equal(d.lastSignInAt?.getTime(), lastLogin.getTime());
    assert.equal((await getCompanyDetail(globex.companyId))!.enabledPanels, null);
    assert.equal(await getCompanyDetail("nope"), null);
  });

  console.log("setCompanyStatus");
  await check("the platform owner can't be suspended", async () => {
    const res = await setCompanyStatus(owner.companyId, "suspended", "actor");
    assert.equal(res.ok, false);
    const doc = await db.collection(COMPANIES_COLLECTION).findOne({ _id: owner.companyId as never });
    assert.equal(doc?.status, "active");
  });
  await check("suspending stops the company's host from routing; reactivating restores it", async () => {
    assert.equal(await resolveCompanyIdByHost("acme.localhost"), acme.companyId, "routes before (and is now cached)");
    assert.deepEqual(await setCompanyStatus(acme.companyId, "suspended", "actor"), { ok: true });
    assert.equal(await resolveCompanyIdByHost("acme.localhost"), null, "cache was dropped");
    assert.equal(await resolveCompanyIdByHost("globex.localhost"), globex.companyId, "others unaffected");
    const k = await getPlatformKpis();
    assert.equal(k.suspended, 1);
    assert.equal(k.active, 2);
    assert.equal((await listCompanies({ status: "suspended" })).rows[0]?.slug, "acme");
    assert.equal((await listCompanies({ status: "active" })).total, 2);
    assert.deepEqual(await setCompanyStatus(acme.companyId, "active", "actor"), { ok: true });
    assert.equal(await resolveCompanyIdByHost("acme.localhost"), acme.companyId);
  });
  await check("unknown company / status refused", async () => {
    assert.equal((await setCompanyStatus("nope", "suspended", "actor")).ok, false);
    assert.equal((await setCompanyStatus(acme.companyId, "deleted" as never, "actor")).ok, false);
  });

  console.log("Approval queue");
  await setSignupMode("approval", "actor");
  const initechId = await addPendingApproval("initech", "peter@initech.test", "Initech");
  const clashId = await addPendingApproval("acme", "copycat@acme2.test", "Acme Two");
  const rejectId = await addPendingApproval("hooli", "gavin@hooli.test", "Hooli");
  await check("mode persisted; queue listed without secrets; KPI counts it", async () => {
    assert.equal(await getSignupMode(), "approval");
    const list = await listAwaitingApproval();
    assert.equal(list.length, 3);
    assert.ok(list.every((r) => !("passwordHash" in r) && !("tokenHash" in r)));
    assert.equal(await countAwaitingApproval(), 3);
    assert.equal((await getPlatformKpis()).pendingApprovals, 3);
  });
  await check("approve creates the company + owner exactly like a confirmation, and emails a sign-in link", async () => {
    const res = await approveSignup(initechId, { hostHint: "localhost:3000" });
    assert.ok(res.ok, res.ok ? "" : res.error);
    const company = await db.collection(COMPANIES_COLLECTION).findOne({ slug: "initech" });
    assert.equal(company?.status, "active");
    assert.equal(company?.isPlatformOwner, false);
    const ownerUser = await users.findOne({ companyId: company?._id, email: "peter@initech.test" });
    assert.deepEqual(ownerUser?.roles, ["super_admin"]);
    assert.ok(ownerUser?.passwordHash, "keeps the password chosen at sign-up");
    assert.ok(await db.collection("company_domains").findOne({ _id: "initech.localhost" as never, companyId: company?._id }));
    forgetCompanyRouting();
    assert.equal(await resolveCompanyIdByHost("initech.localhost"), company?._id);
    assert.equal(await db.collection("pending_signups").countDocuments({ _id: initechId as never }), 0);
    assert.equal(ownerUser?.emailVerified, false, "an approved owner starts with an unverified email");
    const mail = emailsTo("peter@initech.test");
    assert.equal(mail.length, 2, "the approval e-mail and the email-verification e-mail");
    assert.ok(mail.some((m) => m.includes("http://initech.localhost:3000/commandos/login")), mail.join("\n"));
    assert.ok(mail.some((m) => m.includes("http://initech.localhost:3000/commandos/verify-email?token=")));
  });
  await check("approving twice is refused (atomic claim)", async () => {
    const res = await approveSignup(initechId, { hostHint: null });
    assert.equal(res.ok, false);
    assert.equal(await db.collection(COMPANIES_COLLECTION).countDocuments({ slug: "initech" }), 1);
  });
  await check("approving a request whose address is now taken is refused and stays queued", async () => {
    const res = await approveSignup(clashId, { hostHint: null });
    assert.equal(res.ok, false);
    assert.match(res.ok ? "" : res.error, /acme/);
    assert.equal(await db.collection("pending_signups").countDocuments({ _id: clashId as never, status: "awaiting_approval" }), 1);
    assert.equal(await db.collection(COMPANIES_COLLECTION).countDocuments({ slug: "acme" }), 1);
    assert.equal(emailsTo("copycat@acme2.test").length, 0);
  });
  await check("reject deletes the request and sends a polite email", async () => {
    const res = await rejectSignup(rejectId);
    assert.deepEqual(res, { ok: true, emailed: true });
    assert.equal(await db.collection("pending_signups").countDocuments({ _id: rejectId as never }), 0);
    assert.equal(await db.collection(COMPANIES_COLLECTION).countDocuments({ slug: "hooli" }), 0);
    const mail = emailsTo("gavin@hooli.test");
    assert.equal(mail.length, 1);
    assert.ok(/not able to approve/.test(mail[0]));
    assert.equal((await rejectSignup(rejectId)).ok, false, "second reject refused");
  });
  await check("queue now holds only the unresolved clash", async () => {
    assert.deepEqual((await listAwaitingApproval()).map((r) => r.slug), ["acme"]);
    assert.equal((await getPlatformKpis()).total, 4);
  });
}

async function main() {
  origLog(`Scratch database: ${dbName}\n`);
  const client = await clientPromise;
  try {
    await run();
  } finally {
    await client.db().dropDatabase();
    await client.close();
    origLog(`\nDropped ${dbName}.`);
  }
  origLog(`${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
