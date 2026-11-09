/** Shapes of the signature request model (B2). Client-safe: no database, no server-only imports. */

export const REQUEST_STATUSES = ["sent", "in_progress", "completed", "declined", "expired", "voided"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const SIGNER_STATUSES = ["pending", "sent", "viewed", "otp_verified", "signed", "declined"] as const;
export type SignerStatus = (typeof SIGNER_STATUSES)[number];

export const SIGNER_ROLES = ["company_signatory", "counterparty", "witness", "approver"] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export type OrderMode = "parallel" | "sequential";

/** A link token can open the signing page and nothing else. */
export type TokenPurpose = "sign";

export interface RequestDoc {
  _id: string;
  /** The clone being signed (`cf_documents`, B1). */
  cloneId: string;
  title: string;
  partyId: string | null;
  orderMode: OrderMode;
  status: RequestStatus;
  /** One value now ("otp"); a string so a later provider needs no migration. */
  authMode: string;
  provider: string;
  expiresAt: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  /** Hash of the clone content the signers were shown (the clone's frozen hash when the request was made). Null when the clone is not in this store. */
  contentSha256?: string | null;
}

export interface SignerDoc {
  _id: string;
  requestId: string;
  role: SignerRole;
  name: string;
  email: string;
  phone: string | null;
  order: number;
  status: SignerStatus;
  /** SHA-256 of the link token. The token itself is never stored. Null once revoked or replaced. */
  tokenHash: string | null;
  tokenPurpose: TokenPurpose;
  tokenExpiresAt: Date;
  tokenUsedAt: Date | null;
  tokenRevokedAt: Date | null;
  signedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
  declineReason: string | null;
  /** When the signer last proved control of their email or phone with a one-time code (B3). Null = not yet; reset when the link is replaced. */
  otpVerifiedAt?: Date | null;
  /** While set and in the future, no code can be requested or checked for this signer (too many wrong codes). */
  otpLockedUntil?: Date | null;
  /** When the signer first opened the document itself (B4). Signing needs it. */
  documentViewedAt?: Date | null;
  /** What the signer typed as the name they sign under, and their role or title. */
  signedName?: string | null;
  designation?: string | null;
  signature?: SignatureArtefact | null;
  /** The consent the signer accepted (version and hash of the exact text shown). */
  consent?: { version: string; textSha256: string; at: Date } | null;
  /** The content hash the signer signed. */
  signedContentSha256?: string | null;
  createdAt: Date;
  /** Set by the public resolver; the row's company, read back so nothing downstream trusts the host. */
  companyId?: string;
}

export const EVENT_TYPES = [
  "request_created",
  "link_issued",
  "link_revoked",
  "link_viewed",
  "link_rejected",
  "request_voided",
  "request_expired",
  "document_viewed",
  "otp_sent",
  "otp_verified",
  "otp_failed",
  "otp_locked",
  "otp_refused",
  "signer_declined",
  "signer_signed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Append-only. There is no function anywhere that updates or deletes one. */
export interface EventDoc {
  _id: string;
  requestId: string;
  signerId: string | null;
  /** 1, 2, 3 … per request; unique, so two writers cannot both take the same place in the chain. */
  seq: number;
  type: EventType;
  at: Date;
  actorType: "system" | "user" | "signer";
  actorId: string | null;
  ip: string | null;
  userAgent: string | null;
  data: Record<string, string | number | boolean | null>;
  /** SHA-256 of the previous event's hash plus this event's content: editing or removing any event breaks the chain. */
  prevHash: string;
  hash: string;
}

export type OtpChannel = "email" | "sms";
export type OtpStatus = "active" | "used" | "superseded" | "locked" | "expired";

/** `cf_otp`: one row per code sent. The code itself is never stored, only a salted hash. */
export interface OtpDoc {
  _id: string;
  signerId: string;
  requestId: string;
  /** What the code unlocks. Single-purpose: a code for one purpose is useless for another. */
  purpose: "sign";
  channel: OtpChannel;
  salt: string;
  codeHash: string;
  /** Masked, for the audit trail and the screen ("o***@a.test"). The full address is never copied here. */
  destinationMasked: string;
  status: OtpStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  /** The row is removed by the database a day after it expires. */
  deleteAt: Date;
}

/** What the company records before SMS codes may be sent to Indian numbers (see otp.ts). */
export interface DltDetails {
  entityId: string;
  senderId: string;
  templateId: string;
  /** The text the operator approved, with {code} where the code goes. */
  templateText: string;
  confirmed: boolean;
  confirmedBy: string | null;
  confirmedAt: Date | null;
}

export interface SignatureArtefact {
  kind: "drawn" | "typed" | "uploaded";
  /** Private storage key of the PNG (drawn and uploaded). Never served by a public URL. */
  storageKey: string | null;
  sha256: string | null;
  widthPx: number | null;
  heightPx: number | null;
  /** Typed signatures: the text and the style key chosen. */
  typedText: string | null;
  style: string | null;
}
