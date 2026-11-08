import "server-only";
import { PDF_BY_KEY } from "@/lib/pdf/catalog";
import { renderSaasInvoicePdf } from "@/components/platform/billing/SaasInvoicePdf";
import { renderTransactionReceiptPdf, type ReceiptData } from "@/components/platform/billing/TransactionReceiptPdf";
import { renderInvoicePdf as renderFmsInvoicePdf } from "@/components/products/cashflow-ai/InvoicePdf";
import { renderReceiptPdf as renderFmsReceiptPdf } from "@/components/products/cashflow-ai/ReceiptPdf";
import { renderPublicReceiptPdf } from "@/components/products/cashflow-ai/PaymentReceiptPdf";
import { renderFmsReportPdf } from "@/components/products/cashflow-ai/reports/FmsReportPdf";
import { renderCertificatePdf as renderTmsCertificatePdf } from "@/components/products/cohort-ai/CertificatePdf";
import { renderInvoicePdf as renderTmsInvoicePdf } from "@/components/products/cohort-ai/InvoicePdf";
import { renderReportPdf as renderTmsReportPdf } from "@/components/products/cohort-ai/ReportPdf";
import { renderOtsCertificatePdf } from "@/components/products/evaliq/CertificatePdf";
import { renderItemInvoicePdf, renderItemReceiptPdf } from "@/components/products/spendiq/ItemInvoiceReceiptPdf";
import { renderPaymentReceiptPdf } from "@/components/products/spendiq/PaymentReceiptPdf";
import { renderPurchaseOrderPdf } from "@/components/products/spendiq/PurchaseOrderPdf";
import { renderReportPdf as renderPrmsReportPdf } from "@/components/products/spendiq/ReportPdf";
import { renderProjectInvoicePdf, renderProjectReceiptPdf } from "@/components/products/sprintos/ProjectBillingPdf";
import { renderProjectReportPdf } from "@/components/products/sprintos/reports/ProjectReportPdf";
import { renderPayslipPdf } from "@/components/products/talentos/PayslipPdfDocument";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import type { SaasInvoice } from "@/lib/platform/billing/invoices";
import type { Invoice as FmsInvoice } from "@/lib/products/cashflow-ai/invoices";
import type { Receipt as FmsReceipt } from "@/lib/products/cashflow-ai/receipts";
import type { PurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import type { Payment } from "@/lib/products/spendiq/payments";
import type { Invoice as PrmsInvoice } from "@/lib/products/spendiq/invoices";
import type { Report as PrmsReport } from "@/lib/products/spendiq/reports";
import type { ProjectReport } from "@/lib/products/sprintos/reports";
import type { PayslipPdfData } from "@/lib/products/talentos/payslip-pdf";

/**
 * A sample of every PDF, for the Documents & PDFs page. Each is made by the real renderer, so it carries the company's own letterhead
 * (name, logo, address, theme colours) and shows exactly how its documents look; only the figures and names are made up. No real record is
 * read, so a preview can never show another person's data.
 */

const now = new Date();
const iso = (d = now) => d.toISOString().slice(0, 10);
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);
const audit = { createdAt: now, updatedAt: now, createdBy: "sample", updatedBy: "sample", deletedAt: null };

