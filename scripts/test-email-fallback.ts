import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { getPlatformDb, clientPromise } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { saveConfig } from "../src/lib/platform/config/store";
import { saveConnection } from "../src/lib/platform/connections/store";
import { saveIntegrations } from "../src/lib/platform/integrations";
import { sendEmail } from "../src/lib/platform/email";

// One retry on the next platform email account. Every provider is stubbed; nothing leaves the machine.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
type Sent = { via: string; from: string; replyTo?: string };
const sent: Sent[] = [];
let down = new Set<string>();
let throwing = new Set<string>();
globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  const via = u.includes("resend.com") ? "resend" : u.includes("sendgrid.com") ? "sendgrid" : "?";
  const body = JSON.parse(String(init?.body ?? "{}"));
  sent.push({ via: `${via}:${String((init?.headers as Record<string, string>).Authorization).slice(7)}`, from: typeof body.from === "string" ? body.from : `${body.from?.name ?? ""} <${body.from?.email}>` });
  if (throwing.has(via)) throw new Error("network down");
  return down.has(via) ? new Response(JSON.stringify({ message: "boom", errors: [{ message: "boom" }] }), { status: 500 }) : new Response(JSON.stringify({ id: "x" }), { status: 200 });
}) as typeof fetch;
(nodemailer as unknown as { createTransport: unknown }).createTransport = (o: { host: string }) => ({
  sendMail: async (m: { from: string; replyTo?: string }) => {
    sent.push({ via: `smtp:${o.host}`, from: m.from, replyTo: m.replyTo });
    if (down.has("smtp")) throw new Error("connection refused");
    return { messageId: "m1" };
  },
});
const warnings: string[] = [];
console.warn = (...a: unknown[]) => { warnings.push(a.join(" ")); };
console.error = () => {};

const msg = { to: "x@example.test", subject: "s", html: "<p>h</p>", text: "t" };
const reset = (d: string[] = [], th: string[] = []) => { sent.length = 0; warnings.length = 0; down = new Set(d); throwing = new Set(th); };
const vias = () => sent.map((s) => s.via.split(":")[0]).join(",");

(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await db.dropDatabase();
  const now = new Date();
  const A = randomUUID(), OWN = randomUUID();
  await db.collection("companies").insertMany([[A, "acme"], [OWN, "own"]].map(([id, slug]) => ({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now })));
  const send = (id = A) => runAsCompany(id, () => sendEmail(msg));
  const domains = { provider: "" as const, token: "", clearToken: false, projectId: "", teamId: "", rootDomain: "" };
  const r = await saveIntegrations({ email: { provider: "resend", apiKey: "re_platform_key_1", clearApiKey: false, from: "hello@resend.platform.test" }, domains }, "staff1");
  assert.ok(r.ok, JSON.stringify(r));
  await saveConfig({ PLATFORM_SMTP_HOST: "smtp.platform.test", PLATFORM_SMTP_FROM: "mail@smtp.platform.test", PLATFORM_SENDGRID_API_KEY: "SG.platform-key-123", PLATFORM_SENDGRID_FROM: "no-reply@sg.platform.test" }, "staff1");

  await T("a working first account is used once, with no retry and no warning", async () => {
    reset();
    assert.equal((await send()).ok, true);
    assert.equal(vias(), "resend");
    assert.equal(warnings.length, 0);
  });
  await T("a failed platform Resend send is retried once on SMTP, from SMTP's own sender under the company's name, and logged", async () => {
    reset(["resend"]);
    assert.equal((await send()).ok, true);
    assert.equal(vias(), "resend,smtp");
    assert.equal(sent[1].from, "acme <mail@smtp.platform.test>");
    assert.ok(warnings[0].includes("resend") && warnings[0].includes("smtp"));
  });
  await T("a thrown error counts as a failure; only ONE retry, never the third account", async () => {
    reset(["smtp"], ["resend"]);
    const out = await send();
    assert.equal(out.ok, false);
    assert.equal(vias(), "resend,smtp");
  });
  await T("platform mail with no company falls back too", async () => {
    reset(["resend"]);
    assert.equal((await sendEmail(msg)).ok, true);
    assert.equal(vias(), "resend,smtp");
  });
  await T("SMTP first (no Resend) falls back to SendGrid; the last account has nothing to fall back to", async () => {
    const off = await saveIntegrations({ email: { provider: "", apiKey: "", clearApiKey: true, from: "" }, domains }, "staff1");
    assert.ok(off.ok, JSON.stringify(off));
    reset(["smtp"]);
    assert.equal((await send()).ok, true);
    assert.equal(vias(), "smtp,sendgrid");
    assert.equal(sent[1].from, "acme <no-reply@sg.platform.test>");
    await saveConfig({ PLATFORM_SMTP_HOST: { clear: true } }, "staff1");
    reset(["sendgrid"]);
    assert.equal((await send()).ok, false);
    assert.equal(vias(), "sendgrid");
    await saveConfig({ PLATFORM_SMTP_HOST: "smtp.platform.test" }, "staff1");
  });
  await T("a company's own account is never retried through a platform account", async () => {
    const own = await runAsCompany(OWN, () => saveConnection("sendgrid", { apiKey: "SG.company-own-key", from: "me@own.example" }, "u1"));
    assert.equal(own.ok, true, JSON.stringify(own));
    reset(["sendgrid"]);
    assert.equal((await send(OWN)).ok, false);
    assert.deepEqual(sent.map((s) => s.via), ["sendgrid:SG.company-own-key"]);
    assert.equal(warnings.length, 0);
  });
  await T("the console choice made on purpose sends nothing and has no fallback", async () => {
    const c = await saveIntegrations({ email: { provider: "console", apiKey: "", clearApiKey: false, from: "" }, domains }, "staff1");
    assert.ok(c.ok, JSON.stringify(c));
    reset();
    const log = console.log; console.log = () => {};
    try { await send(); } finally { console.log = log; }
    assert.equal(sent.length, 0);
  });

  await db.dropDatabase();
  await (await clientPromise).close();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { process.stderr.write(String(e?.stack ?? e) + "\n"); process.exit(1); });
