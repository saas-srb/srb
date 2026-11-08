/**
 * AI-token allowance checks: every AI call draws on the plan's monthly tokens (responses, streams, streams that end without a usage
 * event, images without usage), and a used-up / missing / too-small allowance stops AI with a clear message. Runs against a throwaway
 * database (dropped at the end) and a local mock OpenAI server — no real calls.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/ai_limits_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-ai-limits.ts
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { listPlans } from "@/lib/platform/billing/plans";
import { getUsage, recordUsage } from "@/lib/platform/billing/usage";
import { aiAllowance, aiBlockReason, isBillingLimitError } from "@/lib/platform/billing/enforce";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function mockOpenAI(): Promise<{ url: string; hits: () => number; close: () => void }> {
  let hits = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits++;
      const parsed = body ? JSON.parse(body) : {};
      const url = req.url ?? "";
      if (url.includes("/images/")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ created: 0, data: [{ b64_json: "eA==" }] })); // no usage, like an image model that doesn't report it
        return;
      }
      const response = { id: "resp_1", object: "response", created_at: 0, status: "completed", model: "mock", output: [], usage: { input_tokens: 30, output_tokens: 12, total_tokens: 42 } };
      if (parsed.stream && parsed.input === "cut") {
        // Deltas, then the connection ends with no `response.completed` (so no usage event).
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "x".repeat(350), sequence_number: 1 })}\n\n`);
        res.end();
        return;
      }
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
  const mk = randomUUID(); // 1,000 tokens
  const noai = randomUUID(); // plan without AI (0)
  const free = randomUUID(); // unlimited (null)
  const company = (id: string, slug: string) => ({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
  await db.collection("companies").insertMany([company(mk, "mk"), company(noai, "noai"), company(free, "free")]);
  await listPlans();
  const plan = (id: string, name: string, aiTokensPerMonth: number | null) => ({ _id: id as never, name, description: "t", currency: "INR", priceMonthly: 0, priceYearly: 0, modules: "all", flags: [], limits: { seats: 5, aiTokensPerMonth, storageMb: 100 }, active: true, isDefault: false, sortOrder: 90, createdAt: now, updatedAt: now });
  await db.collection("billing_plans").insertMany([plan("t1000", "Starter", 1000), plan("t0", "NoAI", 0), plan("tnull", "Big", null)]);
  const base = { interval: "monthly" as const, trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, updatedAt: now };
  const setSub = (id: string, planId: string) => db.collection("companies").updateOne({ _id: id as never }, { $set: { subscription: { ...base, planId, status: "active" } } });
  await setSub(mk, "t1000");
  await setSub(noai, "t0");
  await setSub(free, "tnull");

  console.log("allowance messages");
  await check("room left: no block; allowance numbers", async () => {
    assert.equal(await runAsCompany(mk, () => aiBlockReason()), null);
    const a = await runAsCompany(mk, () => aiAllowance());
    assert.deepEqual([a.limit, a.used, a.remaining, a.planName], [1000, 0, 1000, "Starter"]);
  });
  await check("a big job needs room up front (website generation)", async () => {
    await runAsCompany(mk, () => recordUsage("ai_tokens", 900));
    const msg = await runAsCompany(mk, () => aiBlockReason(80_000));
    assert.match(msg ?? "", /needs about 80,000 AI tokens, but only 100 of your Starter plan's 1,000 are left/);
    assert.match(msg ?? "", /resets on 1 /);
    assert.equal(await runAsCompany(mk, () => aiBlockReason()), null, "a small call still fits");
  });
  await check("used up: names the plan, the limit and the reset date", async () => {
    await runAsCompany(mk, () => recordUsage("ai_tokens", 100));
    const msg = await runAsCompany(mk, () => aiBlockReason());
    assert.match(msg ?? "", /used all 1,000 AI tokens of your Starter plan this month/);
    assert.match(msg ?? "", /paused until 1 /);
    assert.match(msg ?? "", /Settings → Billing/);
  });
  await check("plan with no AI says so", async () => {
    assert.match((await runAsCompany(noai, () => aiBlockReason())) ?? "", /AI features aren't included in your NoAI plan/);
  });
  await check("unlimited plan is never blocked", async () => {
    await runAsCompany(free, () => recordUsage("ai_tokens", 9_999_999));
    assert.equal(await runAsCompany(free, () => aiBlockReason(80_000)), null);
  });

  console.log("website generation");
  await check("the AI website at sign-up draws on the allowance: refused up front with the plain message, nothing written", async () => {
    const { generateAiWebsite } = await import("@/lib/platform/website/ai/apply");
    const res = await runAsCompany(mk, () => generateAiWebsite({ force: true }));
    assert.equal(res.ok, false);
    assert.match((res as { error: string }).error, /used all 1,000 AI tokens of your Starter plan/);
    assert.equal(await db.collection("website_state").countDocuments({}), 0, "no state row, nothing started");
  });

  console.log("metering");
  const mock = await mockOpenAI();
  process.env.OPENAI_API_KEY = "sk-test-not-real";
  process.env.OPENAI_BASE_URL = mock.url;
  const { getOpenAI } = await import("@/lib/openai");
  try {
    await check("stream that ends without a usage event is still counted (estimate)", async () => {
      const before = await runAsCompany(free, () => getUsage("ai_tokens"));
      await runAsCompany(free, async () => {
        const stream = await (await getOpenAI()).responses.create({ model: "mock", input: "cut", stream: true });
        for await (const ev of stream) void ev;
      });
      const added = (await runAsCompany(free, () => getUsage("ai_tokens"))) - before;
      assert.ok(added >= 100 && added <= 130, `estimated ~${Math.ceil((350 + 5) / 3.5)} tokens, got ${added}`);
    });
    await check("a reader that stops early is counted too", async () => {
      const before = await runAsCompany(free, () => getUsage("ai_tokens"));
      await runAsCompany(free, async () => {
        const stream = await (await getOpenAI()).responses.create({ model: "mock", input: "cut", stream: true });
        for await (const ev of stream) { void ev; break; }
      });
      assert.ok((await runAsCompany(free, () => getUsage("ai_tokens"))) - before >= 100);
    });
    await check("an image with no usage in the reply is billed a fixed amount", async () => {
      const before = await runAsCompany(free, () => getUsage("ai_tokens"));
      await runAsCompany(free, async () => (await getOpenAI()).images.generate({ model: "mock", prompt: "x" }));
      assert.equal((await runAsCompany(free, () => getUsage("ai_tokens"))) - before, 4000);
    });
    await check("used-up company: no call reaches OpenAI, error is a plain BillingLimitError", async () => {
      const hits = mock.hits();
      let err: unknown = null;
      try { await runAsCompany(mk, async () => (await getOpenAI()).responses.create({ model: "mock", input: "hi" })); } catch (e) { err = e; }
      assert.ok(isBillingLimitError(err));
      assert.match((err as Error).message, /used all 1,000 AI tokens/);
      assert.equal(mock.hits(), hits);
    });
    await check("no-AI plan blocks images and embeddings too", async () => {
      const calls: (() => Promise<unknown>)[] = [
        async () => (await getOpenAI()).images.generate({ model: "mock", prompt: "x" }),
        async () => (await getOpenAI()).embeddings.create({ model: "mock", input: "x" }),
      ];
      for (const call of calls) {
        let err: unknown = null;
        try { await runAsCompany(noai, call); } catch (e) { err = e; }
        assert.ok(isBillingLimitError(err), "blocked");
      }
    });
  } finally {
    mock.close();
  }
  console.log(`\n${passed} checks passed`);
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
