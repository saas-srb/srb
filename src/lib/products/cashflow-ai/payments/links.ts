import "server-only";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  type AuditFields,
} from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { paymentPublicBaseUrl } from "@/lib/products/cashflow-ai/payments/public-url";
import { PaymentSourceModule } from "./intents";

export const PAYMENT_LINKS_COLLECTION = "fms_payment_links";

export type PaymentLinkStatus = "DRAFT" | "ACTIVE" | "PARTIALLY_PAID" | "PAID" | "EXPIRED" | "CANCELLED";

export interface PaymentLink extends AuditFields {
  _id: string;
  token: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  customerId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  sourceModule: PaymentSourceModule;
  sourceRecordId: string | null;
  invoiceId: string | null;
  allowedMethods: string[];
  expiresAt: Date | null;
  maxAttempts: number;
  usageCount: number;
  status: PaymentLinkStatus;
  paymentIntentId: string | null;
}

export interface SerializedPaymentLink
  extends Omit<PaymentLink, "createdAt" | "updatedAt" | "deletedAt" | "expiresAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  expiresAt: string | null;
}

export function serializePaymentLink(pl: PaymentLink): SerializedPaymentLink {
  return {
    ...pl,
    createdAt: pl.createdAt.toISOString(),
    updatedAt: pl.updatedAt.toISOString(),
    deletedAt: pl.deletedAt ? pl.deletedAt.toISOString() : null,
    expiresAt: serializeDate(pl.expiresAt),
  };
}

function serializeDate(value: unknown): string | null {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<PaymentLink>(PAYMENT_LINKS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ token: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ customerId: 1 }).catch(() => {}),
      collection.createIndex({ invoiceId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export function generateSecurePaymentToken(): string {
  return randomBytes(16).toString("hex"); // 32 characters hex string
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPaymentLinkByToken(token: string): Promise<PaymentLink | null> {
  const collection = await getCollection();
  const link = await collection.findOne({ token, ...notDeleted });
  if (!link) return null;

  if (link.expiresAt && new Date() > link.expiresAt && link.status === "ACTIVE") {
    await collection.updateOne({ _id: link._id }, { $set: { status: "EXPIRED" } });
    link.status = "EXPIRED";
  }

  return link;
}

export async function listPaymentLinks(
  opts: { search?: string; status?: PaymentLinkStatus; customerId?: string; page?: number; pageSize?: number } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter: Record<string, unknown> = { ...notDeleted };

  if (opts.status) filter.status = opts.status;
  if (opts.customerId) filter.customerId = opts.customerId;

  if (opts.search?.trim()) {
    const rx = new RegExp(opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { customerName: rx }, { customerEmail: rx }, { token: rx }];
  }

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreatePaymentLinkInput {
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  customerId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  sourceModule?: PaymentSourceModule;
  sourceRecordId?: string | null;
  invoiceId?: string | null;
  allowedMethods?: string[];
  expiresInDays?: number;
  maxAttempts?: number;
  actorId?: string | null;
}

export async function createPaymentLink(
  input: CreatePaymentLinkInput
): Promise<{ ok: true; paymentLink: PaymentLink; publicUrl: string } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const token = generateSecurePaymentToken();

  const days = input.expiresInDays && input.expiresInDays > 0 ? input.expiresInDays : 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const doc: PaymentLink = {
    _id: newId(),
    token,
    title: input.title,
    description: input.description || "",
    amount: input.amount,
    currency: input.currency || "INR",
    customerId: input.customerId ?? null,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone ?? null,
    sourceModule: input.sourceModule || "DIRECT",
    sourceRecordId: input.sourceRecordId ?? null,
    invoiceId: input.invoiceId ?? null,
    allowedMethods: input.allowedMethods || ["UPI", "CARD", "NET_BANKING"],
    expiresAt,
    maxAttempts: input.maxAttempts || 5,
    usageCount: 0,
    status: "ACTIVE",
    paymentIntentId: null,
    ...createStamp(input.actorId ?? null),
  };

  await collection.insertOne(doc);

  await recordAudit({
    actorId: input.actorId || "system",
    actorEmail: input.customerEmail,
    action: "create",
    entity: "payment_link",
    entityId: doc._id,
    entityLabel: doc.title,
    summary: `Generated payment link for ₹${doc.amount} (Token: ${token.slice(0, 8)}...)`,
  });

  const baseUrl = await paymentPublicBaseUrl();
  return { ok: true, paymentLink: doc, publicUrl: `${baseUrl}/pay/${token}` };
}

export async function cancelPaymentLink(id: string, actorId: string | null = null): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "CANCELLED", ...updateStamp(actorId) } }
  );
  return res.modifiedCount === 1;
}

/**
 * One more attempt to pay this link. Refused when the link is no longer open, was paid, expired, or has used up its attempts: the check and
 * the count are one atomic step, so many people (or one script) opening the same link cannot make more attempts than it allows.
 */
export async function claimLinkAttempt(linkId: string): Promise<boolean> {
  const collection = await getCollection();
  const now = new Date();
  const res = await collection.findOneAndUpdate(
    { _id: linkId, status: "ACTIVE", ...notDeleted, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }], $expr: { $lt: ["$usageCount", "$maxAttempts"] } } as never,
    { $inc: { usageCount: 1 } },
    { returnDocument: "after" },
  );
  return !!res;
}

/** The customer has paid: the link is done and cannot be paid again. */
export async function markLinkPaid(linkId: string, intentId: string): Promise<void> {
  await (await getCollection()).updateOne({ _id: linkId, status: { $in: ["ACTIVE", "PARTIALLY_PAID"] } }, { $set: { status: "PAID", paymentIntentId: intentId, updatedAt: new Date() } });
}
