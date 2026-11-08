import "server-only";
import { getVendor, createVendor, updateVendor, deleteVendor } from "@/lib/products/spendiq/vendors";
import { getRequisition, createRequisition, updateRequisition, submitRequisition, decideRequisition, deleteRequisition } from "@/lib/products/spendiq/requisitions";
import { getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, issuePurchaseOrder, setPurchaseOrderStatus, deletePurchaseOrder, type PoItemInput } from "@/lib/products/spendiq/purchase-orders";
import { getRfq, createRfq, updateRfq, setRfqStatus, addQuotation, awardRfq, deleteRfq, createRfqFromRequisition, type RfqLine } from "@/lib/products/spendiq/rfqs";
import { createGoodsReceipt, deleteGoodsReceipt, getGoodsReceipt, type GrnLineInput } from "@/lib/products/spendiq/goods-receipts";
import { getInvoice, createInvoice, updateInvoice, setInvoiceStatus, deleteInvoice, type InvoiceWriteData } from "@/lib/products/spendiq/invoices";
import { recordPayment, markPaymentProcessed, deletePayment, getPayment, type PaymentWriteData } from "@/lib/products/spendiq/payments";
import { getExpense, createExpense, updateExpense, decideExpense, markExpenseReimbursed, setRecurringActive, deleteExpense, type ExpenseWriteData } from "@/lib/products/spendiq/expenses";
import { getAsset, createAsset, updateAsset, assignAsset, returnAsset, changeAssetStatus, deleteAsset, type AssetWriteData } from "@/lib/products/spendiq/assets";
import { getInventoryItem, createInventoryItem, updateInventoryItem, recordInventoryTransaction, deleteInventoryItem } from "@/lib/products/spendiq/inventory";
import { getContract, createContract, updateContract, deleteContractRow, type ContractWriteInput } from "@/lib/products/spendiq/contracts";
import { getBudget, createBudget, updateBudget, deleteBudget, refreshBudgetConsumption, type BudgetWriteData } from "@/lib/products/spendiq/budgets";
import { getSubscription, createSubscription, updateSubscription, deleteSubscriptionRow, type SubscriptionWriteInput } from "@/lib/products/spendiq/software-subscriptions";
import { getThirdPartyService, createThirdPartyService, updateThirdPartyService, deleteThirdPartyRow, type ThirdPartyWriteInput } from "@/lib/products/spendiq/third-party-services";
import { getInfrastructureResource, createInfrastructure, updateInfrastructure, deleteInfrastructureRow, type InfraWriteInput } from "@/lib/products/spendiq/infrastructure";
import { getPrmsSettings, normalizeSettingsInput, updatePrmsSettings } from "@/lib/products/spendiq/settings";
import { getPrmsDashboardStats } from "@/lib/products/spendiq/dashboard";
import { notify, notifyStaff } from "@/lib/products/spendiq/notifications";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { validateVendor, validateRequisition } from "@/lib/products/spendiq/validation";
import {
  PRIORITIES, VENDOR_CATEGORIES, VENDOR_STATUSES, PAYMENT_TERMS, PAYMENT_METHODS, UNITS_OF_MEASURE, ASSET_CATEGORIES, ASSET_STATUSES, DEPRECIATION_METHODS, INVENTORY_TXN_TYPES, RESOURCE_STATUSES, BILLING_CYCLES, INFRA_RESOURCE_TYPES, CONTRACT_TYPES, INVOICE_STATUSES, BUDGET_LEVELS, BUDGET_PERIODS, EXPENSE_CATEGORY_TREE, RECURRENCE_INTERVALS, PO_STATUSES, SUPPORTED_CURRENCIES, DEFAULT_GST_RATE,
  isValidExpenseCategory, isValidPaymentMethod, isValidRecurrenceInterval, isValidInvoiceStatus, isValidAssetStatus, isValidInventoryTxnType, isValidBudgetLevel, isValidBudgetPeriod, isValidBillingCycle, isValidResourceStatus, isValidDepreciationMethod,
  type InvoiceStatus, type AssetStatus, type InventoryTxnType, type BudgetLevel, type BudgetPeriod, type BillingCycle, type ResourceStatus,
} from "@/lib/products/spendiq/constants";
import { canManageProcurement, canManageFinance, canApproveRequisitions, canManageExpenses, canManageSettings, canViewAuditLog, canViewReports } from "@/lib/prms-roles";
import { hasLevel } from "@/lib/ai/agent/access";
import { check, crudOps, f, fail, values, str } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * Procurement & resources (PRMS) for the agent: vendors, requisitions and their approval, RFQs and quotations, purchase orders,
 * goods receipts, vendor bills and payments, expenses, assets, inventory, contracts, budgets, subscriptions, services and infrastructure.
 * Employees (prms_employee) raise and follow their own requisitions and expenses.
 */

const soft = { deletedAt: null };
const audit = (u: AgentUser, e: Json) => recordAudit({ actorId: u.id, actorEmail: u.email, ...e } as never);
const PRIORITY = values(PRIORITIES); const VCAT = values(VENDOR_CATEGORIES); const VSTATUS = values(VENDOR_STATUSES); const TERMS = values(PAYMENT_TERMS); const METHODS = values(PAYMENT_METHODS);
const UOM = [...UNITS_OF_MEASURE] as string[]; const ACAT = [...ASSET_CATEGORIES] as string[]; const ASTATUS = values(ASSET_STATUSES); const DEPR = values(DEPRECIATION_METHODS); const TXN = values(INVENTORY_TXN_TYPES);
const RSTATUS = values(RESOURCE_STATUSES); const CYCLE = values(BILLING_CYCLES); const INFRA = [...INFRA_RESOURCE_TYPES] as string[]; const CTYPES = [...CONTRACT_TYPES] as string[]; const BLEVEL = values(BUDGET_LEVELS); const BPERIOD = values(BUDGET_PERIODS);
const ECAT = EXPENSE_CATEGORY_TREE.map((c) => c.value as string); const RECUR = values(RECURRENCE_INTERVALS); const PO = values(PO_STATUSES); const BILLSTATUS = values(INVOICE_STATUSES); const CURRENCIES = [...SUPPORTED_CURRENCIES] as string[];
const nameFromEmail = (email: string) => {
  const words = (email.split("@")[0] ?? email).replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : email;
};
const isStaff = (u: AgentUser) => hasLevel(u.roles, "prms", "staff");
const vendorName = async (id: unknown) => (typeof id === "string" && id ? (await getVendor(id))?.companyName ?? null : null);
const dateOk = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const mineReq = (u: AgentUser): Json | null => ({ "requestedBy.userId": u.id });
const mineExp = (u: AgentUser): Json | null => ({ raisedByUserId: u.id });

function poLines(raw: unknown): PoItemInput[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Json[]).map((l) => ({ description: String(l.description ?? "").trim(), hsn: String(l.hsn ?? "").trim() || null, quantity: Number(l.quantity) || 0, uom: String(l.uom ?? "pcs"), unitPrice: Number(l.unitPrice) || 0, gstRate: Number.isFinite(Number(l.gstRate)) ? Number(l.gstRate) : DEFAULT_GST_RATE })).filter((l) => l.description && l.quantity > 0);
}
function rfqLines(raw: unknown): RfqLine[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Json[]).map((l) => ({ description: String(l.description ?? "").trim(), quantity: Number(l.quantity) || 0, uom: String(l.uom ?? "pcs") })).filter((l) => l.description && l.quantity > 0);
}

