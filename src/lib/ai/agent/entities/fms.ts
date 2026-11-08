import "server-only";
import { createInvoice, updateInvoice, deleteInvoice, getInvoice, setInvoiceStatus, type InvoiceWriteData } from "@/lib/products/cashflow-ai/invoices";
import { recordReceipt, voidReceipt, type RecordReceiptData } from "@/lib/products/cashflow-ai/receipts";
import { createTransaction, updateTransaction, deleteTransaction, changeTransactionStatus, getTransaction, type TransactionWriteData } from "@/lib/products/cashflow-ai/transactions";
import { createCreditNote, issueCreditNote, cancelCreditNote, getCreditNote } from "@/lib/products/cashflow-ai/credit-notes";
import { createDebitNote, issueDebitNote, cancelDebitNote, getDebitNote } from "@/lib/products/cashflow-ai/debit-notes";
import { requestRefund, changeRefundStatus, getRefund } from "@/lib/products/cashflow-ai/refunds";
import { requestAdvance, changeAdvanceStatus, recordRepayment, getAdvance } from "@/lib/products/cashflow-ai/employee-advances";
import { recordVendorPayment } from "@/lib/products/cashflow-ai/vendor-payments";
import { recordTransfer } from "@/lib/products/cashflow-ai/fund-transfers";
import { createBankAccount, updateBankAccount, deleteBankAccount, getBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { createCashAccount, updateCashAccount, deleteCashAccount, getCashAccount } from "@/lib/products/cashflow-ai/cash-accounts";
import { createAccount, updateAccount, deleteAccount, getAccount, seedDefaultAccounts } from "@/lib/products/cashflow-ai/accounts";
import { createFiscalPeriod, closePeriod, reopenPeriod } from "@/lib/products/cashflow-ai/fiscal-periods";
import { getTaxConfig, updateTaxConfig } from "@/lib/products/cashflow-ai/tax-config";
import { addExchangeRate, deleteExchangeRate } from "@/lib/products/cashflow-ai/exchange-rates";
import { recordAssetExpense } from "@/lib/products/cashflow-ai/asset-expenses";
import { disposeAsset } from "@/lib/products/cashflow-ai/asset-disposals";
import { recordCashCount } from "@/lib/products/cashflow-ai/cash-reconciliation";
import { createStatementLine, matchStatementLine, flagStatementLine } from "@/lib/products/cashflow-ai/bank-reconciliation";
import { getFmsDashboardStats } from "@/lib/products/cashflow-ai/dashboard";
import { getProfitAndLoss } from "@/lib/products/cashflow-ai/reports/profit-and-loss";
import { getBalanceSheet } from "@/lib/products/cashflow-ai/reports/balance-sheet";
import { getTrialBalance } from "@/lib/products/cashflow-ai/reports/trial-balance";
import { getCashFlow } from "@/lib/products/cashflow-ai/reports/cash-flow";
import { getTaxSummary, currentTaxPayable } from "@/lib/products/cashflow-ai/reports/tax";
import { getBudgetVsActual } from "@/lib/products/cashflow-ai/reports/budget-vs-actual";
import { projectProfitabilityReport } from "@/lib/products/cashflow-ai/reports/project-financials";
import { generalLedgerForAccount } from "@/lib/products/cashflow-ai/reports/general-ledger";
import { receivablesAging, customerWiseReceivables, totalOutstandingInvoices, overdueInvoices } from "@/lib/products/cashflow-ai/receivables";
import { payablesAging, vendorWisePayables, totalOutstandingPayable, overdueBills } from "@/lib/products/cashflow-ai/payables";
import { listPendingApprovals } from "@/lib/products/cashflow-ai/approvals";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getClient } from "@/lib/products/sprintos/clients";
import {
  isValidTransactionType, isValidPaymentMethod, isValidSourceModule, isValidTransactionStatus, isValidFundAccountType, isValidInvoiceStatus, isValidRefundStatus, isValidAdvanceStatus, isValidAccountType, isValidFundAccountStatus, isValidAssetExpenseCategory, isValidStatementLineStatus,
  TRANSACTION_TYPES, TRANSACTION_STATUSES, PAYMENT_METHODS, SOURCE_MODULES, REFUND_STATUSES, ADVANCE_STATUSES, ACCOUNT_TYPES, FUND_ACCOUNT_TYPES, FUND_ACCOUNT_STATUSES, ASSET_EXPENSE_CATEGORIES, SUPPORTED_CURRENCIES, DEFAULT_CURRENCY,
} from "@/lib/products/cashflow-ai/constants";
import { canManageTransactions, canApproveTransactions, canManageAccounts, canManageBanking, canManageFiscalPeriods, canManageTaxConfig, canReconcile, canViewReports, canViewAuditLog } from "@/lib/fms-roles";
import { fail, str } from "@/lib/ai/agent/entities/helpers";
import { hsnSacError } from "@/lib/products/cashflow-ai/gst/hsn";
import type { ActionDef, AgentUser, EntityDef, FieldDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * Finance (FMS) for the agent. Customers are the PMS clients and vendors come from procurement, exactly as in the product. Every money
 * movement goes through the product's own functions (balances, ledger postings, period locks, approvals) and is written to the FMS audit log.
 */

const MONEY_MOVES_IN_THE_APP = "Money is never sent from the assistant. Open the payment in the app and confirm it there with your confirmation code.";
const soft = { deletedAt: null };
const vals = (a: readonly { value: string }[]) => a.map((x) => x.value);
const TXN_TYPES = vals(TRANSACTION_TYPES); const TXN_STATUS = vals(TRANSACTION_STATUSES); const METHODS = vals(PAYMENT_METHODS); const SOURCES = vals(SOURCE_MODULES);
const REFUND_STATUS = vals(REFUND_STATUSES); const ADVANCE_STATUS = vals(ADVANCE_STATUSES); const ACCT_TYPES = vals(ACCOUNT_TYPES); const FUND_TYPES = vals(FUND_ACCOUNT_TYPES); const FUND_STATUS = vals(FUND_ACCOUNT_STATUSES);
const ASSET_CATS = ASSET_EXPENSE_CATEGORIES.map((c) => c.value as string);
const CURRENCIES = [...SUPPORTED_CURRENCIES] as string[];
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10));
const date0 = (s: string) => new Date(`${s}T00:00:00`);

const audit = (u: AgentUser, a: Json) => recordAudit({ actorId: u.id, actorEmail: u.email, ...a } as never);
const fundKey = (v: Json): { fundAccountId: string | null; fundAccountType: "bank" | "cash" | null } => {
  const key = str(v.fundAccountKey);
  if (key) {
    const [type, id] = key.split(":");
    if (isValidFundAccountType(type) && id) return { fundAccountId: id, fundAccountType: type as "bank" | "cash" };
  }
  return { fundAccountId: null, fundAccountType: null };
};
const FUND: FieldDef = { key: "fundAccountKey", label: "Paid from / into account, as bank:<id> or cash:<id> (fms.bank_account / fms.cash_account)", type: "string" };
const needMoney = (u: AgentUser) => canManageTransactions(u);

interface RawLine { description?: unknown; quantity?: unknown; unitPrice?: unknown; taxRate?: unknown; hsnSac?: unknown }
function lineItems(v: unknown): { ok: true; items: { description: string; quantity: number; unitPrice: number; taxRate: number; hsnSac: string | null }[] } | { ok: false; error: Json } {
  if (!Array.isArray(v) || !v.length) return { ok: false, error: fail("Add at least one line item: [{description, quantity, unitPrice, taxRate}].") };
  const items = [];
  for (const raw of (v as RawLine[]).slice(0, 50)) {
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    const quantity = Number(raw.quantity);
    const unitPrice = Number(raw.unitPrice);
    const taxRate = raw.taxRate === undefined || raw.taxRate === null ? 0 : Number(raw.taxRate);
    if (!description || !(quantity > 0) || !(unitPrice >= 0) || !Number.isFinite(taxRate) || taxRate < 0) return { ok: false, error: fail("Each line item needs a description, a quantity above 0, a unit price and an optional tax rate (percent).") };
    const hsnSac = typeof raw.hsnSac === "string" ? raw.hsnSac.trim() : "";
    const hsnErr = hsnSacError(hsnSac);
    if (hsnErr) return { ok: false, error: fail(hsnErr) };
    items.push({ description: description.slice(0, 300), quantity, unitPrice, taxRate, hsnSac: hsnSac || null });
  }
  return { ok: true, items };
}

