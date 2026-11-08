import "server-only";
import { notifyRoles } from "@/lib/notify";
import { day, inr, plural, short, today } from "@/lib/notify/triggers/format";

/**
 * Finance (FMS) notifications. Each goes only to the finance functions that own the thing, never to everyone:
 *   receivables  — invoices, receipts, credit notes, refunds        (AR, accountant, finance manager, finance exec, admin)
 *   payables     — vendor payments, debit notes, bills              (AP, accountant, finance manager, admin)
 *   approvers    — anything waiting for a decision                  (finance manager, admin)
 *   controllers  — period close / reopen, reconciliation flags      (finance manager, accountant, admin)
 * `exceptUserId` is whoever did it, who doesn't need telling.
 */
const AR = ["fms_admin", "finance_manager", "accountant", "accounts_receivable", "finance_executive"];
const AP = ["fms_admin", "finance_manager", "accountant", "accounts_payable", "finance_executive"];
const APPROVERS = ["fms_admin", "finance_manager"];
const CONTROL = ["fms_admin", "finance_manager", "accountant"];

export const fmsEvents = {
  invoiceCreated: (i: { id: string; invoiceNumber: string; customerName: string; totalAmount: number; currency: string; dueDate?: string | Date | null }, actor: string) =>
    notifyRoles("fms", AR, { type: "fms_invoice_created", title: `Invoice ${i.invoiceNumber} created`, body: `${i.customerName} · ${inr(i.totalAmount, i.currency)}${i.dueDate ? ` · due ${day(i.dueDate)}` : ""}`, link: `/cashflow-ai/invoices/${i.id}` }, actor),
  invoicePaid: (i: { id: string; invoiceNumber: string; customerName: string; totalAmount: number; currency: string }, actor: string) =>
    notifyRoles("fms", AR, { type: "fms_invoice_paid", title: `Invoice ${i.invoiceNumber} paid in full`, body: `${i.customerName} · ${inr(i.totalAmount, i.currency)}`, link: `/cashflow-ai/invoices/${i.id}` }, actor),
  receiptRecorded: (r: { id: string; receiptNumber: string; customerName: string; amount: number; currency: string; method?: string }, actor: string) =>
    notifyRoles("fms", AR, { type: "fms_payment_received", title: `Payment received: ${inr(r.amount, r.currency)}`, body: `${r.customerName} · receipt ${r.receiptNumber}${r.method ? ` · ${r.method}` : ""}`, link: `/cashflow-ai/receipts/${r.id}` }, actor),
  receiptVoided: (r: { id: string; receiptNumber: string; customerName: string; amount: number; currency: string }, actor: string) =>
    notifyRoles("fms", [...AR, ...APPROVERS], { type: "fms_receipt_voided", title: `Receipt ${r.receiptNumber} was voided`, body: `${r.customerName} · ${inr(r.amount, r.currency)} was taken back off the books`, link: `/cashflow-ai/receipts/${r.id}`, priority: "high" }, actor),
  transactionNeedsApproval: (t: { id: string; transactionNumber: string; type: string; amount: number; currency: string; description?: string | null }, actor: string) =>
    notifyRoles("fms", APPROVERS, { type: "fms_approval_needed", title: `Approval needed: ${t.transactionNumber}`, body: `${t.type} · ${inr(t.amount, t.currency)}${t.description ? ` · ${short(t.description, 60)}` : ""}`, link: `/cashflow-ai/transactions/${t.id}`, priority: "high", dedupeKey: `fms-txn-approval:${t.id}` }, actor),
  transactionDecided: async (t: { id: string; transactionNumber: string; amount: number; currency: string; createdBy?: string | null }, decision: "approved" | "rejected" | "failed" | "cancelled", actor: string) => {
    if (!t.createdBy || t.createdBy === actor) return;
    const { notifyUsers } = await import("@/lib/notify");
    await notifyUsers("fms", [t.createdBy], { type: `fms_transaction_${decision}`, title: `Transaction ${t.transactionNumber} ${decision}`, body: inr(t.amount, t.currency), link: `/cashflow-ai/transactions/${t.id}`, priority: decision === "approved" ? "normal" : "high" });
  },
  refundRequested: (r: { id: string; refundNumber: string; customerName?: string | null; amount: number; currency: string }, actor: string) =>
    notifyRoles("fms", APPROVERS, { type: "fms_refund_requested", title: `Refund ${r.refundNumber} needs a decision`, body: `${r.customerName ?? "Customer"} · ${inr(r.amount, r.currency)}`, link: `/cashflow-ai/refunds/${r.id}`, priority: "high", dedupeKey: `fms-refund-req:${r.id}` }, actor),
  refundStatus: (r: { id: string; refundNumber: string; amount: number; currency: string }, status: string, actor: string) =>
    notifyRoles("fms", AR, { type: "fms_refund_status", title: `Refund ${r.refundNumber} is ${status.replace(/_/g, " ")}`, body: inr(r.amount, r.currency), link: `/cashflow-ai/refunds/${r.id}` }, actor),
  advanceRequested: (a: { id: string; advanceNumber: string; employeeName?: string | null; amount: number; currency?: string }, actor: string) =>
    notifyRoles("fms", APPROVERS, { type: "fms_advance_requested", title: `Advance ${a.advanceNumber} needs approval`, body: `${a.employeeName ?? "Employee"} · ${inr(a.amount, a.currency)}`, link: `/cashflow-ai/advances/${a.id}`, priority: "high", dedupeKey: `fms-adv-req:${a.id}` }, actor),
  advanceStatus: (a: { id: string; advanceNumber: string; amount: number; currency?: string }, status: string, actor: string) =>
    notifyRoles("fms", [...APPROVERS, "accounts_payable"], { type: "fms_advance_status", title: `Advance ${a.advanceNumber} ${status.replace(/_/g, " ")}`, body: inr(a.amount, a.currency), link: `/cashflow-ai/advances/${a.id}` }, actor),
  creditNote: (n: { id: string; creditNoteNumber: string; amount: number; currency?: string; invoiceNumber?: string | null }, what: "issued" | "cancelled", actor: string) =>
    notifyRoles("fms", AR, { type: `fms_credit_note_${what}`, title: `Credit note ${n.creditNoteNumber} ${what}`, body: `${inr(n.amount, n.currency)}${n.invoiceNumber ? ` against ${n.invoiceNumber}` : ""}`, link: `/cashflow-ai/credit-notes/${n.id}` }, actor),
  debitNote: (n: { id: string; debitNoteNumber: string; amount: number; currency?: string }, what: "issued" | "cancelled", actor: string) =>
    notifyRoles("fms", AP, { type: `fms_debit_note_${what}`, title: `Debit note ${n.debitNoteNumber} ${what}`, body: inr(n.amount, n.currency), link: `/cashflow-ai/debit-notes/${n.id}` }, actor),
  vendorPayment: (p: { id?: string; vendorName?: string | null; amount: number; currency?: string; reference?: string | null }, what: "recorded" | "processed", actor: string) =>
    notifyRoles("fms", AP, { type: `fms_vendor_payment_${what}`, title: `Vendor payment ${what}: ${inr(p.amount, p.currency)}`, body: `${p.vendorName ?? "Vendor"}${p.reference ? ` · ${p.reference}` : ""}`, link: "/cashflow-ai/vendor-payments" }, actor),
  periodChanged: (p: { id: string; label: string }, what: "closed" | "reopened", actor: string) =>
    notifyRoles("fms", [...CONTROL], { type: `fms_period_${what}`, title: `Fiscal period ${p.label} ${what}`, body: what === "closed" ? "Postings dated in this period are now blocked." : "Postings dated in this period are allowed again.", link: "/cashflow-ai/settings/fiscal-periods", priority: "high" }, actor),
  statementLineFlagged: (l: { id: string; description?: string | null; amount?: number }, actor: string) =>
    notifyRoles("fms", CONTROL, { type: "fms_reconciliation_flag", title: "A bank statement line was flagged", body: `${short(l.description, 80)}${l.amount ? ` · ${inr(l.amount)}` : ""}`, link: "/cashflow-ai/bank-reconciliation", dedupeKey: `fms-flag:${l.id}` }, actor),
  fundTransfer: (t: { id?: string; transferNumber: string; amount: number; currency?: string }, actor: string) =>
    notifyRoles("fms", CONTROL, { type: "fms_fund_transfer", title: `Fund transfer ${t.transferNumber}: ${inr(t.amount, t.currency)}`, body: "Money moved between your accounts.", link: "/cashflow-ai/transfers" }, actor),
  assetDisposed: (d: { disposalNumber: string; assetName?: string | null }, actor: string) =>
    notifyRoles("fms", CONTROL, { type: "fms_asset_disposed", title: `Asset disposal ${d.disposalNumber} recorded`, body: short(d.assetName, 80), link: "/cashflow-ai/asset-disposals" }, actor),
  /** Daily: invoices past due, and invoices falling due in the next 3 days. */
  receivablesDigest: async (overdue: { count: number; amount: number; oldest?: string | null }, dueSoon: { count: number; amount: number }) => {
    if (overdue.count > 0) await notifyRoles("fms", AR, { type: "fms_invoices_overdue", title: `${plural(overdue.count, "invoice")} overdue`, body: `${inr(overdue.amount)} is past its due date${overdue.oldest ? ` — oldest: ${overdue.oldest}` : ""}.`, link: "/cashflow-ai/invoices?status=overdue", priority: "high", dedupeKey: `fms-overdue:${today()}` });
    if (dueSoon.count > 0) await notifyRoles("fms", AR, { type: "fms_invoices_due_soon", title: `${plural(dueSoon.count, "invoice")} due in the next 3 days`, body: `${inr(dueSoon.amount)} expected.`, link: "/cashflow-ai/invoices", dedupeKey: `fms-due-soon:${today()}` });
  },
  /** Daily: filings past their date and not marked filed, and filings falling due within 7 days. Only filings with a date can be reminded. */
  filingsDigest: async (overdue: { count: number; names: string[] }, dueSoon: { count: number; names: string[] }) => {
    if (overdue.count > 0) await notifyRoles("fms", CONTROL, { type: "fms_filings_overdue", title: `${plural(overdue.count, "filing")} overdue`, body: `${overdue.names.slice(0, 3).join(", ")}${overdue.count > 3 ? ` and ${overdue.count - 3} more` : ""} — past the due date and not marked filed.`, link: "/cashflow-ai/compliance/calendar", priority: "high", dedupeKey: `fms-filings-overdue:${today()}` });
    if (dueSoon.count > 0) await notifyRoles("fms", CONTROL, { type: "fms_filings_due_soon", title: `${plural(dueSoon.count, "filing")} due within 7 days`, body: `${dueSoon.names.slice(0, 3).join(", ")}${dueSoon.count > 3 ? ` and ${dueSoon.count - 3} more` : ""}.`, link: "/cashflow-ai/compliance/calendar", dedupeKey: `fms-filings-due-soon:${today()}` });
  },
  /** Daily: pieces of work from "My work" that are overdue, and those due today. One of each per day at most. */
  workDigest: async (counts: { overdue: number; dueToday: number; overdueTitles: string[]; dueTodayTitles: string[]; day: string }) => {
    const names = (t: string[]) => { const u = [...new Set(t)]; return `${u.slice(0, 3).join(", ")}${u.length > 3 ? " and more" : ""}`; };
    const over = names(counts.overdueTitles);
    const due = names(counts.dueTodayTitles);
    if (counts.overdue > 0) await notifyRoles("fms", CONTROL, { type: "fms_work_overdue", title: `${plural(counts.overdue, "piece")} of work overdue`, body: over ? `${over} — open My work to catch up.` : "Open My work to catch up.", link: "/cashflow-ai/work", priority: "high", dedupeKey: `fms-work-overdue:${counts.day}` });
    if (counts.dueToday > 0) await notifyRoles("fms", CONTROL, { type: "fms_work_due_today", title: `${plural(counts.dueToday, "piece")} of work due today`, body: due ? `${due}.` : "Open My work.", link: "/cashflow-ai/work", dedupeKey: `fms-work-due-today:${counts.day}` });
  },
  payablesDigest: async (overdue: { count: number; amount: number }) => {
    if (overdue.count > 0) await notifyRoles("fms", AP, { type: "fms_bills_overdue", title: `${plural(overdue.count, "vendor bill")} overdue`, body: `${inr(overdue.amount)} is past its due date.`, link: "/cashflow-ai/payables", priority: "high", dedupeKey: `fms-bills-overdue:${today()}` });
  },
};
