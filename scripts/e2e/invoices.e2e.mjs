/**
 * Browser test for SaaS invoices — Platform Console /console/invoices (list,
 * filters, CSV, PDF, detail, mark paid, void, credit note) and the company
 * side /commandos/settings/billing/invoices (own invoices only; another company's PDF is
 * a 404) — against a RUNNING server (production build recommended).
 *
 * It seeds its own invoices straight into the server's database, so
 * E2E_MONGODB_URI must be that same scratch database (name must contain "test").
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   E2E_MONGODB_URI=mongodb://127.0.0.1:27099/<scratch>_test_... \
 *   TEST_COMPANY_URL=http://acme.localhost:3006 TEST_COMPANY_EMAIL=... TEST_COMPANY_PASSWORD=... \
 *   node scripts/e2e/invoices.e2e.mjs
 *
 * The TEST_COMPANY_* variables are optional; without them the company-side
 * steps are skipped. The seeded invoices are removed at the end.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { MongoClient } from "mongodb";

const BASE = process.env.PANEL_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.OWNER_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD;
const MONGO = process.env.E2E_MONGODB_URI;
const COMPANY_URL = process.env.TEST_COMPANY_URL;
const COMPANY_EMAIL = process.env.TEST_COMPANY_EMAIL;
const COMPANY_PASSWORD = process.env.TEST_COMPANY_PASSWORD;
if (!EMAIL || !PASSWORD || !MONGO) {
  console.error("Set OWNER_EMAIL, OWNER_PASSWORD and E2E_MONGODB_URI.");
  process.exit(2);
}

let passed = 0;
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
}

// ── Seed ──
const mongo = new MongoClient(MONGO);
await mongo.connect();
const db = mongo.db();
if (!/test/.test(db.databaseName)) {
  console.error(`Refusing to seed "${db.databaseName}" — use a scratch database whose name contains "test".`);
  process.exit(2);
}
const companies = db.collection("companies");
const invoices = db.collection("saas_invoices");
const slug = COMPANY_URL ? new URL(COMPANY_URL).hostname.split(".")[0] : null;
let company = slug ? await companies.findOne({ slug }) : null;
if (!company) company = await companies.findOne({ isPlatformOwner: { $ne: true } });
assert.ok(company, "need at least one non-owner company in the database");
const otherId = `e2e-other-${randomUUID()}`;
await companies.insertOne({ _id: otherId, slug: `e2e-other-${Date.now()}`, name: "E2E Other Co", status: "active", isPlatformOwner: false, createdAt: new Date(), updatedAt: new Date() });

const run = Date.now().toString(36).toUpperCase();
const now = new Date();
const fy = (() => {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
})();
const party = (name) => ({ name, legalName: `${name} Pvt Ltd`, address: "1 Test Road", gstin: null, pan: null, state: "Uttar Pradesh", stateCode: "09", email: null, phone: null });
function invoiceDoc(n, companyId, companyName, status) {
  const paid = status === "paid";
  return {
    _id: randomUUID(),
    kind: "invoice",
    companyId,
    number: `E2E${run}/${fy}/${String(n).padStart(6, "0")}`,
    financialYear: fy,
    status,
    paymentRef: paid ? `pay_e2e_${run}_${n}` : null,
    refundRef: null,
    planId: "growth",
    planName: "Growth",
    interval: "monthly",
    periodStart: now,
    periodEnd: new Date(now.getTime() + 30 * 86_400_000),
    couponId: null,
    currency: "INR",
    seller: party("E2E Platform"),
    buyer: party(companyName),
    placeOfSupply: { code: "09", name: "Uttar Pradesh" },
    supplyType: "intra",
    taxRatePercent: 18,
    sac: "998314",
    pricesIncludeTax: false,
    items: [{ kind: "plan", refId: "growth", description: "Growth (monthly)", sac: "998314", quantity: 1, amount: 100_000, taxable: 100_000 }],
    taxable: 100_000,
    cgst: 9_000,
    sgst: 9_000,
    igst: 0,
    taxTotal: 18_000,
    total: 118_000,
    credited: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    original: null,
    reason: null,
    footerNote: "E2E footer",
    terms: "",
    issuedAt: now,
    paidAt: paid ? now : null,
    voidedAt: null,
    emailedAt: null,
    createdAt: now,
    createdBy: "e2e",
  };
}
const paidInv = invoiceDoc(1, company._id, company.name, "paid");
const unpaidInv = invoiceDoc(2, company._id, company.name, "unpaid");
const voidInv = invoiceDoc(3, company._id, company.name, "unpaid");
const foreignInv = invoiceDoc(4, otherId, "E2E Other Co", "paid");
await invoices.insertMany([paidInv, unpaidInv, voidInv, foreignInv]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  await step("the PDF route refuses signed-out visitors", async () => {
    const res = await page.request.get(`${BASE}/api/platform/billing/invoices/${paidInv._id}/pdf`);
    assert.equal(res.status(), 401);
  });

  await step("owner signs in and opens SaaS invoices", async () => {
    await page.goto(`${BASE}/console/invoices`);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
    await page.goto(`${BASE}/console/invoices`);
    await page.getByRole("heading", { name: "SaaS invoices", level: 1 }).waitFor();
    await page.getByRole("link", { name: paidInv.number, exact: true }).waitFor();
  });

  await step("filters: status, company, FY, search", async () => {
    await page.goto(`${BASE}/console/invoices?status=unpaid&q=E2E${run}`);
    await page.getByRole("link", { name: unpaidInv.number, exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: paidInv.number, exact: true }).count(), 0, "paid hidden by the unpaid filter");
    await page.goto(`${BASE}/console/invoices?company=${encodeURIComponent(otherId)}`);
    await page.getByRole("link", { name: foreignInv.number, exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: paidInv.number, exact: true }).count(), 0, "company filter");
    await page.goto(`${BASE}/console/invoices?fy=1999-00`);
    assert.equal(await page.getByRole("link", { name: paidInv.number, exact: true }).count(), 0, "FY filter");
    await page.goto(`${BASE}/console/invoices?q=E2E${run}`);
    await page.locator("#invoice-search").waitFor();
    await page.locator("#invoice-status").waitFor();
    await page.locator("#invoice-company").waitFor();
    await page.locator("#invoice-fy").waitFor();
  });

  await step("CSV export has the filtered invoices", async () => {
    const href = await page.locator("#invoice-export").getAttribute("href");
    assert.ok(href?.includes(`q=E2E${run}`), `export link keeps filters: ${href}`);
    const res = await page.request.get(`${BASE}${href}`);
    assert.equal(res.status(), 200);
    assert.match(res.headers()["content-type"] ?? "", /text\/csv/);
    const csv = await res.text();
    for (const inv of [paidInv, unpaidInv, voidInv, foreignInv]) assert.ok(csv.includes(inv.number), `${inv.number} in CSV`);
    assert.ok(csv.includes("Taxable value") && csv.includes("1180.00"), "amounts in rupees");
  });

  await step("detail view + PDF download", async () => {
    await page.goto(`${BASE}/console/invoices/${paidInv._id}`);
    await page.getByRole("heading", { name: paidInv.number, level: 1 }).waitFor();
    await page.getByText("CGST @ 9%").waitFor();
    const res = await page.request.get(`${BASE}/api/platform/billing/invoices/${paidInv._id}/pdf?download=1`);
    assert.equal(res.status(), 200);
    assert.equal(res.headers()["content-type"], "application/pdf");
    assert.equal((await res.body()).subarray(0, 5).toString(), "%PDF-");
  });

  await step("mark an unpaid invoice paid", async () => {
    await page.goto(`${BASE}/console/invoices/${unpaidInv._id}`);
    await page.locator("#invoice-action-paid").click();
    await page.fill("#invoice-paid-text", `NEFT-${run}`);
    await page.getByRole("button", { name: "Mark paid", exact: true }).last().click();
    await page.locator("#invoice-action-paid").waitFor({ state: "detached", timeout: 30_000 });
    const doc = await invoices.findOne({ _id: unpaidInv._id });
    assert.equal(doc?.status, "paid");
    assert.equal(doc?.paymentRef, `NEFT-${run}`);
  });

  await step("void an unpaid invoice (reason required)", async () => {
    await page.goto(`${BASE}/console/invoices/${voidInv._id}`);
    await page.locator("#invoice-action-void").click();
    await page.getByRole("button", { name: "Void invoice" }).click();
    await page.getByText("Give a reason for voiding.").waitFor({ timeout: 30_000 });
    await page.fill("#invoice-void-text", "Issued in error (e2e)");
    await page.getByRole("button", { name: "Void invoice" }).click();
    await page.locator("#invoice-action-void").waitFor({ state: "detached", timeout: 30_000 });
    assert.equal((await invoices.findOne({ _id: voidInv._id }))?.status, "void");
  });

  await step("issue a partial then a full credit note", async () => {
    await page.goto(`${BASE}/console/invoices/${paidInv._id}`);
    await page.locator("#invoice-action-credit").click();
    await page.fill("#credit-amount", "180");
    await page.fill("#invoice-credit-text", "Partial refund (e2e)");
    await page.getByRole("button", { name: "Issue credit note" }).last().click();
    await page.locator("#invoice-credit-notes li").first().waitFor({ timeout: 30_000 });
    await page.locator("#invoice-action-credit").click();
    await page.fill("#invoice-credit-text", "Cancelled (e2e)");
    await page.getByRole("button", { name: "Issue credit note" }).last().click();
    await page.locator("#invoice-action-credit").waitFor({ state: "detached", timeout: 30_000 });
    const notes = await invoices.find({ kind: "credit_note", "original.id": paidInv._id }).toArray();
    assert.equal(notes.length, 2);
    assert.equal(notes.reduce((a, n) => a + n.total, 0), paidInv.total, "credits add up to the invoice");
    assert.equal(notes.reduce((a, n) => a + n.cgst + n.sgst, 0), paidInv.taxTotal, "tax reversed exactly");
    await page.getByText("Credited", { exact: true }).first().waitFor();
  });

  await step("every change is in the platform audit log", async () => {
    const actions = await db.collection("platform_audit_log").distinct("action", { "target.id": { $in: [unpaidInv._id, voidInv._id] } });
    assert.ok(actions.includes("invoice.mark_paid") && actions.includes("invoice.void"), actions.join(","));
    assert.ok((await db.collection("platform_audit_log").countDocuments({ action: "invoice.credit_note", "details.invoice": paidInv.number })) === 2);
  });

  await step("no horizontal scroll at phone width, no page errors", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/console/invoices", `/console/invoices/${paidInv._id}`]) {
      await page.goto(`${BASE}${path}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${path} scrolls horizontally by ${overflow}px`);
    }
    assert.deepEqual(pageErrors, []);
  });

  if (COMPANY_URL && COMPANY_EMAIL && COMPANY_PASSWORD) {
    const cctx = await browser.newContext();
    const cpage = await cctx.newPage();
    await step("company Super Admin sees its own invoices and credit notes", async () => {
      await cpage.goto(`${COMPANY_URL}/commandos/login`);
      await cpage.fill('input[name="email"]', COMPANY_EMAIL);
      await cpage.fill('input[name="password"]', COMPANY_PASSWORD);
      await Promise.all([cpage.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), cpage.press('input[name="password"]', "Enter")]);
      await cpage.goto(`${COMPANY_URL}/commandos/settings/billing/invoices`);
      await cpage.getByRole("heading", { name: "Invoices" }).or(cpage.getByText("Invoices", { exact: true })).first().waitFor();
      await cpage.locator(`[data-invoice-number="${paidInv.number}"]`).waitFor();
      assert.equal(await cpage.locator(`[data-invoice-number="${foreignInv.number}"]`).count(), 0, "no other company's invoice listed");
      assert.ok((await cpage.locator("[data-invoice-number^='CN/']").count()) >= 2, "credit notes listed");
    });
    // Node can't resolve *.localhost, so company-host requests are made from inside the browser.
    const browserGet = (path) =>
      cpage.evaluate(async (url) => {
        const r = await fetch(url, { credentials: "include" });
        const bytes = new Uint8Array(await r.arrayBuffer()).subarray(0, 5);
        return { status: r.status, head: String.fromCharCode(...bytes) };
      }, `${COMPANY_URL}${path}`);
    await step("company downloads its own PDF", async () => {
      const res = await browserGet(`/api/platform/billing/invoices/${paidInv._id}/pdf?download=1`);
      assert.equal(res.status, 200);
      assert.equal(res.head, "%PDF-");
    });
    await step("company can't fetch another company's PDF (404)", async () => {
      assert.equal((await browserGet(`/api/platform/billing/invoices/${foreignInv._id}/pdf`)).status, 404);
    });
    await step("company can't open the Platform Console invoices or export", async () => {
      assert.equal((await browserGet(`/console/invoices/export`)).status, 404);
      assert.equal((await cpage.goto(`${COMPANY_URL}/console/invoices`))?.status(), 404);
    });
    await cctx.close();
  } else {
    console.log("  - company-side steps skipped (set TEST_COMPANY_URL, TEST_COMPANY_EMAIL, TEST_COMPANY_PASSWORD)");
  }
} finally {
  await browser.close();
  await invoices.deleteMany({ $or: [{ _id: { $in: [paidInv._id, unpaidInv._id, voidInv._id, foreignInv._id] } }, { "original.id": paidInv._id }] });
  await companies.deleteOne({ _id: otherId });
  await mongo.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
