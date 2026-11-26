/**
 * CyberVault, EvalIQ, ViralPulse, RankMax (and Cohort AI's student pages) on their own: no link or name that needs
 * another product, and the ClientOS pages the people of EvalIQ and Cohort AI sign in to. Throwaway database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { companySubdomain } from "@/lib/platform/tenancy/provisioning";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { hrefAvailable } from "@/lib/platform/products/routes";
import { requireAnyModule } from "@/lib/platform/billing/enforce";
import { PORTAL_NAV } from "@/lib/portal-roles";
import { targetTypesFor } from "@/lib/products/evaliq/constants";
import { saveClientRecord } from "@/lib/products/sprintos/client-write";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { proxy } from "@/proxy";

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

  for (const f of ["cybervault", "evaliq", "viralpulse-ai", "rankmax-ai"].flatMap((p) => files(`src/app/(products)/${p}`).concat(files(`src/components/products/${p}`)))) {
    const bad = readFileSync(f, "utf8").split("\n").filter((l) => /<(Link|a)\s[^>]*href=\{?[`"]\/(cashflow-ai|spendiq|talentos|sprintos|cohort-ai|dealflow-ai|playbook-ai|contractflow-ai|agentos)\b/.test(l));
    assert.deepEqual(bad, [], `${f}: plain link into another product`);
  }
  checks++;

  await listPlans();
  const now = new Date();
  const company = async (slug: string, products: string) => {
    const id = randomUUID();
    await db.collection("companies").insertOne({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
    await updateCompanySubscription(id, { planId: "growth", status: "active" });
    ok((await setCompanyProducts(id, { products }, { id: "tester" })).ok, `${slug}: ${products}`);
    return id;
  };
  const call = async (slug: string, path: string) => {
    const host = companySubdomain(slug); // no website with us: one address
    const res = await proxy(new NextRequest(`http://${host}${path}`, { headers: { host, "sec-fetch-mode": "navigate", accept: "text/html", "accept-language": "en-IN", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" } }));
    const rewrite = res.headers.get("x-middleware-rewrite") ?? "";
    return !res.headers.get("location")?.includes("/upgrade") && !rewrite.includes("/product-unavailable") && res.status < 400;
  };

  const tests = await company("testsonly", "ots");
  const school = await company("schoolonly", "tms");
  await company("vaultonly", "dlms");
  const nav = async (id: string, role: keyof typeof PORTAL_NAV) => {
    const hidden = await unavailablePanelKeys(id);
    return PORTAL_NAV[role].filter((i) => hrefAvailable(i.href, hidden)).map((i) => i.href.replace("/clientos", "") || "/");
  };

  // --- EvalIQ: candidates sign in to their tests, nothing else of ClientOS -----------
  for (const p of ["/clientos", "/clientos/tests", "/clientos/tests/results", "/clientos/exam/x", "/clientos/profile", "/clientos/login", "/evaliq"]) ok(await call("testsonly", p), `EvalIQ company opens ${p}`);
  for (const p of ["/clientos/invoices", "/clientos/wallet", "/clientos/projects", "/clientos/program", "/clientos/messages", "/clientos/application"]) ok(!(await call("testsonly", p)), `EvalIQ company does not open ${p}`);
  eq(await nav(tests, "job_applicant"), ["/", "/journey", "/tests", "/documents", "/profile"], "applicant menu");
  ok(!(await nav(tests, "client")).includes("/invoices"), "client menu has no invoices");
  await runAsCompany(tests, () => requireAnyModule(["portal", "tms", "ots"]));
  checks++;

  // --- Cohort AI: students sign in to their learning pages ----------------------------
  for (const p of ["/clientos", "/clientos/program", "/clientos/attendance", "/clientos/tests", "/cohort-ai"]) ok(await call("schoolonly", p), `Cohort AI company opens ${p}`);
  for (const p of ["/clientos/invoices", "/clientos/wallet", "/clientos/milestones", "/clientos/interviews"]) ok(!(await call("schoolonly", p)), `Cohort AI company does not open ${p}`);
  const student = await nav(school, "trainee");
  ok(student.includes("/program") && student.includes("/payments") && !student.includes("/wallet") && !student.includes("/messages"), `student menu ${student}`);

  // --- a company with neither has no portal --------------------------------------------
  for (const p of ["/clientos", "/clientos/tests", "/clientos/program", "/clientos/login"]) ok(!(await call("vaultonly", p)), `no portal: ${p}`);
  await assert.rejects(runAsCompany((await db.collection("companies").findOne({ slug: "vaultonly" }))!._id as unknown as string, () => requireAnyModule(["portal", "tms", "ots"])));
  checks++;

  // --- EvalIQ assigns to the people the company has ------------------------------------
  const groups = async (id: string) => [...new Set(targetTypesFor(await unavailablePanelKeys(id)).map((t) => t.group))];
  eq(await groups(tests), ["Employees", "Staff Users"], "EvalIQ alone: its own people");
  eq(await groups(school), ["Employees", "Staff Users", "Students"], "with Cohort AI: students too");

  // --- CyberVault keeps its own clients ------------------------------------------------
  const vault = (await db.collection("companies").findOne({ slug: "vaultonly" }))!._id as unknown as string;
  await runAsCompany(vault, async () => {
    ok((await saveClientRecord({ id: "u1", email: "v@vault.test" }, { companyName: "Locker Client", contactName: "Lata" })).ok, "client added from the vault");
    eq((await listClientOptions()).map((c) => c.companyName), ["Locker Client"], "and it has a vault to open");
  });

  for (const key of ["viralpulse-ai", "rankmax-ai"]) {
    const slug = key.split("-")[0];
    await company(slug, key === "viralpulse-ai" ? "smms" : "seo");
    ok(await call(slug, `/${key}`), `${key} opens on its own`);
    ok(!(await call(slug, "/sprintos")), `${key}: no other product`);
  }

  console.log(`light products standalone: all ${checks} checks passed`);
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
