import assert from "node:assert/strict";
import { deductionRows, type BillForTds, type SectionConfig } from "../src/lib/products/cashflow-ai/tds/core";
import { certificateProblem, certificateTasks, isRealDate, lowerCertCovering, lowerCertProblem, type LowerCertInput, type LowerCertLike } from "../src/lib/products/cashflow-ai/tds/certificates-core";
import { attentionItems, grandTotal, sectionSubtotals, statementLines } from "../src/lib/products/cashflow-ai/tds/statement";
import { STATEMENT_CSV_HEADER, csvField, statementCsv } from "../src/lib/products/cashflow-ai/tds/statement-csv";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
// Numbers are test inputs a company might type from its CA; the code under test contains none of them.
const cfg = (code: string, o: Partial<SectionConfig> = {}): SectionConfig => ({ code, label: code, rate: 10, singleThreshold: null, annualThreshold: null, noPanRate: null, confirmed: true, active: true, ...o });
const settings = new Map([["194J", cfg("194J")], ["194C", cfg("194C", { rate: 2 })]]);
const bill = (o: Partial<BillForTds> = {}): BillForTds => ({ billId: "b1", billNumber: "BILL-1", vendorId: "v1", vendorName: "Acme", vendorPan: "ABCPE1234F", date: "2026-10-05", base: 50000, tdsRate: 10, tdsAmount: 5000, section: "194J", status: "pending", ...o });
const rows = deductionRows([
  bill(),
  bill({ billId: "b2", billNumber: "BILL-2", vendorId: "v2", vendorName: "Beta, \"Co\"", vendorPan: null, base: 10000.1, tdsRate: 2, tdsAmount: 200.2, section: "194C" }),
  bill({ billId: "b3", billNumber: "BILL-3", base: 0.1, tdsRate: 10, tdsAmount: 0.01, date: "2026-10-06" }),
  bill({ billId: "b4", billNumber: "BILL-4", vendorId: "v3", vendorName: "Gamma", base: 1000, tdsAmount: 0, tdsRate: 0 }), // expected 100, nothing deducted
], settings);

t("only bills with tax deducted become statement lines, grouped by section", () => {
  const lines = statementLines(rows);
  assert.deepEqual(lines.map((l) => l.billId), ["b2", "b1", "b3"], "194C before 194J; b4 deducted nothing");
});

t("section subtotals and the grand total equal the sum of the lines", () => {
  const lines = statementLines(rows);
  const subs = sectionSubtotals(lines);
  assert.deepEqual(subs.map((s) => s.section), ["194C", "194J"]);
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const g = grandTotal(lines);
  assert.equal(g.deducted, r2(lines.reduce((n, l) => n + l.deducted, 0)));
  assert.equal(g.deducted, r2(subs.reduce((n, s) => n + s.deducted, 0)));
  assert.equal(g.paid, r2(subs.reduce((n, s) => n + s.paid, 0)));
  assert.equal(g.count, subs.reduce((n, s) => n + s.count, 0));
  assert.equal(g.deducted, 5200.21);
  assert.deepEqual(grandTotal([]), { count: 0, paid: 0, deducted: 0 });
});

t("csv fields are quoted per RFC 4180 and formulas are defused", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField('a,"b"'), '"a,""b"""');
  assert.equal(csvField("two\nlines"), '"two\nlines"');
  assert.equal(csvField("=1+1"), "'=1+1");
  assert.equal(csvField("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvField("-2+3"), "'-2+3");
  assert.equal(csvField("+9"), "'+9");
  assert.equal(csvField("\tx"), "'\tx");
  assert.equal(csvField('=HYPERLINK("x","y")'), `"'=HYPERLINK(""x"",""y"")"`);
});

t("the statement csv has a header, one row per line, CRLF, and safe vendor names", () => {
  const evil = deductionRows([bill({ vendorName: "=cmd|' /C calc'!A0" })], settings);
  const csv = statementCsv(statementLines([...rows, ...evil]), "2026-27", 3);
  const out = csv.split("\r\n");
  assert.equal(out.pop(), "");
  assert.equal(out[0], STATEMENT_CSV_HEADER.join(","));
  assert.equal(out.length, 1 + 4);
  assert.ok(out.some((l) => l.startsWith('"Beta, ""Co"""')));
  assert.ok(out.every((l) => !/^[=+\-@]/.test(l)), "no line starts as a formula");
  assert.ok(out.some((l) => l.startsWith("'=cmd")));
  const b2 = out.find((l) => l.includes("BILL-2"))!;
  assert.ok(b2.includes(",05-10-2026,10000.10,2,200.20,2026-27,Q3,"));
  assert.ok(b2.endsWith("Vendor PAN missing"), "the checks column carries the flag title");
});

