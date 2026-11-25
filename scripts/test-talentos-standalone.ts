/**
 * A company with TalentOS alone: it hires from an empty start (candidate → selected → offer), pays from its own bank
 * account and is not notified or linked into products it doesn't have. Runs against a throwaway database.
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
import { addCandidate, listCandidates, setCandidateStatus } from "@/lib/products/talentos/candidates";
import { getConvertibleApplicants } from "@/lib/products/talentos/recruitment";
import { listPipelineCandidates } from "@/lib/products/talentos/calls";
import { createOffer, listOffers } from "@/lib/products/talentos/offers";
import { validateOffer } from "@/lib/products/talentos/validation-payroll";
import { addCompanyAccount, payingAccounts, validateAccount } from "@/lib/products/talentos/payroll-bank";
import { notifyPanel } from "@/lib/notify";

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

  // The one plain link into another product is the careers inbox, shown only to a company that has DealFlow.
  for (const f of [...files("src/app/(products)/talentos"), ...files("src/components/products/talentos")]) {
    const bad = readFileSync(f, "utf8").split("\n").filter((l) => /<(Link|a)\s[^>]*href=\{?[`"]\/(cashflow-ai|spendiq|sprintos|cohort-ai|dealflow-ai|playbook-ai|contractflow-ai|evaliq|agentos|clientos)\b/.test(l) && !l.includes('"/dealflow-ai/careers/applicants"'));
    assert.deepEqual(bad, [], `${f}: plain link into another product`);
  }
  checks++;

  await listPlans();
  const now = new Date();
  const id = randomUUID();
  await db.collection("companies").insertOne({ _id: id as never, slug: "people", name: "People Only", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
  await updateCompanySubscription(id, { planId: "growth", status: "active" });
  ok((await setCompanyProducts(id, { products: "hrms" }, { id: "tester" })).ok, "TalentOS only");

  await runAsCompany(id, async () => {
    const hidden = await unavailablePanelKeys(id);
    const hrId = new ObjectId();
    await (await getDb()).collection("admin_users").insertOne({ _id: hrId, email: "hr@people.test", roles: ["super_admin"], status: "active", createdAt: now });
    for (const p of ["/talentos", "/talentos/employees", "/talentos/payroll", "/talentos/payroll/payouts", "/talentos/payroll/compliance", "/talentos/recruitment", "/talentos/requests", "/commandos/settings/payments", "/commandos/careers/applicants"]) ok(hrefAvailable(p, hidden), `${p} is open`);

    // --- hiring from nothing ---
    const form = (extra: Record<string, string | File> = {}) => {
      const f = new FormData();
      const base: Record<string, string | File> = { name: "Ravi Kumar", email: "ravi@example.com", phone: "+91 9876543210", positionTitle: "Accountant", resume: new File([Buffer.from("%PDF-1.4 test resume")], "ravi.pdf", { type: "application/pdf" }), ...extra };
      for (const [k, v] of Object.entries(base)) f.set(k, v);
      return f;
    };
    const missing = await addCandidate(form({ positionTitle: "", resume: "" }));
    ok(!missing.ok && "positionTitle" in missing.errors && "resume" in missing.errors, "role and resume are asked for");
    const added = await addCandidate(form());
    ok(added.ok, `candidate added ${JSON.stringify(added)}`);
    if (!added.ok) return;
    eq((await listCandidates()).items.map((c) => [c.name, c.positionTitle, c.status]), [["Ravi Kumar", "Accountant", "new"]], "listed");
    ok(!(await setCandidateStatus(added.id, "nonsense")).ok, "unknown status refused");
    ok((await setCandidateStatus(added.id, "shortlisted")).ok, "shortlisted");
    eq((await listPipelineCandidates()).length, 1, "in the pipeline");
    ok((await setCandidateStatus(added.id, "selected")).ok, "selected");
    eq((await getConvertibleApplicants()).map((a) => a.name), ["Ravi Kumar"], "ready to join");
    const offer = validateOffer({ applicationId: added.id, offerDate: now.toISOString().slice(0, 10), proposedJoiningDate: now.toISOString().slice(0, 10), annualCtc: 600000 });
    ok(offer.valid, `offer valid ${JSON.stringify(offer)}`);
    if (offer.valid) ok((await createOffer(offer.data, String(hrId))).ok, "offer made");
    eq((await listOffers()).length, 1, "offer listed");

    // --- HR hears about applications; nothing is sent for products it doesn't have ---
    const inbox = (await getDb()).collection<{ panel: string; link: string | null }>("panel_notifications");
    eq(await notifyPanel("fms", { type: "fms_test", title: "Money", link: "/cashflow-ai" }, { level: "staff" }), 0, "no CashFlow notices");
    const rows = await inbox.find({}).toArray();
    ok(rows.every((r) => !r.link || hrefAvailable(r.link, hidden)), `notices link only to screens it has: ${rows.map((r) => r.link)}`);

    // --- salary account without CashFlow ---
    const account = validateAccount({ accountName: "Salary account", bankName: "HDFC", accountNumber: "123456789012", ifsc: "HDFC0001234", openingBalance: 0 });
    ok(account.valid, "bank account details");
    process.env.PLATFORM_ENCRYPTION_KEY ||= Buffer.alloc(32, 1).toString("base64");
    if (account.valid) ok((await addCompanyAccount(account.data, String(hrId))).ok, "account added from CommandOS payments");
    eq((await payingAccounts()).length, 1, "payroll can pay from it");
  });

  console.log(`talentos standalone: all ${checks} checks passed`);
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