/** A "resource" entity (contract, subscription, service, infrastructure) is saved by its own create/update with a vendor name looked up. */
function resource<R extends { _id: unknown }>(cfg: { key: string; label: string; description: string; collection: string; entity: string; fields: ReturnType<typeof f.str>[]; get: (id: string) => Promise<R | null>; create: (d: never, uid: string) => Promise<R>; update: (id: string, d: never, uid: string) => Promise<unknown>; remove: (id: string, uid: string) => Promise<unknown>; build: (v: Json, vendor: string | null) => Json | { error: Json }; title: string; code?: string; search: string[]; allow?: (u: AgentUser) => boolean }): EntityDef {
  return {
    key: cfg.key, panel: "prms", label: cfg.label, description: cfg.description, collection: cfg.collection, idType: "string", baseFilter: soft, titleField: cfg.title, search: cfg.search, read: "staff", write: "staff", allow: cfg.allow ?? canManageProcurement, canDelete: true, fields: cfg.fields,
    ops: {
      create: async (v, u) => {
        const data = cfg.build(v, await vendorName(v.vendorId));
        if ("error" in data) return data.error as Json;
        const rec = await cfg.create(data as never, u.id);
        await audit(u, { action: "create", entity: cfg.entity, entityId: String(rec._id), entityLabel: String((rec as Json)[cfg.code ?? cfg.title] ?? "") });
        return { ok: true, id: String(rec._id), record: rec as unknown as Json };
      },
      update: async (id, v, u) => {
        const before = await cfg.get(id);
        if (!before) return fail("Not found.");
        const data = cfg.build({ ...(before as unknown as Json), ...v }, await vendorName(("vendorId" in v ? v.vendorId : (before as unknown as Json).vendorId)));
        if ("error" in data) return data.error as Json;
        await cfg.update(id, data as never, u.id);
        await audit(u, { action: "update", entity: cfg.entity, entityId: id, entityLabel: String((before as unknown as Json)[cfg.title] ?? "") });
        return { ok: true, id, result: "Saved." };
      },
      remove: async (id, u) => {
        const before = await cfg.get(id);
        await cfg.remove(id, u.id);
        await audit(u, { action: "delete", entity: cfg.entity, entityId: id, entityLabel: before ? String((before as unknown as Json)[cfg.code ?? cfg.title] ?? "") : null });
        return { ok: true, id };
      },
    },
  };
}

const cycleOk = (v: Json): Json | null => (isValidBillingCycle(String(v.billingCycle ?? "monthly")) ? null : fail("Unknown billing cycle.", { allowed: CYCLE }));
const statusOk = (v: Json): Json | null => (isValidResourceStatus(String(v.status ?? "active")) ? null : fail("Unknown status.", { allowed: RSTATUS }));

