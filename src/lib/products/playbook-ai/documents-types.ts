/**
 * Types shared by the Playbook document data layer (`documents.ts`, `versions.ts`, `variables-*.ts`) and the UI. Pure, client-safe: no
 * database and no server-only imports. Server functions return `PbResult` (never throw for expected failures) so a server action can hand
 * the typed error straight to the editor.
 */

import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { AclEntry, DocStatus, VersionKind } from "@/lib/products/playbook-ai/status";
import type { VarLists, VarValues } from "@/lib/products/playbook-ai/doc/variables";

/** The signed-in person, as the data layer needs them. Build it from the session (`id` is the `admin_users` _id as a string). */
export interface PbActor {
  id: string;
  email: string | null;
  name: string | null;
  roles: readonly string[];
  permissionOverrides?: Record<string, boolean> | null;
}

export interface PbPerson { id: string; name: string | null; email: string | null }

/** Records a document is linked to. Linked, never copied: values are read live until the version is issued, then frozen. */
export interface DocLinks {
  employeeId?: string | null;
  clientId?: string | null;
  vendorId?: string | null;
  candidateId?: string | null;
  projectId?: string | null;
}
export const DOC_LINK_KEYS = ["employeeId", "clientId", "vendorId", "candidateId", "projectId"] as const;

export type InputValues = Record<string, string | number | boolean>;

export interface TemplateRef { templateId: string; version: number }

export interface PbLock { userId: string; name: string | null; acquiredAt: Date; expiresAt: Date }
export interface PbLastEditor extends PbPerson { at: Date }

export interface PbReview {
  submittedBy: string | null;
  submittedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decision: "approved" | "rejected" | "auto_approved" | null;
  reason: string | null;
}

/** Frozen values of every variable a version uses. Stored on each issued version; the version renders from this, never from live data. */
export interface VariableSnapshot {
  takenAt: string;
  values: Record<string, string | number | boolean>;
  lists: VarLists;
  /** The records the values came from (links), for the audit trail. */
  sources: { kind: string; id: string; label: string }[];
  sha256: string;
}

export interface PbDocumentRecord {
  _id: string;
  title: string;
  docTypeId: string | null;
  templateRef: TemplateRef | null;
  status: DocStatus;
  archivedFrom: DocStatus | null;
  /** The editable content (PBDoc, includes the A4 page settings and margins). */
  pbdoc: PBDoc;
  contentSha256: string;
  /** Incremented by every change; a save carries the rev it was based on. */
  rev: number;
  /** Last version number handed out (versions are numbered 1, 2, 3 ... per document). */
  versionSeq: number;
  latestVersion: number | null;
  issuedVersion: number | null;
  docNumber: string | null;
  inputs: InputValues;
  lists: VarLists;
  links: DocLinks;
  acl: AclEntry[];
  lock: PbLock | null;
  lastEditor: PbLastEditor | null;
  review: PbReview | null;
  legalHold: boolean;
  /** Set when a legal-type document was issued: who confirmed it had been reviewed by a qualified lawyer, and when. */
  legalAck?: { by: string; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  issuedAt: Date | null;
}

/** List row: the record without the (large) content. */
export type PbDocumentSummary = Omit<PbDocumentRecord, "pbdoc" | "inputs" | "lists">;

export interface PbVersionRecord {
  _id: string;
  documentId: string;
  number: number;
  kind: VersionKind;
  label: string | null;
  changeNote: string | null;
  title: string;
  status: DocStatus;
  docNumber: string | null;
  pbdoc: PBDoc;
  contentSha256: string;
  variableSnapshot: VariableSnapshot | null;
  templateRef: TemplateRef | null;
  revertedFrom: number | null;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  /** Sealed exports of an issued version, each set once by A5 (`attachSealedExport`). */
  exports: Partial<Record<"pdf" | "docx", { key: string; sha256: string; at: Date }>>;
}

export type PbVersionSummary = Omit<PbVersionRecord, "pbdoc" | "variableSnapshot">;

export interface MissingItem {
  key: string;
  label: string;
  reason: "no_value" | "bad_format" | "no_source_selected" | "no_access" | "unknown_variable";
  /** What the author can do about it. */
  fix: string;
  source: string;
}

export interface MissingReport {
  /** Required variables (no fallback) that have no usable value. They block issue. */
  missing: MissingItem[];
  /** Placeholders the author still has to fill. They block issue. */
  placeholders: { key: string; label: string }[];
  /** Keys read only by conditions that have no value: informational, the condition simply evaluates as "not set". */
  conditionsWithoutValue: string[];
  ok: boolean;
}

export type PbError =
  | { code: "not_found"; message: string }
  | { code: "forbidden"; message: string }
  | { code: "invalid"; message: string; issues: { path: string; message: string }[] }
  | { code: "bad_status"; message: string; status: DocStatus }
  | {
      code: "conflict";
      message: string;
      currentRev: number;
      yourRev: number;
      changedBy: PbPerson | null;
      changedAt: string | null;
    }
  | { code: "locked"; message: string; lockedBy: PbPerson; expiresAt: string }
  | { code: "unresolved_variables"; message: string; report: MissingReport }
  | { code: "self_approval"; message: string }
  | { code: "legal_hold"; message: string }
  | { code: "reason_required"; message: string }
  | { code: "legal_ack_required"; message: string }
  | { code: "retention_active"; message: string; keepUntil: string }
  | { code: "too_large"; message: string }
  | { code: "render_failed"; message: string }
  | { code: "busy"; message: string };

export type PbResult<T> = ({ ok: true } & T) | { ok: false; error: PbError };

export const LOCK_TTL_MS = 10 * 60_000;

export type { VarValues };
