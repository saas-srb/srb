/**
 * Fills ONE company with realistic demo data for every product (HR, projects, CRM, finance, procurement, training, chat,
 * SOPs, legal documents, Digi Locker, online tests, AI bots, social media, SEO, website, portal, support, AI Intelligence reads
 * the same business data). Meant for a demo company registered at /signup.
 *
 *   npm run demo:seeders                       # the only customer company in the database
 *   npm run demo:seeders -- --company <slug>   # a specific company
 *
 * Every row goes through the company-scoped database, so nothing outside that company is read or written. Re-running replaces
 * the previous demo rows instead of duplicating them. Refuses the platform operator company, any company not flagged as demo
 * (node --env-file=.env.local scripts/mark-demo-company.mjs <slug>) and any production environment (scripts/demo/guard.mjs).
 */

import { OpenAI } from "openai";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { scopeDb } from "@/lib/platform/tenancy/scoped-db";
import { seedBase } from "./demo/base.mjs";
import { seedTms } from "./demo/tms.mjs";
import { seedPmsFms } from "./demo/pms.mjs";
import { seedPeople, DEMO_ACCOUNTS } from "./demo/people.mjs";
import { seedGrowth } from "./demo/growth.mjs";
import { seedPanels } from "./demo/panels.mjs";
import { seedMessenger } from "./demo/messenger.mjs";
import { seedChatbot } from "./demo/chatbot.mjs";
import { seedProcurement } from "./demo/procurement.mjs";
import { seedPrmsOps } from "./demo/prms-ops.mjs";
import { seedMarketing } from "./demo/marketing.mjs";
import { seedSop, SOP_DEMO_ACCOUNTS } from "./demo/sop.mjs";
import { seedSeo, SEO_DEMO_ACCOUNTS } from "./demo/seo.mjs";
import { seedDlms, DLMS_DEMO_ACCOUNTS } from "./demo/dlms.mjs";
import { seedAibots, AIBOTS_DEMO_ACCOUNTS } from "./demo/aibots.mjs";
import { seedSmms, SMMS_DEMO_ACCOUNTS } from "./demo/smms.mjs";
import { assertDemoTarget } from "./demo/guard.mjs";
import { seedOts, OTS_DEMO_ACCOUNTS, OTS_PORTAL_ACCOUNTS } from "./demo/ots.mjs";
import { seedOtsCareers } from "./demo/ots-careers.mjs";
import { seedCms, CMS_DEMO_ACCOUNTS } from "./demo/cms.mjs";
import { seedLpms, LPMS_DEMO_ACCOUNTS } from "./demo/lpms.mjs";
import { seedSupport } from "./demo/support.mjs";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};
const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