function saasInvoice(credit: boolean): SaasInvoice {
  const party = (name: string) => ({ name, legalName: name, address: "12 Sample Street, Bengaluru, Karnataka 560001", gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", state: "Karnataka", stateCode: "29", email: "billing@example.com", phone: "+91 98765 43210" });
  return {
    _id: "sample", kind: credit ? "credit_note" : "invoice", companyId: "sample", number: credit ? "SAMPLE-CN-0001" : "SAMPLE-INV-0001", financialYear: "2026-27", status: credit ? "issued" : "paid", paymentRef: "pay_SAMPLE", refundRef: credit ? "rfnd_SAMPLE" : null,
    planId: "business", planName: "Business", interval: "monthly", periodStart: now, periodEnd: day(30), couponId: null, currency: "INR", seller: party("Sample Seller Pvt Ltd"), buyer: party("Sample Buyer Pvt Ltd"),
    placeOfSupply: { code: "29", name: "Karnataka" }, supplyType: "intra", taxRatePercent: 18, sac: "998314", pricesIncludeTax: false,
    items: [{ kind: "plan", refId: "business", description: "Business plan (monthly)", sac: "998314", quantity: 1, amount: credit ? -199900 : 199900, taxable: credit ? -199900 : 199900 }],
    taxable: credit ? -199900 : 199900, cgst: credit ? -17991 : 17991, sgst: credit ? -17991 : 17991, igst: 0, taxTotal: credit ? -35982 : 35982, total: credit ? -235882 : 235882,
    credited: { taxable: 0, cgst: 0, sgst: 0, igst: 0, taxTotal: 0, total: 0 } as never, original: credit ? { id: "sample", number: "SAMPLE-INV-0001", issuedAt: now } : null, reason: credit ? "Sample refund" : null,
    footerNote: "This is a computer-generated sample.", terms: "Payment is due on receipt.", issuedAt: now, paidAt: credit ? null : now, voidedAt: null, emailedAt: null, createdAt: now, createdBy: "sample",
  } as unknown as SaasInvoice;
}

const fmsInvoice = (): FmsInvoice =>
  ({
    ...audit, _id: "sample", invoiceNumber: "SAMPLE-INV-0001", customerId: "sample", customerName: "Sample Customer Pvt Ltd", projectId: null, invoiceDate: iso(), dueDate: iso(day(15)),
    items: [
      { description: "Website design", quantity: 1, unitPrice: 45000, taxRate: 18, lineTotal: 45000, taxAmount: 8100 },
      { description: "Monthly maintenance", quantity: 3, unitPrice: 5000, taxRate: 18, lineTotal: 15000, taxAmount: 2700 },
    ],
    discount: 0, subtotal: 60000, taxAmount: 10800, totalAmount: 70800, amountPaid: 20000, amountCredited: 0, currency: "INR", paymentTerms: "Net 15", poNumber: "PO-SAMPLE-17", status: "partially_paid", notes: "Thank you for your business.",
  }) as unknown as FmsInvoice;

const fmsReceipt = (): FmsReceipt =>
  ({
    ...audit, _id: "sample", receiptNumber: "SAMPLE-RCT-0001", customerId: "sample", customerName: "Sample Customer Pvt Ltd", receiptDate: now, amount: 20000, method: "bank_transfer", transactionReference: "UTR-SAMPLE-0001",
    allocations: [{ invoiceId: "sample", invoiceNumber: "SAMPLE-INV-0001", amount: 20000 }], advanceAmount: 0, currency: "INR", status: "completed", transactionId: null, notes: null,
  }) as unknown as FmsReceipt;

const tableReport = (title: string) => ({
  title,
  meta: [["Period", "Sample period"], ["Generated", iso()]] as [string, string][],
  columns: [{ header: "Name", key: "name", width: 28 }, { header: "Details", key: "detail", width: 30 }, { header: "Amount", key: "amount", width: 14, numFmt: "#,##0" }],
  rows: [1, 2, 3, 4, 5].map((n) => ({ name: `Sample row ${n}`, detail: "Example details", amount: n * 12500 })),
});

function sampleOf(key: string, variant: string, company: Awaited<ReturnType<typeof getPrmsSettings>>["company"]): Promise<Buffer> {
  const label = PDF_BY_KEY.get(key)?.variants?.find((v) => v.key === variant)?.label ?? "Sample report";
  switch (key) {
    case "saas_invoice":
      return renderSaasInvoicePdf(saasInvoice(variant === "credit_note"));
    case "transaction_receipt":
      return renderTransactionReceiptPdf({ id: "sample", type: "payment", status: "success", amount: 235882, currency: "INR", at: now.toISOString(), description: "Business plan (monthly)", method: "UPI", reference: "pay_SAMPLE", refundReference: null, receiptNumber: "SAMPLE-RCPT-0001", invoiceId: null, invoiceNumber: "SAMPLE-INV-0001", reason: null, payer: { name: "Sample Buyer Pvt Ltd", email: "billing@example.com", gstin: "29ABCDE1234F1Z5" }, planName: "Business", interval: "monthly" } as ReceiptData);
    case "fms_invoice":
    case "portal_invoice":
      return renderFmsInvoicePdf(fmsInvoice());
    case "fms_payment_receipt":
      return renderPublicReceiptPdf({ number: "REC-2026-0042", paymentNumber: "PAY-2026-0042", paidAt: "2026-04-15T10:42:00.000Z", amount: 25000, currency: "INR", customerName: "Rahul Sharma", customerEmail: "rahul@example.com", title: "AI Batch Course Fee", method: "UPI", gatewayPaymentId: "pay_Qx1234567890ab", utr: "412345678901" });
    case "fms_receipt":
      return renderFmsReceiptPdf(fmsReceipt());
    case "fms_report":
      return renderFmsReportPdf({ title: label, subtitle: "Sample period", currency: "INR", sections: [{ heading: "Section one", rows: [{ label: "Sample line A", value: 120000 }, { label: "Sample line B", value: 80000 }] }, { heading: "Section two", rows: [{ label: "Sample line C", value: 45000 }] }], total: { label: "Total", value: 245000 } });
    case "tms_invoice":
      return renderTmsInvoicePdf({ invoiceNumber: "SAMPLE-FEE-0001", paidOn: iso(), method: "UPI", transactionId: "TXN-SAMPLE-0001", amount: 15000, currency: "INR", totalFees: 45000, discount: 2000, paidToDate: 30000, pending: 13000, studentName: "Sample Student", studentCode: "STU-0001", programName: "Sample Programme", batchName: "Batch A", institute: { name: company.name || "Your institute", addressLine: company.addressLine, city: company.city, email: company.email, phone: company.phone } });
    case "tms_certificate":
      return renderTmsCertificatePdf({ certificateNumber: "SAMPLE-CERT-0001", verificationCode: "SAMPLE-CODE", verifyUrl: "https://example.com/verify/SAMPLE-CODE", typeLabel: "Certificate of Completion", studentName: "Sample Student", programName: "Sample Programme", batchName: "Batch A", title: null, issuedOn: iso(), grade: "A", institute: { name: company.name || "Your institute", addressLine: company.addressLine, city: company.city, signatoryName: company.signatoryName ?? "Sample Signatory", signatoryTitle: company.signatoryTitle ?? "Director" } });
    case "tms_report":
      return renderTmsReportPdf(tableReport(label));
    case "ots_certificate":
      return renderOtsCertificatePdf({ certificateNumber: "SAMPLE-CERT-0001", verificationCode: "SAMPLE-CODE", verifyUrl: "https://example.com/verify/SAMPLE-CODE", candidateName: "Sample Candidate", testName: "Sample Aptitude Test", title: "Certificate of Achievement", score: 42, totalMarks: 50, percentage: 84, issuedOn: now, validUntil: day(365), organization: company.name || "Your company", signatoryName: company.signatoryName ?? "Sample Signatory", signatoryTitle: company.signatoryTitle ?? "Director" });
    case "prms_item": {
      const item = { id: "sample", code: "EXP-SAMPLE-0001", type: "expense" as const, title: "Sample team lunch", vendorName: "Sample Vendor", requesterName: "Sample Employee", category: "Meals", date: iso(), amount: 5900, currency: "INR", status: "approved", taxAmount: 900, subtotal: 5000, paymentMethod: "UPI", transactionRef: "UTR-SAMPLE-0001", lineItems: [{ description: "Lunch for 10", quantity: 10, unitPrice: 500, total: 5000 }], notes: "Sample item." };
      return variant === "receipt" ? renderItemReceiptPdf(item, company) : renderItemInvoicePdf(item, company);
    }
    case "prms_payment":
      return renderPaymentReceiptPdf(
        { ...audit, _id: "sample", paymentCode: "PAY-SAMPLE-0001", invoiceId: "sample", invoiceNumber: "BILL-SAMPLE-0001", vendorId: "sample", vendorName: "Sample Vendor", amount: 47200, paymentDate: now, method: "bank_transfer", transactionReference: "UTR-SAMPLE-0001", tdsDeducted: 800, status: "processed", notes: null } as unknown as Payment,
        { ...audit, _id: "sample", invoiceNumber: "BILL-SAMPLE-0001", vendorInvoiceNumber: "VND-17", vendorId: "sample", vendorName: "Sample Vendor", poId: null, poNumber: "PO-SAMPLE-0001", invoiceDate: iso(day(-10)), dueDate: iso(day(5)), subtotal: 40000, gstAmount: 7200, tdsRate: 2, tdsAmount: 800, totalAmount: 47200, netPayable: 46400, amountPaid: 47200, currency: "INR", status: "paid", storageKey: null, filename: null, poMatched: true, grnMatched: true, notes: null } as unknown as PrmsInvoice,
        company,
      );
    case "prms_po":
      return renderPurchaseOrderPdf(
        { ...audit, _id: "sample", poNumber: "PO-SAMPLE-0001", vendorId: "sample", vendorName: "Sample Vendor", requisitionId: null, rfqId: null, departmentId: null, departmentName: "Operations", projectId: null, projectName: null, items: [{ description: "Office chairs", hsn: "9401", quantity: 10, uom: "pcs", unitPrice: 4500, gstRate: 18, lineTotal: 45000, gstAmount: 8100, receivedQty: 0 }], subtotal: 45000, discount: 0, taxableAmount: 45000, gstAmount: 8100, totalAmount: 53100, currency: "INR", deliveryAddress: "12 Sample Street, Bengaluru", deliveryDate: iso(day(14)), paymentTerms: "Net 30", notes: "Deliver to the front desk.", status: "issued", issuedAt: now } as unknown as PurchaseOrder,
        company,
      );
    case "prms_report":
      return renderPrmsReportPdf({ ...tableReport(label), type: variant as PrmsReport["type"] } as unknown as PrmsReport);
    case "pms_billing": {
      const details = { id: "sample", projectCode: "PRJ-SAMPLE", projectName: "Sample website build", clientName: "Sample Client Pvt Ltd", clientEmail: "client@example.com", billingModel: "milestone" as const, totalBudget: 120000, currency: "INR", status: "in_progress", date: iso(), milestones: [{ title: "Design", amount: 40000, status: "completed" }, { title: "Development", amount: 60000, status: "in_progress" }, { title: "Launch", amount: 20000, status: "pending" }], notes: "Sample project." };
      return variant === "receipt" ? renderProjectReceiptPdf(details, company) : renderProjectInvoicePdf(details, company);
    }
    case "pms_report":
      return renderProjectReportPdf({
        generatedAt: now.toISOString(), range: {}, summary: { projectCode: "PRJ-SAMPLE", name: "Sample website build", client: "Sample Client Pvt Ltd", manager: "Sample Manager", status: "in_progress", statusLabel: "In progress", priority: "medium", startDate: iso(day(-30)), endDate: iso(day(30)), progressPercent: 55, currency: "INR" },
        financials: { projectId: "sample", projectCode: "PRJ-SAMPLE", projectName: "Sample website build", currency: "INR", contractValue: 120000, estimatedBudget: 90000, estimatedHours: 300, avgBillRate: 400, avgCostRate: 250, estimatedCost: 75000, actualHours: 160, costedHours: 160, billableHours: 150, nonBillableHours: 10, resourceCost: 40000, otherCosts: 2000, actualCost: 42000, revenue: 60000, profit: 18000, loss: 0, profitMargin: 30, remainingBudget: 48000, remainingHours: 140, costVariance: 33000 },
        taskProgress: [{ status: "done", label: "Done", count: 12 }, { status: "in_progress", label: "In progress", count: 6 }, { status: "todo", label: "To do", count: 9 }], totalTasks: 27, doneTasks: 12,
        contributions: [{ employeeId: "sample", name: "Sample Developer", role: "Developer", hours: 90, billableHours: 85, costRate: 250, billRate: 400, cost: 22500, revenue: 34000 }, { employeeId: "sample-2", name: "Sample Designer", role: "Designer", hours: 70, billableHours: 65, costRate: 250, billRate: 400, cost: 17500, revenue: 26000 }],
      } as unknown as ProjectReport);
    case "hrms_payslip":
      return renderPayslipPdf(payslip());
    default:
      return Promise.reject(new Error("no sample"));
  }
}

function payslip(): PayslipPdfData {
  const lines = (names: [string, number][]) => names.map(([name, amount]) => ({ name, amount, ytd: amount * 7 }));
  return {
    payslipId: "sample", month: iso().slice(0, 7), monthLabel: now.toLocaleString("en-IN", { month: "long", year: "numeric" }), runStatus: "paid", isProvisional: false,
    company: { name: "", legalName: "", address: "", email: "", phone: "", website: "", registrations: [], signatoryName: "Sample Signatory", signatoryDesignation: "HR Manager", note: "This is a computer-generated sample payslip." },
    employeeId: "sample",
    employee: { name: "Sample Employee", code: "EMP-0001", designation: "Software Engineer", department: "Engineering", team: "Platform", location: "Bengaluru", employmentType: "Full-time", gender: "—", dateOfBirth: "1995-04-12", joiningDate: "2022-06-01", pan: "ABCDE1234F", uan: "100000000000", pfNumber: "KN/BLR/0000000", esiNumber: "—" },
    period: { workingDays: 26, lopDays: 0, daysPaid: 26, payDate: iso(), monthDays: 30, notes: [] }, tax: { regime: "new", fy: "2026-27", taxableIncome: 765000, yearTax: 33800, thisMonth: 2817, deductedSoFar: 16902 },
    earnings: lines([["Basic", 40000], ["House rent allowance", 16000], ["Special allowance", 14000]]), deductions: lines([["Provident fund", 4800], ["Professional tax", 200]]),
    employerContributions: [{ name: "Employer provident fund", amount: 4800 }], grossPay: 70000, totalDeductions: 5000, netPay: 65000, employerCost: 74800, ytd: { gross: 490000, deductions: 35000, net: 455000, monthsCount: 7 },
    netInWords: "Sixty-five thousand rupees only", payment: { mode: "Bank transfer", status: "paid", bankName: "Sample Bank", accountMasked: "XXXX1234", ifsc: "SAMP0000001", utr: "UTR-SAMPLE-0001", paidOn: iso() }, generatedAt: now.toISOString(),
  } as unknown as PayslipPdfData;
}

/** The sample PDF for `key` (and `variant`, for types that have several); null when that type has no server-made sample. */
export async function renderSamplePdf(key: string, variant?: string | null): Promise<Buffer | null> {
  const type = PDF_BY_KEY.get(key);
  if (!type || type.status !== "active") return null;
  const v = type.variants?.some((x) => x.key === variant) ? (variant as string) : (type.variants?.[0]?.key ?? "");
  const { company } = await getPrmsSettings();
  return sampleOf(key, v, company);
}