const lc = (o: Partial<LowerCertLike> = {}): LowerCertLike => ({ vendorId: "v1", section: "194J", certificateNumber: "C-1", nil: false, rate: 1, validFrom: "2026-04-01", validTo: "2027-03-31", maxAmount: null, ...o });

t("a lower-deduction certificate covers its vendor, section and dates (inclusive)", () => {
  const certs = [lc()];
  assert.ok(lowerCertCovering(certs, "v1", "194J", "2026-04-01"));
  assert.ok(lowerCertCovering(certs, "v1", "194j", "2027-03-31"));
  assert.equal(lowerCertCovering(certs, "v1", "194J", "2027-04-01"), null);
  assert.equal(lowerCertCovering(certs, "v1", "194J", "2026-03-31"), null);
  assert.equal(lowerCertCovering(certs, "v2", "194J", "2026-10-05"), null);
  assert.equal(lowerCertCovering(certs, "v1", "194C", "2026-10-05"), null);
  assert.equal(lowerCertCovering(certs, "v1", null, "2026-10-05"), null);
});

t("needs-attention lists flagged rows and rows a certificate covers, and does not touch the expected amount", () => {
  const without = attentionItems(rows, []);
  const withCert = attentionItems(rows, [lc()]);
  const b1 = withCert.find((a) => a.row.bill.billId === "b1");
  assert.ok(b1 && b1.lowerCert && b1.flags.length === 0, "b1 had no flag of its own");
  assert.ok(!without.some((a) => a.row.bill.billId === "b1"));
  assert.equal(rows.find((r) => r.bill.billId === "b1")!.expected, 5000, "arithmetic unchanged");
  assert.ok(withCert.some((a) => a.row.bill.billId === "b4"), "flagged rows stay");
});

t("certificate tasks: one per vendor and section with tax deducted, matched to records", () => {
  const tasks = certificateTasks(rows, [{ vendorId: "v1", section: "194J", issuedOn: "2026-11-01", certificateNumber: "X1", note: null }]);
  assert.deepEqual(tasks.map((x) => `${x.vendorId}/${x.section}`), ["v1/194J", "v2/194C"], "v3 had nothing deducted");
  const v1 = tasks[0];
  assert.equal(v1.billCount, 2);
  assert.equal(v1.deducted, 5000.01);
  assert.ok(v1.certificate);
  assert.equal(tasks[1].certificate, null);
});

t("certificate and lower-certificate checks", () => {
  assert.ok(isRealDate("2028-02-29"));
  assert.ok(!isRealDate("2027-02-29"));
  assert.ok(!isRealDate("2026-13-01"));
  assert.ok(!isRealDate(null));
  const ok = { issuedOn: "2026-11-01", certificateNumber: "ABCD1234" };
  assert.equal(certificateProblem(ok, "2026-11-02"), null);
  assert.ok(certificateProblem({ ...ok, issuedOn: "2026-11-03" }, "2026-11-02"), "future");
  assert.ok(certificateProblem({ ...ok, certificateNumber: " " }, "2026-11-02"));
  assert.ok(certificateProblem({ ...ok, certificateNumber: "=1+1" }, "2026-11-02"));
  const input = (o: Partial<LowerCertInput> = {}): LowerCertInput => ({ vendorId: "v1", section: "194J", certificateNumber: "C-1", nil: false, rate: 1.5, validFrom: "2026-04-01", validTo: "2027-03-31", maxAmount: null, ...o });
  assert.equal(lowerCertProblem(input()), null);
  assert.equal(lowerCertProblem(input({ nil: true, rate: null, maxAmount: 500000 })), null);
  assert.equal(lowerCertProblem(input({ rate: 0 })), null);
  assert.ok(lowerCertProblem(input({ rate: -1 })));
  assert.ok(lowerCertProblem(input({ rate: 101 })));
  assert.ok(lowerCertProblem(input({ rate: null })));
  assert.ok(lowerCertProblem(input({ validFrom: "2026-02-30" })));
  assert.ok(lowerCertProblem(input({ validFrom: "2027-04-01" })), "from after to");
  assert.equal(lowerCertProblem(input({ validFrom: "2026-04-01", validTo: "2026-04-01" })), null);
  assert.ok(lowerCertProblem(input({ maxAmount: 0 })));
  assert.ok(lowerCertProblem(input({ vendorId: "" })));
  assert.ok(lowerCertProblem(input({ section: "" })));
});

console.log("tds statement tests passed");