async function main() {
  const platform = await getPlatformDb();
  const companies = platform.collection("companies");

  const slug = flag("company")?.trim().toLowerCase();
  let company;
  if (slug) {
    company = await companies.findOne({ slug });
    if (!company) fail(`No company with slug "${slug}". Register it at /signup first.`);
  } else {
    const customers = await companies.find({ isPlatformOwner: { $ne: true } }).toArray();
    if (customers.length === 0) fail("No customer company yet. Register one at /signup, then run this again.");
    if (customers.length > 1) fail(`More than one company exists (${customers.map((c) => c.slug).join(", ")}). Pass --company <slug>.`);
    company = customers[0];
  }
  if (company!.isPlatformOwner) fail("That is the platform operator company. Demo data belongs in a customer company.");

  // The social-media seeder writes invented numbers and known-password logins: check up front so a refusal doesn't leave the other products half seeded.
  try {
    assertDemoTarget(company, process.env, "demo data");
  } catch (e) {
    fail(`${(e as Error).message}`);
  }

  const companyId = String(company!._id);
  const companyName = String(company!.name);
  const db = scopeDb(platform, companyId);
  // Some seeders list collection names to backfill audit stamps; that is a read of names only, never of data.
  const seedDb = new Proxy(db, { get: (t, k) => (k === "listCollections" ? platform.listCollections.bind(platform) : Reflect.get(t, k, t)) });

  console.log(`🌱 Demo data → "${companyName}" (${company!.slug}) in database "${platform.databaseName}"\n`);
  const step = async <T>(label: string, fn: () => Promise<T>, summarize?: (r: T) => string) => {
    process.stdout.write(`• ${label} … `);
    const r = await fn();
    console.log(`done${summarize ? ` — ${summarize(r)}` : ""}`);
    return r;
  };

  await step("Core: HR, projects, procurement, training, finance, chat, CRM, portal, workspace", () => seedBase(seedDb));
  const tms = await step("Training (TMS)", () => seedTms(seedDb));
  const pms = await step("Projects and finance (PMS / FMS)", () => seedPmsFms(seedDb));
  const people = await step("Portal accounts, leads, recruitment", () => seedPeople(seedDb, tms, pms));
  await step("Offers, wallet and referrals", () => seedGrowth(seedDb, tms, pms, people));
  await step("Cross-product repair, HRMS, FMS, audit trails", () => seedPanels(seedDb, tms, pms));
  await step("Team chat (Messenger)", () => seedMessenger(seedDb, pms));
  await step("Website chatbot", () => seedChatbot(seedDb));
  await step("Procurement (PRMS)", () => seedProcurement(seedDb, pms));
  await step("Procurement operations", () => seedPrmsOps(seedDb, pms));
  await step("Marketing", () => seedMarketing(seedDb));
  await step("SOPs and policies", () => seedSop(seedDb), (r: any) => `${r.sops} SOPs, ${r.versions} versions`);
  await step("SEO", () => seedSeo(seedDb), (r: any) => `${r.keywords} keywords, ${r.backlinks} backlinks`);
  await step("Digi Locker (DLMS)", () => seedDlms(seedDb), (r: any) => `${r.credentials} credentials, ${r.documents} documents`);
  const openai = process.env.OPENAI_API_KEY?.trim() ? new OpenAI() : null;
  await step("AI assistants", () => seedAibots(seedDb, { openai, log: () => {} }), (r: any) => `${r.bots} bots, ${r.chats} chats${r.openai ? "" : " (no OpenAI key: metadata only)"}`);
  await step("Social media (SMMS)", () => seedSmms(seedDb, { company }), (r: any) => `${r.campaigns} campaigns, ${r.posts} posts`);
  await step("Online tests (OTS)", () => seedOts(seedDb), (r: any) => `${r.tests} tests, ${r.attempts} attempts`);
  const manager = await seedDb.collection("admin_users").findOne({ email: "demo.ots.manager@example.com" }, { projection: { _id: 1 } });
  const evaluator = await seedDb.collection("admin_users").findOne({ email: "demo.ots.evaluator@example.com" }, { projection: { _id: 1 } });
  await step("Online tests: hiring screening", () => seedOtsCareers(seedDb, { actorId: manager?._id.toString() ?? null, evaluatorId: evaluator?._id.toString() ?? null } as any), (r: any) => `${r.tests} screening tests`);
  await step("Website (CMS)", () => seedCms(seedDb), (r: any) => `${r.pages} page(s)`);
  await step("Legal and documents (LPMS)", () => seedLpms(seedDb), (r: any) => `${r.documents} documents, ${r.templates} templates`);
  const owner = await seedDb.collection("admin_users").findOne({ roles: "super_admin", email: { $not: /@example\.com$/ } }, { projection: { _id: 1, email: 1 } });
  await step("Help and support", () => seedSupport(seedDb, { companyId, companyName, owner: { id: String(owner?._id ?? "demo-owner"), email: String(owner?.email ?? "owner@example.com") } }), (r: any) => `${r.requests} requests`);

  console.log("\n✓ Every product now has demo data. AI Intelligence answers from the same business data.");
  console.log("\nDemo logins (password for all of them: Demo@12345). Your own Super Admin login is unchanged.");
  const groups: [string, string, { email: string; label: string }[]][] = [
    ["Client / student portal", "/login", DEMO_ACCOUNTS],
    ["SOPs", "/playbook-ai/login", SOP_DEMO_ACCOUNTS],
    ["SEO", "/rankmax-ai/login", SEO_DEMO_ACCOUNTS],
    ["Digi Locker", "/cybervault/login", DLMS_DEMO_ACCOUNTS],
    ["AI assistants", "/agentos/login", AIBOTS_DEMO_ACCOUNTS],
    ["Social media", "/viralpulse-ai/login", SMMS_DEMO_ACCOUNTS],
    ["Online tests", "/evaliq/login", [...OTS_DEMO_ACCOUNTS, ...OTS_PORTAL_ACCOUNTS]],
    ["Website", "/sitecraft-ai/login", CMS_DEMO_ACCOUNTS],
    ["Legal", "/contractflow-ai/login", LPMS_DEMO_ACCOUNTS],
  ];
  for (const [label, path, list] of groups) {
    console.log(`\n  ${label} (${path})`);
    for (const a of list) console.log(`    ${a.label.padEnd(36)} ${a.email}`);
  }
  console.log("\nA product only appears in the sidebar if the company's plan includes it (Platform Console → Companies → plan).");
}

main()
  .then(async () => (await clientPromise).close())
  .catch(async (err) => {
    console.error("✗ Demo seeding failed:", err);
    await (await clientPromise).close().catch(() => {});
    process.exit(1);
  });
