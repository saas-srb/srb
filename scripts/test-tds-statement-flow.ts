import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { saveSection } from "../src/lib/products/cashflow-ai/tds/store";
import { loadDeductions } from "../src/lib/products/cashflow-ai/tds/store";
import { clearCertificate, listCertificates, listLowerCerts, loadCertificateTasks, recordCertificate, removeLowerCert, saveLowerCert } from "../src/lib/products/cashflow-ai/tds/certificates-store";
import { grandTotal, statementLines } from "../src/lib/products/cashflow-ai/tds/statement";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const lowerIn = (o: Record<string, unknown> = {}) => ({ vendorId: "v1", section: "194j", certificateNumber: "LC-1", nil: false, rate: 1, validFrom: "2026-04-01", validTo: "2027-03-31", maxAmount: null, note: null, ...o }) as Parameters<typeof saveLowerCert>[1];

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_x", async () => {
    const db = await getDb();
    const now = new Date();
    // test inputs a company might type from its CA; the code under test contains none of them
    assert.ok((await saveSection({ code: "194J", label: "Professional fees", rate: 10, singleThreshold: null, annualThreshold: null, noPanRate: null, confirmed: true, active: true }, actor)).ok);
    await db.collection("prms_vendors").insertMany([
      { _id: "v1", companyName: "Acme", pan: "ABCPE1234F", createdAt: now, updatedAt: now, deletedAt: null },
      { _id: "v2", companyName: "Beta", pan: "BCDPE2345G", createdAt: now, updatedAt: now, deletedAt: null },
    ] as never);
    const bill = (id: string, vendorId: string, date: string, tds: number, status = "pending") => ({ _id: id, invoiceNumber: `BILL-${id}`, vendorId, vendorName: vendorId, invoiceDate: date, subtotal: 1000, gstAmount: 180, tdsRate: 10, tdsAmount: tds, tdsSection: "194J", status, createdAt: now, updatedAt: now, deletedAt: null });
    await db.collection("prms_invoices").insertMany([
      bill("a", "v1", "2026-04-01", 100), // first day of Q1
      bill("b", "v1", "2026-06-30", 100), // last day of Q1
      bill("c", "v2", "2026-07-01", 100), // first day of Q2
      bill("d", "v2", "2026-09-30", 100), // last day of Q2
      bill("e", "v1", "2026-07-15", 100, "cancelled"),
      bill("f", "v1", "2027-03-31", 100), // last day of Q4
    ] as never);

    await t("statement lines cover exactly the quarter, edges included, cancelled bills excluded, total equals the rows", async () => {
      const ids = async (q: number) => statementLines((await loadDeductions("2026-27", q)).rows).map((l) => l.billId).sort();
      assert.deepEqual(await ids(1), ["a", "b"]);
      assert.deepEqual(await ids(2), ["c", "d"]);
      assert.deepEqual(await ids(3), []);
      assert.deepEqual(await ids(4), ["f"]);
      const lines = statementLines((await loadDeductions("2026-27", 2)).rows);
      assert.equal(grandTotal(lines).deducted, 200);
      assert.equal(grandTotal(lines).paid, 2000);
    });

    await t("certificates are tracked per vendor, section and quarter, and only where tax was deducted", async () => {
      let tasks = await loadCertificateTasks("2026-27", 1);
      assert.deepEqual(tasks.map((x) => [x.vendorId, x.section, x.deducted, x.certificate === null]), [["v1", "194J", 200, true]]);
      const rec = { vendorId: "v1", section: "194j", fy: "2026-27", quarter: 1, issuedOn: "2026-07-20", certificateNumber: "CERT 001", note: "from TRACES" };
      assert.equal((await recordCertificate({ ...rec, vendorId: "v2" }, actor)).ok, false, "no tax deducted from v2 in Q1");
      assert.equal((await recordCertificate({ ...rec, issuedOn: "2999-01-01" }, actor)).ok, false, "future date");
      assert.equal((await recordCertificate({ ...rec, issuedOn: "2026-02-30" }, actor)).ok, false, "not a real date");
      assert.equal((await recordCertificate({ ...rec, certificateNumber: "" }, actor)).ok, false);
      assert.equal((await recordCertificate({ ...rec, quarter: 5 }, actor)).ok, false);
      assert.ok((await recordCertificate(rec, actor)).ok);
      assert.ok((await recordCertificate({ ...rec, certificateNumber: "CERT 002" }, actor)).ok, "recording again updates, never duplicates");
      await Promise.all([1, 2, 3].map(() => recordCertificate(rec, actor)));
      const list = await listCertificates("2026-27", 1);
      assert.equal(list.length, 1);
      assert.equal(list[0].certificateNumber, "CERT 001");
      assert.equal(list[0].section, "194J");
      tasks = await loadCertificateTasks("2026-27", 1);
      assert.equal(tasks[0].certificate?.certificateNumber, "CERT 001");
      assert.equal((await listCertificates("2026-27", 2)).length, 0, "another quarter is separate");
    });

    await t("the unique index allows one record per vendor, section, year and quarter", async () => {
      const col = db.collection("fms_tds_certificates");
      await assert.rejects(() => col.insertOne({ _id: "dup", vendorId: "v1", section: "194J", fy: "2026-27", quarter: 1, issuedOn: "2026-07-21", certificateNumber: "Z", vendorName: "x", note: null, deletedAt: null } as never));
    });

    await t("clearing removes the mark and it can be recorded again", async () => {
      assert.equal((await clearCertificate({ vendorId: "v1", section: "194J", fy: "2026-27", quarter: 1 }, actor)).ok, true);
      assert.equal((await clearCertificate({ vendorId: "v1", section: "194J", fy: "2026-27", quarter: 1 }, actor)).ok, false);
      assert.equal((await loadCertificateTasks("2026-27", 1))[0].certificate, null);
      assert.ok((await recordCertificate({ vendorId: "v1", section: "194J", fy: "2026-27", quarter: 1, issuedOn: "2026-07-20", certificateNumber: "N2" }, actor)).ok);
    });

    await t("the lower-deduction register validates, edits and removes", async () => {
      assert.equal((await saveLowerCert(null, lowerIn({ rate: 101 }), actor)).ok, false);
      assert.equal((await saveLowerCert(null, lowerIn({ rate: -1 }), actor)).ok, false);
      assert.equal((await saveLowerCert(null, lowerIn({ validFrom: "2026-02-31" }), actor)).ok, false);
      assert.equal((await saveLowerCert(null, lowerIn({ validFrom: "2027-04-01" }), actor)).ok, false);
      assert.equal((await saveLowerCert(null, lowerIn({ vendorId: "nobody" }), actor)).ok, false);
      assert.equal((await saveLowerCert(null, lowerIn({ maxAmount: -5 }), actor)).ok, false);
      assert.equal((await listLowerCerts()).length, 0);
      assert.ok((await saveLowerCert(null, lowerIn(), actor)).ok);
      assert.ok((await saveLowerCert(null, lowerIn({ certificateNumber: "LC-2", nil: true, rate: 7, maxAmount: 100000 }), actor)).ok);
      const list = await listLowerCerts();
      assert.equal(list.length, 2);
      const nil = list.find((c) => c.certificateNumber === "LC-2")!;
      assert.equal(nil.nil, true);
      assert.equal(nil.rate, null, "a nil certificate carries no rate");
      assert.equal(nil.section, "194J");
      assert.equal(nil.vendorName, "Acme");
      assert.ok((await saveLowerCert(nil._id, lowerIn({ certificateNumber: "LC-2", rate: 0.5 }), actor)).ok);
      assert.equal((await listLowerCerts()).find((c) => c._id === nil._id)!.rate, 0.5);
      assert.equal((await saveLowerCert("missing", lowerIn(), actor)).ok, false);
      assert.ok((await removeLowerCert(nil._id, actor)).ok);
      assert.equal((await removeLowerCert(nil._id, actor)).ok, false);
      assert.equal((await listLowerCerts()).length, 1);
    });
  });

  await t("another company sees none of this", async () => {
    await runAsCompany("co_y", async () => {
      assert.equal((await loadCertificateTasks("2026-27", 1)).length, 0);
      assert.equal((await listCertificates("2026-27", 1)).length, 0);
      assert.equal((await listLowerCerts()).length, 0);
      assert.equal(statementLines((await loadDeductions("2026-27", 1)).rows).length, 0);
    });
  });

  console.log("tds statement flow tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
