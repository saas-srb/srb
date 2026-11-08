import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { hasPrmsStaffRole } from "@/lib/prms-roles";
import { getDb } from "@/lib/mongodb";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import { getPurchaseOrder, getPurchaseOrderByNumber } from "@/lib/products/spendiq/purchase-orders";
import { renderItemInvoicePdf, renderItemReceiptPdf, type PdfItemDetails } from "@/components/products/spendiq/ItemInvoiceReceiptPdf";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ id: string }> };

async function handleGET(req: NextRequest, { params }: Context) {
  const user = await getCurrentPrmsUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Purchase orders, vendor invoices and the like are procurement documents — staff only (employees have their own requisition pages).
  if (!hasPrmsStaffRole(user.roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const pdfType = searchParams.get("type") === "receipt" ? "receipt" : "invoice";

  const db = await getDb();
  let itemDetails: PdfItemDetails | null = null;

  // 1. Try Purchase Order (by ID or PO Number)
  const po = (await getPurchaseOrder(id)) || (await getPurchaseOrderByNumber(id));
  if (po) {
    itemDetails = {
      id: String(po._id),
      code: po.poNumber,
      type: "po",
      title: `Purchase Order - ${po.poNumber}`,
      vendorName: po.vendorName,
      requesterName: po.departmentName || "Procurement Dept",
      category: "PURCHASE ORDER",
      date: (po.issuedAt || po.createdAt).toISOString().slice(0, 10),
      amount: po.totalAmount,
      currency: po.currency || "INR",
      status: po.status,
      subtotal: po.subtotal,
      taxAmount: po.gstAmount,
      lineItems: po.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.lineTotal,
      })),
      notes: po.notes || undefined,
    };
  }

  // 2. Try Requisition
  if (!itemDetails) {
    const reqDoc = (await db.collection("prms_requisitions").findOne({
      $or: [{ _id: id }, { prCode: id }],
      deletedAt: null,
    } as any)) as any;
    if (reqDoc) {
      itemDetails = {
        id: String(reqDoc._id),
        code: reqDoc.prCode || id,
        type: "procurement",
        title: reqDoc.itemName || "Procurement Requisition",
        vendorName: reqDoc.preferredVendorName || "Approved Vendor",
        requesterName: reqDoc.requestedBy?.name || "Staff Member",
        category: reqDoc.category || "Procurement",
        date: new Date(reqDoc.createdAt || Date.now()).toISOString().slice(0, 10),
        amount: reqDoc.estimatedCost || 0,
        currency: reqDoc.currency || "INR",
        status: reqDoc.status || "approved",
        subtotal: reqDoc.estimatedCost || 0,
        notes: reqDoc.justification || undefined,
      };
    }
  }

  // 3. Try Expense Claim
  if (!itemDetails) {
    const expDoc = (await db.collection("prms_expense_claims").findOne({
      $or: [{ _id: id }, { claimCode: id }],
      deletedAt: null,
    } as any)) as any;
    if (expDoc) {
      itemDetails = {
        id: String(expDoc._id),
        code: expDoc.claimCode || id,
        type: "expense",
        title: expDoc.title || "Expense Claim",
        vendorName: expDoc.merchant || expDoc.vendorName || "Merchant",
        requesterName: expDoc.employeeName || "Employee",
        category: expDoc.category || "Expense",
        date: new Date(expDoc.createdAt || Date.now()).toISOString().slice(0, 10),
        amount: expDoc.totalAmount || expDoc.amount || 0,
        currency: expDoc.currency || "INR",
        status: expDoc.status || "approved",
        subtotal: expDoc.totalAmount || expDoc.amount || 0,
        notes: expDoc.description || undefined,
      };
    }
  }

  // 4. Try Subscription
  if (!itemDetails) {
    const subDoc = (await db.collection("prms_subscriptions").findOne({
      $or: [{ _id: id }, { code: id }],
      deletedAt: null,
    } as any)) as any;
    if (subDoc) {
      itemDetails = {
        id: String(subDoc._id),
        code: subDoc.code || id,
        type: "subscription",
        title: subDoc.name || subDoc.title || "SaaS Subscription",
        vendorName: subDoc.vendorName || subDoc.provider || "SaaS Provider",
        category: "SOFTWARE & SUBSCRIPTION",
        date: new Date(subDoc.createdAt || Date.now()).toISOString().slice(0, 10),
        amount: subDoc.cost || subDoc.amount || 0,
        currency: subDoc.currency || "INR",
        status: subDoc.status || "active",
        subtotal: subDoc.cost || subDoc.amount || 0,
        notes: subDoc.notes || undefined,
      };
    }
  }

  // 5. Try Asset
  if (!itemDetails) {
    const assetDoc = (await db.collection("prms_assets").findOne({
      $or: [{ _id: id }, { assetTag: id }],
      deletedAt: null,
    } as any)) as any;
    if (assetDoc) {
      itemDetails = {
        id: String(assetDoc._id),
        code: assetDoc.assetTag || id,
        type: "asset",
        title: assetDoc.name || "Hardware Asset",
        vendorName: assetDoc.vendorName || "Hardware Supplier",
        category: "HARDWARE & ASSETS",
        date: new Date(assetDoc.purchaseDate || assetDoc.createdAt || Date.now()).toISOString().slice(0, 10),
        amount: assetDoc.purchaseCost || 0,
        currency: assetDoc.currency || "INR",
        status: assetDoc.status || "in_use",
        subtotal: assetDoc.purchaseCost || 0,
        notes: assetDoc.notes || undefined,
      };
    }
  }

  // Fallback generic item if ID was passed directly
  if (!itemDetails) {
    itemDetails = {
      id: id,
      code: id,
      type: "generic",
      title: `Item Ref: ${id}`,
      vendorName: "—",
      requesterName: user.email.split("@")[0] || "Staff",
      category: "FINANCIAL ITEM",
      date: new Date().toISOString().slice(0, 10),
      amount: 0,
      currency: "INR",
      status: "COMPLETED",
    };
  }

  const settings = await getPrmsSettings();
  const buffer =
    pdfType === "receipt"
      ? await renderItemReceiptPdf(itemDetails, settings.company)
      : await renderItemInvoicePdf(itemDetails, settings.company);

  const filename = `${pdfType.toUpperCase()}_${itemDetails.code}.pdf`;

  await recordPdf({ type: "prms_item", variant: pdfType, ref: itemDetails.code, by: user.email, role: "staff" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
