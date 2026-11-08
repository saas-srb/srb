import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { loadTodayWork, workSummaryText } from "../src/lib/products/cashflow-ai/home/today-work";
import { startPlan } from "../src/lib/products/cashflow-ai/work/store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const A = <T>(fn: () => Promise<T>) => runAsCompany("co_wha", fn);
const B = <T>(fn: () => Promise<T>) => runAsCompany("co_whb", fn);
const day = (offset: number) => new Date(Date.now() + 5.5 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase(); // only ever a zz_throwaway_ database, checked above

  await t("summary text", async () => {
    assert.equal(workSummaryText(3, 2), "3 overdue, 2 due today");
    assert.equal(workSummaryText(1, 0), "1 overdue");
    assert.equal(workSummaryText(0, 1), "1 due today");
    assert.equal(workSummaryText(0, 0), "Nothing due today");
  });

  await t("not started", async () => {
    assert.deepEqual(await A(() => loadTodayWork(day(0))), { started: false });
  });

  await t("started: a past day with no log is overdue; isolated per company", async () => {
    // plan started 3 days ago: daily work for those days has no log, so it is overdue today
    const r = await A(async () => {
      const s = await startPlan(day(-3), { id: "u1", email: null });
      assert.ok(s.ok);
      return loadTodayWork(day(0));
    });
    assert.ok(r && r.started);
    if (!r || !r.started) return;
    assert.ok(r.overdue >= 1, `expected overdue work, got ${r.overdue}`);
    assert.ok(r.items.length <= 5);
    assert.ok(r.items.every((i) => i.state === "overdue" || i.state === "due_today"));
    assert.equal(r.items[0].state, "overdue");
    assert.equal(r.summary, workSummaryText(r.overdue, r.dueToday));
    assert.deepEqual(await B(() => loadTodayWork(day(0))), { started: false });
  });

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
