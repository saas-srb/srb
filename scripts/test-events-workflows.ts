/**
 * Event bus + workflow automation checks against a throwaway database that
 * is dropped at the end. Webhooks are exercised against a local mock server.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/p35_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-events-workflows.ts
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { emitEvent, listEvents, runInWorkflowScope, withEventSource, EVENTS_COLLECTION } from "@/lib/platform/events";
import { EVENT_TYPES, eventFields } from "@/lib/platform/events/catalog";
import { createWorkflow, deleteWorkflow, listWorkflowRuns, listWorkflows, setWorkflowEnabled, updateWorkflow } from "@/lib/platform/workflows";
import { buildWorkflowEmail, sendTestRun } from "@/lib/platform/workflows/run";
import { MAX_ACTIONS_PER_WORKFLOW, MAX_WORKFLOWS_PER_COMPANY, matchesAll, matchesCondition, renderTemplate, validateWorkflow, type WorkflowInput } from "@/lib/platform/workflows/shared";
import { WORKFLOW_TEMPLATES } from "@/lib/platform/workflows/templates";
import { deliverWebhook, isBlockedAddress, parseWebhookUrl, signWebhook, WebhookBlockedError } from "@/lib/platform/workflows/webhook";
import { listNotifications } from "@/lib/platform/notifications";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

interface Hit {
  headers: http.IncomingHttpHeaders;
  body: string;
  path: string;
}

/** A local endpoint: /ok → 200, /redirect → 302, /hang → never answers, /fail → 500. */
function mockEndpoint(): Promise<{ url: string; hits: Hit[]; close: () => void }> {
  const hits: Hit[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ headers: req.headers, body, path: req.url ?? "" });
      if (req.url === "/hang") return;
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "/ok" });
        return res.end();
      }
      res.writeHead(req.url === "/fail" ? 500 : 200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        hits,
        close: () => {
            server.closeAllConnections();
            server.close();
          },
        }),
    ),
  );
}

