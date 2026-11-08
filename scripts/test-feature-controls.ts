import assert from "node:assert/strict";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { eventChannelOff, forgetFeatureControls, getFeatureControls, pdfOff, setEventChannel, setPdfEnabled, setSectionEnabled } from "../src/lib/platform/feature-controls";
import { eventCatalog, listRules, planNotification, updateRule } from "../src/lib/notify/center/store";
import { platformEvents, platformPdfStats } from "../src/lib/notify/center/platform";
import { recordPdf } from "../src/lib/pdf/activity";
import { pdfTypeOfRequest } from "../src/lib/pdf/gate";

// Runs only against a throwaway database: set MONGODB_URI=mongodb://localhost:27017/zz_throwaway_<n>.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const admin = { id: "u1", email: "admin@example.com" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");

  await t("everything is on until the platform switches it off", async () => {
    const c = await getFeatureControls();
    assert.equal(c.notificationCenter, true); assert.equal(c.pdfLibrary, true); assert.deepEqual(c.events, {}); assert.deepEqual(c.pdfs, {});
  });

  await t("switching an event channel off stops it for every company; locked ones refuse", async () => {
    const catalog = eventCatalog();
    const ev = catalog.find((e) => e.key === "expense_approved")!;
    assert.deepEqual(await setEventChannel("expense_approved", "email", false, admin, { exists: true, locked: false, channels: ev.channels }), { ok: true });
    const c = await getFeatureControls();
    assert.equal(eventChannelOff(c, "expense_approved", "email"), true); assert.equal(eventChannelOff(c, "expense_approved", "push"), false);
    for (const company of ["company-a", "company-b"]) {
      await runAsCompany(company, async () => {
        const plan = await planNotification({ type: "expense_approved", title: "Approved", product: "prms" });
        assert.equal(plan.email.on, false); assert.equal(plan.email.reason, "platform"); assert.equal(plan.inApp.on, true);
      });
    }
    const locked = eventCatalog().find((e) => e.key === "auth_password_reset")!;
    assert.equal((await setEventChannel("auth_password_reset", "email", false, admin, { exists: true, locked: locked.locked, channels: locked.channels })).ok, false);
    assert.equal((await setEventChannel("nope", "email", false, admin, { exists: false, locked: false, channels: [] })).ok, false);
    assert.equal((await setEventChannel("expense_approved", "inApp", false, admin, { exists: true, locked: false, channels: ["email"] })).ok, false, "a channel the event doesn't use");
    // even a stale control on a locked event is never applied
    await db.collection("platform_settings").updateOne({ _id: "feature_controls" as never }, { $set: { "events.auth_password_reset.email": false } });
    forgetFeatureControls();
    await runAsCompany("company-a", async () => assert.equal((await planNotification({ type: "auth_password_reset", title: "x" })).email.on, true));
  });

  await t("a company cannot turn on what the platform switched off, and a company's own off still shows as theirs", async () => {
    await runAsCompany("company-a", async () => {
      await listRules();
      await updateRule("expense_approved", { channels: { email: { enabled: true }, push: { enabled: false } } }, "u");
      await sleep(20);
      const plan = await planNotification({ type: "expense_approved", title: "Approved" });
      assert.equal(plan.email.on, false); assert.equal(plan.email.reason, "platform");
      assert.equal(plan.push.on, false); assert.equal(plan.push.reason, "company");
    });
  });

  await t("turning it back on restores delivery", async () => {
    const ev = eventCatalog().find((e) => e.key === "expense_approved")!;
    await setEventChannel("expense_approved", "email", true, admin, { exists: true, locked: false, channels: ev.channels });
    await runAsCompany("company-b", async () => assert.equal((await planNotification({ type: "expense_approved", title: "Approved" })).email.on, true));
  });

  await t("the platform sees how many companies turned a channel off", async () => {
    const list = await platformEvents();
    const e = list.find((x) => x.key === "expense_approved")!;
    assert.equal(e.companiesOff.push, 1); assert.equal(e.companiesOff.email, 0);
    assert.ok(list.length >= eventCatalog().length);
  });

  await t("PDF switch: off for everyone, with the right route recognised", async () => {
    assert.deepEqual(await setPdfEnabled("fms_invoice", false, admin, true), { ok: true });
    assert.equal(pdfOff(await getFeatureControls(), "fms_invoice"), true);
    assert.equal((await setPdfEnabled("nope", false, admin, false)).ok, false);
    assert.equal(pdfTypeOfRequest("/api/cashflow-ai/invoices/INV-0042", new URLSearchParams())?.key, "fms_invoice");
    assert.equal(pdfTypeOfRequest("/api/clientos/invoices/INV-0042", new URLSearchParams())?.key, "portal_invoice");
    assert.equal(pdfTypeOfRequest("/api/spendiq/items/abc/pdf", new URLSearchParams("type=receipt"))?.key, "prms_item");
    assert.equal(pdfTypeOfRequest("/api/cashflow-ai/reports/revenue", new URLSearchParams("format=pdf"))?.key, "fms_report");
    assert.equal(pdfTypeOfRequest("/api/cashflow-ai/reports/revenue", new URLSearchParams("format=csv")), null, "CSV is not the PDF");
    assert.equal(pdfTypeOfRequest("/api/sprintos/reports/p1", new URLSearchParams())?.key, "pms_report", "SprintOS reports default to PDF");
    assert.equal(pdfTypeOfRequest("/api/sprintos/reports/p1", new URLSearchParams("format=xlsx")), null);
    assert.equal(pdfTypeOfRequest("/api/pdf-library/preview/fms_invoice", new URLSearchParams()), null, "samples are not documents");
    assert.equal(pdfTypeOfRequest("/api/cashflow-ai/invoices", new URLSearchParams()), null);
    await setPdfEnabled("fms_invoice", true, admin, true);
    assert.equal(pdfOff(await getFeatureControls(), "fms_invoice"), false);
  });

  await t("section switches and cross-company PDF numbers", async () => {
    await setSectionEnabled("pdfLibrary", false, admin);
    assert.equal((await getFeatureControls()).pdfLibrary, false); assert.equal((await getFeatureControls()).notificationCenter, true);
    await setSectionEnabled("pdfLibrary", true, admin);
    await runAsCompany("company-a", () => recordPdf({ type: "hrms_payslip", ref: "x", by: "a@example.com" }));
    await runAsCompany("company-b", () => recordPdf({ type: "hrms_payslip", ref: "y", by: "b@example.com" }));
    const stats = await platformPdfStats();
    assert.equal(stats.hrms_payslip.total, 2); assert.equal(stats.hrms_payslip.companies, 2); assert.equal(stats.fms_invoice.total, 0);
    const audit = await db.collection("platform_audit_log").countDocuments({ action: { $regex: "^feature\\." } });
    assert.equal(audit, 6, "every change is audited (3 on, 3 off)");
  });

  await db.dropDatabase();
  console.log("feature controls tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
