/** Shapes of the clone store (B1). Client-safe: types and constants only, no database, no server-only imports. */
import type { ItemKind, ItemMeta } from "@/lib/products/playbook-ai/items-types";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { VariableSnapshot } from "@/lib/products/playbook-ai/documents-types";
import type { PartyType } from "./party-types";
import type { NewSigner } from "./requests-types";

export const CLONE_STATUSES = ["clone_draft", "ready", "sent", "partially_signed", "signed", "voided", "declined", "expired"] as const;
export type CloneStatus = (typeof CLONE_STATUSES)[number];

export const CLONE_STATUS_LABEL: Record<CloneStatus, string> = {
  clone_draft: "Draft",
  ready: "Ready to send",
  sent: "Sent for signature",
  partially_signed: "Partly signed",
  signed: "Signed",
  voided: "Voided",
  declined: "Declined",
  expired: "Expired",
};

/** Statuses in which content may still be edited (and only while no signature exists: see the lock rule in clones.ts). */
export const EDITABLE_CLONE_STATUSES: readonly CloneStatus[] = ["clone_draft", "ready", "sent"];

export interface CloneSource {
  product: "playbook-ai";
  documentId: string;
  versionId: string;
  versionNumber: number;
  docNumber: string | null;
  docTypeId: string | null;
  templateRef: { templateId: string; version: number } | null;
  /** Hash of the Playbook version's content when it was cloned. Compared with the clone's own hash to flag "edited after cloning". */
  sourceContentSha256: string;
}

export interface CloneParty {
  type: PartyType;
  partyId: string | null;
  displayName: string;
}

export interface CloneDates {
  effectiveDate: string | null;
  expiryDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  noticePeriodDays: number | null;
}

export interface CloneStamp {
  required: boolean;
  state: string | null;
  instrumentCategory: string | null;
}

export interface CloneOptions {
  /** How long the signing links work once sent. */
  expiryDays: number;
  /** Days before expiry on which a reminder goes out (sent by the reminder job, B7). */
  reminderDays: number[];
  orderMode: "parallel" | "sequential";
  /** Where the document is executed (a state or UT code from the stamp rulebook), as entered by the sender. */
  placeOfExecution: string | null;
}

export interface CloneDoc {
  _id: string;
  title: string;
  /** SOP, document or KPI sheet (absent on clones made before the three kinds: those are documents). */
  kind?: ItemKind;
  meta?: ItemMeta;
  /** Soft delete: set when the clone is removed from the lists. */
  deletedAt?: Date | null;
  status: CloneStatus;
  pbdoc: PBDoc;
  contentSha256: string;
  /** Incremented by every content change; a save carries the rev it started from. */
  rev: number;
  source: CloneSource;
  /** Frozen values of the variables the document uses, copied from the Playbook version. The clone renders from this, never from live data. */
  variableSnapshot: VariableSnapshot;
  party: CloneParty;
  /** Who is to sign, as chosen when sending from Playbook. Turned into a signature request later. */
  signerPlan: NewSigner[];
  dates: CloneDates;
  stamp: CloneStamp;
  options: CloneOptions;
  /** The open signature request, if any. */
  requestId: string | null;
  /** Number of signatures applied. Once above zero (or `lockedAt` is set) the content can never change again. */
  signatureCount: number;
  lockedAt: Date | null;
  /** Content hash at the moment the clone was marked ready (what was shown to signers). */
  frozenContentSha256: string | null;
  replaces: string | null;
  replacedBy: string | null;
  voidReason: string | null;
  voidedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastEditorId: string | null;
}

export type CloneSummary = Omit<CloneDoc, "pbdoc" | "variableSnapshot"> & { editedAfterCloning: boolean };

export const EDIT_KINDS = ["created", "edit", "ready", "reopened", "void", "recloned_from", "recloned_to", "signature_applied", "deleted"] as const;
export type EditKind = (typeof EDIT_KINDS)[number];

export interface EditDiffEntry {
  id: string;
  zone: string;
  blockType: string;
  kind: string;
  before: string | null;
  after: string | null;
}

/** `cf_clone_edits`: the audit of a clone. Written by the data layer for every content change and every state change; never updated. */
export interface CloneEditDoc {
  _id: string;
  cloneId: string;
  kind: EditKind;
  rev: number;
  at: Date;
  by: string | null;
  summary: string;
  detail: Record<string, string | number | boolean | null>;
  /** Block-level changes of a content edit (capped). Null for state changes. */
  diff: EditDiffEntry[] | null;
  beforeSha256: string | null;
  afterSha256: string | null;
}

export type CloneErrorCode = "not_found" | "forbidden" | "invalid" | "conflict" | "locked" | "bad_status" | "source_unavailable" | "unavailable";
export type CloneError = { code: CloneErrorCode; message: string; currentRev?: number };
export type CloneResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: CloneError };

export const VERSION_SOURCES = ["created", "edit", "ai", "restore"] as const;
export type VersionSource = (typeof VERSION_SOURCES)[number];

/** `cf_clone_versions`: one row per saved version of a clone (the version number equals the clone's `rev` at that save). Never updated except for `statusLog`. */
export interface CloneVersionDoc {
  _id: string;
  cloneId: string;
  number: number;
  pbdoc: PBDoc;
  contentSha256: string;
  title: string;
  at: Date;
  by: string | null;
  byName: string | null;
  summary: string;
  source: VersionSource;
  /** What happened to this exact version: "sent", "signed", "voided", "declined"... */
  statusLog: { status: string; at: Date; note: string | null }[];
}

export type CloneVersionSummary = Omit<CloneVersionDoc, "pbdoc">;

/** `cf_clone_chat`: the "Edit with AI" conversation. */
export interface CloneChatDoc {
  _id: string;
  cloneId: string;
  role: "user" | "assistant";
  text: string;
  at: Date;
  by: string | null;
  /** For an assistant turn that changed the document: the version it created and the one it replaced. */
  versionNumber: number | null;
  previousVersionNumber: number | null;
  /** Block-level changes shown in the chat (capped). */
  changes: { kind: string; before: string | null; after: string | null; blockId?: string }[] | null;
  undone: boolean;
  /** Files attached to a user message (name, size, private storage key; never the content). */
  attachments?: { name: string; size: number; mime: string; storageKey: string }[];
  steps?: string[];
  /** Suggested operations waiting for accept or reject (Edit mode "as suggestions"). */
  ops?: { op: "replace" | "insert" | "delete"; blockId: string | null; blockType: "paragraph" | "heading" | "clause" | "bullets" | "none"; level: number; text: string }[];
  suggestions?: import("@/lib/products/playbook-ai/ai/edit-types").SuggestionCard[];
}

/** `cf_sealed`: the final signed PDF of a clone that every signer has signed. One per clone. */
export interface SealedDoc {
  _id: string;
  cloneId: string;
  requestId: string;
  /** The code on the public verify page (`/verify/<code>`). Random, not guessable. */
  verifyCode: string;
  storageKey: string;
  sha256: string;
  bytes: number;
  pages: number | null;
  sealedAt: Date;
  title: string;
  companyName: string;
  contentSha256: string;
  signers: { name: string; email: string; role: string; designation: string | null; signedAt: Date | null }[];
  emailedTo: string[];
  emailFailed: string[];
}

export type { ChatChange, ChatTurn } from "@/lib/products/playbook-ai/ai/edit-types";
