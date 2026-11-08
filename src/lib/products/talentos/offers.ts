import "server-only";
import { ObjectId, type Document } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import { APPLICATIONS_COLLECTION } from "@/lib/career-applications";
import { canTransition, type OfferStatus } from "@/lib/products/talentos/offers-status";

export const OFFERS_COLLECTION = "hrms_offers";

interface ApplicationShape {
  _id: ObjectId;
  name: string;
  email: string;
  positionTitle: string;
  positionSlug: string | null;
  status: string;
}

export interface Offer extends AuditFields {
  _id: string;
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  positionTitle: string;
  positionSlug: string | null;
  status: OfferStatus;
  offerDate: string | null;
  proposedJoiningDate: string | null;
  annualCtc: number | null;
  notes: string | null;
  employeeId: string | null;
}

export interface SerializedOffer extends Omit<Offer, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

let indexEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Offer>(OFFERS_COLLECTION);
  if (!indexEnsured) {
    indexEnsured = true;
    await Promise.all([
      collection.createIndex({ applicationId: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export function serializeOffer(o: Offer): SerializedOffer {
  return {
    ...o,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    deletedAt: o.deletedAt ? o.deletedAt.toISOString() : null,
  };
}

export async function listOffers(): Promise<Offer[]> {
  const collection = await getCollection();
  return collection.find(notDeleted).sort({ createdAt: -1 }).toArray();
}

export async function getOffer(id: string): Promise<Offer | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getOfferByApplication(applicationId: string): Promise<Offer | null> {
  const collection = await getCollection();
  return collection.findOne({ applicationId, ...notDeleted });
}

export async function createOffer(
  data: { applicationId: string; offerDate: string | null; proposedJoiningDate: string | null; annualCtc: number | null; notes: string | null },
  actorId: string
): Promise<{ ok: true; offer: Offer } | { ok: false; error: string }> {
  if (!ObjectId.isValid(data.applicationId)) return { ok: false, error: "Unknown applicant." };
  const db = await getDb();
  const collection = await getCollection();

  const existing = await collection.findOne({ applicationId: data.applicationId, ...notDeleted });
  if (existing) return { ok: false, error: "An offer already exists for this applicant." };

  const app = (await db
    .collection<Document>(APPLICATIONS_COLLECTION)
    .findOne({ _id: new ObjectId(data.applicationId) })) as unknown as ApplicationShape | null;
  if (!app) return { ok: false, error: "Application not found." };

  const doc: Offer = {
    _id: newId(),
    applicationId: data.applicationId,
    candidateName: app.name,
    candidateEmail: app.email,
    positionTitle: app.positionTitle,
    positionSlug: app.positionSlug,
    status: "draft",
    offerDate: data.offerDate,
    proposedJoiningDate: data.proposedJoiningDate,
    annualCtc: data.annualCtc,
    notes: data.notes,
    employeeId: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return { ok: true, offer: doc };
}

export async function updateOfferStatus(
  id: string,
  next: OfferStatus,
  actorId: string
): Promise<{ ok: true; offer: Offer } | { ok: false; error: string }> {
  const collection = await getCollection();
  const offer = await collection.findOne({ _id: id, ...notDeleted });
  if (!offer) return { ok: false, error: "Offer not found." };
  if (!canTransition(offer.status, next)) {
    return { ok: false, error: `Can't move an offer from ${offer.status} to ${next}.` };
  }
  const updated = await collection.findOneAndUpdate(
    { _id: id },
    { $set: { status: next, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  return { ok: true, offer: updated! };
}

export async function updateOfferDetails(
  id: string,
  patch: { offerDate: string | null; proposedJoiningDate: string | null; annualCtc: number | null; notes: string | null },
  actorId: string
): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { ...patch, ...updateStamp(actorId) } });
  return res.matchedCount === 1;
}

/** Called when an application with an offer is converted to an employee. */
export async function markOfferJoined(applicationId: string, employeeId: string, actorId: string): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne(
    { applicationId, ...notDeleted },
    { $set: { status: "joined", employeeId, ...updateStamp(actorId) } }
  );
}
