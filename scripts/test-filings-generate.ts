import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { generateYearFilings, getComplianceProfile, listFilings, markFiled, refreshYearDates, saveComplianceProfile, updateFiling } from "../src/lib/products/cashflow-ai/compliance/filings";
import { EMPTY_PROFILE, appliesToProfile, categoriesFor, currentFilingYear, type ComplianceProfile } from "../src/lib/products/cashflow-ai/compliance/filings-core";
import { builtinRulebook, calendarFor } from "../src/lib/products/cashflow-ai/rulebook/rules";
import { loadRulebook } from "../src/lib/products/cashflow-ai/rulebook/rules-store";
import { saveRulebook } from "../src/lib/products/cashflow-ai/rulebook/rules-store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const inA = <T>(fn: () => Promise<T>) => runAsCompany("co_gen_a", fn);
const inB = <T>(fn: () => Promise<T>) => runAsCompany("co_gen_b", fn);
const actor = { id: "u1", email: "a@x.in" };
const FY = "2026-27";
const profile = (p: Partial<ComplianceProfile>): ComplianceProfile => ({ ...EMPTY_PROFILE, ...p });
const cats = (rows: { category: string }[]) => new Set(rows.map((r) => r.category));

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await t("which filing types apply comes from the answers; PF and ESI follow employees", () => {
    assert.deepEqual([...categoriesFor(EMPTY_PROFILE)].sort(), ["audit", "income_tax", "other", "roc"]);
    assert.ok(categoriesFor(profile({ gstRegistered: true })).has("gst"));
    assert.ok(!categoriesFor(profile({ gstRegistered: false })).has("gst"));
    assert.ok(!categoriesFor(profile({ isPrivateLimited: false })).has("roc"));
    assert.equal(appliesToProfile({ ruleId: "pf", category: "tds" }, profile({ hasEmployees: true })), true);
    assert.equal(appliesToProfile({ ruleId: "esi", category: "tds" }, profile({ deductsTds: true })), false);
    assert.equal(currentFilingYear("2027-03-31"), "2026-27");
    assert.equal(currentFilingYear("2026-04-01"), "2026-27");
  });

  await t("the profile is saved per company and unanswered by default", async () => {
    await inA(async () => {
      assert.deepEqual(await getComplianceProfile(), EMPTY_PROFILE);
      await saveComplianceProfile({ gstRegistered: true, hasEmployees: true, deductsTds: false }, "u1", null);
      await saveComplianceProfile({ isPrivateLimited: true }, "u1", null);
      assert.deepEqual(await getComplianceProfile(), { gstRegistered: true, hasEmployees: true, deductsTds: false, isPrivateLimited: true });
    });
    await inB(async () => assert.deepEqual(await getComplianceProfile(), EMPTY_PROFILE));
  });

  const p = profile({ gstRegistered: true, hasEmployees: true, deductsTds: false });
  const expected = calendarFor(builtinRulebook(FY)).filter((i) => appliesToProfile(i, p)).length;

  await t("a company's answers decide which dates are added, with the rulebook's date and unchecked flag", async () => {
    await inA(async () => {
      const r = await generateYearFilings(FY, p, actor);
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.equal(r.added, expected);
      assert.equal(r.confirmed, false);
      const rows = await listFilings();
      assert.equal(rows.length, expected);
      assert.ok(!cats(rows).has("tds"), "no TDS rows when TDS is answered no");
      assert.ok(cats(rows).has("gst") && cats(rows).has("payroll"));
      assert.ok(rows.every((x) => x.generated && x.dueDate && x.ruleId && x.period && !x.dueDateConfirmed));
      const gstr3b = rows.find((x) => x.ruleId === "gstr3b" && x.period === "Apr 2026")!;
      assert.equal(gstr3b.dueDate, "2026-05-20");
    });
  });

  await t("a second run adds nothing", async () => {
    await inA(async () => {
      const r = await generateYearFilings(FY, p, actor);
      assert.ok(r.ok && r.added === 0 && r.alreadyThere === expected);
      assert.equal((await listFilings()).length, expected);
      const [x, y] = await Promise.all([generateYearFilings(FY, p, actor), generateYearFilings(FY, p, actor)]);
      assert.ok(x.ok && y.ok && x.added + y.added === 0);
      assert.equal((await listFilings()).length, expected);
    });
  });

  await t("a bad year is refused", async () => {
    await inA(async () => assert.equal((await generateYearFilings("2026-28", p, actor)).ok, false));
  });

  await t("answering TDS yes later adds only the TDS rows", async () => {
    await inA(async () => {
      const r = await generateYearFilings(FY, { ...p, deductsTds: true }, actor);
      assert.ok(r.ok && r.added > 0);
      assert.ok(cats(await listFilings()).has("tds"));
    });
  });

  await t("a moved date updates only unfiled generated rows, keeps the old date, and leaves filed and hand-set rows alone", async () => {
    await inA(async () => {
      const rows = await listFilings();
      const filed = rows.find((x) => x.ruleId === "gstr3b" && x.period === "Apr 2026")!;
      const handSet = rows.find((x) => x.ruleId === "gstr3b" && x.period === "May 2026")!;
      const open = rows.find((x) => x.ruleId === "gstr3b" && x.period === "Jun 2026")!;
      await markFiled(filed._id, { filedOn: "2026-05-18" }, "u1", null);
      await updateFiling(handSet._id, { dueDate: "2026-06-25" }, "u1", null);

      const same = await refreshYearDates(FY, actor);
      assert.ok(same.ok && same.moved === 0, "nothing moves while the rulebook is unchanged");

      const rb = builtinRulebook(FY);
      const rule = rb.dueRules.find((r) => r.id === "gstr3b")!;
      rule.when = { kind: "monthly", day: 24, monthsAfter: 1 };
      assert.ok((await saveRulebook(FY, rb, true, { id: "admin", email: "admin@x.in" })).ok);
      assert.equal((await loadRulebook(FY)).confirmed, true);

      const res = await refreshYearDates(FY, actor);
      assert.ok(res.ok);
      if (!res.ok) return;
      assert.equal(res.moved, 10, "12 months of GSTR-3B less the filed one and the hand-set one");
      assert.equal(res.skippedByHand, 1);
      const after = await listFilings();
      const get = (id: string) => after.find((x) => x._id === id)!;
      assert.equal(get(filed._id).dueDate, "2026-05-20");
      assert.equal(get(filed._id).dateHistory, undefined);
      assert.equal(get(handSet._id).dueDate, "2026-06-25");
      const o = get(open._id);
      assert.equal(o.dueDate, "2026-07-24");
      assert.equal(o.dueDateConfirmed, true);
      assert.equal(o.dateHistory?.length, 1);
      assert.equal(o.dateHistory?.[0].from, "2026-07-20");
      assert.equal(o.dateHistory?.[0].to, "2026-07-24");
      const other = after.find((x) => x.ruleId === "gstr1" && x.period === "Apr 2026")!;
      assert.equal(other.dueDate, "2026-05-11", "other rules are untouched");
      assert.equal((await refreshYearDates(FY, actor) as { moved: number }).moved, 0, "a second refresh moves nothing");
    });
  });

  await t("an unanswered profile generates only income tax, company filings, audit and other", async () => {
    await inB(async () => {
      const r = await generateYearFilings(FY, EMPTY_PROFILE, actor);
      assert.ok(r.ok && r.added > 0);
      assert.deepEqual([...cats(await listFilings())].sort(), ["audit", "income_tax", "roc"]);
    });
  });

  await t("companies do not see each other's calendars", async () => {
    await inB(async () => assert.ok((await listFilings()).length < expected));
    const [a, b] = [await inA(async () => (await listFilings()).length), await inB(async () => (await listFilings()).length)];
    assert.notEqual(a, b);
  });

  console.log("filings generate: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