const invoiceData = async (v: Json, current?: Json): Promise<{ ok: true; data: InvoiceWriteData } | { ok: false; error: Json }> => {
  const merged = { ...(current ?? {}), ...v };
  const customer = await getClient(String(merged.customerId ?? ""));
  if (!customer) return { ok: false, error: fail("Customer not found. Look it up with find_records on pms.client.") };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(merged.invoiceDate ?? ""))) return { ok: false, error: fail("Enter a valid invoice date (YYYY-MM-DD).") };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(merged.dueDate ?? ""))) return { ok: false, error: fail("Enter a valid due date (YYYY-MM-DD).") };
  const li = lineItems(merged.items);
  if (!li.ok) return li;
  return {
    ok: true,
    data: { customerId: customer._id, customerName: customer.companyName, projectId: str(merged.projectId), invoiceDate: String(merged.invoiceDate), dueDate: String(merged.dueDate), items: li.items, discount: Number(merged.discount) || 0, currency: str(merged.currency) ?? customer.billing?.currency ?? DEFAULT_CURRENCY, paymentTerms: str(merged.paymentTerms), poNumber: str(merged.poNumber), notes: str(merged.notes) },
  };
};

const txnData = (v: Json, current?: Json): { ok: true; data: TransactionWriteData } | { ok: false; error: Json } => {
  const m = { ...(current ?? {}), ...v };
  const type = String(m.type ?? "");
  if (!isValidTransactionType(type)) return { ok: false, error: fail("Select a transaction type.", { allowed: TXN_TYPES }) };
  const amount = Number(m.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: fail("Enter a valid amount.") };
  const method = String(m.paymentMethod ?? "bank_transfer");
  if (!isValidPaymentMethod(method)) return { ok: false, error: fail("Unknown payment method.", { allowed: METHODS }) };
  const source = String(m.sourceModule ?? "fms");
  if (!isValidSourceModule(source)) return { ok: false, error: fail("Unknown source module.", { allowed: SOURCES }) };
  const td = String(m.transactionDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(td)) return { ok: false, error: fail("Enter a valid transaction date (YYYY-MM-DD).") };
  const pd = String(m.postingDate ?? td);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pd)) return { ok: false, error: fail("Enter a valid posting date (YYYY-MM-DD).") };
  const f = fundKey(m);
  return {
    ok: true,
    data: {
      type: type as TransactionWriteData["type"], transactionDate: date0(td), postingDate: date0(pd), amount, currency: String(m.currency ?? DEFAULT_CURRENCY), paymentMethod: method as never, sourceModule: source as never,
      sourceRecordId: str(m.sourceRecordId), customerId: str(m.customerId), vendorId: str(m.vendorId), employeeId: str(m.employeeId), projectId: str(m.projectId), department: str(m.department), accountId: str(m.accountId),
      ...f, taxAmount: Number.isFinite(Number(m.taxAmount)) ? Number(m.taxAmount) : 0, referenceNumber: str(m.referenceNumber), description: str(m.description), attachments: (current?.attachments as never) ?? [],
    },
  };
};
const txnCurrent = (t: Json): Json => ({ ...t, transactionDate: t.transactionDate instanceof Date ? t.transactionDate.toISOString().slice(0, 10) : t.transactionDate, postingDate: t.postingDate instanceof Date ? t.postingDate.toISOString().slice(0, 10) : t.postingDate, fundAccountKey: t.fundAccountId && t.fundAccountType ? `${String(t.fundAccountType)}:${String(t.fundAccountId)}` : undefined });

