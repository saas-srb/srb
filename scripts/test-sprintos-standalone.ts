/**
 * A company with SprintOS alone: a person added in People & access can be put on a project, and client → project →
 * task → timesheet → approval → costing works from an empty start. Runs against a throwaway database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { hrefAvailable } from "@/lib/platform/products/routes";
import { createAdminUser } from "@/lib/products/commandos/admin-users";
import { ensureDesignations, listCustomRoles } from "@/lib/products/commandos/custom-roles";
import { saveClientRecord } from "@/lib/products/sprintos/client-write";
import { validateMember, validateProject, validateTask, validateTimesheet } from "@/lib/products/sprintos/validation";
import { createProject } from "@/lib/products/sprintos/projects";
import { availableEmployees, listProjectMembers, upsertMember } from "@/lib/products/sprintos/project-members";
import { createTask, listTasks } from "@/lib/products/sprintos/tasks";
import { createEntry, reviewEntry, submitEntries, projectLoggedHours } from "@/lib/products/sprintos/timesheets";
import { computeProjectFinancials } from "@/lib/products/sprintos/costing";
import { buildProjectReport } from "@/lib/products/sprintos/reports";

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

  // Huddle comes with every workspace; no other product is linked plainly.
  for (const f of [...files("src/app/(products)/sprintos"), ...files("src/components/products/sprintos")]) {
    const bad = readFileSync(f, "utf8").split("\n").filter((l) => /<(Link|a)\s[^>]*href=\{?[`"]\/(cashflow-ai|spendiq|talentos|cohort-ai|dealflow-ai|playbook-ai|contractflow-ai|evaliq|agentos|clientos)\b/.test(l));
    assert.deepEqual(bad, [], `${f}: plain link into another product`);
  }
  checks++;

  await listPlans();
  const now = new Date();
  const id = randomUUID();
  await db.collection("companies").insertOne({ _id: id as never, slug: "builders", name: "Builders Only", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
  await updateCompanySubscription(id, { planId: "growth", status: "active" });
  ok((await setCompanyProducts(id, { products: "pms" }, { id: "tester" })).ok, "SprintOS only");

  await runAsCompany(id, async () => {
    const hidden = await unavailablePanelKeys(id);
    for (const p of ["/sprintos", "/sprintos/clients", "/sprintos/projects", "/sprintos/timesheets", "/sprintos/costing", "/huddle-ai", "/commandos/users/new", "/commandos/pms/projects"]) ok(hrefAvailable(p, hidden), `${p} is open`);

    // --- the team comes from People & access ---
    await ensureDesignations();
    const intern = (await listCustomRoles()).find((r) => r.name === "Intern")!;
    const person = await createAdminUser({ email: "dev@builders.test", name: "Neha Verma", designationId: intern.id }, "tester");
    ok(person.ok, `person added ${JSON.stringify(person)}`);
    const team = await availableEmployees();
    const neha = team.find((e) => e.name === "Neha Verma");
    ok(neha, `she can be put on a project without TalentOS: ${JSON.stringify(team)}`);
    const user = { id: "u1", email: "pm@builders.test" };

    // --- client → project → task → time → approval → costing ---
    const client = await saveClientRecord(user, { companyName: "Acme Retail", contactName: "Asha", contactEmail: "asha@acme.example" });
    ok(client.ok, "client added");
    const p = validateProject({ name: "Storefront", clientId: client.id, estimatedHours: 40, estimatedBudget: 100000, currency: "INR" });
    ok(p.valid, `project valid ${JSON.stringify(p)}`);
    if (!p.valid) return;
    const project = await createProject(p.data, user.id);
    const m = validateMember({ employeeId: neha!._id, allocationPercent: 50, billableRate: 1000, costRate: 500 });
    ok(m.valid && (await upsertMember(project._id, (m as { data: never }).data, user.id)).ok, "member added");
    eq((await listProjectMembers(project._id)).length, 1, "listed");
    const t = validateTask({ title: "Checkout page", assigneeId: neha!._id });
    ok(t.valid, "task valid");
    if (!t.valid) return;
    const task = await createTask(project._id, t.data, user.id);
    eq((await listTasks(project._id, {})).length, 1, "task listed");
    const day = now.toISOString().slice(0, 10);
    const e = validateTimesheet({ projectId: project._id, taskId: task._id, date: day, hours: 6, billable: true });
    ok(e.valid, "time valid");
    if (!e.valid) return;
    const entry = await createEntry(neha!._id, e.data, user.id);
    eq(await submitEntries([entry._id], neha!._id), 1, "submitted");
    ok(await reviewEntry(entry._id, "approved", null, user.id), "approved");
    eq((await projectLoggedHours(project._id)).totalHours, 6, "hours counted");
    const money = await computeProjectFinancials(project._id);
    ok(money && money.actualHours === 6, "costing from its own timesheets");
    ok(await buildProjectReport(project._id), "project report");

    // --- notices link only to screens it has ---
    const notices = await (await getDb()).collection<{ link: string | null }>("panel_notifications").find({}).toArray();
    ok(notices.every((n) => !n.link || hrefAvailable(n.link, hidden)), "notification links");
  });

  console.log(`sprintos standalone: all ${checks} checks passed`);
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
