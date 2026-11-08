/**
 * Plan enforcement checks (module gating, read-only mode, seats, AI tokens,
 * storage, add-on extras, the internal owner never blocked, the usage
 * report) against a throwaway database that is dropped at the end. The AI
 * wrapper is exercised against a local mock OpenAI server — no real calls.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/enforce_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-enforcement.ts
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
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { getUsage, recordUsage } from "@/lib/platform/billing/usage";
import { applyAddonExtras, getEffectiveLimits } from "@/lib/platform/billing/limits";
import {
  BillingLimitError,
  aiBlockReason,
  assertAiAvailable,
  assertWritable,
  countSeatsUsed,
  getBillingNotice,
  isBillingLimitError,
  meterAiTokens,
  meterStorage,
  moduleBlockReason,
  requireModule,
  rolesUseSeat,
  seatBlockReason,
  storageBlockReason,
  storageUsedBytes,
  writeBlockReason,
} from "@/lib/platform/billing/enforce";
import { listCompanyUsage, meterLevel } from "@/lib/platform/billing/usage-report";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function rejectsWith(p: Promise<unknown>, pred: (e: unknown) => boolean, msg: string) {
  let err: unknown = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert.ok(err && pred(err), `${msg} (got ${err instanceof Error ? err.message : String(err)})`);
}

/** Minimal OpenAI-compatible server: JSON for normal calls, SSE for `stream: true`. */
function mockOpenAI(): Promise<{ url: string; hits: () => number; close: () => void }> {
  let hits = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits++;
      const parsed = body ? JSON.parse(body) : {};
      const response = { id: "resp_1", object: "response", created_at: 0, status: "completed", model: "mock", output: [], usage: { input_tokens: 30, output_tokens: 12, total_tokens: 42 } };
      if (parsed.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "hi", sequence_number: 1 })}\n\n`);
        res.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { ...response, usage: { input_tokens: 50, output_tokens: 50, total_tokens: 100 } }, sequence_number: 2 })}\n\n`);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, hits: () => hits, close: () => server.close() })));
}

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  const now = new Date();
  const owner = randomUUID();
  const starter = randomUUID(); // Starter plan, active
  const tiny = randomUUID(); // custom tiny plan for limits
  const susp = randomUUID(); // suspended
  const trial = randomUUID();
  const grace = randomUUID();
  const company = (id: string, slug: string, isPlatformOwner = false) => ({ _id: id as never, slug, name: slug[0].toUpperCase() + slug.slice(1), status: "active", isPlatformOwner, createdAt: now, updatedAt: now });
  await db.collection("companies").insertMany([company(owner, "owner", true), company(starter, "starter"), company(tiny, "tiny"), company(susp, "susp"), company(trial, "trial"), company(grace, "grace")]);
  await listPlans(); // seeds the default catalogue
  // Every real plan has every product; this test needs one with a smaller set, so Starter is narrowed here (test database only).
  await db.collection("billing_plans").updateOne({ _id: "starter" as never }, { $set: { modules: ["hrms", "pms"] } });
  await db.collection("billing_plans").insertOne({
    _id: "tiny" as never,
    name: "Tiny",
    description: "test",
    currency: "INR",
    priceMonthly: 100,
    priceYearly: 1000,
    modules: ["hrms"],
    limits: { seats: 2, aiTokensPerMonth: 1000, storageMb: 1 },
    trialDays: 30,
    active: true,
    isDefault: false,
    sortOrder: 99,
    createdAt: now,
    updatedAt: now,
  });
  const base = { interval: "monthly" as const, trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, updatedAt: now };
  const setSub = (id: string, sub: Record<string, unknown>) => db.collection("companies").updateOne({ _id: id as never }, { $set: { subscription: { ...base, ...sub } } });
  await setSub(starter, { planId: "starter", status: "active" });
  await setSub(tiny, { planId: "tiny", status: "active" });
  await setSub(susp, { planId: "growth", status: "suspended" });
  await setSub(trial, { planId: "growth", status: "trialing", trialEndsAt: new Date(now.getTime() + 5 * 86_400_000) });
  await setSub(grace, { planId: "growth", status: "grace", graceEndsAt: new Date(now.getTime() + 3 * 86_400_000) });

  console.log("module gating");
  await check("plan products open, others locked, core always open", async () => {
    assert.equal(await runAsCompany(starter, () => moduleBlockReason("hrms")), null);
    assert.equal(await runAsCompany(starter, () => moduleBlockReason("messenger")), null, "core product");
    assert.match((await runAsCompany(starter, () => moduleBlockReason("fms"))) ?? "", /Starter plan/);
  });
  await check("requireModule redirects a locked product to /commandos/upgrade", async () => {
    await rejectsWith(runAsCompany(starter, () => requireModule("fms")), (e) => String((e as { digest?: string }).digest ?? "").includes("/commandos/upgrade?module=fms"), "redirect to upgrade");
    await runAsCompany(starter, () => requireModule("pms"));
  });
  await check("internal owner: every product open", async () => {
    await runAsCompany(owner, () => requireModule("smms"));
    assert.equal(await runAsCompany(owner, () => moduleBlockReason("aibots")), null);
  });

  console.log("read-only mode");
  await check("suspended company is read-only", async () => {
    assert.ok(await runAsCompany(susp, () => writeBlockReason()));
    await rejectsWith(runAsCompany(susp, () => assertWritable()), (e) => isBillingLimitError(e) && (e as BillingLimitError).code === "read_only" && (e as BillingLimitError).status === 402, "read_only error");
  });
  await check("canceled company is read-only; active/trial/grace are not", async () => {
    await updateCompanySubscription(susp, { status: "canceled" });
    assert.ok(await runAsCompany(susp, () => writeBlockReason()));
    for (const id of [starter, trial, grace, owner]) assert.equal(await runAsCompany(id, () => writeBlockReason()), null);
  });
  await check("expired trial: grace for the platform's grace days, then read-only (on read)", async () => {
    const justExpired = randomUUID();
    await db.collection("companies").insertOne(company(justExpired, "just-expired"));
    await setSub(justExpired, { planId: "growth", status: "trialing", trialEndsAt: new Date(now.getTime() - 1000) });
    assert.equal(await runAsCompany(justExpired, () => writeBlockReason()), null, "still writable during grace");
    assert.equal((await runAsCompany(justExpired, () => getBillingNotice()))?.status, "grace");
    const expired = randomUUID();
    await db.collection("companies").insertOne(company(expired, "expired"));
    await setSub(expired, { planId: "growth", status: "trialing", trialEndsAt: new Date(now.getTime() - 60 * 86_400_000) });
    assert.ok(await runAsCompany(expired, () => writeBlockReason()));
  });
  await check("suspended company can't add seats or use AI", async () => {
    assert.ok(await runAsCompany(susp, () => seatBlockReason(1)));
    await rejectsWith(runAsCompany(susp, () => assertAiAvailable()), (e) => isBillingLimitError(e) && (e as BillingLimitError).code === "read_only", "AI blocked read-only");
  });

  console.log("billing notice");
  await check("trial / grace / suspended / active / owner", async () => {
    assert.deepEqual(await runAsCompany(trial, () => getBillingNotice()), { status: "trialing", planName: "Growth", daysLeft: 5 });
    assert.deepEqual(await runAsCompany(grace, () => getBillingNotice()), { status: "grace", planName: "Growth", daysLeft: 3 });
    assert.equal((await runAsCompany(susp, () => getBillingNotice()))?.status, "canceled");
    assert.equal(await runAsCompany(starter, () => getBillingNotice()), null);
    assert.equal(await runAsCompany(owner, () => getBillingNotice()), null);
  });

  console.log("seats");
  const { createAdminUser, reactivateAdminUser, updateAdminUserRoles } = await import("@/lib/products/commandos/admin-users");
  await check("training students don't take a seat", () => {
    assert.equal(rolesUseSeat(["training_student"]), false);
    assert.equal(rolesUseSeat(["training_student", "employee"]), true);
    assert.equal(rolesUseSeat([]), false);
  });
  await check("createAdminUser stops at the plan's seat limit", async () => {
    await runAsCompany(tiny, async () => {
      const users = (await getDb()).collection("admin_users");
      await users.insertMany([
        { _id: new ObjectId(), email: "owner@tiny.test", roles: ["super_admin"], createdAt: now },
        { _id: new ObjectId(), email: "student@tiny.test", roles: ["training_student"], createdAt: now },
        { _id: new ObjectId(), email: "gone@tiny.test", roles: [], savedRoles: ["employee"], createdAt: now },
      ]);
      assert.equal(await countSeatsUsed(), 1);
      assert.ok((await createAdminUser("two@tiny.test", ["employee"])).ok, "2nd seat fits");
      const third = await createAdminUser("three@tiny.test", ["employee"]);
      assert.ok(!third.ok && /includes 2 users/.test(third.error ?? ""), "3rd seat blocked");
      assert.ok((await createAdminUser("learner@tiny.test", ["training_student"])).ok, "seatless role still allowed");
    });
  });
  await check("reactivating / re-granting roles also counts", async () => {
    await runAsCompany(tiny, async () => {
      const gone = await (await getDb()).collection("admin_users").findOne({ email: "gone@tiny.test" });
      const r = await reactivateAdminUser(String(gone!._id));
      assert.ok(!r.ok && /includes 2 users/.test(r.error ?? ""));
      const u = await updateAdminUserRoles(String(gone!._id), ["employee"], "someone-else");
      assert.ok(!u.ok);
    });
  });
  await check("pending invitations count when inviting", async () => {
    await runAsCompany(tiny, async () => {
      const db2 = await getDb();
      await db2.collection("admin_users").updateOne({ email: "two@tiny.test" }, { $set: { roles: [] } }); // free a seat
      assert.equal(await seatBlockReason(1), null);
      await db2.collection("company_invitations").insertOne({ _id: randomUUID() as never, email: "inv@tiny.test", status: "pending", roles: ["employee"], expiresAt: new Date(Date.now() + 86_400_000) });
      assert.ok(await seatBlockReason(1, { countPendingInvites: true }), "invite would exceed");
      assert.equal(await seatBlockReason(1), null, "accepting that invite still fits");
    });
  });
  await check("internal owner: no seat limit", async () => {
    await runAsCompany(owner, async () => {
      await (await getDb()).collection("admin_users").insertMany(Array.from({ length: 30 }, (_, i) => ({ _id: new ObjectId(), email: `o${i}@owner.test`, roles: ["employee"], createdAt: now })));
      assert.equal(await seatBlockReason(5), null);
    });
  });

  console.log("add-on extras");
  await check("applyAddonExtras adds quantity × amount; unlimited stays unlimited; unknown ignored", () => {
    const out = applyAddonExtras({ seats: 10, aiTokensPerMonth: null, storageMb: 100 }, [{ addonId: "s", quantity: 3 }, { addonId: "ai", quantity: 2 }, { addonId: "nope", quantity: 9 }], [
      { _id: "s", limitKey: "seats", amountPerUnit: 5 },
      { _id: "ai", limitKey: "aiTokensPerMonth", amountPerUnit: 1000 },
    ]);
    assert.deepEqual(out, { seats: 25, aiTokensPerMonth: null, storageMb: 100 });
  });
  await check("getEffectiveLimits + entitlements include purchased add-ons", async () => {
    await db.collection("billing_addons").insertMany([
      { _id: "seats5" as never, limitKey: "seats", amountPerUnit: 5 },
      { _id: "ai10k" as never, limitKey: "aiTokensPerMonth", amountPerUnit: 10_000 },
    ]);
    await db.collection("companies").updateOne({ _id: tiny as never }, { $set: { "subscription.addons": [{ addonId: "seats5", quantity: 2 }] } });
    assert.deepEqual(await getEffectiveLimits(tiny), { seats: 12, aiTokensPerMonth: 1000, storageMb: 1 });
    assert.deepEqual(await getEffectiveLimits(owner), { seats: null, aiTokensPerMonth: null, storageMb: null, emailsPerMonth: null, voiceMinutesPerMonth: null, customDomains: null });
    await runAsCompany(tiny, async () => {
      assert.ok((await createAdminUser("three@tiny.test", ["employee"])).ok, "extra seats unblock creation");
    });
  });

  console.log("AI tokens");
  await check("blocks at the monthly limit with a friendly error", async () => {
    await runAsCompany(tiny, () => recordUsage("ai_tokens", 999));
    assert.equal(await runAsCompany(tiny, () => aiBlockReason()), null);
    await meterAiTokens(5, tiny);
    assert.equal(await runAsCompany(tiny, () => getUsage("ai_tokens")), 1004);
    const reason = await runAsCompany(tiny, () => aiBlockReason());
    assert.match(reason ?? "", /used all 1,000 AI tokens/);
    await rejectsWith(runAsCompany(tiny, () => assertAiAvailable()), (e) => isBillingLimitError(e) && (e as BillingLimitError).code === "ai_tokens", "ai_tokens error");
  });
  await check("AI add-on raises the limit", async () => {
    await db.collection("companies").updateOne({ _id: tiny as never }, { $set: { "subscription.addons": [{ addonId: "seats5", quantity: 2 }, { addonId: "ai10k", quantity: 1 }] } });
    assert.equal(await runAsCompany(tiny, () => aiBlockReason()), null);
    await db.collection("companies").updateOne({ _id: tiny as never }, { $set: { "subscription.addons": [{ addonId: "seats5", quantity: 2 }] } });
  });
  await check("internal owner never blocked on AI (still metered)", async () => {
    await runAsCompany(owner, () => recordUsage("ai_tokens", 50_000_000));
    assert.equal(await runAsCompany(owner, () => aiBlockReason()), null);
  });

  const mock = await mockOpenAI();
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  process.env.OPENAI_BASE_URL = mock.url;
  const { getOpenAI } = await import("@/lib/openai");
  try {
    await check("OpenAI wrapper meters responses.create usage", async () => {
      const before = await runAsCompany(starter, () => getUsage("ai_tokens"));
      await runAsCompany(starter, async () => (await getOpenAI()).responses.create({ model: "mock", input: "hi" }));
      assert.equal(await runAsCompany(starter, () => getUsage("ai_tokens")), before + 42);
    });
    await check("OpenAI wrapper meters a streamed reply on its final event", async () => {
      const before = await runAsCompany(starter, () => getUsage("ai_tokens"));
      const events: string[] = [];
      await runAsCompany(starter, async () => {
        const stream = await (await getOpenAI()).responses.create({ model: "mock", input: "hi", stream: true });
        for await (const ev of stream) events.push(ev.type);
      });
      assert.deepEqual(events, ["response.output_text.delta", "response.completed"]);
      assert.equal(await runAsCompany(starter, () => getUsage("ai_tokens")), before + 100);
    });
    await check("OpenAI wrapper blocks an over-limit company before calling OpenAI", async () => {
      const hits = mock.hits();
      await rejectsWith(
        runAsCompany(tiny, async () => (await getOpenAI()).responses.create({ model: "mock", input: "hi" })),
        (e) => isBillingLimitError(e),
        "blocked",
      );
      assert.equal(mock.hits(), hits, "no request sent");
    });
    await check("OpenAI wrapper: owner over any number is never blocked", async () => {
      await runAsCompany(owner, async () => (await getOpenAI()).responses.create({ model: "mock", input: "hi" }));
    });
  } finally {
    mock.close();
  }

  console.log("storage");
  await check("storage meter blocks beyond the plan's MB and clamps at 0", async () => {
    await runAsCompany(tiny, async () => {
      await meterStorage(900_000);
      assert.equal(await storageUsedBytes(), 900_000);
      assert.equal(await storageBlockReason(100_000), null);
      assert.match((await storageBlockReason(200_000)) ?? "", /1 MB of file storage/);
      await meterStorage(-2_000_000);
      assert.equal(await storageUsedBytes(), 0);
      await meterStorage(900_000); // 0.86 MB of 1 MB → near
    });
    await runAsCompany(owner, async () => {
      await meterStorage(10 * 1024 * 1024 * 1024);
      assert.equal(await storageBlockReason(1024 * 1024 * 1024), null, "owner unlimited");
    });
  });

  console.log("usage report");
  await check("levels", () => {
    assert.equal(meterLevel(5, null), "ok");
    assert.equal(meterLevel(79, 100), "ok");
    assert.equal(meterLevel(80, 100), "near");
    assert.equal(meterLevel(101, 100), "over");
  });
  await check("per-company rows: plan, seats, AI, storage, highlighting", async () => {
    const rows = await listCompanyUsage();
    const t = rows.find((r) => r.id === tiny)!;
    assert.equal(t.planName, "Tiny");
    assert.deepEqual([t.seats.used, t.seats.limit], [2, 12], "owner + three (two was freed, student is seatless)");
    assert.deepEqual([t.aiTokens.used, t.aiTokens.limit, t.aiTokens.level], [1004, 1000, "over"]);
    assert.equal(t.storageMb.limit, 1);
    assert.equal(t.storageMb.level, "near");
    assert.equal(t.level, "over");
    const o = rows.find((r) => r.id === owner)!;
    assert.equal(o.status, "internal");
    assert.equal(o.level, "ok");
    assert.equal(o.seats.limit, null);
    const s = rows.find((r) => r.id === starter)!;
    assert.equal(s.aiTokens.used, 142);
  });

  console.log(`enforcement: all ${passed} checks passed`);
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
  });