export const FMS_ENTITIES: EntityDef[] = [
  {
    key: "fms.invoice", panel: "fms", label: "Invoice", description: "Customer invoices (draft → sent → partially_paid → paid / overdue / cancelled / void). Customers are SprintOS clients.", collection: "fms_invoices", idType: "string", baseFilter: soft,
    titleField: "invoiceNumber", search: ["invoiceNumber", "customerName", "poNumber"], read: "staff", write: "staff", allow: canManageTransactions, canDelete: true,
    fields: [
      { key: "customerId", label: "Customer (pms.client id)", type: "ref", ref: "pms.client", required: true, createOnly: true },
      { key: "invoiceDate", label: "Invoice date", type: "dateString", required: true },
      { key: "dueDate", label: "Due date", type: "dateString", required: true },
      { key: "items", label: "Line items: [{description, quantity, unitPrice, taxRate(percent), hsnSac(optional 4/6/8 digit HSN or SAC)}]", type: "json", required: true },
      { key: "discount", label: "Discount amount", type: "number" },
      { key: "currency", label: "Currency", type: "enum", options: CURRENCIES },
      { key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project" },
      { key: "paymentTerms", label: "Payment terms", type: "string" }, { key: "poNumber", label: "PO number", type: "string" }, { key: "notes", label: "Notes", type: "text" },
    ],
    ops: {
      create: async (v, u) => {
        const d = await invoiceData(v);
        if (!d.ok) return d.error;
        const created = await createInvoice(d.data, u.id);
        await audit(u, { action: "create", entity: "invoice", entityId: created._id, entityLabel: created.invoiceNumber });
        return { ok: true, id: created._id, record: created };
      },
      update: async (id, v, u) => {
        const before = await getInvoice(id);
        if (!before) return fail("Invoice not found.");
        const d = await invoiceData(v, { customerId: before.customerId, invoiceDate: before.invoiceDate, dueDate: before.dueDate, items: before.items, discount: before.discount, currency: before.currency, projectId: before.projectId, paymentTerms: before.paymentTerms, poNumber: before.poNumber, notes: before.notes });
        if (!d.ok) return d.error;
        const r = await updateInvoice(id, d.data, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not update the invoice.");
        await audit(u, { action: "update", entity: "invoice", entityId: id, entityLabel: before.invoiceNumber });
        return { ok: true, id, result: "Invoice updated." };
      },
      remove: async (id, u) => {
        const before = await getInvoice(id);
        const r = await deleteInvoice(id, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not delete the invoice.");
        await audit(u, { action: "delete", entity: "invoice", entityId: id, entityLabel: before?.invoiceNumber });
        return { ok: true, id };
      },
    },
  },
  {
    key: "fms.transaction", panel: "fms", label: "Transaction", description: "Income, expense and other money transactions with status (draft → submitted → approved → completed …), amount, parties and account.", collection: "fms_transactions", idType: "string", baseFilter: soft,
    titleField: "referenceNumber", search: ["referenceNumber", "description", "transactionNumber"], read: "staff", write: "staff", allow: canManageTransactions, canDelete: true,
    fields: [
      { key: "type", label: "Type", type: "enum", options: TXN_TYPES, required: true },
      { key: "transactionDate", label: "Transaction date", type: "dateString", required: true },
      { key: "postingDate", label: "Posting date (defaults to transaction date)", type: "dateString" },
      { key: "amount", label: "Amount", type: "number", required: true },
      { key: "currency", label: "Currency", type: "enum", options: CURRENCIES },
      { key: "paymentMethod", label: "Payment method", type: "enum", options: METHODS },
      { key: "sourceModule", label: "Source module", type: "enum", options: SOURCES },
      { key: "customerId", label: "Customer (pms.client id)", type: "ref", ref: "pms.client" }, { key: "vendorId", label: "Vendor (prms.vendor id)", type: "ref", ref: "prms.vendor" },
      { key: "employeeId", label: "Employee (hrms.employee id)", type: "ref", ref: "hrms.employee" }, { key: "projectId", label: "Project (pms.project id)", type: "ref", ref: "pms.project" },
      { key: "department", label: "Department", type: "string" }, { key: "accountId", label: "Ledger account (fms.account id)", type: "ref", ref: "fms.account" }, FUND,
      { key: "taxAmount", label: "Tax amount", type: "number" }, { key: "referenceNumber", label: "Reference number", type: "string" }, { key: "description", label: "Description", type: "text" },
    ],
    ops: {
      create: async (v, u) => {
        const d = txnData(v);
        if (!d.ok) return d.error;
        const t = await createTransaction(d.data, u.id, u.email);
        return { ok: true, id: t._id, record: t };
      },
      update: async (id, v, u) => {
        const cur = await getTransaction(id);
        if (!cur) return fail("Transaction not found.");
        const d = txnData(v, txnCurrent(cur as unknown as Json));
        if (!d.ok) return d.error;
        const r = await updateTransaction(id, d.data, u.id, u.email);
        if (!r) return fail("Transaction not found.");
        if ("ok" in r && r.ok === false) return fail(r.reason);
        return { ok: true, id, result: "Transaction updated." };
      },
      remove: async (id, u) => {
        const r = await deleteTransaction(id, u.id, u.email);
        return r.ok ? { ok: true, id } : fail(r.reason);
      },
    },
  },
  {
    key: "fms.bank_account", panel: "fms", label: "Bank account", description: "Company bank accounts and their balances (account numbers are never shown here).", collection: "fms_bank_accounts", idType: "string", baseFilter: soft, titleField: "accountName", search: ["accountName", "bankName"],
    read: "staff", write: "staff", allow: canManageBanking, canDelete: true, hide: ["accountNumber", "accountNumberEncrypted", "accountNumberLast4"],
    fields: [
      { key: "accountName", label: "Account name", type: "string", required: true }, { key: "bankName", label: "Bank name", type: "string", required: true },
      { key: "accountNumber", label: "Account number", type: "string" }, { key: "ifsc", label: "IFSC", type: "string" }, { key: "branch", label: "Branch", type: "string" },
      { key: "currency", label: "Currency", type: "enum", options: CURRENCIES }, { key: "status", label: "Status", type: "enum", options: FUND_STATUS }, { key: "notes", label: "Notes", type: "text" },
      { key: "openingBalance", label: "Opening balance (at creation only)", type: "number", createOnly: true },
    ],
    ops: {
      create: async (v, u) => {
        const r = await createBankAccount({ accountName: String(v.accountName).trim(), bankName: String(v.bankName).trim(), accountNumber: str(v.accountNumber), ifsc: str(v.ifsc), branch: str(v.branch), currency: str(v.currency) ?? DEFAULT_CURRENCY, status: isValidFundAccountStatus(v.status) ? (v.status as never) : "active", notes: str(v.notes), openingBalance: Number(v.openingBalance) || 0 }, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "create", entity: "bank_account", entityId: r.account._id, entityLabel: r.account.accountName });
        return { ok: true, id: r.account._id, result: "Bank account created." };
      },
      update: async (id, v, u) => {
        const cur = await getBankAccount(id);
        if (!cur) return fail("Bank account not found.");
        const r = await updateBankAccount(id, { accountName: String(v.accountName ?? cur.accountName).trim(), bankName: String(v.bankName ?? cur.bankName).trim(), accountNumber: "accountNumber" in v ? str(v.accountNumber) : null, ifsc: "ifsc" in v ? str(v.ifsc) : cur.ifsc ?? null, branch: "branch" in v ? str(v.branch) : cur.branch ?? null, currency: str(v.currency) ?? cur.currency, status: isValidFundAccountStatus(v.status) ? (v.status as never) : cur.status, notes: "notes" in v ? str(v.notes) : cur.notes ?? null }, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "update", entity: "bank_account", entityId: id, entityLabel: r.account.accountName });
        return { ok: true, id, result: "Bank account updated." };
      },
      remove: async (id, u) => {
        const before = await getBankAccount(id);
        const r = await deleteBankAccount(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "bank_account", entityId: id, entityLabel: before?.accountName });
        return { ok: true, id };
      },
    },
  },
  {
    key: "fms.cash_account", panel: "fms", label: "Cash account", description: "Cash-in-hand accounts (petty cash, tills) and balances.", collection: "fms_cash_accounts", idType: "string", baseFilter: soft, titleField: "accountName", search: ["accountName", "location"],
    read: "staff", write: "staff", allow: canManageBanking, canDelete: true,
    fields: [
      { key: "accountName", label: "Account name", type: "string", required: true }, { key: "location", label: "Location", type: "string" }, { key: "department", label: "Department", type: "string" },
      { key: "currency", label: "Currency", type: "enum", options: CURRENCIES }, { key: "status", label: "Status", type: "enum", options: FUND_STATUS }, { key: "notes", label: "Notes", type: "text" },
      { key: "openingBalance", label: "Opening balance (at creation only)", type: "number", createOnly: true },
    ],
    ops: {
      create: async (v, u) => {
        const c = await createCashAccount({ accountName: String(v.accountName).trim(), location: str(v.location), department: str(v.department), currency: str(v.currency) ?? DEFAULT_CURRENCY, status: isValidFundAccountStatus(v.status) ? (v.status as never) : "active", notes: str(v.notes), openingBalance: Number(v.openingBalance) || 0 }, u.id);
        await audit(u, { action: "create", entity: "cash_account", entityId: c._id, entityLabel: c.accountName });
        return { ok: true, id: c._id, record: c };
      },
      update: async (id, v, u) => {
        const cur = await getCashAccount(id);
        if (!cur) return fail("Cash account not found.");
        const a = await updateCashAccount(id, { accountName: String(v.accountName ?? cur.accountName).trim(), location: "location" in v ? str(v.location) : cur.location ?? null, department: "department" in v ? str(v.department) : cur.department ?? null, currency: str(v.currency) ?? cur.currency, status: isValidFundAccountStatus(v.status) ? (v.status as never) : cur.status, notes: "notes" in v ? str(v.notes) : cur.notes ?? null }, u.id);
        if (!a) return fail("Cash account not found.");
        await audit(u, { action: "update", entity: "cash_account", entityId: id, entityLabel: a.accountName });
        return { ok: true, id, record: a };
      },
      remove: async (id, u) => {
        const before = await getCashAccount(id);
        const r = await deleteCashAccount(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "cash_account", entityId: id, entityLabel: before?.accountName });
        return { ok: true, id };
      },
    },
  },
  {
    key: "fms.account", panel: "fms", label: "Ledger account", description: "Chart of accounts (code, name, type asset/liability/equity/income/expense, parent).", collection: "fms_accounts", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "code"],
    read: "staff", write: "staff", allow: canManageAccounts, canDelete: true,
    fields: [
      { key: "code", label: "Code", type: "string", required: true }, { key: "name", label: "Name", type: "string", required: true },
      { key: "type", label: "Type", type: "enum", options: ACCT_TYPES, required: true }, { key: "parentId", label: "Parent (fms.account id)", type: "ref", ref: "fms.account" },
      { key: "description", label: "Description", type: "text" }, { key: "isActive", label: "Active", type: "boolean" },
    ],
    ops: {
      create: async (v, u) => {
        if (!isValidAccountType(v.type)) return fail("Select an account type.", { allowed: ACCT_TYPES });
        const a = await createAccount({ code: String(v.code).trim(), name: String(v.name).trim(), type: v.type as never, parentId: str(v.parentId), description: str(v.description), isActive: v.isActive !== false }, u.id);
        await audit(u, { action: "create", entity: "account", entityId: a._id, entityLabel: a.code });
        return { ok: true, id: a._id, record: a };
      },
      update: async (id, v, u) => {
        const cur = await getAccount(id);
        if (!cur) return fail("Account not found.");
        const type = v.type ?? cur.type;
        if (!isValidAccountType(type)) return fail("Select an account type.", { allowed: ACCT_TYPES });
        const a = await updateAccount(id, { code: String(v.code ?? cur.code).trim(), name: String(v.name ?? cur.name).trim(), type: type as never, parentId: "parentId" in v ? str(v.parentId) : cur.parentId ?? null, description: "description" in v ? str(v.description) : cur.description ?? null, isActive: "isActive" in v ? v.isActive !== false : cur.isActive }, u.id);
        if (!a) return fail("Account not found.");
        await audit(u, { action: "update", entity: "account", entityId: id, entityLabel: a.code });
        return { ok: true, id, record: a };
      },
      remove: async (id, u) => {
        const r = await deleteAccount(id, u.id);
        if (!r.ok) return fail(r.reason ?? "Could not delete the account.");
        await audit(u, { action: "delete", entity: "account", entityId: id });
        return { ok: true, id };
      },
    },
  },
  { key: "fms.receipt", panel: "fms", label: "Receipt", description: "Payments received from customers, with the invoices each paid.", collection: "fms_receipts", idType: "string", baseFilter: soft, titleField: "receiptNumber", search: ["receiptNumber", "customerName", "transactionReference"], read: "staff" },
  { key: "fms.credit_note", panel: "fms", label: "Credit note", description: "Credit notes issued against customer invoices.", collection: "fms_credit_notes", idType: "string", baseFilter: soft, titleField: "creditNoteNumber", search: ["creditNoteNumber", "invoiceNumber"], read: "staff" },
  { key: "fms.debit_note", panel: "fms", label: "Debit note", description: "Debit notes against vendor bills.", collection: "fms_debit_notes", idType: "string", baseFilter: soft, titleField: "debitNoteNumber", search: ["debitNoteNumber", "billNumber"], read: "staff" },
  { key: "fms.refund", panel: "fms", label: "Refund", description: "Refunds of receipts (requested → approved → completed / failed).", collection: "fms_refunds", idType: "string", baseFilter: soft, titleField: "refundNumber", read: "staff" },
  { key: "fms.reimbursement", panel: "fms", label: "Reimbursement", description: "Employee expense reimbursements paid.", collection: "fms_reimbursements", idType: "string", baseFilter: soft, read: "staff" },
  { key: "fms.employee_advance", panel: "fms", label: "Employee advance", description: "Advances to employees (requested → approved → paid → repaid).", collection: "fms_employee_advances", idType: "string", baseFilter: soft, titleField: "advanceNumber", search: ["advanceNumber", "employeeName"], read: "staff" },
  { key: "fms.fund_transfer", panel: "fms", label: "Fund transfer", description: "Transfers between bank and cash accounts.", collection: "fms_fund_transfers", idType: "string", baseFilter: soft, titleField: "transferNumber", read: "staff" },
  { key: "fms.journal_entry", panel: "fms", label: "Journal entry", description: "Accounting journal entries.", collection: "fms_journal_entries", idType: "string", baseFilter: soft, read: "staff", allowRead: canViewReports },
  { key: "fms.statement_line", panel: "fms", label: "Bank statement line", description: "Bank statement lines for reconciliation (unmatched / matched / needs review).", collection: "fms_bank_statement_lines", idType: "string", baseFilter: soft, read: "staff", allowRead: canReconcile, search: ["description"] },
  { key: "fms.cash_count", panel: "fms", label: "Cash count", description: "Physical cash counts and differences.", collection: "fms_cash_counts", idType: "string", baseFilter: soft, read: "staff", allowRead: canReconcile },
  { key: "fms.fiscal_period", panel: "fms", label: "Fiscal period", description: "Accounting periods (open / closed).", collection: "fms_fiscal_periods", idType: "string", read: "staff" },
  { key: "fms.exchange_rate", panel: "fms", label: "Exchange rate", description: "Currency rates to the base currency.", collection: "fms_exchange_rates", idType: "string", read: "staff" },
  { key: "fms.payment_link", panel: "fms", label: "Payment link", description: "Online payment links sent to customers.", collection: "fms_payment_links", idType: "string", read: "staff" },
  { key: "fms.asset_expense", panel: "fms", label: "Asset expense", description: "Maintenance, insurance and AMC costs of assets.", collection: "fms_asset_expenses", idType: "string", baseFilter: soft, read: "staff" },
  { key: "fms.asset_disposal", panel: "fms", label: "Asset disposal", description: "Assets sold or written off, with gain/loss.", collection: "fms_asset_disposals", idType: "string", baseFilter: soft, read: "staff" },
  { key: "fms.activity", panel: "fms", label: "Audit log", description: "Who changed what in CashFlow.", collection: "fms_activity_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin", allowRead: canViewAuditLog },
];

