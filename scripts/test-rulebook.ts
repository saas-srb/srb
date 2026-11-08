import assert from "node:assert/strict";
import { builtinRulebook, calendarFor, surchargeRateFor, validateRulebook, type TaxRulebook } from "../src/lib/products/cashflow-ai/rulebook/rules";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };

t("the built-in table for a year is valid", () => {
  assert.deepEqual(validateRulebook(builtinRulebook("2026-27")), []);
  assert.deepEqual(validateRulebook(builtinRulebook("2099-00")), []);
});

t("a table with a bad figure is refused, with a reason a person can read", () => {
  const rb = builtinRulebook("2026-27");
  const bad = (m: (r: TaxRulebook) => void) => { const c = structuredClone(rb); m(c); return validateRulebook(c); };
  assert.ok(bad((r) => { r.tds[0].rate = 150; }).some((e) => e.includes("rate")));
  assert.ok(bad((r) => { r.tds.push({ ...r.tds[0] }); }).some((e) => e.includes("twice")));
  assert.ok(bad((r) => { r.tds[0].annualThreshold = -1; }).length > 0);
  assert.ok(bad((r) => { r.regimes = []; }).some((e) => e.includes("at least one")));
  assert.ok(bad((r) => { r.advanceTax[1].cumulativePercent = 10; }).some((e) => e.includes("keep growing")));
  assert.ok(bad((r) => { r.advanceTax[0].dueDate = "2026-06-31"; }).some((e) => e.includes("real date")));
  assert.ok(bad((r) => { r.source = ""; }).some((e) => e.includes("where the figures")));
  assert.ok(bad((r) => { r.fy = "2026-28"; }).length > 0);
  assert.ok(bad((r) => { r.regimes[0].surchargeSlabs = [{ above: 100, rate: 7 }, { above: 50, rate: 12 }]; }).some((e) => e.includes("go up")));
  assert.ok(bad((r) => { r.dueRules[0].when = { kind: "monthly", day: 40, monthsAfter: 1 }; }).some((e) => e.includes("1 to 31")));
});

t("the calendar of a year runs April to March with monthly, quarterly, yearly and dated items, sorted", () => {
  const cal = calendarFor(builtinRulebook("2026-27"));
  const gstr3b = cal.filter((c) => c.ruleId === "gstr3b");
  assert.equal(gstr3b.length, 12);
  assert.deepEqual(gstr3b[0], { ruleId: "gstr3b", name: "GST: summary return and tax payment", form: "GSTR-3B", category: "gst", period: "Apr 2026", dueDate: "2026-05-20" });
  assert.equal(gstr3b[11].period, "Mar 2027");
  assert.equal(gstr3b[11].dueDate, "2027-04-20", "March's return is due in April of the next year");
  assert.deepEqual(cal.filter((c) => c.ruleId === "tds-return").map((c) => c.dueDate), ["2026-07-31", "2026-10-31", "2027-01-31", "2027-05-31"]);
  assert.equal(cal.find((c) => c.ruleId === "itr6")!.dueDate, "2027-10-31", "the return for FY 2026-27 is filed in the next calendar year");
  assert.deepEqual([...cal].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((c) => c.dueDate), cal.map((c) => c.dueDate));
});

t("a day past the end of a month falls on its last day", () => {
  const rb = builtinRulebook("2026-27");
  rb.dueRules = [{ id: "x", name: "X", form: null, category: "other", when: { kind: "monthly", day: 31, monthsAfter: 0 } }];
  const cal = calendarFor(rb);
  assert.equal(cal.find((c) => c.period === "Feb 2027")!.dueDate, "2027-02-28");
  assert.equal(cal.find((c) => c.period === "Apr 2026")!.dueDate, "2026-04-30");
  const leap = builtinRulebook("2027-28");
  leap.dueRules = rb.dueRules;
  assert.equal(calendarFor(leap).find((c) => c.period === "Feb 2028")!.dueDate, "2028-02-29");
});

t("quarterly items follow the quarter's last month", () => {
  const rb = builtinRulebook("2026-27");
  rb.dueRules = [{ id: "q", name: "Q", form: null, category: "other", when: { kind: "quarterly", day: 15, monthsAfter: 1 } }];
  assert.deepEqual(calendarFor(rb).map((c) => [c.period, c.dueDate]), [["Q1", "2026-07-15"], ["Q2", "2026-10-15"], ["Q3", "2027-01-15"], ["Q4", "2027-04-15"]]);
});

t("the surcharge is the highest slab the income is above", () => {
  const r = builtinRulebook("2026-27").regimes.find((x) => x.id === "normal-30")!;
  assert.equal(surchargeRateFor(r, 5000000), 0);
  assert.equal(surchargeRateFor(r, 10000000), 0, "at the limit is not above it");
  assert.equal(surchargeRateFor(r, 10000001), 7);
  assert.equal(surchargeRateFor(r, 200000000), 12);
  assert.equal(surchargeRateFor(builtinRulebook("2026-27").regimes[0], 1), 10, "a flat surcharge applies from the first rupee");
});

console.log("rulebook tests passed");
