import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { listLosses, removeLoss, saveLoss, listLossDocs } from "../src/lib/products/cashflow-ai/income-tax/losses-store";
import { getReturn, listReturns, saveReturn } from "../src/lib/products/cashflow-ai/income-tax/returns-store";
import { addNoticeEvent, listNotices, saveNotice, setNoticeStatus } from "../src/lib/products/cashflow-ai/income-tax/notices-store";
import { auditStatusText, replyDueText, returnStatusText, type NoticeInput, type ReturnInput } from "../src/lib/products/cashflow-ai/income-tax/registers-core";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const TODAY = "2026-10-29";
const lossIn = (o: Record<string, unknown> = {}) => ({ fy: "2024-25", kind: "business", amount: 1000, available: 600, validUntilFy: "2032-33", note: null, ...o }) as Parameters<typeof saveLoss>[1];
const retIn = (o: Partial<ReturnInput> = {}): ReturnInput => ({ formLabel: null, filedOn: null, acknowledgementNo: null, verifiedOn: null, auditApplicable: "undecided", auditReportFiledOn: null, auditUdin: null, auditedBy: null, note: null, ...o });
const noticeIn = (o: Partial<NoticeInput> = {}): NoticeInput => ({ type: "Demand", reference: "s.156", fy: "2024-25", receivedOn: "2026-10-01", responseDueOn: "2026-11-05", status: "open", amountDemanded: 5000, note: null, ...o });

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_x", async () => {
    await t("loss validation, and listLosses has exactly the shape the computation reads", async () => {
      for (const bad of [{ fy: "2024-26" }, { kind: "x" }, { amount: 0 }, { available: -1 }, { available: 1001 }, { validUntilFy: "2023-24" }, { validUntilFy: "abc" }])
        assert.equal((await saveLoss(null, lossIn(bad), actor)).ok, false, JSON.stringify(bad));
      assert.ok((await saveLoss(null, lossIn(), actor)).ok);
      assert.ok((await saveLoss(null, lossIn({ fy: "2025-26", kind: "other", validUntilFy: null, available: 0 }), actor)).ok, "available 0 and amount equal are fine");
      const lines = await listLosses();
      assert.equal(lines.length, 2);
      assert.deepEqual(Object.keys(lines[0]).sort(), ["available", "fy", "id", "kind", "validUntilFy"]);
      assert.deepEqual(lines[0], { id: lines[0].id, fy: "2024-25", kind: "business", available: 600, validUntilFy: "2032-33" });
      assert.equal(lines[1].validUntilFy, null);
    });

    await t("a loss can be edited; unknown id is refused", async () => {
      const id = (await listLosses())[0].id;
      assert.ok((await saveLoss(id, lossIn({ available: 400 }), actor)).ok);
      assert.equal((await listLosses()).find((l) => l.id === id)!.available, 400);
      assert.equal((await saveLoss("nope", lossIn(), actor)).ok, false);
    });

    await t("removal is refused while a yearly computation sets the loss off, allowed otherwise (soft delete)", async () => {
      const [a, b] = await listLosses();
      await (await getDb()).collection("fms_it_years").insertOne({ _id: "y1", fy: "2026-27", setOffs: [{ lossId: a.id, amount: 100 }] } as never);
      const res = await removeLoss(a.id, actor);
      assert.equal(res.ok, false);
      assert.ok((await removeLoss(b.id, actor)).ok);
      assert.deepEqual((await listLosses()).map((l) => l.id), [a.id]);
      assert.equal((await listLossDocs()).length, 1);
      assert.equal((await removeLoss(b.id, actor)).ok, false, "already removed");
    });

    await t("return status text for every state, with no due date in it", async () => {
      assert.equal(returnStatusText(null), "Return not filed yet");
      assert.equal(returnStatusText(retIn()), "Return not filed yet");
      assert.equal(returnStatusText(retIn({ filedOn: "2026-07-20" })), "Filed on 20-07-2026, not yet e-verified");
      assert.equal(returnStatusText(retIn({ filedOn: "2026-07-20", verifiedOn: "2026-07-22" })), "Filed and e-verified");
      assert.equal(auditStatusText(null), "Tax audit: not decided yet (ask your CA)");
      assert.equal(auditStatusText(retIn({ auditApplicable: "no" })), "Tax audit: not applicable");
      assert.equal(auditStatusText(retIn({ auditApplicable: "yes" })), "Tax audit: applicable, report not filed yet");
      assert.match(auditStatusText(retIn({ auditApplicable: "yes", auditReportFiledOn: "2026-09-01" })), /report filed on 01-09-2026/);
    });

    await t("one return record per year; future, impossible and out-of-order dates refused; text capped", async () => {
      assert.equal((await saveReturn("2026-27", retIn({ filedOn: "2999-01-01" }), actor, TODAY)).ok, false);
      assert.equal((await saveReturn("2026-27", retIn({ filedOn: "2026-02-30" }), actor, TODAY)).ok, false);
      assert.equal((await saveReturn("2026-27", retIn({ auditApplicable: "yes", auditReportFiledOn: "2999-01-01" }), actor, TODAY)).ok, false);
      assert.equal((await saveReturn("2026-27", retIn({ verifiedOn: "2026-07-22" }), actor, TODAY)).ok, false, "verified without filed");
      assert.equal((await saveReturn("2026-27", retIn({ filedOn: "2026-07-22", verifiedOn: "2026-07-20" }), actor, TODAY)).ok, false);
      assert.equal((await saveReturn("2026-27", retIn({ formLabel: "x".repeat(41) }), actor, TODAY)).ok, false);
      assert.equal((await saveReturn("2026-28", retIn(), actor, TODAY)).ok, false, "bad fy");
      assert.equal(await getReturn("2026-27"), null);
      assert.ok((await saveReturn("2026-27", retIn({ formLabel: " ITR-6 ", filedOn: "2026-07-20" }), actor, TODAY)).ok);
      await Promise.all([1, 2, 3].map(() => saveReturn("2026-27", retIn({ formLabel: "ITR-6", filedOn: "2026-07-20", verifiedOn: "2026-07-21" }), actor, TODAY)));
      assert.equal((await listReturns()).length, 1);
      const r = (await getReturn("2026-27"))!;
      assert.equal(r.formLabel, "ITR-6");
      assert.equal(returnStatusText(r), "Filed and e-verified");
    });

    await t("notice lifecycle: validation, status change, append-only events, open first", async () => {
      assert.equal((await saveNotice(null, noticeIn({ type: " " }), actor, TODAY)).ok, false);
      assert.equal((await saveNotice(null, noticeIn({ receivedOn: "2999-01-01" }), actor, TODAY)).ok, false);
      assert.equal((await saveNotice(null, noticeIn({ responseDueOn: "2026-09-01" }), actor, TODAY)).ok, false, "due before received");
      assert.equal((await saveNotice(null, noticeIn({ amountDemanded: -5 }), actor, TODAY)).ok, false);
      assert.equal((await saveNotice(null, noticeIn({ status: "x" as never }), actor, TODAY)).ok, false);
      assert.ok((await saveNotice(null, noticeIn({ type: "Intimation", receivedOn: "2026-04-01", responseDueOn: "2026-05-01", status: "closed" }), actor, TODAY)).ok);
      assert.ok((await saveNotice(null, noticeIn({ responseDueOn: "2026-12-01", type: "Scrutiny" }), actor, TODAY)).ok);
      assert.ok((await saveNotice(null, noticeIn(), actor, TODAY)).ok);
      let list = await listNotices();
      assert.deepEqual(list.map((n) => n.type), ["Demand", "Scrutiny", "Intimation"], "open by soonest reply date, then closed");
      const id = list[0]._id;
      assert.equal((await addNoticeEvent(id, { date: "2999-01-01", text: "x" }, actor, TODAY)).ok, false);
      assert.equal((await addNoticeEvent(id, { date: "2026-10-10", text: "  " }, actor, TODAY)).ok, false);
      assert.equal((await addNoticeEvent("nope", { date: "2026-10-10", text: "x" }, actor, TODAY)).ok, false);
      assert.ok((await addNoticeEvent(id, { date: "2026-10-10", text: "Reply uploaded" }, actor, TODAY)).ok);
      assert.ok((await addNoticeEvent(id, { date: "2026-10-12", text: "Hearing attended" }, actor, TODAY)).ok);
      assert.ok((await setNoticeStatus(id, "replied", actor)).ok);
      assert.equal((await setNoticeStatus(id, "bogus" as never, actor)).ok, false);
      // editing the details never touches the history
      assert.ok((await saveNotice(id, noticeIn({ status: "appealed", note: "to CIT(A)" }), actor, TODAY)).ok);
      const n = (await listNotices()).find((x) => x._id === id)!;
      assert.equal(n.status, "appealed");
      assert.deepEqual(n.events.map((e) => e.text), ["Reply uploaded", "Hearing attended"]);
      list = await listNotices();
      assert.equal(list[0].type, "Scrutiny", "no longer open, so it moves down");
    });

    await t("reply-due wording from an injected today", async () => {
      const o = (d: string | null, status: "open" | "replied" = "open") => replyDueText({ status, responseDueOn: d }, TODAY);
      assert.equal(o("2026-11-05"), "Reply due in 7 days");
      assert.equal(o("2026-10-30"), "Reply due in 1 day");
      assert.equal(o("2026-10-29"), "Reply due today");
      assert.equal(o("2026-10-28"), "Overdue by 1 day");
      assert.equal(o("2026-10-20"), "Overdue by 9 days");
      assert.equal(o(null), "No reply-due date entered");
      assert.equal(o("2026-10-20", "replied"), null);
      assert.equal(replyDueText({ status: "open", responseDueOn: "2027-03-01" }, "2026-02-28"), "Reply due in 366 days", "across a year");
    });
  });

  await runAsCompany("co_y", async () => {
    await t("another company sees none of it", async () => {
      assert.equal((await listLosses()).length, 0);
      assert.equal((await listReturns()).length, 0);
      assert.equal((await listNotices()).length, 0);
      assert.ok((await saveReturn("2026-27", retIn({ filedOn: "2026-07-20" }), actor, TODAY)).ok, "same fy is fine in a different company");
    });
  });

  await (await getPlatformDb()).dropDatabase();
  console.log("all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