const ref = (key: string, label: string, entity: string, required = true): FieldDef => ({ key, label, type: "ref", ref: entity, required });

export const FMS_ACTIONS: ActionDef[] = [
  {
    key: "fms.set_invoice_status", panel: "fms", label: "Change an invoice's status", description: "Send it (draft → sent), mark overdue, cancel or void. Paid states come from receipts, not from here.", level: "staff", allow: canManageTransactions,
    params: [ref("invoiceId", "Invoice id", "fms.invoice"), { key: "status", label: "New status", type: "enum", options: ["draft", "sent", "overdue", "cancelled", "void"], required: true }],
    run: async (v, u) => {
      const status = String(v.status);
      if (!isValidInvoiceStatus(status)) return fail("Unknown status.");
      const before = await getInvoice(String(v.invoiceId));
      const r = await setInvoiceStatus(String(v.invoiceId), status, u.id);
      if (!r.ok) return fail(r.reason ?? "Could not change the status.");
      await audit(u, { action: "status_change", entity: "invoice", entityId: String(v.invoiceId), entityLabel: before?.invoiceNumber, summary: `status → ${status}` });
      return { ok: true, id: String(v.invoiceId), result: `Invoice is now ${status}.` };
    },
  },
  {
    key: "fms.record_receipt", panel: "fms", label: "Record a payment received against invoices", description: "Record money received from a customer (cash, cheque, bank transfer) and apply it to their open invoices. A cheque waits as awaiting clearance until it is marked cleared. Cash of ₹2,00,000 or more in a day from one customer is refused.", level: "staff", allow: canManageTransactions,
    params: [ref("customerId", "Customer (pms.client id)", "pms.client"), { key: "receiptDate", label: "Date received", type: "dateString", required: true }, { key: "amount", label: "Amount received", type: "number", required: true }, { key: "method", label: "Method", type: "enum", options: METHODS, required: true }, { key: "allocations", label: "Which invoices it pays: [{invoiceId, amount}]", type: "json" }, { key: "transactionReference", label: "Reference / UTR / cheque no.", type: "string" }, FUND, { key: "notes", label: "Notes", type: "string" }, { key: "chequeNumber", label: "Cheque number (6 digits, for a cheque)", type: "string" }, { key: "chequeDate", label: "Date on the cheque", type: "dateString" }, { key: "chequeBank", label: "Bank the cheque is drawn on", type: "string" }],
    run: async (v, u) => {
      const client = await getClient(String(v.customerId));
      if (!client) return fail("Customer not found.");
      const method = String(v.method);
      if (!isValidPaymentMethod(method)) return fail("Unknown payment method.", { allowed: METHODS });
      const allocations = (Array.isArray(v.allocations) ? (v.allocations as Json[]) : []).map((a) => ({ invoiceId: String(a.invoiceId), amount: Number(a.amount) || 0 })).filter((a) => a.amount > 0);
      const first = allocations[0] ? await getInvoice(allocations[0].invoiceId) : null;
      const data: RecordReceiptData = { customerId: client._id, customerName: client.companyName, receiptDate: String(v.receiptDate), amount: Number(v.amount), method, transactionReference: str(v.transactionReference), allocations, currency: first?.currency ?? client.billing?.currency ?? DEFAULT_CURRENCY, ...fundKey(v), notes: str(v.notes), chequeNumber: str(v.chequeNumber), chequeDate: str(v.chequeDate), chequeBank: str(v.chequeBank) };
      const r = await recordReceipt(data, u.id, u.email);
      if (!r.ok) return fail(r.reason);
      await audit(u, { action: "create", entity: "receipt", entityId: r.receipt._id, entityLabel: r.receipt.receiptNumber });
      return { ok: true, id: r.receipt._id, result: `Receipt ${r.receipt.receiptNumber} recorded.` };
    },
  },
  {
    key: "fms.void_receipt", panel: "fms", label: "Void a receipt", description: "Reverse a recorded receipt (invoice balances go back).", level: "staff", allow: canManageTransactions, destructive: true,
    params: [ref("receiptId", "Receipt id", "fms.receipt")],
    run: async (v, u) => {
      const r = await voidReceipt(String(v.receiptId), u.id);
      if (!r.ok) return fail(r.reason ?? "Could not void that receipt.");
      await audit(u, { action: "reverse", entity: "receipt", entityId: String(v.receiptId) });
      return { ok: true, id: String(v.receiptId), result: "Receipt voided." };
    },
  },
  {
    key: "fms.change_transaction_status", panel: "fms", label: "Move a transaction through its workflow", description: "Submit, approve, reject, schedule, complete, cancel, reverse or reconcile a transaction. Approving and rejecting need approval authority.", level: "staff", allow: needMoney,
    params: [ref("transactionId", "Transaction id", "fms.transaction"), { key: "status", label: "New status", type: "enum", options: TXN_STATUS, required: true }],
    run: async (v, u) => {
      const status = String(v.status);
      if (!isValidTransactionStatus(status)) return fail("Unknown status.", { allowed: TXN_STATUS });
      if ((status === "approved" || status === "rejected") && !canApproveTransactions(u)) return fail("You don't have authority to approve or reject transactions.");
      const r = await changeTransactionStatus(String(v.transactionId), status, u.id, u.email);
      if (!r) return fail("Transaction not found.");
      if ("ok" in r && r.ok === false) return fail(r.reason);
      return { ok: true, id: String(v.transactionId), result: `Transaction is now ${status}.` };
    },
  },
  {
    key: "fms.issue_credit_note", panel: "fms", label: "Issue a credit note against an invoice", description: "Reduce what a customer owes: a credit note with a reason, issued immediately.", level: "staff", allow: canManageTransactions,
    params: [ref("invoiceId", "Invoice id", "fms.invoice"), { key: "amount", label: "Credit amount", type: "number", required: true }, { key: "reason", label: "Reason", type: "string", required: true }],
    run: async (v, u) => {
      if (!(Number(v.amount) > 0)) return fail("Enter a credit amount.");
      const created = await createCreditNote({ invoiceId: String(v.invoiceId), amount: Number(v.amount), reason: String(v.reason).trim() }, u.id);
      if (!created.ok) return fail(created.reason);
      const issued = await issueCreditNote(created.note._id, u.id);
      if (!issued.ok) return fail(issued.reason ?? "Could not issue the credit note.");
      await audit(u, { action: "approve", entity: "credit_note", entityId: created.note._id, entityLabel: created.note.creditNoteNumber, summary: `issued ${Number(v.amount)} against ${created.note.invoiceNumber}` });
      return { ok: true, id: created.note._id, result: `Credit note ${created.note.creditNoteNumber} issued.` };
    },
  },
  {
    key: "fms.cancel_credit_note", panel: "fms", label: "Cancel a credit note", description: "Reverse an issued credit note.", level: "staff", allow: canApproveTransactions, destructive: true,
    params: [ref("creditNoteId", "Credit note id", "fms.credit_note")],
    run: async (v, u) => {
      const before = await getCreditNote(String(v.creditNoteId));
      const r = await cancelCreditNote(String(v.creditNoteId), u.id);
      if (!r.ok) return fail(r.reason ?? "Could not cancel the credit note.");
      await audit(u, { action: "reverse", entity: "credit_note", entityId: String(v.creditNoteId), entityLabel: before?.creditNoteNumber });
      return { ok: true, id: String(v.creditNoteId), result: "Credit note cancelled." };
    },
  },
  {
    key: "fms.issue_debit_note", panel: "fms", label: "Issue a debit note against a vendor bill", description: "Reduce what you owe a vendor: a debit note with a reason, issued immediately.", level: "staff", allow: canManageTransactions,
    params: [{ key: "billId", label: "Vendor bill id (prms.invoice)", type: "ref", ref: "prms.invoice", required: true }, { key: "amount", label: "Debit amount", type: "number", required: true }, { key: "reason", label: "Reason", type: "string", required: true }],
    run: async (v, u) => {
      if (!(Number(v.amount) > 0)) return fail("Enter a debit amount.");
      const created = await createDebitNote({ billId: String(v.billId), amount: Number(v.amount), reason: String(v.reason).trim() }, u.id);
      if (!created.ok) return fail(created.reason);
      const issued = await issueDebitNote(created.note._id, u.id);
      if (!issued.ok) return fail(issued.reason ?? "Could not issue the debit note.");
      await audit(u, { action: "approve", entity: "debit_note", entityId: created.note._id, entityLabel: created.note.debitNoteNumber, summary: `issued ${Number(v.amount)} against ${created.note.billNumber}` });
      return { ok: true, id: created.note._id, result: `Debit note ${created.note.debitNoteNumber} issued.` };
    },
  },
  {
    key: "fms.cancel_debit_note", panel: "fms", label: "Cancel a debit note", description: "Reverse an issued debit note.", level: "staff", allow: canApproveTransactions, destructive: true,
    params: [ref("debitNoteId", "Debit note id", "fms.debit_note")],
    run: async (v, u) => {
      const before = await getDebitNote(String(v.debitNoteId));
      const r = await cancelDebitNote(String(v.debitNoteId), u.id);
      if (!r.ok) return fail(r.reason ?? "Could not cancel the debit note.");
      await audit(u, { action: "reverse", entity: "debit_note", entityId: String(v.debitNoteId), entityLabel: before?.debitNoteNumber });
      return { ok: true, id: String(v.debitNoteId), result: "Debit note cancelled." };
    },
  },
  {
    key: "fms.request_refund", panel: "fms", label: "Request a refund of a receipt", description: "Start a refund of money a customer paid.", level: "staff", allow: canManageTransactions,
    params: [ref("receiptId", "Receipt id", "fms.receipt"), { key: "amount", label: "Refund amount", type: "number", required: true }, { key: "reason", label: "Reason", type: "string", required: true }],
    run: async (v, u) => {
      if (!(Number(v.amount) > 0)) return fail("Enter a refund amount.");
      const r = await requestRefund({ receiptId: String(v.receiptId), amount: Number(v.amount), reason: String(v.reason).trim() }, u.id);
      if (!r.ok) return fail(r.reason);
      await audit(u, { action: "create", entity: "refund", entityId: r.refund._id, entityLabel: r.refund.refundNumber });
      return { ok: true, id: r.refund._id, result: `Refund ${r.refund.refundNumber} requested.` };
    },
  },
  {
    key: "fms.change_refund_status", panel: "fms", label: "Approve, complete or fail a refund", description: "Move a refund along (approving needs approval authority; completing moves money).", level: "staff", allow: canManageTransactions, destructive: true,
    params: [ref("refundId", "Refund id", "fms.refund"), { key: "status", label: "New status", type: "enum", options: REFUND_STATUS, required: true }],
    run: async (v, u) => {
      const status = String(v.status);
      if (!isValidRefundStatus(status)) return fail("Unknown status.", { allowed: REFUND_STATUS });
      if (status === "approved" && !canApproveTransactions(u)) return fail("You don't have authority to approve refunds.");
      if (status === "processing" || status === "completed") return fail(MONEY_MOVES_IN_THE_APP);
      const before = await getRefund(String(v.refundId));
      const r = await changeRefundStatus(String(v.refundId), status, u.id, u.email);
      if (!r.ok) return fail(r.reason ?? "Could not change the refund.");
      await audit(u, { action: status === "failed" ? "reject" : status === "approved" ? "approve" : "status_change", entity: "refund", entityId: String(v.refundId), entityLabel: before?.refundNumber, summary: `status → ${status}` });
      return { ok: true, id: String(v.refundId), result: `Refund is now ${status}.` };
    },
  },
  {
    key: "fms.record_reimbursement", panel: "fms", label: "Reimburse an employee expense", description: "Pay back an approved employee expense through Razorpay, into the employee's bank account.", level: "staff", allow: canManageTransactions,
    params: [{ key: "expenseId", label: "Expense id (prms.expense)", type: "ref", ref: "prms.expense", required: true }, { key: "amount", label: "Amount", type: "number", required: true }, { key: "method", label: "Method", type: "enum", options: METHODS }, { key: "paymentDate", label: "Payment date", type: "dateString" }, { key: "transactionReference", label: "Reference", type: "string" }, FUND, { key: "notes", label: "Notes", type: "string" }],
    run: async () => fail(MONEY_MOVES_IN_THE_APP),
  },
  {
    key: "fms.request_advance", panel: "fms", label: "Request an employee advance", description: "Record an advance requested by an employee.", level: "staff", allow: canManageTransactions,
    params: [ref("employeeId", "Employee (hrms.employee id)", "hrms.employee"), { key: "employeeName", label: "Employee name", type: "string", required: true }, { key: "amount", label: "Amount", type: "number", required: true }, { key: "reason", label: "Reason", type: "string", required: true }],
    run: async (v, u) => {
      if (!(Number(v.amount) > 0)) return fail("Enter an advance amount.");
      const a = await requestAdvance({ employeeId: String(v.employeeId), employeeName: String(v.employeeName).trim(), amount: Number(v.amount), reason: String(v.reason).trim() }, u.id);
      await audit(u, { action: "create", entity: "transaction", entityId: a._id, entityLabel: a.advanceNumber });
      return { ok: true, id: a._id, result: `Advance ${a.advanceNumber} requested.` };
    },
  },
  {
    key: "fms.change_advance_status", panel: "fms", label: "Approve, pay or reject an employee advance", description: "Move an advance along its flow; paying needs the account it is paid from.", level: "staff", allow: canManageTransactions, destructive: true,
    params: [ref("advanceId", "Advance id", "fms.employee_advance"), { key: "status", label: "New status", type: "enum", options: ADVANCE_STATUS, required: true }, FUND],
    run: async (v, u) => {
      const status = String(v.status);
      if (!isValidAdvanceStatus(status)) return fail("Unknown status.", { allowed: ADVANCE_STATUS });
      if ((status === "approved" || status === "rejected") && !canApproveTransactions(u)) return fail("You don't have authority to approve or reject advances.");
      if (status === "disbursed") return fail(MONEY_MOVES_IN_THE_APP);
      const f = fundKey(v);
      const before = await getAdvance(String(v.advanceId));
      const r = await changeAdvanceStatus(String(v.advanceId), status, u.id, u.email, f.fundAccountId, f.fundAccountType);
      if (!r.ok) return fail(r.reason ?? "Could not change the advance.");
      await audit(u, { action: status === "approved" ? "approve" : status === "rejected" ? "reject" : "status_change", entity: "transaction", entityId: String(v.advanceId), entityLabel: before?.advanceNumber, summary: `status → ${status}` });
      return { ok: true, id: String(v.advanceId), result: `Advance is now ${status}.` };
    },
  },
  {
    key: "fms.record_advance_repayment", panel: "fms", label: "Record an advance repayment", description: "An employee paid back part or all of an advance.", level: "staff", allow: canManageTransactions,
    params: [ref("advanceId", "Advance id", "fms.employee_advance"), { key: "amount", label: "Amount", type: "number", required: true }, { key: "method", label: "Method", type: "enum", options: METHODS }, { key: "date", label: "Date", type: "dateString" }, { key: "transactionReference", label: "Reference", type: "string" }, FUND],
    run: async (v, u) => {
      const method = String(v.method ?? "bank_transfer");
      if (!isValidPaymentMethod(method)) return fail("Unknown payment method.", { allowed: METHODS });
      if (!(Number(v.amount) > 0)) return fail("Enter a repayment amount.");
      const r = await recordRepayment(String(v.advanceId), { amount: Number(v.amount), method, transactionReference: str(v.transactionReference), date: day(v.date), ...fundKey(v) }, u.id, u.email);
      if (!r.ok) return fail(r.reason ?? "Could not record the repayment.");
      await audit(u, { action: "record", entity: "transaction", entityId: String(v.advanceId), summary: `repayment of ${Number(v.amount)}` });
      return { ok: true, id: String(v.advanceId), result: "Repayment recorded." };
    },
  },
  {
    key: "fms.record_vendor_payment", panel: "fms", label: "Pay a vendor bill", description: "Pay a vendor bill through Razorpay to the vendor's saved bank details (or schedule it for later). The bill is reduced when Razorpay confirms.", level: "staff", allow: canManageTransactions, destructive: true,
    params: [{ key: "billId", label: "Vendor bill id (prms.invoice)", type: "ref", ref: "prms.invoice", required: true }, { key: "amount", label: "Amount", type: "number", required: true }, { key: "method", label: "Method", type: "enum", options: METHODS }, { key: "paymentDate", label: "Payment date", type: "dateString" }, { key: "transactionReference", label: "Reference / UTR", type: "string" }, { key: "tdsDeducted", label: "TDS deducted", type: "number" }, { key: "status", label: "processed or scheduled", type: "enum", options: ["processed", "scheduled"] }, FUND, { key: "notes", label: "Notes", type: "string" }],
    run: async (v, u) => {
      const method = String(v.method ?? "bank_transfer");
      if (!isValidPaymentMethod(method)) return fail("Unknown payment method.", { allowed: METHODS });
      if (!(Number(v.amount) > 0)) return fail("Enter a payment amount.");
      if (v.status !== "scheduled") return fail(MONEY_MOVES_IN_THE_APP + " You can schedule it here instead.");
      const f = fundKey(v);
      const r = await recordVendorPayment({ invoiceId: String(v.billId), amount: Number(v.amount), paymentDate: day(v.paymentDate), method, transactionReference: str(v.transactionReference), tdsDeducted: Number(v.tdsDeducted) || 0, status: v.status === "scheduled" ? "scheduled" : "processed", notes: str(v.notes) } as never, u.id, u.email, f.fundAccountId, f.fundAccountType);
      if (!r.ok) return fail(r.reason);
      await audit(u, { action: "record", entity: "transaction", entityId: r.paymentId!, summary: `Vendor payment of ${Number(v.amount)} recorded via FMS (PRMS payment ${r.paymentId})` });
      return { ok: true, id: r.paymentId, result: "Vendor payment sent through Razorpay. The bill is reduced once the bank confirms." };
    },
  },
  {
    key: "fms.mark_vendor_payment_processed", panel: "fms", label: "Pay a scheduled vendor payment now", description: "Send a scheduled vendor payment through Razorpay now.", level: "staff", allow: canManageTransactions, destructive: true,
    params: [{ key: "paymentId", label: "Vendor payment id (prms.payment)", type: "ref", ref: "prms.payment", required: true }],
    run: async () => fail(MONEY_MOVES_IN_THE_APP),
  },
  {
    key: "fms.record_transfer", panel: "fms", label: "Transfer money between bank/cash accounts", description: "Move an amount from one bank or cash account to another.", level: "staff", allow: canManageTransactions, destructive: true,
    params: [{ key: "fromAccountType", label: "From type", type: "enum", options: FUND_TYPES, required: true }, { key: "fromAccountId", label: "From account id", type: "string", required: true }, { key: "toAccountType", label: "To type", type: "enum", options: FUND_TYPES, required: true }, { key: "toAccountId", label: "To account id", type: "string", required: true }, { key: "amount", label: "Amount", type: "number", required: true }, { key: "transferDate", label: "Date", type: "dateString" }, { key: "referenceNumber", label: "Reference", type: "string" }, { key: "notes", label: "Notes", type: "string" }],
    run: async (v, u) => {
      if (!isValidFundAccountType(v.fromAccountType) || !isValidFundAccountType(v.toAccountType)) return fail("Select the account types.", { allowed: FUND_TYPES });
      if (!(Number(v.amount) > 0)) return fail("Enter a transfer amount.");
      const r = await recordTransfer({ fromAccountId: String(v.fromAccountId), fromAccountType: v.fromAccountType as never, toAccountId: String(v.toAccountId), toAccountType: v.toAccountType as never, amount: Number(v.amount), transferDate: day(v.transferDate), referenceNumber: str(v.referenceNumber), notes: str(v.notes) }, u.id, u.email);
      if (!r.ok) return fail(r.reason);
      await audit(u, { action: "create", entity: "fund_transfer", entityId: r.transfer._id, entityLabel: r.transfer.transferNumber, summary: `${r.transfer.fromAccountName} → ${r.transfer.toAccountName}: ${Number(v.amount)}` });
      return { ok: true, id: r.transfer._id, result: `Transfer ${r.transfer.transferNumber} recorded.` };
    },
  },
  {
    key: "fms.record_asset_expense", panel: "fms", label: "Record an asset expense", description: "Maintenance, insurance or AMC cost for an asset.", level: "staff", allow: canManageTransactions,
    params: [{ key: "assetId", label: "Asset id (prms.asset)", type: "ref", ref: "prms.asset", required: true }, { key: "category", label: "Category", type: "enum", options: ASSET_CATS, required: true }, { key: "amount", label: "Amount", type: "number", required: true }, { key: "expenseDate", label: "Date", type: "dateString" }, { key: "method", label: "Method", type: "enum", options: METHODS }, { key: "vendorId", label: "Vendor (prms.vendor id)", type: "ref", ref: "prms.vendor" }, { key: "vendorName", label: "Vendor name", type: "string" }, { key: "notes", label: "Notes", type: "string" }, FUND],
    run: async (v, u) => {
      if (!isValidAssetExpenseCategory(v.category)) return fail("Select a category.", { allowed: ASSET_CATS });
      const method = String(v.method ?? "bank_transfer");
      if (!isValidPaymentMethod(method)) return fail("Unknown payment method.", { allowed: METHODS });
      if (!(Number(v.amount) > 0)) return fail("Enter an expense amount.");
      const r = await recordAssetExpense({ assetId: String(v.assetId), category: v.category as never, amount: Number(v.amount), expenseDate: day(v.expenseDate), method, vendorId: str(v.vendorId), vendorName: str(v.vendorName), notes: str(v.notes), ...fundKey(v) }, u.id, u.email);
      if (!r.ok) return fail(r.reason);
      await audit(u, { action: "record", entity: "transaction", entityId: r.expense._id, entityLabel: r.expense.expenseNumber, summary: `${r.expense.category} expense of ${Number(v.amount)} for ${r.expense.assetCode}` });
      return { ok: true, id: r.expense._id, result: `Expense ${r.expense.expenseNumber} recorded.` };
    },
  },
  {
    key: "fms.dispose_asset", panel: "fms", label: "Dispose of an asset", description: "Record the sale or write-off of an asset with its disposal value (books the gain or loss).", level: "staff", allow: canManageTransactions, destructive: true,
    params: [{ key: "assetId", label: "Asset id (prms.asset)", type: "ref", ref: "prms.asset", required: true }, { key: "disposalValue", label: "Disposal value", type: "number", required: true }, { key: "reason", label: "Reason", type: "string", required: true }, { key: "disposalDate", label: "Date", type: "dateString" }, FUND],
    run: async (v, u) => {
      if (!Number.isFinite(Number(v.disposalValue)) || Number(v.disposalValue) < 0) return fail("Enter a disposal value.");
      const r = await disposeAsset({ assetId: String(v.assetId), disposalDate: day(v.disposalDate), disposalValue: Number(v.disposalValue), reason: String(v.reason).trim(), ...fundKey(v) }, u.id, u.email);
      if (!r.ok) return fail(r.reason);
      await audit(u, { action: "record", entity: "transaction", entityId: r.disposal._id, entityLabel: r.disposal.disposalNumber, summary: `Disposed ${r.disposal.assetCode}: gain/loss ${r.disposal.gainLoss}` });
      return { ok: true, id: r.disposal._id, result: `Disposal ${r.disposal.disposalNumber} recorded (gain/loss ${r.disposal.gainLoss}).` };
    },
  },
  {
    key: "fms.record_cash_count", panel: "fms", label: "Record a physical cash count", description: "Count the cash in a cash account and see the difference from the books.", level: "staff", allow: canReconcile,
    params: [ref("cashAccountId", "Cash account id", "fms.cash_account"), { key: "physicalCount", label: "Counted amount", type: "number", required: true }, { key: "countDate", label: "Date", type: "dateString" }, { key: "notes", label: "Notes", type: "string" }],
    run: async (v, u) => {
      if (!Number.isFinite(Number(v.physicalCount)) || Number(v.physicalCount) < 0) return fail("Enter the counted amount.");
      const r = await recordCashCount({ cashAccountId: String(v.cashAccountId), countDate: day(v.countDate), physicalCount: Number(v.physicalCount), notes: str(v.notes) }, u.id, u.email);
      return r.ok ? { ok: true, id: r.count._id, result: "Cash count recorded.", record: r.count as unknown as Json } : fail(r.reason);
    },
  },
  {
    key: "fms.add_statement_line", panel: "fms", label: "Add a bank statement line", description: "Enter a line from the bank statement for reconciliation (negative amount for withdrawals).", level: "staff", allow: canReconcile,
    params: [ref("bankAccountId", "Bank account id", "fms.bank_account"), { key: "description", label: "Description", type: "string", required: true }, { key: "amount", label: "Signed amount", type: "number", required: true }, { key: "statementDate", label: "Date", type: "dateString" }, { key: "notes", label: "Notes", type: "string" }],
    run: async (v, u) => {
      if (!Number.isFinite(Number(v.amount)) || Number(v.amount) === 0) return fail("Enter a signed amount (negative for withdrawals).");
      const line = await createStatementLine({ bankAccountId: String(v.bankAccountId), statementDate: day(v.statementDate), description: String(v.description).trim(), amount: Number(v.amount), notes: str(v.notes) }, u.id);
      return { ok: true, id: line._id, result: "Statement line added." };
    },
  },
  {
    key: "fms.match_statement_line", panel: "fms", label: "Match a bank statement line to a transaction", description: "Reconcile a statement line with the transaction it belongs to.", level: "staff", allow: canReconcile,
    params: [ref("lineId", "Statement line id (fms.statement_line)", "fms.statement_line"), ref("transactionId", "Transaction id", "fms.transaction")],
    run: async (v, u) => {
      const r = await matchStatementLine(String(v.lineId), String(v.transactionId), u.id, u.email);
      return r.ok ? { ok: true, result: "Matched." } : fail(r.reason ?? "Could not match.");
    },
  },
  {
    key: "fms.flag_statement_line", panel: "fms", label: "Flag a bank statement line", description: "Mark a line duplicate, needs review, unmatched or partially matched.", level: "staff", allow: canReconcile,
    params: [ref("lineId", "Statement line id", "fms.statement_line"), { key: "status", label: "Flag", type: "enum", options: ["duplicate", "needs_review", "unmatched", "partially_matched"], required: true }],
    run: async (v, u) => {
      if (!isValidStatementLineStatus(v.status)) return fail("Unknown flag.");
      const r = await flagStatementLine(String(v.lineId), v.status as never, u.id, u.email);
      return r.ok ? { ok: true, result: `Flagged ${String(v.status)}.` } : fail(r.reason ?? "Could not flag.");
    },
  },
  {
    key: "fms.close_fiscal_period", panel: "fms", label: "Close an accounting period", description: "Lock a fiscal period so nothing more can be posted in it.", level: "admin", allow: canManageFiscalPeriods, destructive: true,
    params: [ref("periodId", "Fiscal period id", "fms.fiscal_period")],
    run: async (v, u) => {
      const r = await closePeriod(String(v.periodId), u.id, u.email);
      return r.ok ? { ok: true, id: String(v.periodId), result: "Period closed." } : fail(r.reason ?? "Could not close the period.");
    },
  },
  {
    key: "fms.reopen_fiscal_period", panel: "fms", label: "Reopen a closed accounting period", description: "Unlock a closed fiscal period.", level: "admin", allow: canManageFiscalPeriods, destructive: true,
    params: [ref("periodId", "Fiscal period id", "fms.fiscal_period")],
    run: async (v, u) => {
      const r = await reopenPeriod(String(v.periodId), u.id, u.email);
      return r.ok ? { ok: true, id: String(v.periodId), result: "Period reopened." } : fail(r.reason ?? "Could not reopen the period.");
    },
  },
  {
    key: "fms.create_fiscal_period", panel: "fms", label: "Create an accounting period", description: "Define a fiscal period with a start and end date.", level: "admin", allow: canManageFiscalPeriods,
    params: [{ key: "name", label: "Name (e.g. FY 2026-27)", type: "string", required: true }, { key: "startDate", label: "Start", type: "dateString", required: true }, { key: "endDate", label: "End", type: "dateString", required: true }],
    run: async (v, u) => {
      if (!String(v.name).trim() || !v.startDate || !v.endDate) return fail("Name, start and end are required.");
      await createFiscalPeriod({ name: String(v.name).trim(), startDate: date0(String(v.startDate)), endDate: new Date(`${String(v.endDate)}T23:59:59`) }, u.id);
      return { ok: true, result: "Fiscal period created." };
    },
  },
  {
    key: "fms.add_tax_rate", panel: "fms", label: "Add a tax rate", description: "Add a named tax rate (percent).", level: "admin", allow: canManageTaxConfig,
    params: [{ key: "name", label: "Name (e.g. GST 18%)", type: "string", required: true }, { key: "ratePercent", label: "Rate %", type: "number", required: true }],
    run: async (v, u) => {
      const rate = Number(v.ratePercent);
      if (!String(v.name).trim() || !Number.isFinite(rate) || rate < 0) return fail("Enter a name and a rate of 0 or more.");
      const config = await getTaxConfig();
      await updateTaxConfig([...config.rates, { name: String(v.name).trim(), ratePercent: rate, isActive: true }], u.id);
      return { ok: true, result: "Tax rate added." };
    },
  },
  {
    key: "fms.set_tax_rate_active", panel: "fms", label: "Turn a tax rate on or off", description: "Activate or deactivate a tax rate.", level: "admin", allow: canManageTaxConfig,
    params: [{ key: "rateId", label: "Tax rate id", type: "string", required: true }, { key: "active", label: "Active", type: "boolean", required: true }],
    run: async (v, u) => {
      const config = await getTaxConfig();
      if (!config.rates.some((r) => r.id === v.rateId)) return fail("Tax rate not found.");
      await updateTaxConfig(config.rates.map((r) => (r.id === v.rateId ? { ...r, isActive: v.active === true } : r)), u.id);
      return { ok: true, result: v.active === true ? "Tax rate activated." : "Tax rate deactivated." };
    },
  },
  {
    key: "fms.delete_tax_rate", panel: "fms", label: "Delete a tax rate", description: "Remove a tax rate.", level: "admin", allow: canManageTaxConfig, destructive: true,
    params: [{ key: "rateId", label: "Tax rate id", type: "string", required: true }],
    run: async (v, u) => {
      const config = await getTaxConfig();
      if (!config.rates.some((r) => r.id === v.rateId)) return fail("Tax rate not found.");
      await updateTaxConfig(config.rates.filter((r) => r.id !== v.rateId), u.id);
      return { ok: true, result: "Tax rate deleted." };
    },
  },
  {
    key: "fms.add_exchange_rate", panel: "fms", label: "Add an exchange rate", description: "A currency's rate to the base currency from a date.", level: "admin", allow: canManageAccounts,
    params: [{ key: "currency", label: "Currency", type: "enum", options: CURRENCIES, required: true }, { key: "rateToBase", label: "Rate to base currency", type: "number", required: true }, { key: "effectiveDate", label: "Effective date", type: "dateString", required: true }],
    run: async (v, u) => {
      if (!(Number(v.rateToBase) > 0) || !v.effectiveDate) return fail("Enter a rate above 0 and a date.");
      await addExchangeRate({ currency: String(v.currency).toUpperCase(), rateToBase: Number(v.rateToBase), effectiveDate: date0(String(v.effectiveDate)) } as never, u.id);
      return { ok: true, result: "Exchange rate added." };
    },
  },
  {
    key: "fms.delete_exchange_rate", panel: "fms", label: "Delete an exchange rate", description: "Remove an exchange rate.", level: "admin", allow: canManageAccounts, destructive: true,
    params: [ref("rateId", "Exchange rate id", "fms.exchange_rate")],
    run: async (v, u) => {
      const r = await deleteExchangeRate(String(v.rateId), u.id);
      return r.ok ? { ok: true, result: "Exchange rate deleted." } : fail("Exchange rate not found.");
    },
  },
  {
    key: "fms.seed_default_accounts", panel: "fms", label: "Create the default chart of accounts", description: "Add the standard set of ledger accounts (skips ones that exist).", level: "admin", allow: canManageAccounts,
    params: [],
    run: async (_v, u) => {
      const n = await seedDefaultAccounts(u.id);
      await audit(u, { action: "create", entity: "account", entityId: "bulk-seed", summary: `Seeded ${n} default account(s)` });
      return { ok: true, result: `${n} default account(s) added.` };
    },
  },
];