const wf = (over: Partial<WorkflowInput> = {}): WorkflowInput => ({ name: "Test", enabled: true, trigger: "lead.created", conditions: [], actions: [{ type: "notify", target: "role", value: "lms_manager", title: "New lead: {{name}}", body: "{{email}}" }], ...over });

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  const now = new Date();
  const A = randomUUID();
  const B = randomUUID();
  const SUSP = randomUUID();
  const company = (id: string, slug: string) => ({ _id: id as never, slug, name: slug[0].toUpperCase() + slug.slice(1), status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
  await db.collection("companies").insertMany([company(A, "alpha"), company(B, "beta"), company(SUSP, "susp")]);
  await listPlans();
  await db.collection("companies").updateOne(
    { _id: SUSP as never },
    { $set: { subscription: { planId: "growth", status: "suspended", interval: "monthly", trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, updatedAt: now } } },
  );

  const userA = new ObjectId();
  const salesA = new ObjectId();
  const salesB = new ObjectId();
  await runAsCompany(A, async () => {
    await (await getDb()).collection("admin_users").insertMany([
      { _id: userA, email: "owner@alpha.test", roles: ["super_admin"], createdAt: now },
      { _id: salesA, email: "sales@alpha.test", roles: ["lms_manager"], createdAt: now },
    ]);
  });
  await runAsCompany(B, async () => {
    await (await getDb()).collection("admin_users").insertOne({ _id: salesB, email: "sales@beta.test", roles: ["lms_manager"], createdAt: now });
  });
  const lead = (name = "Asha Verma", extra: Record<string, string | number | boolean> = {}) => ({ entity: { type: "lead", id: randomUUID(), label: name, url: "/dealflow-ai/leads/x" }, actorId: String(userA), data: { name, email: "asha@example.com", phone: "+91 98765 43210", ...extra } });

  console.log("catalogue");
  await check("the eleven event types, each with a label, fields and a sample", () => {
    assert.deepEqual(
      EVENT_TYPES.map((e) => e.type).sort(),
      ["client.created", "employee.created", "intelligence.question", "invoice.created", "invoice.paid", "lead.created", "lead.status_changed", "leave.requested", "project.created", "task.completed", "task.created"],
    );
    for (const e of EVENT_TYPES) {
      assert.ok(e.label && e.fields.length > 0);
      for (const f of e.fields) assert.ok(f.key in e.sample, `${e.type} sample has ${f.key}`);
    }
    assert.ok(eventFields("lead.created").some((f) => f.key === "actorEmail"), "built-in fields included");
  });

  console.log("emit");
  await check("emitEvent writes one company-scoped row", async () => {
    const ev = await runAsCompany(A, () => emitEvent("lead.created", lead()));
    assert.ok(ev);
    const raw = await db.collection(EVENTS_COLLECTION).find({}).toArray();
    assert.equal(raw.length, 1);
    assert.equal(raw[0].companyId, A);
    assert.equal(raw[0].type, "lead.created");
    assert.equal(raw[0].area, "leads");
    assert.equal(raw[0].entity.label, "Asha Verma");
    assert.equal(raw[0].data.email, "asha@example.com");
    assert.equal(raw[0].source, "app");
    assert.ok(raw[0].at instanceof Date);
  });
  await check("TTL and lookup indexes exist", async () => {
    const idx = await db.collection(EVENTS_COLLECTION).indexes();
    assert.ok(idx.some((i) => i.expireAfterSeconds === 180 * 86400), "180-day TTL");
    assert.ok(idx.some((i) => "type" in i.key && "at" in i.key), "type/at index");
  });
  await check("never throws: unknown type, no company, broken input", async () => {
    assert.equal(await runAsCompany(A, () => emitEvent("nope.nope" as never, lead())), null);
    assert.equal(await emitEvent("lead.created", lead()), null, "outside any company");
    assert.equal(await runAsCompany(A, () => emitEvent("lead.created", null as never)), null);
  });
  await check("withEventSource tags events (imports)", async () => {
    const ev = await runAsCompany(A, () => withEventSource("import", () => emitEvent("lead.created", lead("Imported"))));
    assert.equal(ev?.source, "import");
  });
  await check("listEvents: filters, actor email, newest first", async () => {
    await runAsCompany(A, () => emitEvent("client.created", { entity: { type: "client", id: "c1", label: "Northwind" }, data: { companyName: "Northwind" } }));
    const all = await runAsCompany(A, () => listEvents());
    assert.equal(all.total, 3);
    assert.equal(all.items[0].type, "client.created");
    assert.equal(all.items[0].actorEmail, null);
    assert.equal(all.items[2].actorEmail, "owner@alpha.test");
    assert.equal((await runAsCompany(A, () => listEvents({ types: ["lead.created"] }))).total, 2);
    assert.equal((await runAsCompany(A, () => listEvents({ areas: ["clients"] }))).total, 1);
    assert.equal((await runAsCompany(A, () => listEvents({ actorId: String(userA) }))).total, 2);
    assert.equal((await runAsCompany(A, () => listEvents({ from: new Date(Date.now() + 60_000) }))).total, 0);
  });

  console.log("conditions");
  await check("eq / neq / contains / gt / lt", () => {
    const ctx = { status: "Won", amount: 1500, name: "Asha Verma", empty: null, flag: true };
    assert.ok(matchesCondition({ field: "status", op: "eq", value: "won" }, ctx), "eq is case-insensitive");
    assert.ok(!matchesCondition({ field: "status", op: "eq", value: "lost" }, ctx));
    assert.ok(matchesCondition({ field: "status", op: "neq", value: "lost" }, ctx));
    assert.ok(!matchesCondition({ field: "status", op: "neq", value: "WON" }, ctx));
    assert.ok(matchesCondition({ field: "name", op: "contains", value: "verma" }, ctx));
    assert.ok(!matchesCondition({ field: "name", op: "contains", value: "" }, ctx), "empty contains never matches");
    assert.ok(matchesCondition({ field: "amount", op: "gt", value: "1000" }, ctx));
    assert.ok(!matchesCondition({ field: "amount", op: "gt", value: "1500" }, ctx));
    assert.ok(matchesCondition({ field: "amount", op: "lt", value: "2000" }, ctx));
    assert.ok(!matchesCondition({ field: "name", op: "gt", value: "1" }, ctx), "non-numbers never compare");
    assert.ok(!matchesCondition({ field: "empty", op: "lt", value: "5" }, ctx), "missing value isn't 0");
    assert.ok(matchesCondition({ field: "flag", op: "eq", value: "true" }, ctx));
    assert.ok(matchesCondition({ field: "missing", op: "eq", value: "" }, ctx));
  });
  await check("all conditions must match; none = always", () => {
    const ctx = { status: "won", amount: 10 };
    assert.ok(matchesAll([], ctx));
    assert.ok(matchesAll([{ field: "status", op: "eq", value: "won" }, { field: "amount", op: "gt", value: "5" }], ctx));
    assert.ok(!matchesAll([{ field: "status", op: "eq", value: "won" }, { field: "amount", op: "gt", value: "50" }], ctx));
  });

  console.log("templating");
  await check("{{field}} substitution; unknown fields are empty; no prototype access", () => {
    const ctx = { name: "Asha", amount: 1500, none: null };
    assert.equal(renderTemplate("Hi {{name}} / {{ name }} — {{amount}}", ctx), "Hi Asha / Asha — 1500");
    assert.equal(renderTemplate("[{{nope}}][{{none}}]", ctx), "[][]");
    assert.equal(renderTemplate("{{constructor}}{{__proto__}}{{toString}}", ctx), "");
    assert.equal(renderTemplate("{{name}", ctx), "{{name}", "malformed tokens are left alone");
  });
  await check("values are HTML-escaped in emails", () => {
    const evil = { name: `<script>alert(1)</script>`, email: `"><img src=x onerror=1>`, actorEmail: "a@b.co" };
    assert.equal(renderTemplate("{{name}}", evil, { html: true }), "&lt;script&gt;alert(1)&lt;/script&gt;");
    const mail = buildWorkflowEmail({ type: "email", to: "{{actorEmail}}", subject: "Lead {{name}}\r\nBcc: x@y.z", body: "Hello {{name}}\n\nContact: {{email}}" }, evil, { brand: "Alpha <b>", link: "https://alpha.example/dealflow-ai/leads/x" });
    assert.equal(mail.to, "a@b.co");
    assert.ok(!mail.html.includes("<script>") && !mail.html.includes("<img"), "no raw markup from event data");
    assert.ok(mail.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(!mail.html.includes("Alpha <b>"), "brand escaped too");
    assert.ok(!/[\r\n]/.test(mail.subject), "no header injection through the subject");
    assert.ok(mail.text.includes("Contact:"));
  });

  console.log("validation and caps");
  await check("rejects bad workflows", () => {
    const bad = (input: unknown, re: RegExp) => {
      const v = validateWorkflow(input);
      assert.ok(!v.ok && re.test(v.error), `expected ${re}, got ${JSON.stringify(v)}`);
    };
    bad({ ...wf(), name: " " }, /name/);
    bad({ ...wf(), trigger: "x.y" }, /triggers/);
    bad({ ...wf(), actions: [] }, /at least one action/);
    bad({ ...wf(), actions: Array.from({ length: MAX_ACTIONS_PER_WORKFLOW + 1 }, () => wf().actions[0]) }, /at most 5 actions/);
    bad({ ...wf(), conditions: [{ field: "nope", op: "eq", value: "1" }] }, /field/);
    bad({ ...wf(), conditions: [{ field: "name", op: "regex", value: "1" }] }, /comparison/);
    bad({ ...wf(), conditions: [{ field: "name", op: "gt", value: "abc" }] }, /number/);
    bad({ ...wf(), actions: [{ type: "sms", to: "1" }] }, /Unknown action/);
    bad({ ...wf(), actions: [{ type: "email", to: "not-an-email", subject: "s", body: "b" }] }, /email address/);
    bad({ ...wf(), actions: [{ type: "email", to: "a@b.co, c@d.co", subject: "s", body: "b" }] }, /email address/);
    bad({ ...wf(), actions: [{ type: "webhook", url: "http://example.com/hook" }] }, /https/);
    bad({ ...wf(), actions: [{ type: "webhook", url: "https://user:pw@example.com/" }] }, /username or password/);
    bad({ ...wf(), actions: [{ type: "notify", target: "role", value: "", title: "t" }] }, /role/);
    assert.ok(validateWorkflow({ ...wf(), actions: [{ type: "email", to: "{{actorEmail}}", subject: "s", body: "b" }] }).ok);
    assert.equal(MAX_ACTIONS_PER_WORKFLOW, 5);
    assert.equal(MAX_WORKFLOWS_PER_COMPANY, 50);
  });
  await check("the four templates are valid workflows", () => {
    assert.equal(WORKFLOW_TEMPLATES.length, 4);
    for (const t of WORKFLOW_TEMPLATES) assert.ok(validateWorkflow(t.build("admin@alpha.test")).ok, t.key);
  });
  await check("at most 50 workflows per company", async () => {
    await runAsCompany(B, async () => {
      for (let i = 0; i < MAX_WORKFLOWS_PER_COMPANY; i++) assert.ok((await createWorkflow(wf({ name: `W${i}`, enabled: false }), null)).ok);
      const over = await createWorkflow(wf({ name: "one too many" }), null);
      assert.ok(!over.ok && /at most 50/.test(over.error));
      for (const w of await listWorkflows()) await deleteWorkflow(w.id);
      assert.equal((await listWorkflows()).length, 0);
    });
    assert.equal((await runAsCompany(A, () => listWorkflows())).length, 0, "another company's cap is untouched");
  });
  await check("a read-only (suspended) company can't create automations", async () => {
    let err: unknown = null;
    try {
      await runAsCompany(SUSP, () => createWorkflow(wf(), null));
    } catch (e) {
      err = e;
    }
    assert.ok(isBillingLimitError(err));
  });

  console.log("running workflows");
  let notifyWf = "";
  await check("matching event → notification for the role + a logged run", async () => {
    await runAsCompany(A, async () => {
      const created = await createWorkflow(wf(), String(userA));
      assert.ok(created.ok);
      notifyWf = created.workflow.id;
      assert.match(created.workflow.secret, /^whsec_[0-9a-f]{48}$/);
      await emitEvent("lead.created", lead("Rohit Shah"));
      const got = await listNotifications(String(salesA));
      assert.equal(got.length, 1);
      assert.equal(got[0].title, "New lead: Rohit Shah");
      assert.equal(got[0].body, "asha@example.com");
      assert.equal(got[0].url, "/dealflow-ai/leads/x");
      assert.equal(got[0].read, false);
      assert.equal((await listNotifications(String(userA))).length, 0, "only the role's holders");
      const runs = await listWorkflowRuns(notifyWf);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].status, "success");
      assert.equal(runs[0].test, false);
      assert.equal(runs[0].label, "Rohit Shah");
      assert.equal((await listWorkflows())[0].lastRun?.status, "success");
    });
  });
  await check("conditions decide whether it runs; other triggers don't fire it", async () => {
    await runAsCompany(A, async () => {
      assert.ok((await updateWorkflow(notifyWf, wf({ conditions: [{ field: "name", op: "contains", value: "vip" }] }))).ok);
      await emitEvent("lead.created", lead("Plain Person"));
      assert.equal((await listWorkflowRuns(notifyWf)).length, 1, "no match → no run");
      await emitEvent("lead.created", lead("A VIP Person"));
      assert.equal((await listWorkflowRuns(notifyWf)).length, 2);
      await emitEvent("client.created", { entity: { type: "client", id: "c", label: "VIP Co" }, data: { name: "vip" } });
      assert.equal((await listWorkflowRuns(notifyWf)).length, 2);
      await updateWorkflow(notifyWf, wf());
    });
  });
  await check("a disabled workflow doesn't run", async () => {
    await runAsCompany(A, async () => {
      await setWorkflowEnabled(notifyWf, false);
      await emitEvent("lead.created", lead());
      assert.equal((await listWorkflowRuns(notifyWf)).length, 2);
      await setWorkflowEnabled(notifyWf, true);
    });
  });
  await check("a failing action is logged as a failed run, and the emit still succeeds", async () => {
    await runAsCompany(A, async () => {
      const w = await createWorkflow(wf({ name: "nobody", trigger: "invoice.paid", actions: [{ type: "notify", target: "role", value: "no_such_role", title: "x", body: "" }, { type: "email", to: "{{missingField}}", subject: "s", body: "b" }] }), null);
      assert.ok(w.ok);
      const ev = await emitEvent("invoice.paid", { entity: { type: "invoice", id: "i1", label: "INV-1" }, data: { invoiceNumber: "INV-1" } });
      assert.ok(ev, "event recorded");
      const runs = await listWorkflowRuns(w.workflow.id);
      assert.equal(runs[0].status, "failed");
      assert.match(runs[0].error ?? "", /Nobody has that role/);
      assert.match(runs[0].error ?? "", /No recipient/);
      assert.equal((await listWorkflows()).find((x) => x.id === w.workflow.id)?.lastRun?.status, "failed");
      await deleteWorkflow(w.workflow.id);
      assert.equal((await listWorkflowRuns(w.workflow.id)).length, 0, "runs go with the workflow");
    });
  });
  await check("email action sends to a fixed address and to an event field", async () => {
    await runAsCompany(A, async () => {
      const w = await createWorkflow(wf({ name: "mail", trigger: "invoice.created", actions: [{ type: "email", to: "finance@alpha.test", subject: "Invoice {{invoiceNumber}}", body: "Hello" }, { type: "email", to: "{{actorEmail}}", subject: "You created {{invoiceNumber}}", body: "Hi" }] }), null);
      assert.ok(w.ok);
      await emitEvent("invoice.created", { entity: { type: "invoice", id: "i2", label: "INV-2", url: "/cashflow-ai/invoices/i2" }, actorId: String(userA), data: { invoiceNumber: "INV-2" } });
      const run = (await listWorkflowRuns(w.workflow.id))[0];
      assert.equal(run.status, "success", run.error ?? "");
      assert.deepEqual(run.results.map((r) => r.detail), ["Sent to finance@alpha.test", "Sent to owner@alpha.test"]);
      await deleteWorkflow(w.workflow.id);
    });
  });
  await check("Send test runs the actions with the sample payload and logs a test run", async () => {
    await runAsCompany(A, async () => {
      const before = (await listNotifications(String(salesA))).length;
      const res = await sendTestRun(notifyWf, { id: String(userA), email: "owner@alpha.test" });
      assert.ok(res.ok, res.error);
      const got = await listNotifications(String(salesA));
      assert.equal(got.length, before + 1);
      assert.equal(got[0].title, "New lead: Asha Verma");
      const run = (await listWorkflowRuns(notifyWf))[0];
      assert.equal(run.test, true);
      assert.equal((await sendTestRun("missing", { id: "x", email: "x@y.z" })).ok, false);
    });
  });

  console.log("loop guard");
  await check("events emitted by workflow actions are recorded but never trigger workflows", async () => {
    await runAsCompany(A, async () => {
      const runsBefore = (await listWorkflowRuns(notifyWf)).length;
      const eventsBefore = (await listEvents({ types: ["lead.created"] })).total;
      const ev = await runInWorkflowScope(() => emitEvent("lead.created", lead("From a workflow")));
      assert.ok(ev, "still recorded");
      assert.equal((await listEvents({ types: ["lead.created"] })).total, eventsBefore + 1);
      assert.equal((await listWorkflowRuns(notifyWf)).length, runsBefore, "no workflow ran");
      await emitEvent("lead.created", lead("Outside again"));
      assert.equal((await listWorkflowRuns(notifyWf)).length, runsBefore + 1, "the guard doesn't leak out of its scope");
    });
  });

  console.log("tenant isolation");
  await check("company A's events never trigger company B's workflows", async () => {
    const bWf = await runAsCompany(B, () => createWorkflow(wf({ name: "B's" }), null));
    assert.ok(bWf.ok);
    await runAsCompany(A, () => emitEvent("lead.created", lead("Alpha only")));
    await runAsCompany(B, async () => {
      assert.equal((await listWorkflowRuns(bWf.workflow.id)).length, 0);
      assert.equal((await listNotifications(String(salesB))).length, 0);
      assert.equal((await listEvents()).total, 0, "B sees none of A's events");
      assert.equal((await listWorkflows()).length, 1, "B sees only its own workflow");
    });
    await runAsCompany(B, () => emitEvent("lead.created", lead("Beta lead")));
    await runAsCompany(B, async () => {
      assert.equal((await listWorkflowRuns(bWf.workflow.id)).length, 1);
      assert.equal((await listNotifications(String(salesB)))[0].title, "New lead: Beta lead");
    });
    assert.equal((await runAsCompany(A, () => listNotifications(String(salesB)))).length, 0);
    assert.equal(await runAsCompany(A, () => listWorkflowRuns(bWf.workflow.id)).then((r) => r.length), 0, "A can't read B's runs");
    assert.equal((await runAsCompany(A, () => updateWorkflow(bWf.workflow.id, wf()))).ok, false, "A can't edit B's workflow");
    assert.equal(await runAsCompany(A, () => deleteWorkflow(bWf.workflow.id)), false);
    const users = await runAsCompany(A, async () => (await import("@/lib/platform/notifications")).notify({ to: { userId: String(salesB) }, title: "cross" }));
    assert.equal(users, 0, "can't notify another company's user");
  });

  console.log("webhooks: SSRF");
  await check("private, loopback, link-local and reserved addresses are blocked", () => {
    for (const ip of ["127.0.0.1", "127.8.8.8", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "ff02::1", "not-an-ip", ""]) {
      assert.ok(isBlockedAddress(ip), `${ip} should be blocked`);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.63.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.ok(!isBlockedAddress(ip), `${ip} should be allowed`);
  });
  await check("URL rules: https only, no credentials, no internal names or IP tricks", () => {
    const blocked = (url: string) => assert.throws(() => parseWebhookUrl(url), WebhookBlockedError, url);
    for (const u of [
      "http://example.com/hook",
      "ftp://example.com/",
      "https://localhost/hook",
      "https://app.localhost/hook",
      "https://127.0.0.1/hook",
      "https://[::1]/hook",
      "https://2130706433/",
      "https://0x7f.0.0.1/",
      "https://017700000001/",
      "https://10.1.2.3:8443/x",
      "https://169.254.169.254/latest/meta-data/",
      "https://intranet/hook",
      "https://db.internal/hook",
      "https://printer.local/",
      "https://user:pass@example.com/",
      "https://[::ffff:10.0.0.1]/",
      "javascript:alert(1)",
      "not a url",
    ])
      blocked(u);
    assert.equal(parseWebhookUrl("https://hooks.example.com/a?b=1").hostname, "hooks.example.com");
  });
  await check("delivery refuses blocked URLs without making a request", async () => {
    const mock = await mockEndpoint();
    try {
      const port = new URL(mock.url).port;
      for (const u of [`${mock.url}/ok`, `https://127.0.0.1:${port}/ok`, `https://localhost:${port}/ok`]) {
        const r = await deliverWebhook(u, { a: 1 }, { secret: "s", eventType: "lead.created", deliveryId: "d" });
        assert.equal(r.ok, false, u);
      }
      assert.equal(mock.hits.length, 0, "nothing reached the local server");
    } finally {
      mock.close();
    }
  });
  await check("a workflow whose webhook points inside the network fails safely", async () => {
    await runAsCompany(A, async () => {
      const w = await createWorkflow(wf({ name: "ssrf", trigger: "task.created", actions: [{ type: "webhook", url: "https://169.254.169.254/latest/meta-data/" }] }), null);
      assert.ok(w.ok, "the URL is syntactically https, so it saves");
      await emitEvent("task.created", { entity: { type: "task", id: "t1", label: "T" }, data: { title: "T" } });
      const run = (await listWorkflowRuns(w.workflow.id))[0];
      assert.equal(run.status, "failed");
      assert.match(run.error ?? "", /private or reserved/);
      await deleteWorkflow(w.workflow.id);
    });
  });

  console.log("webhooks: signature and transport (local mock server)");
  const mock = await mockEndpoint();
  try {
    await check("POSTs JSON with a verifiable HMAC signature", async () => {
      const payload = { type: "lead.created", data: { name: "Asha" } };
      const r = await deliverWebhook(`${mock.url}/ok`, payload, { secret: "whsec_test", eventType: "lead.created", deliveryId: "dlv_1", unsafeAllowAnyHost: true });
      assert.deepEqual(r, { ok: true, status: 200, error: null });
      const hit = mock.hits.at(-1)!;
      assert.equal(hit.body, JSON.stringify(payload));
      assert.equal(hit.headers["content-type"], "application/json");
      assert.equal(hit.headers["x-webhook-event"], "lead.created");
      assert.equal(hit.headers["x-webhook-id"], "dlv_1");
      const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(hit.headers["x-webhook-signature"]));
      assert.ok(m, "signature header format");
      assert.equal(m[2], signWebhook("whsec_test", Number(m[1]), hit.body));
      assert.notEqual(m[2], signWebhook("another-secret", Number(m[1]), hit.body));
      assert.ok(Math.abs(Number(m[1]) - Date.now() / 1000) < 30, "fresh timestamp");
    });
    await check("redirects are not followed; non-2xx is a failure", async () => {
      const before = mock.hits.length;
      const r = await deliverWebhook(`${mock.url}/redirect`, {}, { secret: "s", eventType: "x", deliveryId: "d", unsafeAllowAnyHost: true });
      assert.equal(r.ok, false);
      assert.equal(r.status, 302);
      assert.equal(mock.hits.length, before + 1, "the redirect target was never requested");
      const f = await deliverWebhook(`${mock.url}/fail`, {}, { secret: "s", eventType: "x", deliveryId: "d", unsafeAllowAnyHost: true });
      assert.equal(f.ok, false);
      assert.equal(f.status, 500);
    });
    await check("gives up after 5 seconds", async () => {
      const started = Date.now();
      const r = await deliverWebhook(`${mock.url}/hang`, {}, { secret: "s", eventType: "x", deliveryId: "d", unsafeAllowAnyHost: true });
      const took = Date.now() - started;
      assert.equal(r.ok, false);
      assert.match(r.error ?? "", /5 seconds/);
      assert.ok(took >= 4900 && took < 7000, `took ${took}ms`);
    });
  } finally {
    mock.close();
  }

  console.log("product functions emit");
  await check("client, project, task (completed once), employee, invoice (paid once), lead", async () => {
    await runAsCompany(A, async () => {
      const actor = String(userA);
      const count = async (type: string) => (await listEvents({ types: [type] })).total;
      const base = { lead: await count("lead.created"), status: await count("lead.status_changed") };

      const { createClient } = await import("@/lib/products/sprintos/clients");
      const client = await createClient(
        { companyName: "Northwind", industry: "Retail", website: null, status: "active" as never, primaryContact: { name: "Ravi", email: "ravi@nw.test", phone: null, designation: null }, billing: { addressLine: null, city: null, country: null, gstin: null, currency: "INR", paymentTermsDays: null }, notes: null, tags: [] },
        actor,
      );
      const clientEvents = await listEvents({ types: ["client.created"] });
      assert.equal(clientEvents.items[0].label, "Northwind");
      assert.equal(clientEvents.items[0].url, `/sprintos/clients/${client._id}`);
      assert.equal(clientEvents.items[0].actorEmail, "owner@alpha.test");

      const { createProject } = await import("@/lib/products/sprintos/projects");
      const project = await createProject(
        { name: "Redesign", clientId: client._id, category: null, description: null, priority: "medium" as never, status: "planning" as never, startDate: null, endDate: null, estimatedBudget: 1000, estimatedHours: null, currency: "INR", projectManagerId: null, technologies: [], progressPercent: 0 },
        actor,
      );
      assert.equal(await count("project.created"), 1);

      const { createTask, updateTask, moveTask } = await import("@/lib/products/sprintos/tasks");
      const taskData = { title: "Home page", description: null, status: "todo" as never, priority: "medium" as never, assigneeId: null, labels: [], startDate: null, dueDate: null, estimateHours: null, parentTaskId: null };
      const task = await createTask(project._id, taskData, actor);
      assert.equal(await count("task.created"), 2, "this one + the SSRF test's hand-emitted one");
      assert.equal(await count("task.completed"), 0);
      await updateTask(task._id, { title: "Home page v2" }, actor);
      assert.equal(await count("task.completed"), 0, "an edit isn't a completion");
      await updateTask(task._id, { status: "done" as never }, actor);
      assert.equal(await count("task.completed"), 1);
      await updateTask(task._id, { status: "done" as never }, actor);
      await moveTask(task._id, "done" as never, null, null, actor);
      assert.equal(await count("task.completed"), 1, "already done → not completed again");
      await moveTask(task._id, "todo" as never, null, null, actor);
      await moveTask(task._id, "done" as never, null, null, actor);
      assert.equal(await count("task.completed"), 2, "reopened then done again");

      const { createEmployee } = await import("@/lib/products/talentos/employees");
      await createEmployee(
        {
          firstName: "Meera",
          lastName: "Nair",
          workEmail: "meera@alpha.test",
          status: "active" as never,
          personal: { dateOfBirth: null, gender: null, maritalStatus: null, personalEmail: null, phone: null, addressLine: null, city: null, state: null, postalCode: null, photoKey: null },
          professional: { departmentId: null, designationId: null, teamId: null, reportingManagerId: null, employmentType: null, workLocation: null, joiningDate: null, probationEndDate: null, relievingDate: null },
          emergencyContacts: [],
        },
        actor,
      );
      assert.equal((await listEvents({ types: ["employee.created"] })).items[0].label, "Meera Nair");

      const { createInvoice, applyReceiptToInvoice } = await import("@/lib/products/cashflow-ai/invoices");
      const invoice = await createInvoice({ customerId: client._id, customerName: "Northwind", projectId: null, invoiceDate: "2026-01-10", dueDate: "2026-01-31", items: [{ description: "Work", quantity: 1, unitPrice: 1000, taxRate: 0 } as never], discount: 0, currency: "INR", paymentTerms: null, poNumber: null, notes: null }, actor);
      assert.equal(await count("invoice.created"), 2, "this one + the email test's hand-emitted one");
      const paidBefore = await count("invoice.paid");
      await applyReceiptToInvoice(invoice._id, invoice.totalAmount / 2, actor);
      assert.equal(await count("invoice.paid"), paidBefore, "part payment isn't paid");
      await applyReceiptToInvoice(invoice._id, invoice.totalAmount / 2, actor);
      assert.equal(await count("invoice.paid"), paidBefore + 1);
      await applyReceiptToInvoice(invoice._id, 0, actor);
      assert.equal(await count("invoice.paid"), paidBefore + 1, "already paid → not emitted again");

      const { createLeadRecord, advanceLeadStage } = await import("@/lib/lead-management/records");
      const { nextStageOptions } = await import("@/lib/lead-management/workflows");
      const runsBefore = (await listWorkflowRuns(notifyWf)).length;
      const rec = await createLeadRecord({ type: "client", source: "manual", name: "Kiran Rao", email: "kiran@example.com", phone: "+91 90000 00000", externalUserId: "ext-1", actorId: actor });
      assert.equal(await count("lead.created"), base.lead + 1);
      assert.equal((await listWorkflowRuns(notifyWf)).length, runsBefore + 1, "the real create function triggers the workflow");
      assert.equal((await listNotifications(String(salesA)))[0].title, "New lead: Kiran Rao");
      const next = nextStageOptions(rec.type, rec.stage)[0];
      assert.ok(next, "the lead has a next stage");
      const moved = await advanceLeadStage(rec._id, next.key, actor);
      assert.ok(moved.ok);
      assert.equal(await count("lead.status_changed"), base.status + 1);
    });
  });

  console.log(`\n${passed} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    const d = c.db();
    if (/test/.test(d.databaseName)) await d.dropDatabase();
    await c.close();
  });
