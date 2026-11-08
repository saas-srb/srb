import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getActiveUpload, listSupersededUploads, loadBooksTds, loadTdsCreditsView, saveTdsCreditsUpload } from "../src/lib/products/cashflow-ai/tds/credits-store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const H = "Deductor Name,Deductor TAN,Section,Transaction Date,Amount Paid or Credited,Tax Deducted,Tax Deposited";
const csv = (...rows: string[]) => `${H}\n${rows.join("\n")}\n`;
// receipt dates are stored at the server's local midnight of their day
const day = (d: string) => new Date(`${d}T00:00:00`);

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_26as_a", async () => {
    const db = await getDb();
    const now = new Date();
    const rec = (id: string, name: string, date: string, tds: number, o: Record<string, unknown> = {}) => ({
      _id: id, receiptNumber: `RCT-${id}`, customerId: `c_${name}`, customerName: name, receiptDate: day(date), amount: 10000, tdsDeducted: tds, tdsSection: "194J",
      status: "completed", createdAt: now, updatedAt: now, deletedAt: null, ...o,
    });
    await db.collection("fms_receipts").insertMany([
      rec("r1", "Acme Pvt Ltd", "2026-05-10", 1000),
      rec("r2", "Beta Ltd", "2026-06-10", 500),
      rec("r3", "Gamma", "2027-03-31", 300), // last day of the year
      rec("r4", "Gamma", "2027-04-01", 300), // next year
      rec("r5", "Acme Pvt Ltd", "2026-05-11", 99, { status: "voided" }),
      rec("r6", "Acme Pvt Ltd", "2026-05-12", 0),
      rec("r7", "Acme Pvt Ltd", "2026-05-13", 77, { deletedAt: now }),
      rec("r8", "Early", "2026-03-31", 40), // previous year
    ] as never);

    await t("the books side is the completed receipts with TDS inside the financial year only", async () => {
      const b = await loadBooksTds("2026-27");
      assert.deepEqual(b.map((x) => x.receiptId).sort(), ["r1", "r2", "r3"]);
      assert.equal(b.find((x) => x.receiptId === "r3")!.date, "2027-03-31");
      assert.deepEqual((await loadBooksTds("2027-28")).map((x) => x.receiptId), ["r4"]);
      assert.equal((await loadBooksTds("bad")).length, 0);
    });

    const text = csv("ACME PRIVATE LIMITED,,194J,15/05/2026,10000,1000,1000", "Beta Limited,,194J,2026-06-12,5000,450,450", "Delta,,194C,2026-08-01,1000,200,200");
    await t("an upload is stored and compared with the receipts", async () => {
      assert.equal(await getActiveUpload("2026-27"), null);
      const r = await saveTdsCreditsUpload({ fy: "2026-27", fileName: "26as.csv", text }, actor);
      assert.ok(r.ok && r.rows === 3 && !r.replaced);
      const v = (await loadTdsCreditsView("2026-27"))!;
      assert.deepEqual(v.recon.rows.map((x) => x.status).sort(), ["amount_differs", "in_26as_not_in_books", "in_books_not_in_26as", "matched"]);
      assert.equal(v.recon.totals.booksTotal, 1800);
      assert.equal(v.recon.totals.credit26asTotal, 1650);
      assert.equal(await loadTdsCreditsView("2025-26"), null, "another year has no upload");
    });

    await t("the books are read again each time: a new receipt changes the result with no new upload", async () => {
      await db.collection("fms_receipts").insertOne(rec("r9", "Delta", "2026-08-03", 200) as never);
      const v = (await loadTdsCreditsView("2026-27"))!;
      assert.equal(v.recon.totals.byStatus.matched.count, 2);
      assert.equal(v.recon.totals.byStatus.in_26as_not_in_books.count, 0);
      await db.collection("fms_receipts").updateOne({ _id: "r2" as never }, { $set: { tdsDeducted: 450 } });
      assert.equal((await loadTdsCreditsView("2026-27"))!.recon.totals.byStatus.matched.count, 3);
    });

    await t("the same file again is refused", async () => {
      assert.equal((await saveTdsCreditsUpload({ fy: "2026-27", fileName: "again.csv", text }, actor)).ok, false);
    });

    await t("a different file for the year replaces the old; the old stays on record as superseded and its rows go", async () => {
      const first = (await getActiveUpload("2026-27"))!;
      const r = await saveTdsCreditsUpload({ fy: "2026-27", fileName: "v2.csv", text: csv("Acme,,194J,15/05/2026,10000,1000,") }, actor);
      assert.ok(r.ok && r.replaced);
      const now2 = (await getActiveUpload("2026-27"))!;
      assert.notEqual(now2._id, first._id);
      const old = await listSupersededUploads("2026-27");
      assert.equal(old.length, 1);
      assert.equal(old[0]._id, first._id);
      assert.equal(old[0].supersededBy, now2._id);
      assert.equal(await db.collection("fms_tds26as_rows").countDocuments({ uploadId: first._id }), 0);
      assert.equal(await db.collection("fms_tds26as_uploads").countDocuments({ fy: "2026-27" }), 2);
      assert.equal(await db.collection("fms_tds26as_rows").countDocuments({}), 1);
      assert.equal(await db.collection("fms_activity_logs").countDocuments({ entityLabel: "Form 26AS credits 2026-27" }), 2, "every upload is in the audit trail");
    });

    await t("hostile and wrong files are refused and leave the stored upload and its rows alone", async () => {
      const before = (await getActiveUpload("2026-27"))!._id;
      const rowsBefore = await db.collection("fms_tds26as_rows").countDocuments({});
      const bad = ["{nope", "%PDF-1.4", "", "x".repeat(5 * 1024 * 1024 + 10), csv("A,,,31/03/2026,,10,"), csv(",,,10/05/2026,,10,"), "a,b\n1,2\n"];
      for (const text of bad) assert.equal((await saveTdsCreditsUpload({ fy: "2026-27", fileName: "bad", text }, actor)).ok, false);
      assert.equal((await saveTdsCreditsUpload({ fy: "2026-28x", fileName: "bad", text: csv("A,,,10/05/2026,,10,") }, actor)).ok, false);
      assert.equal((await getActiveUpload("2026-27"))!._id, before);
      assert.equal(await db.collection("fms_tds26as_rows").countDocuments({}), rowsBefore);
      assert.equal(await db.collection("fms_tds26as_uploads").countDocuments({ fy: "2026-27" }), 2);
    });

    await t("rows outside the year are counted as not read and never stored", async () => {
      const r = await saveTdsCreditsUpload({ fy: "2025-26", fileName: "old.csv", text: csv("Early,,194J,31/03/2026,,40,40", "Early,,194J,01/04/2026,,40,40") }, actor);
      assert.ok(r.ok && r.rows === 1 && r.rejectedCount === 1);
      const v = (await loadTdsCreditsView("2025-26"))!;
      assert.equal(v.upload.rejected[0].reason, "transaction date is outside 2025-26");
      assert.equal(v.recon.totals.byStatus.matched.count, 1);
    });

    await t("nothing in the receipts or ledger was changed by any of this", async () => {
      assert.equal(await db.collection("fms_receipts").countDocuments({}), 9);
      assert.equal(await db.collection("fms_journal_entries").countDocuments({}), 0);
    });
  });

  await t("another company sees nothing of this", async () => {
    await runAsCompany("co_26as_b", async () => {
      assert.equal(await getActiveUpload("2026-27"), null);
      assert.equal(await loadTdsCreditsView("2026-27"), null);
      assert.equal((await listSupersededUploads("2026-27")).length, 0);
      assert.equal((await loadBooksTds("2026-27")).length, 0);
    });
  });

  console.log("tds credits flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
