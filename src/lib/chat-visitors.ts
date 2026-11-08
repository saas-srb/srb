import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { PreChatConfig } from "@/lib/chatbot-config";
import { isValidCategory, type CategorySlug } from "@/lib/categories";

export const CHAT_VISITORS_COLLECTION = "chat_visitors";

export interface ChatVisitorProfile {
  _id: string; // = visitorId
  name: string | null;
  email: string | null;
  phone: string | null;
  /** The "Main Service" the visitor picked in the pre-chat form — one of the 5 primary services. */
  service: CategorySlug | null;
  ipHash: string | null;
  capturedAt: Date;
  updatedAt: Date;
}

export interface SerializedChatVisitor {
  visitorId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  service: CategorySlug | null;
  capturedAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-()]{7,20}$/;

let indexesEnsured = false;

async function getVisitorsCollection(): Promise<Collection<ChatVisitorProfile>> {
  const db = await getDb();
  const collection = db.collection<ChatVisitorProfile>(CHAT_VISITORS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ capturedAt: -1 }).catch(() => {});
    await collection.createIndex({ email: 1 }).catch(() => {});
  }
  return collection;
}

export interface IdentityInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  service?: unknown;
}

export interface CleanIdentity {
  name: string | null;
  email: string | null;
  phone: string | null;
  service: CategorySlug | null;
}

/** Validates a pre-chat submission against the configured field requirements. */
export function validateIdentity(
  input: IdentityInput,
  preChat: PreChatConfig
): { valid: true; data: CleanIdentity } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  function text(raw: unknown): string {
    return typeof raw === "string" ? raw.trim() : "";
  }

  const name = text(input.name).slice(0, 120);
  const email = text(input.email).slice(0, 254);
  const phone = text(input.phone).slice(0, 40);
  const serviceRaw = text(input.service);
  const service = isValidCategory(serviceRaw) ? serviceRaw : "";

  const check = (mode: PreChatConfig["fields"][keyof PreChatConfig["fields"]], value: string, field: string, label: string) => {
    if (mode === "off") return;
    if (mode === "required" && !value) errors[field] = `${label} is required.`;
  };

  check(preChat.fields.name, name, "name", "Name");
  check(preChat.fields.email, email, "email", "Email");
  check(preChat.fields.phone, phone, "phone", "Phone number");
  if (serviceRaw && !service) errors.service = "Choose a valid service.";

  if (email && !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  if (phone && !PHONE_RE.test(phone)) errors.phone = "Enter a valid phone number.";

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      name: name || null,
      email: email || null,
      phone: phone || null,
      service: service || null,
    },
  };
}

export async function upsertVisitorProfile(
  visitorId: string,
  data: CleanIdentity & { ipHash: string | null }
): Promise<void> {
  const collection = await getVisitorsCollection();
  const now = new Date();
  const isNew = !(await collection.findOne({ _id: visitorId }, { projection: { _id: 1 } }));
  await collection.updateOne(
    { _id: visitorId },
    {
      $set: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        service: data.service,
        ipHash: data.ipHash,
        updatedAt: now,
      },
      $setOnInsert: { capturedAt: now },
    },
    { upsert: true }
  );
  if (isNew) await cmsEvents.chatVisitor({ id: visitorId, name: data.name, service: data.service });
}

export async function getVisitorProfile(visitorId: string): Promise<ChatVisitorProfile | null> {
  if (!visitorId) return null;
  const collection = await getVisitorsCollection();
  return collection.findOne({ _id: visitorId });
}

export async function getVisitorProfiles(
  visitorIds: string[]
): Promise<Map<string, SerializedChatVisitor>> {
  const out = new Map<string, SerializedChatVisitor>();
  if (visitorIds.length === 0) return out;
  const collection = await getVisitorsCollection();
  const docs = await collection.find({ _id: { $in: visitorIds } }).toArray();
  for (const d of docs) {
    out.set(d._id, {
      visitorId: d._id,
      name: d.name,
      email: d.email,
      phone: d.phone,
      service: d.service,
      capturedAt: new Date(d.capturedAt).toISOString(),
    });
  }
  return out;
}

export async function countIdentifiedVisitors(from?: Date, to?: Date): Promise<number> {
  const collection = await getVisitorsCollection();
  const filter: Record<string, unknown> = {};
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    filter.capturedAt = range;
  }
  return collection.countDocuments(filter);
}
