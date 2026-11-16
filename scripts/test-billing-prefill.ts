import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billingDetailsFromIdentity, billingDiffersFromIdentity } from "../src/lib/platform/billing/company-details-prefill";
import { EMPTY_IDENTITY } from "../src/lib/platform/company-identity/shared";
import { validateBillingDetails } from "../src/lib/platform/billing/billing-details";

// The GST invoice-to record is OFFERED from the company identity, never duplicated silently (pure + static). Run: npx tsx scripts/test-billing-prefill.ts
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const id = { ...EMPTY_IDENTITY, legalName: "Acme Pvt Ltd", brandName: "Acme", gstin: "27AAPFU0939F1ZV", addressLine1: "1 Road", addressLine2: "Baner", city: "Pune", state: "Maharashtra", postalCode: "411045", country: "India", email: "bill@acme.test" };

T("the offer is the company identity in the shape of the billing record, and passes the billing validation", () => {
  const o = billingDetailsFromIdentity(id);
  assert.deepEqual(o, { legalName: "Acme Pvt Ltd", gstin: "27AAPFU0939F1ZV", address: "1 Road, Baner, Pune, 411045, India", state: "Maharashtra", email: "bill@acme.test" });
  assert.equal(validateBillingDetails(o).ok, true, "the offered values are accepted as they are");
});
T("without a legal name the brand name is offered; blank fields stay blank; a missing GSTIN is null", () => {
  const o = billingDetailsFromIdentity({ ...id, legalName: "", gstin: "" });
  assert.equal(o.legalName, "Acme");
  assert.equal(o.gstin, null);
  assert.equal(billingDetailsFromIdentity(EMPTY_IDENTITY).legalName, "");
});
T("an explicit override is visible: fields where the saved record differs from the company details", () => {
  const offer = billingDetailsFromIdentity(id);
  assert.deepEqual(billingDiffersFromIdentity(null, offer), []);
  assert.deepEqual(billingDiffersFromIdentity({ ...offer }, offer), []);
  assert.deepEqual(billingDiffersFromIdentity({ ...offer, legalName: "Acme Billing LLP", email: "BILL@acme.test" }, offer), ["legalName"], "case does not count as a difference");
});
T("the form starts from the company details only when nothing is saved, offers 'Use company details', and the page passes the offer", () => {
  const f = readFileSync("src/components/platform/billing/BillingDetailsForm.tsx", "utf8");
  assert.match(f, /const start = initial \?\? companyDetails/);
  assert.match(f, /Use company details/);
  assert.match(readFileSync("src/app/(products)/commandos/(protected)/settings/billing/page.tsx", "utf8"), /billingDetailsFromIdentity\(await getCompanyIdentity\(\)\)/);
  assert.equal((readFileSync("src/components/platform/billing/BillingManager.tsx", "utf8").match(/companyDetails=\{view\.companyDetails/g) ?? []).length, 2, "both forms get it");
});
console.log(`\n${passed} passed`);
