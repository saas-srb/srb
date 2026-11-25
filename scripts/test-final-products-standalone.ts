/**
 * DealFlow, AgentOS, Cohort AI and Huddle on their own. Applicants and leads of a company without ClientOS are never
 * pointed at a portal; AI calling needs AgentOS. Runs against a throwaway database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { hrefAvailable, localHref } from "@/lib/platform/products/routes";
import { portalOpen, provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";

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
  const company = async (slug: string, products: string) => {
    const id = randomUUID();
    await db.collection("companies").insertOne({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
    await updateCompanySubscription(id, { planId: "growth", status: "active" });
    ok((await setCompanyProducts(id, { products }, { id: "tester" })).ok, `${slug}: ${products}`);
    return id;
  };
  const open = async (id: string, yes: string[], no: string[]) => {
    const hidden = await unavailablePanelKeys(id);
    for (const p of yes) ok(hrefAvailable(p, hidden), `${p} is open`);
    for (const p of no) ok(!hrefAvailable(p, hidden), `${p} is closed`);
    return hidden;
  };

  const sales = await company("salesonly", "lms");
  await open(sales, ["/dealflow-ai", "/dealflow-ai/leads", "/dealflow-ai/careers/applicants", "/dealflow-ai/meetings", "/dealflow-ai/whatsapp", "/commandos/crm/leads", "/commandos/careers/applicants", "/meeting/room"], ["/dealflow-ai/voice-calls", "/clientos", "/agentos", "/sprintos"]);
  await runAsCompany(sales, async () => {
    ok(!(await portalOpen()), "no portal for its leads");
    const lead = await provisionLeadAndAccount({ source: "manual", type: "client", name: "Asha Rao", email: "asha@lead.example", phone: "+91 9876543210" });
    ok(lead.leadId, "a lead is captured");
    const notices = () => getDb().then((d) => d.collection<{ link: string | null; type: string }>("external_notifications").find({}).toArray());
    ok(!(await notices()).some((n) => n.type === "welcome"), "no 'your portal is ready' message");
    await notifyPortalUser({ recipientUserId: lead.externalUserId, type: "interview", title: "Interview scheduled", link: "/clientos/interviews" });
    ok((await notices()).every((n) => !n.link), "no link into a portal it doesn't have");
  });

  const both = await company("salesai", "lms");
  await setCompanyProducts(both, { products: ["lms", "aibots"] }, { id: "tester" });
  await open(both, ["/dealflow-ai/voice-calls", "/agentos"], ["/clientos"]);

  const agents = await company("agentsonly", "aibots");
  const hidden = await open(agents, ["/agentos", "/agentos/calls", "/huddle-ai"], ["/dealflow-ai", "/talentos", "/sprintos"]);
  ok(localHref("/dealflow-ai/leads/x", hidden) === null && localHref("/agentos/chats/x", hidden) === "/agentos/chats/x", "a call links back only to screens it has");

  const school = await company("trainingonly", "tms");
  await open(school, ["/cohort-ai", "/cohort-ai/students", "/clientos", "/clientos/program"], ["/evaliq", "/dealflow-ai", "/talentos"]);
  await runAsCompany(school, async () => {
    ok(await portalOpen(), "students have their pages");
    await notifyPortalUser({ recipientUserId: "student1", type: "class", title: "Class today", link: "/clientos/schedule" });
    const n = await (await getDb()).collection<{ link: string | null }>("external_notifications").findOne({ recipientUserId: "student1" } as never);
    ok(!n || n.link === "/clientos/schedule", "their links stay");
  });

  const chat = await company("chatonly", "messenger");
  await open(chat, ["/huddle-ai", "/huddle-ai/channels", "/commandos", "/commandos/users", "/resolveiq"], ["/dealflow-ai", "/talentos", "/sprintos", "/cashflow-ai", "/clientos", "/agentos"]);

  console.log(`final products standalone: all ${checks} checks passed`);
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
