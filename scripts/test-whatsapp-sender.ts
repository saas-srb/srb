import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPlatformDb, clientPromise } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { saveConfig } from "../src/lib/platform/config/store";
import { saveConnection, setConnectionMode } from "../src/lib/platform/connections/store";
import { companyWhatsAppSender, sendWhatsApp, whatsAppSenderNotice, WHATSAPP_NEEDS_SENDER } from "../src/lib/platform/messaging";
import { createWorkflow, listWorkflowRuns, listWorkflows } from "../src/lib/platform/workflows";
import { sendTestRun, executeWorkflow, runWorkflowsForEvent } from "../src/lib/platform/workflows/run";
import { channelStatus, listChannelMessages, sendToLead } from "../src/lib/dealflow-ai/channels";

// Company-written WhatsApp needs the company's own sender. Throwaway database; provider calls are stubbed, nothing leaves the machine.
let passed = 0;
const T = async (name: string, fn: () => Promise<void> | void) => { await fn(); passed++; console.log("  ✓", name); };
const calls: { url: string; auth: string; body: string }[] = [];
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  calls.push({ url: String(url), auth: String((init?.headers as Record<string, string> | undefined)?.Authorization ?? ""), body: String(init?.body ?? "") });
  return new Response(JSON.stringify({ sid: "SM1", messages: [{ id: "wamid.1" }] }), { status: 201 });
}) as typeof fetch;

