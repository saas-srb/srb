/**
 * Document status machine and access rules for Playbook documents. Pure and client-safe (no database, no server-only imports): the same
 * table decides which buttons the UI shows and what the server accepts. Hiding a button is never the security boundary; every server
 * function re-checks with `canTransition` and `playbookCan`.
 *
 *   draft --submit--> in_review --approve--> approved --issue--> issued
 *     ^                  |  |                    |                  |
 *     +-----reject-------+  +----withdraw--------+                  |
 *     +-----------------revise (approved or issued)-----------------+
 *   any of draft / approved / issued --archive--> archived --restore--> the status it was archived from
 *
 * Editing is allowed only in `draft`. `revise` takes an approved or issued document back to `draft`; the issued version stays frozen in
 * `pb_versions` and the next issue creates a new version.
 */

import { playbookCan, type PlaybookPermission } from "@/lib/playbook-roles";
import type { RoleContext } from "@/lib/permission-overrides";

export const DOC_STATUSES = ["draft", "in_review", "approved", "issued", "archived"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const DOC_STATUS_META: Record<DocStatus, { label: string; description: string }> = {
  draft: { label: "Draft", description: "Being written. The only status in which the content can be edited." },
  in_review: { label: "In review", description: "Waiting for an approver. The content is frozen until it is approved or sent back." },
  approved: { label: "Approved", description: "Approved and ready to issue. Revising it returns it to draft." },
  issued: { label: "Issued", description: "Final. Its version, variables and number are frozen." },
  archived: { label: "Archived", description: "Kept for the record, hidden from the working lists." },
};

export const DOC_TRANSITIONS = ["submit", "withdraw", "approve", "reject", "revise", "issue", "archive", "restore"] as const;
export type DocTransition = (typeof DOC_TRANSITIONS)[number];

/** Why a version row exists. Every status step that freezes content writes one. */
export const VERSION_KINDS = ["manual", "auto", "submit", "approve", "issue", "revert"] as const;
export type VersionKind = (typeof VERSION_KINDS)[number];

export const TRANSITION_META: Record<DocTransition, { label: string; needsReason: boolean; version: VersionKind | null }> = {
  submit: { label: "Submit for review", needsReason: false, version: "submit" },
  withdraw: { label: "Withdraw from review", needsReason: false, version: null },
  approve: { label: "Approve", needsReason: false, version: "approve" },
  reject: { label: "Send back with a reason", needsReason: true, version: null },
  revise: { label: "Revise (back to draft)", needsReason: false, version: null },
  issue: { label: "Issue", needsReason: false, version: "issue" },
  archive: { label: "Archive", needsReason: false, version: null },
  restore: { label: "Restore from archive", needsReason: false, version: null },
};

const FROM: Record<DocTransition, readonly DocStatus[]> = {
  submit: ["draft"],
  withdraw: ["in_review"],
  approve: ["in_review"],
  reject: ["in_review"],
  revise: ["approved", "issued"],
  issue: ["approved"],
  archive: ["draft", "approved", "issued"],
  restore: ["archived"],
};

const TO: Record<Exclude<DocTransition, "restore">, DocStatus> = {
  submit: "in_review",
  withdraw: "draft",
  approve: "approved",
  reject: "draft",
  revise: "draft",
  issue: "issued",
  archive: "archived",
};

/** The permission a transition needs. Archiving or revising something already approved or issued is an approver/issuer act. */
export function transitionPermission(t: DocTransition, from: DocStatus): PlaybookPermission {
  switch (t) {
    case "submit": return "SUBMIT";
    case "withdraw": return "SUBMIT";
    case "approve": return "APPROVE";
    case "reject": return "APPROVE";
    case "issue": return "ISSUE";
    case "revise": return from === "issued" ? "ISSUE" : "EDIT";
    case "archive": return from === "draft" ? "EDIT" : "ISSUE";
    case "restore": return "EDIT";
  }
}

export type TransitionCheck = { ok: true; to: DocStatus } | { ok: false; reason: string };

/** Pure check of the status graph only (permissions and policies are separate). `archivedFrom` is where a restore goes back to. */
export function nextStatus(from: DocStatus, t: DocTransition, archivedFrom?: DocStatus | null): TransitionCheck {
  if (!FROM[t].includes(from)) {
    return { ok: false, reason: `a ${DOC_STATUS_META[from].label.toLowerCase()} document cannot be ${t === "restore" ? "restored" : `moved by "${TRANSITION_META[t].label}"`}` };
  }
  if (t === "restore") {
    const back = archivedFrom && archivedFrom !== "archived" && archivedFrom !== "in_review" ? archivedFrom : "draft";
    return { ok: true, to: back };
  }
  return { ok: true, to: TO[t] };
}

/** The transitions available from a status. */
export function transitionsFrom(from: DocStatus): DocTransition[] {
  return DOC_TRANSITIONS.filter((t) => FROM[t].includes(from));
}

export const isEditableStatus = (s: DocStatus): boolean => s === "draft";

// ---------------------------------------------------------------------------------------------------------------------------------
// Policy hooks (A10 fills these in)
// ---------------------------------------------------------------------------------------------------------------------------------

export interface PolicyContext {
  documentId: string;
  docTypeId: string | null;
  createdBy: string | null;
  submittedBy: string | null;
  actorId: string;
}

/**
 * Approval rules that depend on company settings (A10). A4 ships the neutral default; A10 installs the real one with
 * `setStatusPolicy` (owner decision 5: an author's own document is approved by default, a company setting per document type can require
 * a different approver).
 */
export interface StatusPolicy {
  /** Called right after a successful submit. True approves the document at once, recorded as an automatic step. */
  autoApproveOnSubmit(ctx: PolicyContext): boolean | Promise<boolean>;
  /** Called on approve. True means the approver must not be the person who authored or submitted the document. */
  requireDifferentApprover(ctx: PolicyContext): boolean | Promise<boolean>;
}

export const NEUTRAL_STATUS_POLICY: StatusPolicy = {
  autoApproveOnSubmit: () => false,
  requireDifferentApprover: () => false,
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------------------------------------------------------------

export type AclLevel = "view" | "edit";
export interface AclEntry { userId: string; level: AclLevel }

export interface AccessInfo {
  createdBy: string | null;
  acl: readonly AclEntry[];
}

/** People with an approval or settings capability see and edit every document; everyone else only their own and those shared with them. */
export function seesAllDocuments(actor: RoleContext): boolean {
  return playbookCan(actor, "APPROVE") || playbookCan(actor, "ISSUE") || playbookCan(actor, "SETTINGS");
}

export function canViewDoc(actor: RoleContext & { id: string }, d: AccessInfo): boolean {
  if (!playbookCan(actor, "VIEW")) return false;
  return seesAllDocuments(actor) || d.createdBy === actor.id || d.acl.some((a) => a.userId === actor.id);
}

export function canEditDoc(actor: RoleContext & { id: string }, d: AccessInfo): boolean {
  if (!playbookCan(actor, "EDIT")) return false;
  return seesAllDocuments(actor) || d.createdBy === actor.id || d.acl.some((a) => a.userId === actor.id && a.level === "edit");
}

export interface DocCapabilities {
  view: boolean;
  edit: boolean;
  transitions: DocTransition[];
  /** Download as PDF or Word. */
  export: boolean;
  delete: boolean;
  purge: boolean;
  holdLegal: boolean;
}

/** What the signed-in user may do with a document right now (buttons in the UI; the server re-checks each action). */
export function documentCapabilities(
  actor: RoleContext & { id: string },
  d: AccessInfo & { status: DocStatus; deleted?: boolean }
): DocCapabilities {
  const view = canViewDoc(actor, d);
  const own = canEditDoc(actor, d);
  const transitions = view
    ? transitionsFrom(d.status).filter((t) => {
        const perm = transitionPermission(t, d.status);
        if (!playbookCan(actor, perm)) return false;
        // Submitting, withdrawing, revising and archiving a draft need write access to this particular document.
        return perm === "APPROVE" || perm === "ISSUE" || own;
      })
    : [];
  return {
    view,
    edit: own && d.status === "draft" && !d.deleted,
    transitions: d.deleted ? [] : transitions,
    export: view && !d.deleted && playbookCan(actor, "EXPORT"),
    delete: own && !d.deleted && (d.status === "draft" || d.status === "archived"),
    purge: playbookCan(actor, "MANAGE_RETENTION"),
    holdLegal: playbookCan(actor, "MANAGE_RETENTION"),
  };
}
