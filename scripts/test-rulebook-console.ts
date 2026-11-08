import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { builtinRulebook, calendarFor } from "../src/lib/products/cashflow-ai/rulebook/rules";
import { confirmRulebook, loadRulebook, resetRulebook, rulebookHistory, saveRulebook, forgetRulebook } from "../src/lib/products/cashflow-ai/rulebook/rules-store";
import { formToRulebook, rulebookToForm, describeWhen } from "../src/app/(platform)/console/tax-rulebook/form";
import { cloneRulebookForYear, shiftDateByYears } from "../src/app/(platform)/console/tax-rulebook/clone";

const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: "admin@example.com" };

(async () => {
  // ── pure ──
  await t("the built-in table survives form and back unchanged", () => {
    const rb = builtinRulebook("2026-27");
    const r = formToRulebook("2026-27", rulebookToForm(rb));
    assert.ok(r.ok);
    assert.deepEqual(r.rulebook, rb);
  });

  await t("empty means null only where null is allowed", () => {
    const f = rulebookToForm(builtinRulebook("2026-27"));
    f.tds[0].noPanRate = ""; f.tds[0].singleThreshold = ""; f.regimes[0].matRate = "";
    const ok = formToRulebook("2026-27", f);
    assert.ok(ok.ok);
    assert.equal(ok.rulebook.tds[0].noPanRate, null);
    assert.equal(ok.rulebook.tds[0].singleThreshold, null);
    assert.equal(ok.rulebook.regimes[0].matRate, null);
    f.tds[0].rate = "";
    const bad = formToRulebook("2026-27", f);
    assert.ok(!bad.ok && bad.errors.some((e) => e.includes("rate: enter a number")));
  });

  await t("numbers are read strictly: no exponents, negatives, commas, text or signs", () => {
    for (const v of ["1e5", "-2", "1,000", "abc", "+3", "1.", ".5", "0x10", "Infinity", "1 2"]) {
      const f = rulebookToForm(builtinRulebook("2026-27"));
      f.tds[0].annualThreshold = v;
      assert.ok(!formToRulebook("2026-27", f).ok, `"${v}" must be refused`);
    }
    const f = rulebookToForm(builtinRulebook("2026-27"));
    f.tds[0].rate = " 0.1 ";
    const r = formToRulebook("2026-27", f);
    assert.ok(r.ok && r.rulebook.tds[0].rate === 0.1);
    f.dueRules[0].day = "1.5";
    assert.ok(!formToRulebook("2026-27", f).ok, "a day must be a whole number");
  });

  await t("a dated rule and a yearly rule come back from the form", () => {
    const f = rulebookToForm(builtinRulebook("2026-27"));
    const d = f.dueRules.find((r) => r.id === "tds-return")!;
    d.dates = [...d.dates, " "];
    const r = formToRulebook("2026-27", f);
    assert.ok(r.ok);
    assert.equal((r.rulebook.dueRules.find((x) => x.id === "tds-return")!.when as { dates: string[] }).dates.length, 4, "blank dates are dropped");
    assert.equal(describeWhen({ kind: "monthly", day: 20, monthsAfter: 1 }), "The 20th of the month, in the next month after the month the work is for");
  });

  await t("shifting a date keeps month and day; 29 Feb falls back to 28 Feb", () => {
    assert.equal(shiftDateByYears("2026-06-15", 1), "2027-06-15");
    assert.equal(shiftDateByYears("2028-02-29", 1), "2029-02-28");
    assert.equal(shiftDateByYears("2028-02-29", 4), "2032-02-29");
    assert.equal(shiftDateByYears("2027-02-28", 1), "2028-02-28");
    assert.equal(shiftDateByYears("nonsense", 1), "nonsense");
  });

  await t("copying a year moves instalments and fixed dates, leaves relative rules alone, and is valid", () => {
    const prev = builtinRulebook("2027-28");
    prev.dueRules.push({ id: "leap", name: "Leap", form: null, category: "other", when: { kind: "dates", dates: ["2028-02-29"] } });
    const copy = cloneRulebookForYear(prev, "2028-29");
    assert.equal(copy.fy, "2028-29");
    assert.deepEqual(copy.advanceTax.map((i) => i.dueDate), ["2028-06-15", "2028-09-15", "2028-12-15", "2029-03-15"]);
    assert.deepEqual((copy.dueRules.find((r) => r.id === "leap")!.when as { dates: string[] }).dates, ["2029-02-28"]);
    assert.deepEqual(copy.dueRules.find((r) => r.id === "gstr3b"), prev.dueRules.find((r) => r.id === "gstr3b"));
    assert.deepEqual(copy.dueRules.find((r) => r.id === "tds-return")!.when, { kind: "dates", dates: ["2028-07-31", "2028-10-31", "2029-01-31", "2029-05-31"] });
    assert.deepEqual(prev.advanceTax[0].dueDate, "2027-06-15", "the original is not changed");
    assert.ok(copy.source.includes("2027-28"));
    assert.equal(calendarFor(copy).find((c) => c.ruleId === "itr6")!.dueDate, "2029-10-31");
  });

  // ── database ──
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  forgetRulebook();
  const FY = "2026-27";

  await t("a year with nothing published is the built-in, unconfirmed table", async () => {
    const e = await loadRulebook(FY);
    assert.equal(e.origin, "built-in");
    assert.equal(e.confirmed, false);
  });

  await t("saving from the form publishes an unconfirmed table; a bad one is refused with the reasons", async () => {
    const f = rulebookToForm(builtinRulebook(FY));
    f.source = "Finance Act, test";
    f.tds[0].rate = "1.5";
    const p = formToRulebook(FY, f);
    assert.ok(p.ok);
    const r = await saveRulebook(FY, p.rulebook, false, actor);
    assert.ok(r.ok && r.version === 1);
    const e = await loadRulebook(FY);
    assert.equal(e.origin, "published");
    assert.equal(e.confirmed, false);
    assert.equal(e.tds[0].rate, 1.5);
    f.tds[0].rate = "150";
    const p2 = formToRulebook(FY, f);
    assert.ok(p2.ok);
    const bad = await saveRulebook(FY, p2.rulebook, false, actor);
    assert.ok(!bad.ok && bad.errors.some((x) => x.includes("rate must be between 0 and 100")));
    assert.equal((await loadRulebook(FY)).tds[0].rate, 1.5, "a refused save changes nothing");
  });

  await t("confirm marks it checked by the actor; save and confirm does too", async () => {
    const c = await confirmRulebook(FY, actor);
    assert.ok(c.ok);
    const e = await loadRulebook(FY);
    assert.equal(e.confirmed, true);
    assert.equal(e.confirmedBy, actor.email);
    const p = formToRulebook("2027-28", rulebookToForm(cloneRulebookForYear(builtinRulebook(FY), "2027-28")));
    assert.ok(p.ok);
    assert.ok((await saveRulebook("2027-28", p.rulebook, true, actor)).ok);
    assert.equal((await loadRulebook("2027-28")).confirmed, true);
  });

  await t("history lists the actions, newest first", async () => {
    const h = await rulebookHistory(FY);
    assert.deepEqual(h.map((x) => x.action), ["confirm", "save"]);
    assert.equal(h[0].by, actor.email);
  });

  await t("reset goes back to the built-in table", async () => {
    await resetRulebook(FY, actor);
    const e = await loadRulebook(FY);
    assert.equal(e.origin, "built-in");
    assert.equal(e.confirmed, false);
    assert.equal(e.tds[0].rate, builtinRulebook(FY).tds[0].rate);
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("rulebook console tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