(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await db.dropDatabase();
  const now = new Date();
  const [NONE, TW, CLOUD, VOICE, OWNER] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), "owner"];
  await db.collection("companies").insertMany([NONE, TW, CLOUD, VOICE, OWNER].map((id, i) => ({ _id: id as never, slug: `c${i}`, name: `c${i}`, status: "active", isPlatformOwner: id === OWNER, createdAt: now, updatedAt: now })));
  const as = <T,>(id: string, fn: () => Promise<T>) => runAsCompany(id, fn);
  assert.deepEqual(await saveConfig({ TWILIO_ACCOUNT_SID: "ACplatform000", TWILIO_AUTH_TOKEN: "plat-token-111", TWILIO_WHATSAPP_FROM: "whatsapp:+19990000000" }, "staff1"), { ok: true });
  const own = async (id: string, provider: string, values: Record<string, string>) => { const r = await as(id, () => saveConnection(provider, values, "u1")); assert.equal(r.ok, true, JSON.stringify(r)); };
  await own(TW, "twilio", { accountSid: "ACcompany0000", authToken: "own-token-222", whatsappFrom: "+10000000001" });
  await own(CLOUD, "whatsapp-cloud", { phoneNumberId: "555000", accessToken: "cloud-token-333" });
  await own(VOICE, "twilio", { accountSid: "ACvoiceonly00", authToken: "own-token-444" });

  console.log("who may send");
  await T("a company without its own sender is skipped: nothing is sent, least of all through the platform's sender", async () => {
    for (const id of [NONE, VOICE]) {
      calls.length = 0;
      assert.equal(await as(id, companyWhatsAppSender), null);
      assert.deepEqual(await as(id, () => sendWhatsApp("+91 98765 43210", "hi")), { ok: false, error: WHATSAPP_NEEDS_SENDER, skipped: true });
      assert.equal(calls.length, 0);
      assert.deepEqual(await as(id, () => channelStatus("whatsapp")), { connected: false, via: "" });
      assert.ok(await as(id, () => whatsAppSenderNotice("twilio")));
    }
  });
  await T("a company's own Twilio or Cloud API sender is used, with its own credentials", async () => {
    calls.length = 0;
    assert.equal((await as(TW, () => sendWhatsApp("+919876543210", "hi"))).ok, true);
    assert.ok(calls[0].url.includes("/Accounts/ACcompany0000/"));
    assert.equal(new URLSearchParams(calls[0].body).get("From"), "whatsapp:+10000000001");
    assert.ok(!JSON.stringify(calls).includes("platform"));
    calls.length = 0;
    assert.equal((await as(CLOUD, () => sendWhatsApp("+919876543210", "hi"))).ok, true);
    assert.ok(calls[0].url.startsWith("https://graph.facebook.com/") && calls[0].url.includes("/555000/messages"));
    assert.equal(calls[0].auth, "Bearer cloud-token-333");
    assert.equal(await as(TW, () => whatsAppSenderNotice("twilio")), null);
    assert.equal(await as(CLOUD, () => whatsAppSenderNotice("twilio")), null, "a Cloud API sender is enough");
    assert.equal(await as(NONE, () => whatsAppSenderNotice("openai")), null);
  });
  await T("switching back to the included default stops company WhatsApp again; the operator's own workspace is the platform sender's owner", async () => {
    await as(TW, () => setConnectionMode("twilio", "srb", "u1"));
    calls.length = 0;
    assert.equal(((await as(TW, () => sendWhatsApp("+919876543210", "hi"))) as { skipped?: true }).skipped, true);
    assert.equal(calls.length, 0);
    await as(TW, () => setConnectionMode("twilio", "own", "u1"));
    assert.equal((await as(OWNER, () => sendWhatsApp("+919876543210", "hi"))).ok, true);
    assert.ok(calls[0].url.includes("/Accounts/ACplatform000/"));
  });

  console.log("automations");
  const wf = (actions: unknown[]) => ({ name: "Ping", enabled: true, trigger: "lead.created", conditions: [], actions });
  const wa = { type: "whatsapp", to: "+919876543210", body: "Hello" };
  await T("a skipped send is its own neutral outcome, recorded in the history, with one notice to the admins", async () => {
    await as(NONE, async () => {
      await (await getDb()).collection("admin_users").insertOne({ email: "d@x.test", roles: ["super_admin"], isActive: true });
      const created = await createWorkflow(wf([wa]), null);
      assert.ok(created.ok);
      if (!created.ok) return;
      calls.length = 0;
      const event = { _id: "e1", type: "lead.created", at: new Date(), entity: { type: "lead", id: "l", label: "L", url: "/x" }, actorId: null, source: "app", data: {} } as never;
      await runWorkflowsForEvent(event);
      await runWorkflowsForEvent(event);
      assert.equal(calls.length, 0);
      const runs = await listWorkflowRuns(created.workflow.id);
      assert.equal(runs.length, 2);
      assert.equal(runs[0].status, "skipped");
      assert.deepEqual(runs[0].results, [{ action: "whatsapp", ok: false, skipped: true, detail: WHATSAPP_NEEDS_SENDER }]);
      assert.equal((await listWorkflows())[0].lastRun?.status, "skipped");
      const notices = await (await getDb()).collection("notifications").find({ title: /Message not sent/ }).toArray();
      assert.ok(notices.length <= 1, "never one per run");
      const test = await sendTestRun(created.workflow.id, { id: "u", email: "d@x.test" });
      assert.equal(test.ok, false);
      assert.equal(test.skipped, true);
      assert.equal(test.error, WHATSAPP_NEEDS_SENDER);
    });
  });
  await T("a real failure beside a skip is still a failure; a company with a sender succeeds", async () => {
    const event = { id: null, type: "lead.created" as const, at: new Date(), entity: { type: "lead", id: "l", label: "L", url: "/x" }, ctx: {} };
    const doc = (actions: unknown[]) => ({ _id: randomUUID(), name: "m", actions, secret: "s", lastRun: null }) as never;
    const mixed = await as(NONE, () => executeWorkflow(doc([wa, { type: "email", to: "{{missing}}", subject: "s", body: "b" }]), event, { test: true }));
    assert.equal(mixed.status, "failed");
    const fine = await as(TW, () => executeWorkflow(doc([wa]), event, { test: true }));
    assert.equal(fine.status, "success");
  });

  console.log("manual sends (DealFlow)");
  await T("a manual send without a sender is refused neutrally and recorded once, never counted, never blocking the real send", async () => {
    await as(NONE, async () => {
      const d = await getDb();
      await d.collection("lead_records").insertOne({ _id: "L1" as never, code: "L1", type: "client", source: "manual", name: "Lee", email: "l@x.test", phone: "+91 98765 43210", stage: "new", status: "open", deletedAt: null, createdAt: now, updatedAt: now });
      calls.length = 0;
      const send = () => sendToLead({ channel: "whatsapp", leadId: "L1", body: "Hi", sentByName: "s" });
      for (let i = 0; i < 2; i++) {
        const r = await send();
        assert.equal(r.ok, false);
        if (!r.ok) { assert.equal(r.error, WHATSAPP_NEEDS_SENDER); assert.equal(r.message?.status, "skipped"); }
      }
      assert.equal(calls.length, 0);
      assert.deepEqual((await listChannelMessages("whatsapp", "L1")).map((m) => m.status), ["skipped"]);
    });
    await own(NONE, "twilio", { accountSid: "AClater000000", authToken: "own-token-555", whatsappFrom: "+10000000002" });
    const r = await as(NONE, () => sendToLead({ channel: "whatsapp", leadId: "L1", body: "Hi", sentByName: "s" }));
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(calls[0].url.includes("AClater000000"));
  });

  console.log("static");
  await T("only these files post a message to Twilio or the Cloud API, and only messaging sends WhatsApp", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const files = walk("src").filter((f) => /\.tsx?$/.test(f)).map((f) => [f, readFileSync(f, "utf8")]);
    assert.deepEqual(files.filter(([, s]) => /Messages\.json|messaging_product/.test(s)).map(([f]) => f).sort(), ["src/lib/platform/messaging/index.ts", "src/lib/products/contractflow-ai/otp.ts", "src/lib/security/sms-otp.ts"]);
    assert.deepEqual(files.filter(([, s]) => /whatsapp:\$\{|messaging_product/.test(s)).map(([f]) => f), ["src/lib/platform/messaging/index.ts"]);
  });

  await db.dropDatabase();
  await (await clientPromise).close();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