const range = (v: Json) => ({ dateFrom: v.dateFrom ? date0(String(v.dateFrom)) : undefined, dateTo: v.dateTo ? new Date(`${String(v.dateTo)}T23:59:59`) : undefined });
const R = (key: string, label: string, description: string, params: FieldDef[], run: (v: Json) => Promise<unknown>, allow: (u: AgentUser) => boolean = canViewReports): ReportDef => ({ key, panel: "fms", label, description, params, level: "staff", allow, run: async (v) => ({ result: await run(v) }) as unknown as Json });
const FROM_TO: FieldDef[] = [{ key: "dateFrom", label: "From", type: "dateString" }, { key: "dateTo", label: "To", type: "dateString" }];

export const FMS_REPORTS: ReportDef[] = [
  R("fms.dashboard", "Finance dashboard numbers", "Cash, income, expenses, receivables, payables, trends for a period.", FROM_TO, (v) => getFmsDashboardStats(range(v))),
  R("fms.profit_and_loss", "Profit & loss", "Income, expenses and net profit over a period.", FROM_TO, (v) => getProfitAndLoss(range(v))),
  R("fms.balance_sheet", "Balance sheet", "Assets, liabilities and equity as of a date.", [{ key: "asOf", label: "As of date", type: "dateString" }], (v) => getBalanceSheet(v.asOf ? date0(String(v.asOf)) : new Date())),
  R("fms.trial_balance", "Trial balance", "Debits and credits per ledger account as of a date.", [{ key: "asOf", label: "As of date", type: "dateString" }], (v) => getTrialBalance({ asOf: v.asOf ? date0(String(v.asOf)) : undefined })),
  R("fms.cash_flow", "Cash flow", "Cash in and out over a period.", [{ key: "dateFrom", label: "From", type: "dateString", required: true }, { key: "dateTo", label: "To", type: "dateString", required: true }], (v) => getCashFlow(date0(String(v.dateFrom)), new Date(`${String(v.dateTo)}T23:59:59`))),
  R("fms.tax_summary", "Tax summary", "Tax collected and paid over a period, and tax payable now.", FROM_TO, async (v) => ({ summary: await getTaxSummary(range(v)), payableNow: await currentTaxPayable() })),
  R("fms.budget_vs_actual", "Budget vs actual", "Planned versus actual spend per budget.", [], () => getBudgetVsActual()),
  R("fms.project_profitability", "Project profitability", "Revenue, cost and margin per project from finance data.", [], () => projectProfitabilityReport()),
  R("fms.general_ledger", "General ledger of one account", "Opening balance, every posting and closing balance for a ledger account.", [{ key: "accountId", label: "Ledger account (fms.account id)", type: "ref", ref: "fms.account", required: true }, ...FROM_TO], async (v) => (await generalLedgerForAccount(String(v.accountId), range(v))) ?? { error: "Account not found." }),
  R("fms.receivables", "Receivables", "Who owes you: totals, overdue, aging buckets and per customer.", [], async () => ({ outstanding: await totalOutstandingInvoices(), overdue: await overdueInvoices(), aging: await receivablesAging(), byCustomer: await customerWiseReceivables() })),
  R("fms.payables", "Payables", "What you owe: totals, overdue, aging buckets and per vendor.", [], async () => ({ outstanding: await totalOutstandingPayable(), overdue: await overdueBills(), aging: await payablesAging(), byVendor: await vendorWisePayables() })),
  R("fms.pending_approvals", "Waiting for approval", "Transactions, refunds, advances and expenses waiting for an approver.", [], () => listPendingApprovals(), canApproveTransactions),
];
void getAccount; void getCashAccount;