export const PRMS_ENTITIES: EntityDef[] = [
  {
    key: "prms.vendor", panel: "prms", label: "Vendor", description: "Suppliers: company, GSTIN/PAN, contact, category, rating, payment terms.", collection: "prms_vendors", idType: "string", baseFilter: soft, titleField: "companyName", search: ["companyName", "email", "phone", "vendorCode", "gstin"],
    read: "staff", write: "staff", allow: canManageProcurement, canDelete: true, hide: ["bank"],
    fields: [f.str("companyName", "Company name", true), f.str("gstin", "GSTIN"), f.str("pan", "PAN"), f.email("email", "Email"), f.str("phone", "Phone"), f.enum("category", "Category", VCAT), f.enum("status", "Status", VSTATUS), f.enum("paymentTerms", "Payment terms", TERMS), f.num("rating", "Rating (1–5)"), f.str("contactPerson", "Contact person"), f.str("addressLine", "Address"), f.str("city", "City"), f.str("state", "State"), f.str("pincode", "Pincode"), f.str("bankAccountName", "Bank account name"), f.str("bankAccountNumber", "Bank account number"), f.str("bankIfsc", "IFSC"), f.str("bankName", "Bank name"), f.str("bankBranch", "Bank branch"), f.enum("currency", "Currency", CURRENCIES), f.text("notes", "Notes")],
    ops: crudOps({
      entity: "vendor", validate: validateVendor, get: getVendor, label: (r) => String(r.companyName ?? ""), audit,
      toInput: (v) => ({ ...(v as unknown as Json), bankAccountName: undefined }),
      create: (d, u) => createVendor(d, u.id), update: (id, d, u) => updateVendor(id, d, u.id), remove: (id, u) => deleteVendor(id, u.id),
    }),
  },
  {
    key: "prms.requisition", panel: "prms", label: "Purchase requisition", description: "Requests to buy something (draft → submitted → approved → converted to PO). Employees raise and see their own.", collection: "prms_requisitions", idType: "string", baseFilter: soft, titleField: "itemName", search: ["itemName", "prCode", "departmentName", "justification"],
    read: "staff", write: "any", selfWrite: true, canDelete: true, self: mineReq,
    fields: [f.str("departmentId", "Department id (hrms.department)", true), f.str("departmentName", "Department name"), f.str("category", "Category", true), f.str("subcategory", "Sub-category"), f.str("itemName", "Item / service", true), f.num("quantity", "Quantity", true), f.enum("uom", "Unit", UOM), f.num("estimatedCost", "Estimated total cost", true), f.enum("currency", "Currency", CURRENCIES), f.date("requiredDate", "Required by"), f.enum("priority", "Priority", PRIORITY), f.text("justification", "Justification"), f.ref("preferredVendorId", "Preferred vendor (prms.vendor id)", "prms.vendor"), f.str("projectId", "Project id (pms.project)"), f.str("projectName", "Project name")],
    ops: {
      create: async (v, u) => {
        const c = check(validateRequisition(v));
        if (!c.ok) return c.error;
        const rec = await createRequisition(c.data, { userId: u.id, employeeId: u.employeeId ?? null, name: nameFromEmail(u.email), email: u.email } as never, u.id);
        await audit(u, { action: "create", entity: "requisition", entityId: rec._id, entityLabel: rec.prCode });
        return { ok: true, id: rec._id, record: rec as unknown as Json, result: `Requisition ${rec.prCode} created as a draft — submit it for approval when ready.` };
      },
      update: async (id, v, u) => {
        const before = await getRequisition(id);
        if (!before) return fail("Requisition not found.");
        if (before.requestedBy.userId !== u.id && !isStaff(u)) return fail("Requisition not found.");
        const c = check(validateRequisition({ ...(before as unknown as Json), ...v }));
        if (!c.ok) return c.error;
        const r = await updateRequisition(id, c.data, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "update", entity: "requisition", entityId: id, entityLabel: c.data.itemName });
        return { ok: true, id, result: "Requisition updated." };
      },
      remove: async (id, u) => {
        const before = await getRequisition(id);
        if (!before || (before.requestedBy.userId !== u.id && !isStaff(u))) return fail("Requisition not found.");
        const r = await deleteRequisition(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "requisition", entityId: id, entityLabel: before.prCode });
        return { ok: true, id };
      },
    },
  },
  {
    key: "prms.purchase_order", panel: "prms", label: "Purchase order", description: "Orders to vendors (draft → issued → received → closed / cancelled) with line items and GST.", collection: "prms_purchase_orders", idType: "string", baseFilter: soft, titleField: "poNumber", search: ["poNumber", "vendorName"],
    read: "staff", write: "staff", allow: canManageProcurement, canDelete: true,
    fields: [f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor", true), f.json("items", "Line items: [{description, hsn?, quantity, uom, unitPrice, gstRate}]", true), f.num("discount", "Discount"), f.enum("currency", "Currency", CURRENCIES), f.ref("requisitionId", "Source requisition (prms.requisition id)", "prms.requisition"), f.str("departmentId", "Department id"), f.str("departmentName", "Department name"), f.str("projectId", "Project id"), f.str("projectName", "Project name"), f.text("deliveryAddress", "Delivery address"), f.date("deliveryDate", "Delivery date"), f.str("paymentTerms", "Payment terms"), f.text("notes", "Notes")],
    ops: {
      create: async (v, u) => {
        const vendor = await getVendor(String(v.vendorId ?? ""));
        if (!vendor) return fail("Select a vendor (prms.vendor).");
        const items = poLines(v.items);
        if (!items.length) return fail("Add at least one line item: [{description, quantity, uom, unitPrice, gstRate}].");
        const payload = { vendorId: vendor._id, vendorName: vendor.companyName, requisitionId: str(v.requisitionId), departmentId: str(v.departmentId), departmentName: str(v.departmentName), projectId: str(v.projectId), projectName: str(v.projectName), items, discount: Number(v.discount) || 0, currency: str(v.currency) ?? vendor.currency ?? "INR", deliveryAddress: str(v.deliveryAddress), deliveryDate: str(v.deliveryDate), paymentTerms: str(v.paymentTerms) ?? vendor.paymentTerms ?? null, notes: str(v.notes) };
        const po = await createPurchaseOrder(payload as never, u.id);
        await audit(u, { action: "create", entity: "purchase_order", entityId: po._id, entityLabel: po.poNumber });
        if (payload.requisitionId) {
          const { getDb } = await import("@/lib/mongodb");
          await (await getDb()).collection<{ _id: string; status: string }>("prms_requisitions").updateOne({ _id: payload.requisitionId, status: "approved" }, { $set: { status: "converted", updatedAt: new Date(), updatedBy: u.id } });
        }
        return { ok: true, id: po._id, record: po as unknown as Json, result: `${po.poNumber} created as a draft.` };
      },
      update: async (id, v, u) => {
        const before = await getPurchaseOrder(id);
        if (!before) return fail("Purchase order not found.");
        const m = { ...(before as unknown as Json), ...v };
        const vendor = await getVendor(String(m.vendorId ?? ""));
        if (!vendor) return fail("Select a vendor (prms.vendor).");
        const items = poLines(m.items);
        if (!items.length) return fail("Add at least one line item.");
        const r = await updatePurchaseOrder(id, { vendorId: vendor._id, vendorName: vendor.companyName, requisitionId: str(m.requisitionId), departmentId: str(m.departmentId), departmentName: str(m.departmentName), projectId: str(m.projectId), projectName: str(m.projectName), items, discount: Number(m.discount) || 0, currency: str(m.currency) ?? "INR", deliveryAddress: str(m.deliveryAddress), deliveryDate: str(m.deliveryDate), paymentTerms: str(m.paymentTerms), notes: str(m.notes) } as never, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "update", entity: "purchase_order", entityId: id, entityLabel: vendor.companyName });
        return { ok: true, id, result: "Purchase order updated." };
      },
      remove: async (id, u) => {
        const before = await getPurchaseOrder(id);
        const r = await deletePurchaseOrder(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "purchase_order", entityId: id, entityLabel: before?.poNumber });
        return { ok: true, id };
      },
    },
  },
  {
    key: "prms.rfq", panel: "prms", label: "RFQ (request for quotation)", description: "Quotation requests sent to vendors; quotations are compared and one vendor is awarded (which creates the PO).", collection: "prms_rfqs", idType: "string", baseFilter: soft, titleField: "title", search: ["title", "rfqCode"],
    read: "staff", write: "staff", allow: canManageProcurement, canDelete: true,
    fields: [f.str("title", "Title", true), f.text("description", "Description"), f.json("lines", "Lines: [{description, quantity, uom}]", true), f.list("vendorIds", "Vendors to ask (prms.vendor ids)"), f.ref("requisitionId", "Source requisition", "prms.requisition"), f.str("departmentId", "Department id"), f.str("departmentName", "Department name")],
    ops: {
      create: async (v, u) => {
        const title = String(v.title ?? "").trim();
        const lines = rfqLines(v.lines);
        if (!title) return fail("Title is required.");
        if (!lines.length) return fail("Add at least one line: [{description, quantity, uom}].");
        const rfq = await createRfq({ title, description: str(v.description), requisitionId: str(v.requisitionId), departmentId: str(v.departmentId), departmentName: str(v.departmentName), lines, vendorIds: ((v.vendorIds as string[]) ?? []).filter(Boolean) } as never, u.id);
        await audit(u, { action: "create", entity: "rfq", entityId: rfq._id, entityLabel: title });
        return { ok: true, id: rfq._id, record: rfq as unknown as Json };
      },
      update: async (id, v, u) => {
        const before = await getRfq(id);
        if (!before) return fail("RFQ not found.");
        const m = { ...(before as unknown as Json), ...v };
        const lines = rfqLines(m.lines);
        if (!String(m.title ?? "").trim() || !lines.length) return fail("A title and at least one line are required.");
        const r = await updateRfq(id, { title: String(m.title).trim(), description: str(m.description), requisitionId: str(m.requisitionId), departmentId: str(m.departmentId), departmentName: str(m.departmentName), lines, vendorIds: ((m.vendorIds as string[]) ?? []).filter(Boolean) } as never, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "update", entity: "rfq", entityId: id, entityLabel: String(m.title) });
        return { ok: true, id, result: "RFQ updated." };
      },
      remove: async (id, u) => {
        const before = await getRfq(id);
        const r = await deleteRfq(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "rfq", entityId: id, entityLabel: before?.title });
        return { ok: true, id };
      },
    },
  },
  { key: "prms.goods_receipt", panel: "prms", label: "Goods receipt (GRN)", description: "Goods received against purchase orders.", collection: "prms_goods_receipts", idType: "string", baseFilter: soft, titleField: "grnNumber", search: ["grnNumber", "poNumber"], read: "staff", write: "staff", allow: canManageProcurement, canDelete: true,
    fields: [f.ref("poId", "Purchase order (prms.purchase_order id)", "prms.purchase_order", true), f.json("lines", "Lines: [{itemIndex, receivedQty, acceptedQty, remarks?}]", true), f.str("warehouseLocation", "Warehouse / location"), f.date("receivedDate", "Received on"), f.bool("qualityChecked", "Quality checked"), f.text("remarks", "Remarks")],
    ops: {
      create: async (v, u) => {
        if (!String(v.poId ?? "")) return fail("Select a purchase order.");
        const lines: GrnLineInput[] = (Array.isArray(v.lines) ? (v.lines as Json[]) : []).map((l) => ({ itemIndex: Number(l.itemIndex), receivedQty: Number(l.receivedQty) || 0, acceptedQty: Number(l.acceptedQty) || 0, remarks: str(l.remarks) })).filter((l) => Number.isInteger(l.itemIndex) && l.receivedQty > 0);
        const r = await createGoodsReceipt({ poId: String(v.poId), warehouseLocation: str(v.warehouseLocation), receivedDate: dateOk(v.receivedDate) ? String(v.receivedDate) : new Date().toISOString().slice(0, 10), qualityChecked: v.qualityChecked === true, remarks: str(v.remarks), lines }, u.id);
        if (!r.ok) return fail(r.reason);
        return { ok: true, id: r.id, result: "Goods receipt recorded." };
      },
      remove: async (id, u) => {
        const before = await getGoodsReceipt(id);
        const r = await deleteGoodsReceipt(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "grn", entityId: id, entityLabel: (before as unknown as Json | null)?.grnNumber as string | undefined });
        return { ok: true, id };
      },
    },
  },
  {
    key: "prms.invoice", panel: "prms", label: "Vendor bill", description: "Bills from vendors (pending → approved → paid) matched to POs and goods receipts.", collection: "prms_invoices", idType: "string", baseFilter: soft, titleField: "invoiceNumber", search: ["invoiceNumber", "vendorName", "vendorInvoiceNumber"],
    read: "staff", write: "staff", allow: canManageFinance, canDelete: true,
    fields: [f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor", true), f.str("vendorInvoiceNumber", "Vendor's invoice number"), f.str("poNumber", "PO number to match"), f.date("invoiceDate", "Invoice date", true), f.date("dueDate", "Due date"), f.num("subtotal", "Taxable amount", true), f.num("gstAmount", "GST amount"), f.num("tdsRate", "TDS rate %"), f.enum("currency", "Currency", CURRENCIES), f.text("notes", "Notes")],
    ops: {
      create: async (v, u) => {
        const d = await billData(v);
        if ("error" in d) return d.error;
        const created = await createInvoice(d.data, u.id);
        await audit(u, { action: "create", entity: "invoice", entityId: created._id, entityLabel: created.invoiceNumber, summary: `${created.poMatched ? "PO-matched" : "no PO match"} · ${created.grnMatched ? "GRN-matched" : "no GRN"}` });
        return { ok: true, id: created._id, record: created as unknown as Json };
      },
      update: async (id, v, u) => {
        const before = await getInvoice(id);
        if (!before) return fail("Bill not found.");
        const d = await billData({ ...(before as unknown as Json), ...v });
        if ("error" in d) return d.error;
        const r = await updateInvoice(id, d.data, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "update", entity: "invoice", entityId: id, entityLabel: before.invoiceNumber });
        return { ok: true, id, result: "Bill updated." };
      },
      remove: async (id, u) => {
        const before = await getInvoice(id);
        const r = await deleteInvoice(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "invoice", entityId: id, entityLabel: before?.invoiceNumber });
        return { ok: true, id };
      },
    },
  },
  { key: "prms.payment", panel: "prms", label: "Vendor payment", description: "Payments made against vendor bills (scheduled / processed).", collection: "prms_payments", idType: "string", baseFilter: soft, read: "staff", allowRead: canManageFinance },
  {
    key: "prms.expense", panel: "prms", label: "Expense", description: "Business expenses and claims (submitted → approved → reimbursed), one-time or recurring. Employees raise and see their own.", collection: "prms_expenses", idType: "string", baseFilter: soft, titleField: "expenseCode", search: ["expenseCode", "description", "vendorName", "invoiceNumber"],
    read: "staff", write: "any", selfWrite: true, canDelete: true, self: mineExp,
    fields: [f.enum("category", "Category", ECAT, true), f.str("subcategory", "Sub-category"), f.num("amount", "Amount (before GST)", true), f.num("gstRate", "GST rate %"), f.enum("currency", "Currency", CURRENCIES), f.enum("paymentMethod", "Payment method", METHODS), f.date("expenseDate", "Expense date", true), f.str("invoiceNumber", "Invoice number"), f.text("description", "Description"), f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor"), f.str("departmentId", "Department id"), f.str("departmentName", "Department name"), f.str("projectId", "Project id"), f.str("projectName", "Project name"), f.enum("expenseType", "One-time or recurring", ["one_time", "recurring"]), f.enum("recurrenceInterval", "Recurrence (for recurring)", RECUR), f.bool("autoApprove", "Approve immediately (needs expense authority)")],
    ops: {
      create: async (v, u) => {
        const d = await expenseData(v);
        if ("error" in d) return d.error;
        const autoApprove = canManageExpenses(u) && v.autoApprove === true;
        const created = await createExpense(d.data, { userId: u.id, name: nameFromEmail(u.email) }, u.id, autoApprove);
        await audit(u, { action: "create", entity: "expense", entityId: created._id, entityLabel: created.expenseCode });
        if (!autoApprove) await notifyStaff({ type: "expense_submitted", title: `Expense ${created.expenseCode} awaiting approval`, body: `${created.currency} ${created.totalAmount.toLocaleString("en-IN")}`, link: `/spendiq/expenses/${created._id}`, dedupeKey: `expense_submitted:${created._id}` } as never, ["super_admin", "prms_admin", "finance", "procurement_manager"]);
        return { ok: true, id: created._id, record: created as unknown as Json };
      },
      update: async (id, v, u) => {
        const before = await getExpense(id);
        if (!before || (before.raisedByUserId !== u.id && !isStaff(u))) return fail("Expense not found.");
        const d = await expenseData({ ...(before as unknown as Json), expenseDate: before.expenseDate.toISOString().slice(0, 10), recurrenceInterval: before.recurrence?.interval ?? null, ...v });
        if ("error" in d) return d.error;
        const r = await updateExpense(id, d.data, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "update", entity: "expense", entityId: id, entityLabel: before.expenseCode });
        return { ok: true, id, result: "Expense updated." };
      },
      remove: async (id, u) => {
        const before = await getExpense(id);
        if (!before || (before.raisedByUserId !== u.id && !isStaff(u))) return fail("Expense not found.");
        const r = await deleteExpense(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "expense", entityId: id, entityLabel: before.expenseCode });
        return { ok: true, id };
      },
    },
  },
  {
    key: "prms.asset", panel: "prms", label: "Asset", description: "Company assets: laptops, furniture, equipment — cost, location, depreciation, who holds it, status.", collection: "prms_assets", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "assetCode", "serialNumber", "brand", "model"],
    read: "staff", write: "staff", allow: canManageProcurement, canDelete: true,
    fields: [f.str("name", "Name", true), f.enum("category", "Category", ACAT, true), f.str("brand", "Brand"), f.str("model", "Model"), f.str("serialNumber", "Serial number"), f.date("purchaseDate", "Purchase date", true), f.num("purchaseCost", "Purchase cost", true), f.enum("currency", "Currency", CURRENCIES), f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor"), f.date("warrantyExpiry", "Warranty expiry"), f.str("officeLocation", "Office location"), f.enum("depreciationMethod", "Depreciation", DEPR), f.num("usefulLifeYears", "Useful life (years)"), f.num("salvageValue", "Salvage value"), f.text("notes", "Notes")],
    ops: {
      create: async (v, u) => {
        const d = await assetData(v);
        if ("error" in d) return d.error;
        const a = await createAsset(d.data, u.id);
        await audit(u, { action: "create", entity: "asset", entityId: a._id, entityLabel: a.assetCode });
        return { ok: true, id: a._id, record: a as unknown as Json };
      },
      update: async (id, v, u) => {
        const before = await getAsset(id);
        if (!before) return fail("Asset not found.");
        const d = await assetData({ ...(before as unknown as Json), ...v });
        if ("error" in d) return d.error;
        const a = await updateAsset(id, d.data, u.id);
        await audit(u, { action: "update", entity: "asset", entityId: id, entityLabel: a?.assetCode ?? before.assetCode });
        return { ok: true, id, result: "Asset updated." };
      },
      remove: async (id, u) => {
        const before = await getAsset(id);
        const r = await deleteAsset(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "asset", entityId: id, entityLabel: before?.assetCode });
        return { ok: true, id };
      },
    },
  },
  {
    key: "prms.inventory_item", panel: "prms", label: "Inventory item", description: "Stock items: quantity on hand, unit cost, minimum stock, location.", collection: "prms_inventory_items", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "sku", "category"],
    read: "staff", write: "staff", allow: canManageProcurement, canDelete: true,
    fields: [f.str("name", "Name", true), f.str("category", "Category"), f.enum("uom", "Unit", UOM), f.num("unitCost", "Unit cost"), f.num("minStock", "Minimum stock"), f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor"), f.str("location", "Location"), f.text("notes", "Notes")],
    ops: {
      create: async (v, u) => {
        const name = String(v.name ?? "").trim();
        if (!name) return fail("Name is required.");
        const item = await createInventoryItem({ name, category: str(v.category), uom: str(v.uom) ?? "pcs", unitCost: Number(v.unitCost) || 0, minStock: Number(v.minStock) || 0, vendorId: str(v.vendorId), vendorName: await vendorName(v.vendorId), location: str(v.location), notes: str(v.notes) } as never, u.id);
        await audit(u, { action: "create", entity: "inventory_item", entityId: item._id, entityLabel: name });
        return { ok: true, id: item._id, record: item as unknown as Json };
      },
      update: async (id, v, u) => {
        const before = await getInventoryItem(id);
        if (!before) return fail("Item not found.");
        const m = { ...(before as unknown as Json), ...v };
        await updateInventoryItem(id, { name: String(m.name).trim(), category: str(m.category), uom: str(m.uom) ?? "pcs", unitCost: Number(m.unitCost) || 0, minStock: Number(m.minStock) || 0, vendorId: str(m.vendorId), vendorName: await vendorName(m.vendorId), location: str(m.location), notes: str(m.notes) } as never, u.id);
        await audit(u, { action: "update", entity: "inventory_item", entityId: id, entityLabel: String(m.name) });
        return { ok: true, id, result: "Item updated." };
      },
      remove: async (id, u) => {
        const before = await getInventoryItem(id);
        const r = await deleteInventoryItem(id, u.id);
        if (!r.ok) return fail(r.reason);
        await audit(u, { action: "delete", entity: "inventory_item", entityId: id, entityLabel: before?.name });
        return { ok: true, id };
      },
    },
  },
  resource<NonNullable<Awaited<ReturnType<typeof getContract>>>>({
    key: "prms.contract", label: "Contract", description: "Vendor contracts and AMCs: dates, value, renewal, SLA, auto-renew.", collection: "prms_contracts", entity: "contract", title: "title", code: "contractCode", search: ["title", "contractCode", "vendorName"],
    fields: [f.str("title", "Title", true), f.enum("contractType", "Type", CTYPES), f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor"), f.date("startDate", "Start", true), f.date("endDate", "End", true), f.date("renewalDate", "Renewal date"), f.num("value", "Value"), f.enum("currency", "Currency", CURRENCIES), f.text("slaSummary", "SLA summary"), f.bool("autoRenew", "Auto-renew"), f.enum("status", "Status", RSTATUS), f.text("notes", "Notes")],
    get: getContract, create: createContract as never, update: updateContract as never, remove: deleteContractRow,
    build: (v, vendor) => {
      const title = String(v.title ?? "").trim();
      if (!title) return { error: fail("Title is required.") };
      if (!dateOk(v.startDate) || !dateOk(v.endDate)) return { error: fail("Start and end dates are required (YYYY-MM-DD).") };
      if (String(v.endDate) < String(v.startDate)) return { error: fail("End date is before the start date.") };
      if (!isValidResourceStatus(String(v.status ?? "active"))) return { error: fail("Unknown status.", { allowed: RSTATUS }) };
      return { title, contractType: String(v.contractType ?? "AMC"), vendorId: str(v.vendorId), vendorName: vendor, startDate: String(v.startDate), endDate: String(v.endDate), renewalDate: str(v.renewalDate), value: Number(v.value) || 0, currency: String(v.currency ?? "INR"), slaSummary: str(v.slaSummary), autoRenew: v.autoRenew === true, status: String(v.status ?? "active") as ResourceStatus, notes: str(v.notes) } satisfies ContractWriteInput;
    },
  }),
  {
    key: "prms.budget", panel: "prms", label: "Budget", description: "Budgets per company, department or project with allocated vs consumed amounts.", collection: "prms_budgets", idType: "string", baseFilter: soft, titleField: "name", search: ["name", "budgetCode", "scopeName"],
    read: "staff", write: "staff", allow: canManageFinance, canDelete: true,
    fields: [f.str("name", "Name", true), f.enum("level", "Level", BLEVEL), f.str("scopeId", "Department/project id (not for company level)"), f.str("scopeName", "Department/project name"), f.enum("period", "Period", BPERIOD), f.date("periodStart", "Period start", true), f.date("periodEnd", "Period end", true), f.num("allocatedAmount", "Allocated amount", true), f.enum("currency", "Currency", CURRENCIES), f.text("notes", "Notes")],
    ops: {
      create: async (v, u) => {
        const d = budgetData(v);
        if ("error" in d) return d.error;
        const b = await createBudget(d.data, u.id);
        await audit(u, { action: "create", entity: "budget", entityId: b._id, entityLabel: b.budgetCode });
        return { ok: true, id: b._id, record: b as unknown as Json };
      },
      update: async (id, v, u) => {
        const before = await getBudget(id);
        if (!before) return fail("Budget not found.");
        const d = budgetData({ ...(before as unknown as Json), ...v });
        if ("error" in d) return d.error;
        await updateBudget(id, d.data, u.id);
        await audit(u, { action: "update", entity: "budget", entityId: id, entityLabel: d.data.name });
        return { ok: true, id, result: "Budget updated." };
      },
      remove: async (id, u) => {
        const before = await getBudget(id);
        await deleteBudget(id, u.id);
        await audit(u, { action: "delete", entity: "budget", entityId: id, entityLabel: before?.budgetCode ?? null });
        return { ok: true, id };
      },
    },
  },
  resource<NonNullable<Awaited<ReturnType<typeof getSubscription>>>>({
    key: "prms.software_subscription", label: "Software subscription", description: "SaaS and software licences: provider, seats, cost, billing cycle, renewal.", collection: "prms_software_subscriptions", entity: "subscription", title: "serviceName", search: ["serviceName", "provider"],
    fields: [f.str("serviceName", "Service name", true), f.str("provider", "Provider"), f.num("licenseCount", "Licences / seats"), f.num("cost", "Cost per cycle"), f.enum("billingCycle", "Billing cycle", CYCLE), f.enum("currency", "Currency", CURRENCIES), f.date("renewalDate", "Renewal date"), f.str("ownerEmployeeId", "Owner (hrms.employee id)"), f.str("ownerName", "Owner name"), f.bool("autoRenew", "Auto-renew"), f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor"), f.enum("status", "Status", RSTATUS), f.text("notes", "Notes")],
    get: getSubscription, create: createSubscription as never, update: updateSubscription as never, remove: deleteSubscriptionRow,
    build: (v, vendor) => {
      const serviceName = String(v.serviceName ?? "").trim();
      if (!serviceName) return { error: fail("Service name is required.") };
      const bad = cycleOk(v) ?? statusOk(v);
      if (bad) return { error: bad };
      return { serviceName, provider: String(v.provider ?? "").trim(), licenseCount: Number(v.licenseCount) || 1, cost: Number(v.cost) || 0, billingCycle: String(v.billingCycle ?? "monthly") as BillingCycle, currency: String(v.currency ?? "INR"), renewalDate: str(v.renewalDate), ownerEmployeeId: str(v.ownerEmployeeId), ownerName: str(v.ownerName), autoRenew: v.autoRenew === true, vendorId: str(v.vendorId), vendorName: vendor, status: String(v.status ?? "active") as ResourceStatus, notes: str(v.notes) } satisfies SubscriptionWriteInput;
    },
  }),
  resource<NonNullable<Awaited<ReturnType<typeof getThirdPartyService>>>>({
    key: "prms.service", label: "Third-party service", description: "Outside services you pay for: provider, type, cost, SLA, renewal.", collection: "prms_third_party_services", entity: "third_party_service", title: "name", search: ["name", "provider", "serviceType"],
    fields: [f.str("name", "Name", true), f.str("serviceType", "Service type"), f.str("provider", "Provider"), f.num("cost", "Cost per cycle"), f.enum("billingCycle", "Billing cycle", CYCLE), f.enum("currency", "Currency", CURRENCIES), f.text("slaSummary", "SLA summary"), f.date("renewalDate", "Renewal date"), f.bool("autoRenew", "Auto-renew"), f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor"), f.enum("status", "Status", RSTATUS), f.text("notes", "Notes")],
    get: getThirdPartyService, create: createThirdPartyService as never, update: updateThirdPartyService as never, remove: deleteThirdPartyRow,
    build: (v, vendor) => {
      const name = String(v.name ?? "").trim();
      if (!name) return { error: fail("Name is required.") };
      const bad = cycleOk(v) ?? statusOk(v);
      if (bad) return { error: bad };
      return { name, serviceType: String(v.serviceType ?? "").trim(), provider: String(v.provider ?? "").trim(), cost: Number(v.cost) || 0, billingCycle: String(v.billingCycle ?? "monthly") as BillingCycle, currency: String(v.currency ?? "INR"), slaSummary: str(v.slaSummary), renewalDate: str(v.renewalDate), autoRenew: v.autoRenew === true, vendorId: str(v.vendorId), vendorName: vendor, status: String(v.status ?? "active") as ResourceStatus, notes: str(v.notes) } satisfies ThirdPartyWriteInput;
    },
  }),
  resource<NonNullable<Awaited<ReturnType<typeof getInfrastructureResource>>>>({
    key: "prms.infrastructure", label: "Infrastructure resource", description: "Servers, domains, hosting, SSL, storage: provider, type, region, cost, renewal.", collection: "prms_infrastructure", entity: "infrastructure", title: "name", search: ["name", "provider", "resourceType"],
    fields: [f.str("name", "Name", true), f.str("provider", "Provider"), f.enum("resourceType", "Type", INFRA), f.str("region", "Region"), f.num("cost", "Cost per cycle"), f.enum("billingCycle", "Billing cycle", CYCLE), f.enum("currency", "Currency", CURRENCIES), f.date("renewalDate", "Renewal date"), f.bool("autoRenew", "Auto-renew"), f.ref("vendorId", "Vendor (prms.vendor id)", "prms.vendor"), f.enum("status", "Status", RSTATUS), f.text("notes", "Notes")],
    get: getInfrastructureResource, create: createInfrastructure as never, update: updateInfrastructure as never, remove: deleteInfrastructureRow,
    build: (v, vendor) => {
      const name = String(v.name ?? "").trim();
      if (!name) return { error: fail("Name is required.") };
      const bad = cycleOk(v) ?? statusOk(v);
      if (bad) return { error: bad };
      return { name, provider: String(v.provider ?? "").trim(), resourceType: String(v.resourceType ?? "").trim(), region: str(v.region), cost: Number(v.cost) || 0, billingCycle: String(v.billingCycle ?? "monthly") as BillingCycle, currency: String(v.currency ?? "INR"), renewalDate: str(v.renewalDate), autoRenew: v.autoRenew === true, vendorId: str(v.vendorId), vendorName: vendor, status: String(v.status ?? "active") as ResourceStatus, notes: str(v.notes) } satisfies InfraWriteInput;
    },
  }),
  { key: "prms.asset_assignment", panel: "prms", label: "Asset assignment", description: "Who holds which asset and since when.", collection: "prms_asset_assignments", idType: "string", read: "staff" },
  { key: "prms.inventory_transaction", panel: "prms", label: "Inventory movement", description: "Stock in / out / adjustments per item.", collection: "prms_inventory_transactions", idType: "string", read: "staff" },
  { key: "prms.activity", panel: "prms", label: "Audit log", description: "Who changed what in SpendIQ.", collection: "prms_activity_logs", idType: "string", search: ["entityLabel", "summary", "actorEmail"], read: "admin", allowRead: canViewAuditLog },
];

async function billData(v: Json): Promise<{ data: InvoiceWriteData } | { error: Json }> {
  const vendor = await getVendor(String(v.vendorId ?? ""));
  if (!vendor) return { error: fail("Select a vendor (prms.vendor).") };
  if (!dateOk(v.invoiceDate)) return { error: fail("Enter a valid invoice date (YYYY-MM-DD).") };
  const subtotal = Number(v.subtotal);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return { error: fail("Enter the taxable amount.") };
  let poId: string | null = null;
  let poNumber: string | null = null;
  const poRef = String(v.poNumber ?? "").trim();
  if (poRef) {
    const { getPurchaseOrderByNumber } = await import("@/lib/products/spendiq/purchase-orders");
    const po = await getPurchaseOrderByNumber(poRef);
    if (po) { poId = po._id; poNumber = po.poNumber; }
  }
  return { data: { vendorId: vendor._id, vendorName: vendor.companyName, vendorInvoiceNumber: str(v.vendorInvoiceNumber), poId, poNumber, invoiceDate: String(v.invoiceDate), dueDate: str(v.dueDate), subtotal, gstAmount: Number(v.gstAmount) || 0, tdsRate: Number(v.tdsRate) || 0, currency: str(v.currency) ?? vendor.currency ?? "INR", notes: str(v.notes) } as InvoiceWriteData };
}

async function expenseData(v: Json): Promise<{ data: ExpenseWriteData } | { error: Json }> {
  const category = String(v.category ?? "");
  if (!isValidExpenseCategory(category)) return { error: fail("Select a category.", { allowed: ECAT }) };
  const amount = Number(v.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: fail("Enter a valid amount.") };
  const method = String(v.paymentMethod ?? "bank_transfer");
  if (!isValidPaymentMethod(method)) return { error: fail("Unknown payment method.", { allowed: METHODS }) };
  if (!dateOk(v.expenseDate)) return { error: fail("Enter a valid expense date (YYYY-MM-DD).") };
  const expenseType = v.expenseType === "recurring" ? "recurring" : "one_time";
  const interval = v.recurrenceInterval ? String(v.recurrenceInterval) : null;
  if (expenseType === "recurring" && !isValidRecurrenceInterval(interval)) return { error: fail("Choose a recurrence interval.", { allowed: RECUR }) };
  return { data: { category, subcategory: str(v.subcategory), vendorId: str(v.vendorId), vendorName: await vendorName(v.vendorId), departmentId: str(v.departmentId), departmentName: str(v.departmentName), projectId: str(v.projectId), projectName: str(v.projectName), amount, gstRate: Number.isFinite(Number(v.gstRate)) ? Number(v.gstRate) : DEFAULT_GST_RATE, currency: String(v.currency ?? "INR"), paymentMethod: method, invoiceNumber: str(v.invoiceNumber), expenseDate: String(v.expenseDate), description: str(v.description), expenseType, recurrenceInterval: expenseType === "recurring" ? (interval as ExpenseWriteData["recurrenceInterval"]) : null } as ExpenseWriteData };
}

async function assetData(v: Json): Promise<{ data: AssetWriteData } | { error: Json }> {
  const name = String(v.name ?? "").trim();
  if (!name) return { error: fail("Name is required.") };
  const category = String(v.category ?? "").trim();
  if (!category) return { error: fail("Category is required.", { allowed: ACAT }) };
  if (!dateOk(v.purchaseDate)) return { error: fail("Enter a valid purchase date (YYYY-MM-DD).") };
  const cost = Number(v.purchaseCost);
  if (!Number.isFinite(cost) || cost < 0) return { error: fail("Enter a valid cost.") };
  const dep = String(v.depreciationMethod ?? "slm");
  if (!isValidDepreciationMethod(dep)) return { error: fail("Unknown depreciation method.", { allowed: DEPR }) };
  return { data: { name, category, brand: str(v.brand), model: str(v.model), serialNumber: str(v.serialNumber), purchaseDate: String(v.purchaseDate), purchaseCost: cost, currency: String(v.currency ?? "INR"), vendorId: str(v.vendorId), vendorName: await vendorName(v.vendorId), warrantyExpiry: str(v.warrantyExpiry), officeLocation: str(v.officeLocation), depreciationMethod: dep as AssetWriteData["depreciationMethod"], usefulLifeYears: Number(v.usefulLifeYears) || 5, salvageValue: Number(v.salvageValue) || 0, notes: str(v.notes) } as AssetWriteData };
}

function budgetData(v: Json): { data: BudgetWriteData } | { error: Json } {
  const name = String(v.name ?? "").trim();
  if (!name) return { error: fail("Name is required.") };
  const level = String(v.level ?? "company");
  if (!isValidBudgetLevel(level)) return { error: fail("Unknown level.", { allowed: BLEVEL }) };
  const period = String(v.period ?? "yearly");
  if (!isValidBudgetPeriod(period)) return { error: fail("Unknown period.", { allowed: BPERIOD }) };
  if (!dateOk(v.periodStart) || !dateOk(v.periodEnd)) return { error: fail("Period start and end dates are required (YYYY-MM-DD).") };
  if (String(v.periodEnd) < String(v.periodStart)) return { error: fail("End is before start.") };
  const allocated = Number(v.allocatedAmount);
  if (!Number.isFinite(allocated) || allocated <= 0) return { error: fail("Enter an allocation above 0.") };
  return { data: { name, level: level as BudgetLevel, scopeId: level === "company" ? null : str(v.scopeId), scopeName: level === "company" ? null : str(v.scopeName), period: period as BudgetPeriod, periodStart: String(v.periodStart), periodEnd: String(v.periodEnd), allocatedAmount: allocated, currency: String(v.currency ?? "INR"), notes: str(v.notes) } as BudgetWriteData };
}

const R = (key: string, label: string, description: string, params: ActionDef["params"], level: ActionDef["level"], allow: ((u: AgentUser) => boolean) | undefined, run: ActionDef["run"], destructive = false): ActionDef => ({ key, panel: "prms", label, description, params, level, allow, run, destructive });
const refP = (key: string, label: string, entity: string) => f.ref(key, label, entity, true);

export const PRMS_ACTIONS: ActionDef[] = [
  R("prms.submit_requisition", "Submit a requisition for approval", "Send a draft requisition to the approvers.", [refP("requisitionId", "Requisition id", "prms.requisition")], "any", undefined, async (v, u) => {
    const before = await getRequisition(String(v.requisitionId));
    if (!before || (before.requestedBy.userId !== u.id && !isStaff(u))) return fail("Requisition not found.");
    const r = await submitRequisition(before._id, u.id);
    if (!r.ok) return fail(r.reason);
    await audit(u, { action: "submit", entity: "requisition", entityId: before._id, entityLabel: before.prCode, summary: `status: draft → ${r.doc?.status ?? "submitted"}` });
    await notifyStaff({ type: "requisition_submitted", title: `Requisition ${before.prCode} awaiting approval`, body: `${before.itemName} · ${before.currency} ${before.estimatedCost.toLocaleString("en-IN")}`, link: `/spendiq/requisitions/${before._id}`, dedupeKey: `requisition_submitted:${before._id}` } as never, ["super_admin", "prms_admin", "procurement_manager", "dept_manager"]);
    return { ok: true, id: before._id, result: "Submitted for approval." };
  }),
  R("prms.decide_requisition", "Approve or reject a requisition", "Decide a requisition waiting for your approval level and tell the requester.", [refP("requisitionId", "Requisition id", "prms.requisition"), f.bool("approve", "Approve (false = reject)"), f.str("note", "Note")], "staff", canApproveRequisitions, async (v, u) => {
    const before = await getRequisition(String(v.requisitionId));
    if (!before) return fail("Requisition not found.");
    const approve = v.approve !== false;
    const res = await decideRequisition(before._id, approve, str(v.note), { id: u.id, email: u.email, roles: u.roles as never, permissionOverrides: u.permissionOverrides });
    if (!res.ok) return fail(res.reason);
    await audit(u, { action: approve ? "approve" : "reject", entity: "requisition", entityId: before._id, entityLabel: before.prCode, summary: `status: ${before.status} → ${res.doc?.status ?? "?"}` });
    await notify({ recipientUserId: before.requestedBy.userId, audience: "employee", type: res.rejected ? "requisition_rejected" : res.fullyApproved ? "requisition_approved" : "requisition_progress", title: res.rejected ? `Requisition ${before.prCode} was rejected` : res.fullyApproved ? `Requisition ${before.prCode} approved` : `Requisition ${before.prCode} advanced`, body: str(v.note), link: `/spendiq/me/requisitions/${before._id}` } as never);
    if (res.fullyApproved) {
      const s = await getPrmsSettings();
      if (before.estimatedCost >= s.financeNotifyThreshold) await notifyStaff({ type: "requisition_high_value_approved", title: `High-value requisition ${before.prCode} approved`, body: `${before.currency} ${before.estimatedCost.toLocaleString("en-IN")} · ${before.itemName}`, link: `/spendiq/requisitions/${before._id}`, dedupeKey: `requisition_high_value_approved:${before._id}` } as never, ["super_admin", "prms_admin", "finance"]);
    }
    return { ok: true, id: before._id, result: res.rejected ? "Requisition rejected." : res.fullyApproved ? "Requisition fully approved." : "Approved at your level; it moves to the next approver." };
  }, true),
  R("prms.issue_purchase_order", "Issue a purchase order to the vendor", "Move a draft PO to issued (notifies procurement and finance).", [refP("poId", "Purchase order id", "prms.purchase_order")], "staff", canManageProcurement, async (v, u) => {
    const before = await getPurchaseOrder(String(v.poId));
    const r = await issuePurchaseOrder(String(v.poId), u.id);
    if (!r.ok) return fail(r.reason);
    await audit(u, { action: "status_change", entity: "purchase_order", entityId: String(v.poId), entityLabel: before?.poNumber, summary: "status: draft → issued" });
    await notifyStaff({ type: "po_issued", title: `${before?.poNumber} issued to ${before?.vendorName}`, body: `Total ${before?.currency} ${before?.totalAmount.toLocaleString("en-IN")}`, link: `/spendiq/purchase-orders/${String(v.poId)}`, dedupeKey: `po_issued:${String(v.poId)}` } as never, ["super_admin", "prms_admin", "procurement_manager", "finance"]);
    return { ok: true, id: String(v.poId), result: "Purchase order issued." };
  }, true),
  R("prms.set_po_status", "Cancel or close a purchase order", `Set a PO to cancelled or closed (statuses: ${PO.join(", ")}).`, [refP("poId", "Purchase order id", "prms.purchase_order"), f.enum("status", "New status", ["cancelled", "closed"], true)], "staff", canManageProcurement, async (v, u) => {
    const before = await getPurchaseOrder(String(v.poId));
    if (!before) return fail("Purchase order not found.");
    await setPurchaseOrderStatus(before._id, v.status as never, u.id);
    await audit(u, { action: "status_change", entity: "purchase_order", entityId: before._id, entityLabel: before.poNumber, summary: `status: ${before.status} → ${String(v.status)}` });
    return { ok: true, id: before._id, result: `PO is now ${String(v.status)}.` };
  }, true),
  R("prms.create_rfq_from_requisition", "Start an RFQ from an approved requisition", "Create an RFQ for the vendors you choose, from a requisition.", [refP("requisitionId", "Requisition id", "prms.requisition"), f.list("vendorIds", "Vendors to ask (prms.vendor ids)")], "staff", canManageProcurement, async (v, u) => {
    const rfq = await createRfqFromRequisition(String(v.requisitionId), ((v.vendorIds as string[]) ?? []).filter(Boolean), u.id);
    if (!rfq) return fail("Requisition not found.");
    return { ok: true, id: rfq._id, result: "RFQ created." };
  }),
  R("prms.send_rfq", "Send an RFQ to its vendors", "Mark the RFQ as sent so quotations can be recorded.", [refP("rfqId", "RFQ id", "prms.rfq")], "staff", canManageProcurement, async (v, u) => {
    const before = await getRfq(String(v.rfqId));
    if (!before) return fail("RFQ not found.");
    await setRfqStatus(before._id, "sent", u.id);
    await audit(u, { action: "status_change", entity: "rfq", entityId: before._id, entityLabel: before.title, summary: "status → sent" });
    return { ok: true, id: before._id, result: "RFQ marked as sent." };
  }),
  R("prms.add_quotation", "Record a vendor's quotation on an RFQ", "Enter the unit price a vendor quoted for each RFQ line (in order).", [refP("rfqId", "RFQ id", "prms.rfq"), refP("vendorId", "Vendor id", "prms.vendor"), f.json("unitPrices", "Unit prices, one per RFQ line, in order: [100, 250]", true), f.num("deliveryDays", "Delivery days"), f.str("paymentTerms", "Payment terms"), f.num("technicalScore", "Technical score"), f.text("notes", "Notes")], "staff", canManageProcurement, async (v, u) => {
    const rfq = await getRfq(String(v.rfqId));
    if (!rfq) return fail("RFQ not found.");
    const prices = rfq.lines.map((_, i) => Number((v.unitPrices as unknown[])?.[i]) || 0);
    const r = await addQuotation(rfq._id, { vendorId: String(v.vendorId), unitPrices: prices, deliveryDays: v.deliveryDays ? Number(v.deliveryDays) : null, paymentTerms: str(v.paymentTerms), technicalScore: v.technicalScore ? Number(v.technicalScore) : null, notes: str(v.notes) } as never, u.id);
    return r.ok ? { ok: true, id: rfq._id, result: "Quotation recorded." } : fail(r.reason);
  }),
  R("prms.award_rfq", "Award an RFQ to a vendor (creates the purchase order)", "Pick the winning vendor; a purchase order is created from their quotation.", [refP("rfqId", "RFQ id", "prms.rfq"), refP("vendorId", "Winning vendor id", "prms.vendor")], "staff", canManageProcurement, async (v, u) => {
    const before = await getRfq(String(v.rfqId));
    const r = await awardRfq(String(v.rfqId), String(v.vendorId), u.id);
    if (!r.ok) return fail(r.reason);
    await audit(u, { action: "approve", entity: "rfq", entityId: String(v.rfqId), entityLabel: before?.title, summary: `awarded to ${String(v.vendorId)}` });
    return { ok: true, id: r.poId, result: "RFQ awarded and a purchase order created." };
  }, true),
  R("prms.set_bill_status", "Approve or change a vendor bill's status", `Set a vendor bill's status (${BILLSTATUS.join(", ")}).`, [refP("billId", "Vendor bill id", "prms.invoice"), f.enum("status", "New status", BILLSTATUS, true)], "staff", canManageFinance, async (v, u) => {
    const status = String(v.status);
    if (!isValidInvoiceStatus(status)) return fail("Unknown status.", { allowed: BILLSTATUS });
    const before = await getInvoice(String(v.billId));
    if (!before) return fail("Bill not found.");
    await setInvoiceStatus(before._id, status as InvoiceStatus, u.id);
    await audit(u, { action: "status_change", entity: "invoice", entityId: before._id, entityLabel: before.invoiceNumber, summary: `status → ${status}` });
    return { ok: true, id: before._id, result: `Bill is now ${status}.` };
  }),
  R("prms.record_bill_payment", "Pay a vendor bill", "Record (or schedule) a payment against a vendor bill.", [refP("billId", "Vendor bill id", "prms.invoice"), f.num("amount", "Amount", true), f.enum("method", "Method", METHODS), f.date("paymentDate", "Payment date"), f.str("transactionReference", "Reference / UTR"), f.num("tdsDeducted", "TDS deducted"), f.enum("status", "processed or scheduled", ["processed", "scheduled"]), f.str("notes", "Notes")], "staff", canManageFinance, async (v, u) => {
    const method = String(v.method ?? "bank_transfer");
    if (!isValidPaymentMethod(method)) return fail("Unknown payment method.", { allowed: METHODS });
    const data: PaymentWriteData = { invoiceId: String(v.billId), amount: Number(v.amount) || 0, paymentDate: dateOk(v.paymentDate) ? String(v.paymentDate) : new Date().toISOString().slice(0, 10), method, transactionReference: str(v.transactionReference), tdsDeducted: Number(v.tdsDeducted) || 0, status: v.status === "scheduled" ? "scheduled" : "processed", notes: str(v.notes) } as PaymentWriteData;
    const r = await recordPayment(data, u.id);
    if (!r.ok) return fail(r.reason);
    const inv = await getInvoice(data.invoiceId);
    if (inv?.status === "paid") await notifyStaff({ type: "invoice_paid", title: `Invoice ${inv.invoiceNumber} fully paid`, body: inv.vendorName, link: `/spendiq/invoices/${inv._id}`, dedupeKey: `invoice_paid:${inv._id}` } as never, ["super_admin", "prms_admin", "finance"]);
    return { ok: true, id: String(v.billId), result: "Payment recorded." };
  }, true),
  R("prms.process_payment", "Mark a scheduled vendor payment as processed", "Confirm a scheduled payment has gone out.", [refP("paymentId", "Payment id", "prms.payment")], "staff", canManageFinance, async (v, u) => {
    const r = await markPaymentProcessed(String(v.paymentId), u.id);
    return r.ok ? { ok: true, id: String(v.paymentId), result: "Payment processed." } : fail(r.reason);
  }, true),
  R("prms.delete_payment", "Delete a vendor payment record", "Remove a recorded vendor payment (balances go back).", [refP("paymentId", "Payment id", "prms.payment")], "staff", canManageFinance, async (v, u) => {
    const p = await getPayment(String(v.paymentId));
    const r = await deletePayment(String(v.paymentId), u.id);
    return r.ok ? { ok: true, id: p?.invoiceId, result: "Payment deleted." } : fail(r.reason);
  }, true),
  R("prms.decide_expense", "Approve or reject an expense", "Decide a submitted expense and tell the person who raised it.", [refP("expenseId", "Expense id", "prms.expense"), f.bool("approve", "Approve (false = reject)"), f.str("note", "Note")], "staff", canManageExpenses, async (v, u) => {
    const approve = v.approve !== false;
    const res = await decideExpense(String(v.expenseId), approve, str(v.note), u.id);
    if (!res.ok) return fail(res.reason);
    await audit(u, { action: approve ? "approve" : "reject", entity: "expense", entityId: String(v.expenseId), entityLabel: res.expense?.expenseCode });
    if (res.expense) await notify({ recipientUserId: res.expense.raisedByUserId, audience: "employee", type: approve ? "expense_approved" : "expense_rejected", title: `Expense ${res.expense.expenseCode} ${approve ? "approved" : "rejected"}`, body: str(v.note), link: `/spendiq/me/expenses/${String(v.expenseId)}` } as never);
    return { ok: true, id: String(v.expenseId), result: approve ? "Expense approved." : "Expense rejected." };
  }, true),
  R("prms.reimburse_expense", "Mark an expense as reimbursed", "Record that the person has been paid back for an approved expense.", [refP("expenseId", "Expense id", "prms.expense")], "staff", canManageExpenses, async (v, u) => {
    const r = await markExpenseReimbursed(String(v.expenseId), u.id);
    if (!r.ok) return fail(r.reason);
    await audit(u, { action: "record", entity: "expense", entityId: String(v.expenseId), summary: "marked reimbursed" });
    return { ok: true, id: String(v.expenseId), result: "Marked reimbursed." };
  }, true),
  R("prms.set_recurring_expense", "Pause or resume a recurring expense", "Turn a recurring expense on or off.", [refP("expenseId", "Expense id", "prms.expense"), f.bool("active", "Active")], "staff", canManageExpenses, async (v, u) => {
    await setRecurringActive(String(v.expenseId), v.active !== false, u.id);
    return { ok: true, id: String(v.expenseId), result: v.active !== false ? "Recurring expense resumed." : "Recurring expense paused." };
  }),
  R("prms.assign_asset", "Give an asset to an employee", "Assign an asset (in stock) to an employee.", [refP("assetId", "Asset id", "prms.asset"), f.ref("employeeId", "Employee (hrms.employee id)", "hrms.employee", true), f.str("employeeName", "Employee name", true), f.str("note", "Note")], "staff", canManageProcurement, async (v, u) => {
    const r = await assignAsset(String(v.assetId), { id: String(v.employeeId), name: String(v.employeeName) }, str(v.note), u.id);
    if (!r.ok) return fail(r.reason);
    await audit(u, { action: "assign", entity: "asset_assignment", entityId: String(v.assetId), entityLabel: String(v.employeeName) });
    return { ok: true, id: String(v.assetId), result: `Assigned to ${String(v.employeeName)}.` };
  }),
  R("prms.return_asset", "Take an asset back", "Record that an assigned asset was returned to stock.", [refP("assetId", "Asset id", "prms.asset"), f.str("note", "Note")], "staff", canManageProcurement, async (v, u) => {
    const r = await returnAsset(String(v.assetId), str(v.note), u.id);
    if (!r.ok) return fail(r.reason);
    await audit(u, { action: "return", entity: "asset_assignment", entityId: String(v.assetId) });
    return { ok: true, id: String(v.assetId), result: "Asset returned." };
  }),
  R("prms.set_asset_status", "Change an asset's status", `Set an asset's status (${ASTATUS.join(", ")}).`, [refP("assetId", "Asset id", "prms.asset"), f.enum("status", "New status", ASTATUS, true), f.str("note", "Note")], "staff", canManageProcurement, async (v, u) => {
    const status = String(v.status);
    if (!isValidAssetStatus(status)) return fail("Unknown status.", { allowed: ASTATUS });
    const r = await changeAssetStatus(String(v.assetId), status as AssetStatus, str(v.note), u.id);
    if (!r.ok) return fail(r.reason);
    await audit(u, { action: "status_change", entity: "asset", entityId: String(v.assetId), summary: `status → ${status}` });
    return { ok: true, id: String(v.assetId), result: `Asset is now ${status}.` };
  }),
  R("prms.record_stock_movement", "Add or remove stock", `Record stock movement for an inventory item (${TXN.join(", ")}).`, [refP("itemId", "Inventory item id", "prms.inventory_item"), f.enum("type", "Type", TXN, true), f.num("quantity", "Quantity", true), f.num("unitCost", "Unit cost"), f.str("reference", "Reference"), f.str("note", "Note")], "staff", canManageProcurement, async (v, u) => {
    const type = String(v.type);
    if (!isValidInventoryTxnType(type)) return fail("Unknown movement type.", { allowed: TXN });
    const r = await recordInventoryTransaction(String(v.itemId), { type: type as InventoryTxnType, quantity: Number(v.quantity) || 0, unitCost: v.unitCost ? Number(v.unitCost) : null, reference: str(v.reference), note: str(v.note) }, u.id);
    return r.ok ? { ok: true, id: String(v.itemId), result: "Stock updated." } : fail(r.reason);
  }),
  R("prms.refresh_budgets", "Recalculate budget consumption", "Refresh how much of each budget has been spent.", [], "staff", canManageFinance, async () => {
    await refreshBudgetConsumption();
    return { ok: true, result: "Budgets refreshed." };
  }),
  R("prms.save_settings", "Change PRMS settings", "Default currency, approval and review thresholds.", [f.enum("defaultCurrency", "Default currency", CURRENCIES), f.num("procurementReviewThreshold", "Procurement review threshold"), f.num("financeNotifyThreshold", "Notify finance above")], "admin", canManageSettings, async (v, u) => {
    const cur = await getPrmsSettings();
    const data = normalizeSettingsInput({ ...(cur as unknown as Json), ...v });
    await updatePrmsSettings(data, u.id);
    await audit(u, { action: "update", entity: "settings", entityId: "config", entityLabel: "PRMS settings", summary: `default ${data.defaultCurrency} · review threshold ${data.procurementReviewThreshold}` });
    return { ok: true, result: "Settings saved." };
  }),
];

export const PRMS_REPORTS: ReportDef[] = [
  { key: "prms.dashboard", panel: "prms", label: "Procurement dashboard numbers", description: "Spend, open requisitions, POs, bills, vendors, assets and trends.", level: "staff", allow: canViewReports, params: [f.date("dateFrom", "From"), f.date("dateTo", "To")], run: async (v) => (await getPrmsDashboardStats({ dateFrom: v.dateFrom ? new Date(String(v.dateFrom)) : undefined, dateTo: v.dateTo ? new Date(`${String(v.dateTo)}T23:59:59`) : undefined } as never)) as unknown as Json },
];
