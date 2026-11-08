/**
 * One device at a time on the free plan: who the limit applies to, and the one-time confirmation pass.
 *   npx tsx --require ./scripts/lib/next-server-shims.cjs --env-file=.env.local scripts/test-device-limit.ts
 * Reads the real database; the only thing it writes is a pass (login_takeovers) that is used or expires within minutes.
 */
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { consumeTakeoverTicket, createTakeoverTicket, oneDeviceLimitApplies } from "@/lib/security/device-limit";

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

(async () => {
  const db = await getPlatformDb();
  type Co = { _id: string; slug: string; isPlatformOwner?: boolean; isDemo?: boolean; subscription?: { planId?: string; status?: string } };
  const companies = await db.collection<Co>("companies").find({}).toArray();
  const bySlug = new Map(companies.map((c) => [c.slug, c._id]));

  const demo = bySlug.get("demo");
  if (demo) await check("the shared demo workspace is never limited", async () => assert.equal(await runAsCompany(demo, () => oneDeviceLimitApplies()), false));
  for (const c of companies.filter((x) => x.slug !== "demo")) {
    const sub = c.subscription;
    if (!sub && !c.isPlatformOwner && !c.isDemo) { console.log(`  - ${c.slug}: no stored plan (default plan applies), skipped`); continue; }
    const expectLimited = !c.isPlatformOwner && !c.isDemo && sub?.planId === "free" && sub?.status !== "internal";
    await check(`${c.slug}: plan ${sub?.planId ?? "owner"} (${sub?.status ?? "-"}) → limit ${expectLimited ? "applies" : "does not apply"}`, async () => assert.equal(await runAsCompany(c._id, () => oneDeviceLimitApplies()), expectLimited));
  }

  const any = companies.find((c) => c.slug !== "demo");
  if (any) {
    await runAsCompany(any._id, async () => {
      const id = new ObjectId();
      const t = await createTakeoverTicket(id, "a@b.co");
      await check("a pass works once", async () => {
        const first = await consumeTakeoverTicket(t);
        assert.equal(first?.adminId.toString(), id.toString());
        assert.equal(await consumeTakeoverTicket(t), null);
      });
      await check("a made-up pass is refused", async () => assert.equal(await consumeTakeoverTicket("0".repeat(64)), null));
      await check("a malformed pass is refused", async () => assert.equal(await consumeTakeoverTicket("nope"), null));
    });
  }
  console.log(`\n${passed} checks passed.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
