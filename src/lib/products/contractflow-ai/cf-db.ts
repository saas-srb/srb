import "server-only";
import type { Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { CF_COLLECTIONS, SEAL_INDEX_COLLECTION } from "./cf-collections";
import type { SealedDoc, CloneChatDoc, CloneDoc, CloneEditDoc, CloneVersionDoc } from "./clone-types";
import type { PartyDoc } from "./party-types";
import type { DltDetails, EventDoc, OtpDoc, RequestDoc, SignerDoc } from "./sign-types";

/** Typed, company-scoped access to the `cf_*` collections. Indexes are created once per process per database. */
const ensured = new Set<string>();
async function ensure(key: string, fn: () => Promise<unknown>) {
  const k = `${process.env.MONGODB_URI ?? ""}|${key}`;
  if (ensured.has(k)) return;
  ensured.add(k);
  try {
    await fn();
  } catch (err) {
    ensured.delete(k);
    console.error("[contractflow] index creation failed", key, err instanceof Error ? err.message : err);
  }
}

export async function cfParties(): Promise<Collection<PartyDoc>> {
  const c = (await getDb()).collection<PartyDoc>(CF_COLLECTIONS.parties);
  await ensure("parties", async () => {
    await c.createIndex({ "source.collection": 1, "source.id": 1 }, { unique: true, partialFilterExpression: { "source.id": { $type: "string" } } });
    await c.createIndex({ type: 1, status: 1, searchKey: 1 });
  });
  return c;
}

export async function cfRequests(): Promise<Collection<RequestDoc>> {
  const c = (await getDb()).collection<RequestDoc>(CF_COLLECTIONS.requests);
  await ensure("requests", async () => {
    await c.createIndex({ status: 1, expiresAt: 1 });
    await c.createIndex({ cloneId: 1 });
  });
  return c;
}

export async function cfSigners(): Promise<Collection<SignerDoc>> {
  const c = (await getDb()).collection<SignerDoc>(CF_COLLECTIONS.signers);
  await ensure("signers", async () => {
    await c.createIndex({ requestId: 1, order: 1 });
  });
  return c;
}

export async function cfEvents(): Promise<Collection<EventDoc>> {
  const c = (await getDb()).collection<EventDoc>(CF_COLLECTIONS.events);
  await ensure("events", async () => {
    await c.createIndex({ requestId: 1, seq: 1 }, { unique: true });
  });
  return c;
}

/**
 * The UNSCOPED view of signers, used only to find a signer from a link token before any company is known. Reading it is the one
 * deliberate cross-company step of the public signing route: the company is then taken from the row it returns.
 */
export async function cfSignersAcrossCompanies(): Promise<Collection<SignerDoc>> {
  const c = (await getPlatformDb()).collection<SignerDoc>(CF_COLLECTIONS.signers);
  await ensure("signers-token", async () => {
    await c.createIndex({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: "string" } } });
  });
  return c;
}

export async function cfOtp(): Promise<Collection<OtpDoc>> {
  const c = (await getDb()).collection<OtpDoc>(CF_COLLECTIONS.otp);
  await ensure("otp", async () => {
    await c.createIndex({ signerId: 1, purpose: 1, status: 1 });
    await c.createIndex({ signerId: 1, createdAt: -1 });
    await c.createIndex({ deleteAt: 1 }, { expireAfterSeconds: 0 });
  });
  return c;
}

export interface CfSettingsDoc {
  _id: string;
  dlt?: DltDetails | null;
}

/** The company's ContractFlow settings singleton (`_id: "main"`, keyed per company by the tenancy layer). */
export async function cfSettings(): Promise<Collection<CfSettingsDoc>> {
  return (await getDb()).collection<CfSettingsDoc>(CF_COLLECTIONS.settings);
}


export async function cfClones(): Promise<Collection<CloneDoc>> {
  const c = (await getDb()).collection<CloneDoc>(CF_COLLECTIONS.documents);
  await ensure("clones", async () => {
    await c.createIndex({ status: 1, updatedAt: -1 });
    await c.createIndex({ "source.documentId": 1, "source.versionId": 1 });
    await c.createIndex({ replacedBy: 1 }, { sparse: true });
  });
  return c;
}

export async function cfCloneEdits(): Promise<Collection<CloneEditDoc>> {
  const c = (await getDb()).collection<CloneEditDoc>(CF_COLLECTIONS.cloneEdits);
  await ensure("clone-edits", async () => {
    await c.createIndex({ cloneId: 1, at: 1 });
  });
  return c;
}

export async function cfCloneVersions(): Promise<Collection<CloneVersionDoc>> {
  const c = (await getDb()).collection<CloneVersionDoc>(CF_COLLECTIONS.cloneVersions);
  await ensure("clone-versions", async () => {
    await c.createIndex({ cloneId: 1, number: 1 }, { unique: true });
  });
  return c;
}

export async function cfCloneChat(): Promise<Collection<CloneChatDoc>> {
  const c = (await getDb()).collection<CloneChatDoc>(CF_COLLECTIONS.cloneChat);
  await ensure("clone-chat", async () => {
    await c.createIndex({ cloneId: 1, at: 1 });
  });
  return c;
}

export async function cfSealed(): Promise<Collection<SealedDoc>> {
  const c = (await getDb()).collection<SealedDoc>(CF_COLLECTIONS.sealed);
  await ensure("sealed", async () => {
    await c.createIndex({ cloneId: 1 }, { unique: true });
    await c.createIndex({ verifyCode: 1 }, { unique: true });
  });
  return c;
}

export interface SealIndexRow { _id: string; companyId: string; sealedId: string }

/** The unscoped index the public verify page reads: code -> company. */
export async function cfSealIndex(): Promise<Collection<SealIndexRow>> {
  return (await getPlatformDb()).collection<SealIndexRow>(SEAL_INDEX_COLLECTION);
}
