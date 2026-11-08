import { lpmsEvents } from "@/lib/notify/triggers/lpms";
import "server-only";
import type { LpmsViewer } from "@/lib/products/contractflow-ai/types";

/**
 * E-sign provider interface. Add providers by implementing this interface.
 * No specific provider is hardcoded — wire your preferred provider here.
 */
export interface ESignProvider {
  name: string;
  /**
   * Request signatures from one or more signers.
   * Returns a provider document ID for status tracking.
   */
  requestSignatures(opts: {
    documentId: string;
    documentTitle: string;
    documentContent: Buffer; // PDF bytes
    signers: { name: string; email: string; role?: string }[];
    expiresAt?: Date;
    redirectUrl?: string;
  }): Promise<{ providerDocId: string; signerLinks: { email: string; link: string }[] }>;

  /** Get current status from the provider. */
  getStatus(providerDocId: string): Promise<{
    status: "pending" | "completed" | "declined" | "expired";
    signers: { email: string; status: string; signedAt?: Date }[];
  }>;

  /** Void / cancel a signature request. */
  voidRequest(providerDocId: string): Promise<void>;
}

/**
 * Signature request flow.
 * Creates a signature request record and (if a provider is configured)
 * sends it via the e-sign provider.
 */
export async function requestSignatures(
  opts: {
    documentId: string;
    signers: { name: string; email: string; role?: string }[];
    expiresAt?: Date;
  },
  viewer: LpmsViewer
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const { getDb } = await import("@/lib/mongodb");
  const { ObjectId } = await import("mongodb");

  const db = await getDb();
  const now = new Date();

  const signerRecords = opts.signers.map((s) => ({
    id: new ObjectId().toString(),
    documentId: opts.documentId,
    signerName: s.name,
    signerEmail: s.email,
    signerRole: s.role ?? "signer",
    status: "pending" as const,
    requestedAt: now,
    signedAt: null,
    signatureData: null,
    providerId: null,
    providerRef: null,
    ipAddress: null,
    userAgent: null,
  }));

  const result = await db.collection("lpms_signatures").insertOne({
    companyId: viewer.companyId,
    documentId: opts.documentId,
    signers: signerRecords,
    status: "pending",
    providerName: null,
    providerDocId: null,
    expiresAt: opts.expiresAt ?? null,
    createdAt: now,
    createdBy: viewer.userId,
  });

  await lpmsEvents.signaturesRequested(opts.documentId, opts.signers.length, viewer.userId);
  return { ok: true, requestId: result.insertedId.toString() };
}

/**
 * Update signature status from a provider webhook.
 */
export async function updateSignatureStatus(
  requestId: string,
  signerEmail: string,
  status: "signed" | "declined" | "expired",
  signedAt?: Date
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { getDb } = await import("@/lib/mongodb");
  const { ObjectId } = await import("mongodb");

  const db = await getDb();
  await db.collection("lpms_signatures").updateOne(
    { _id: new ObjectId(requestId), "signers.signerEmail": signerEmail },
    {
      $set: {
        "signers.$.status": status,
        "signers.$.signedAt": signedAt ?? null,
        updatedAt: new Date(),
      },
    }
  );

  // Check if all signers have responded; if so update overall status
  const request = await db
    .collection("lpms_signatures")
    .findOne({ _id: new ObjectId(requestId) });
  if (request) {
    const allSigned = (request.signers ?? []).every(
      (s: any) => s.status === "signed"
    );
    const anyDeclined = (request.signers ?? []).some(
      (s: any) => s.status === "declined"
    );
    if (allSigned || anyDeclined) {
      await db.collection("lpms_signatures").updateOne(
        { _id: new ObjectId(requestId) },
        { $set: { status: allSigned ? "completed" : "declined" } }
      );
    }
    await lpmsEvents.signatureUpdate(String(request.documentId), signerEmail, status, allSigned ? "completed" : anyDeclined ? "declined" : null);
  }

  return { ok: true };
}

/**
 * List signature requests for a document.
 */
export async function listSignatureRequests(
  documentId: string,
  companyId: string
): Promise<any[]> {
  const { getDb } = await import("@/lib/mongodb");
  const db = await getDb();
  return db
    .collection("lpms_signatures")
    .find({ companyId, documentId })
    .sort({ createdAt: -1 })
    .toArray();
}
