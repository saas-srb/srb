import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cookiesDoc, dataPolicyDoc, dataRequestsDoc, dpaDoc, grievanceDoc, privacyDoc, refundDoc, subprocessorsDoc, termsDoc, type LegalContext } from "../src/lib/platform/saas/legal-india";
import { CONSTITUTIONS_LIST } from "../src/app/(platform)/console/legal/options";

// Pure: no database. Run with: npx tsx scripts/test-legal.ts
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const empty: LegalContext = {
  name: "SelfRun AI",
  mail: { privacy: "privacy@example.in", security: "security@example.in", support: "support@example.in" },
  profile: { legalName: "", tradeName: "", gstin: "", constitution: "", registrationType: "", registrationNo: "", registeredOffice: "", grievanceName: "", grievanceDesignation: "", grievanceEmail: "", grievancePhone: "", jurisdictionCity: "", jurisdictionState: "", effectiveDate: "", updatedAt: null, updatedBy: null },
};
const full: LegalContext = {
  ...empty,
  profile: { ...empty.profile, legalName: "Orbit Software Private Limited", tradeName: "SelfRun", gstin: "27AAAAA0000A1Z5", constitution: CONSTITUTIONS_LIST[0], registrationType: "CIN", registrationNo: "U72900MH2020PTC123456", registeredOffice: "Unit 4, Tech Park, Andheri East, Mumbai 400093", grievanceName: "Asha Rao", grievanceDesignation: "Grievance Officer", grievanceEmail: "grievance@selfrun.in", grievancePhone: "+91 22 5555 0100", jurisdictionCity: "Mumbai", jurisdictionState: "Maharashtra", effectiveDate: "2026-11-01" },
};
const builders = { terms: termsDoc, privacy: privacyDoc, refund: refundDoc, cookies: cookiesDoc, "data-policy": dataPolicyDoc, dpa: dpaDoc, subprocessors: subprocessorsDoc, "data-requests": dataRequestsDoc, grievance: grievanceDoc };
const text = (c: LegalContext) => Object.entries(builders).map(([k, b]) => [k, JSON.stringify(b(c))] as const);

t("every policy builds, with sections and a unique heading each", () => {
  for (const [k, b] of Object.entries(builders)) {
    const d = b(full);
    assert.ok(d.sections.length >= 5, k);
    const heads = d.sections.map((s) => s.heading);
    assert.equal(new Set(heads).size, heads.length, `${k}: duplicate heading`);
    for (const s of d.sections) assert.ok((s.body?.length ?? 0) + (s.list?.length ?? 0) > 0, `${k}/${s.heading} is empty`);
  }
});
t("no placeholder or dummy text, filled in or not", () => {
  for (const c of [empty, full]) for (const [k, s] of text(c)) {
    assert.ok(!/\[[A-Za-z ]{2,40}\]|TODO|lorem|placeholder|your company name|\bXXX\b|\bundefined\b|\bnull\b|\bNaN\b/.test(s), `${k}: ${/\[[A-Za-z ]{2,40}\]|TODO|lorem|placeholder|your company name|\bXXX\b|\bundefined\b|\bnull\b|\bNaN\b/.exec(s)?.[0]}`);
  }
});
t("only what the operator entered is stated, and nothing is invented when it is empty", () => {
  const s = Object.fromEntries(text(empty));
  for (const [k, v] of Object.entries(s)) assert.ok(!/Pvt|Private Limited|GSTIN [0-9]|CIN|Mumbai|Andheri|Asha/.test(v), `${k} invented a detail`);
  assert.ok(s.terms.includes("courts having territorial jurisdiction over our registered office"));
  assert.ok(!/Effective from/.test(s.terms));
  const f = Object.fromEntries(text(full));
  assert.ok(f.terms.includes("Orbit Software Private Limited") && f.terms.includes("U72900MH2020PTC123456") && f.terms.includes("27AAAAA0000A1Z5"));
  assert.ok(f.terms.includes("the courts at Mumbai, Maharashtra") && f.terms.includes("Effective from 1 November 2026"));
});
t("every policy ends with the Grievance Officer, using the entered details or the privacy mailbox", () => {
  for (const [k, b] of Object.entries(builders)) {
    if (k === "grievance") continue;
    const last = b(full).sections.at(-1)!;
    assert.equal(last.heading, "Grievance Officer and contact", k);
    assert.ok(last.list!.some((l) => l.includes("Asha Rao")) && last.list!.some((l) => l.includes("grievance@selfrun.in")), k);
    assert.ok(b(empty).sections.at(-1)!.list!.some((l) => l.includes("privacy@example.in")), `${k} (no profile)`);
  }
  assert.ok(grievanceDoc(full).sections[0].list!.some((l) => l.includes("+91 22 5555 0100")));
});
t("the India law that makes each policy valid is named", () => {
  const f = Object.fromEntries(text(full));
  const must: Record<string, RegExp[]> = {
    terms: [/Information Technology Act, 2000/, /Indian Contract Act, 1872/, /Arbitration and Conciliation Act, 1996/, /GST/, /Reserve Bank of India/, /Intermediary Guidelines/, /Aadhaar Act, 2016/, /Telecom Commercial Communications/],
    privacy: [/Digital Personal Data Protection Act, 2023/, /Reasonable Security Practices/, /Data Protection Board of India/, /CERT-In/, /Eighth Schedule/, /[Ss]ection 16/, /child/],
    refund: [/credit note under section 34 of the CGST Act, 2017/, /Consumer Protection \(E-Commerce\) Rules, 2020/, /Razorpay/],
    dpa: [/section 8\(2\)/, /Data Fiduciary/, /Data Processor/, /section 8\(7\)/, /CERT-In/],
    "data-requests": [/section 11/, /section 12/, /section 13/, /section 14/],
    grievance: [/Rule 3\(2\)/, /Rule 4\(5\)/, /1915/, /cybercrime\.gov\.in/, /incident@cert-in\.org\.in/],
  };
  for (const [k, res] of Object.entries(must)) for (const re of res) assert.match(f[k], re, `${k} lacks ${re}`);
});
t("no policy is about another country's law", () => {
  for (const [k, s] of text(full)) assert.ok(!/UK GDPR|GDPR|CCPA|California|Saudi|United Arab Emirates|DIFC|ADGM|Information Commissioner/.test(s), `${k} still mentions a foreign regime`);
});
t("the public pages read their text from the builders, not from stale copies", () => {
  for (const slug of ["terms", "privacy", "refund-policy", "cookies", "data-policy", "dpa", "subprocessors", "data-requests", "grievance"]) {
    const f = readFileSync(`src/app/(platform)/saas/${slug}/page.tsx`, "utf8");
    assert.ok(f.includes("legal-india") && f.includes("loadLegalContext"), slug);
  }
  const files = (dir: string, out: string[] = []): string[] => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx)$/.test(f)) out.push(p); } return out; };
  for (const f of files("src/lib/platform/saas")) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/UK International Data Transfer|Saudi Arabian|California Consumer/.test(s) || f.endsWith("legal-india.ts"), `${f} still carries foreign-law text`);
  }
});
console.log("legal tests passed");
