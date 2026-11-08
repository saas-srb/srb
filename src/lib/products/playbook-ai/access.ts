import { sopCan } from "@/lib/sop-roles";
import { deriveStatus, isLive } from "@/lib/products/playbook-ai/lifecycle";
import type { SopStatus } from "@/lib/products/playbook-ai/constants";
import type { SopDoc, SopSummary, SopViewer } from "@/lib/products/playbook-ai/types";

/**
 * The single source of truth for "who can do what to which SOP". Two layers:
 *   1. capability   — `sopCan(viewer, PERM)` (role + Director override)
 *   2. object scope — WHICH SOPs: all (admin) / own department(s) (manager) /
 *      own (author, or an employee granted a write permission by override)
 * plus confidentiality for reads. Every list, page, file route and server
 * action goes through these — never re-implement a check inline. Pure, so it
 * can also hide buttons on the client (never as the security boundary).
 */

export type AccessDoc = Pick<
  SopSummary,
  "_id" | "departmentId" | "confidentiality" | "ownerId" | "authorId" | "createdBy" | "accessUserIds" | "allowDownload"
> & { status: SopStatus };

/** Projects a stored SOP onto the fields access decisions need, using its date-derived status. */
export function toAccessDoc(d: SopDoc, today: string): AccessDoc & { version: string | null } {
  return {
    _id: d._id,
    departmentId: d.departmentId,
    confidentiality: d.confidentiality,
    ownerId: d.ownerId,
    authorId: d.authorId,
    createdBy: d.createdBy,
    accessUserIds: d.accessUserIds,
    allowDownload: d.allowDownload,
    status: deriveStatus(d.status, d, today),
    version: d.version,
  };
}

const ctx = (v: SopViewer) => ({ roles: v.roles, permissionOverrides: v.overrides });

function isOwnerOrAuthor(v: SopViewer, s: AccessDoc): boolean {
  return s.ownerId === v.userId || s.authorId === v.userId || s.createdBy === v.userId;
}

/** Object-level write scope: everything (admin), the departments they manage, or SOPs they own/author. */
export function inWriteScope(v: SopViewer, s: AccessDoc): boolean {
  if (v.isAdmin) return true;
  if (v.manageDepartmentIds.includes(s.departmentId)) return true;
  return isOwnerOrAuthor(v, s);
}

/**
 * `assigned` = the viewer holds an assignment row for this SOP, which is an
 * explicit grant to read its live version (whoever assigned it had ASSIGN
 * scope over it).
 */
export function canReadSop(v: SopViewer, s: AccessDoc, assigned: boolean): boolean {
  if (!sopCan(ctx(v), "VIEW")) return false;
  if (v.isAdmin) return true;
  if (isOwnerOrAuthor(v, s)) return true;

  const managesDept = v.manageDepartmentIds.includes(s.departmentId);
  const c = ctx(v);
  const canWriteSomething = sopCan(c, "EDIT") || sopCan(c, "PUBLISH") || sopCan(c, "CREATE") || sopCan(c, "ARCHIVE");
  // Drafts and archived SOPs are only for the people who maintain them.
  if (s.status === "draft" || s.status === "archived") return managesDept && canWriteSomething;
  if (!isLive(s.status)) return false;

  if (assigned) return true;
  if (s.accessUserIds.includes(v.userId)) return true;

  switch (s.confidentiality) {
    case "internal":
      return true;
    case "department_only":
      return managesDept || v.memberDepartmentIds.includes(s.departmentId);
    case "management_only":
      return v.isManagerTier;
    case "confidential":
      return managesDept;
    case "highly_confidential":
      return v.headedDepartmentIds.includes(s.departmentId);
    case "restricted":
      return false;
    default:
      return false;
  }
}

export function canEditSop(v: SopViewer, s: AccessDoc): boolean {
  return sopCan(ctx(v), "EDIT") && inWriteScope(v, s) && s.status !== "archived";
}

export function canPublishSop(v: SopViewer, s: AccessDoc): boolean {
  return sopCan(ctx(v), "PUBLISH") && inWriteScope(v, s) && s.status !== "archived";
}

/** Only live (published/active) SOPs can be assigned — there is nothing to acknowledge on a draft. */
export function canAssignSop(v: SopViewer, s: AccessDoc): boolean {
  return sopCan(ctx(v), "ASSIGN") && inWriteScope(v, s) && (s.status === "published" || s.status === "active");
}

export function canArchiveSop(v: SopViewer, s: AccessDoc): boolean {
  return sopCan(ctx(v), "ARCHIVE") && inWriteScope(v, s) && s.status !== "archived";
}

export function canRestoreSop(v: SopViewer, s: AccessDoc): boolean {
  return sopCan(ctx(v), "ARCHIVE") && inWriteScope(v, s) && s.status === "archived";
}

/** A never-published draft can be discarded by whoever can edit it. */
export function canDeleteDraftSop(v: SopViewer, s: AccessDoc & { version: string | null }): boolean {
  return s.status === "draft" && !s.version && sopCan(ctx(v), "EDIT") && inWriteScope(v, s);
}

export function canDownloadSop(v: SopViewer, s: AccessDoc, assigned: boolean): boolean {
  return sopCan(ctx(v), "DOWNLOAD") && s.allowDownload && canReadSop(v, s, assigned);
}

export function canAcknowledgeSop(v: SopViewer, s: AccessDoc, assigned: boolean): boolean {
  return sopCan(ctx(v), "ACKNOWLEDGE") && (s.status === "published" || s.status === "active") && canReadSop(v, s, assigned);
}

/** Editing the explicit access list needs edit scope AND (MANAGE_PERMISSIONS or being the owner). */
export function canGrantAccess(v: SopViewer, s: AccessDoc): boolean {
  return canEditSop(v, s) && (sopCan(ctx(v), "MANAGE_PERMISSIONS") || s.ownerId === v.userId);
}

export function canCreateInDepartment(v: SopViewer, departmentId: string): boolean {
  if (!sopCan(ctx(v), "CREATE")) return false;
  if (v.isAdmin) return true;
  return v.memberDepartmentIds.includes(departmentId) || v.headedDepartmentIds.includes(departmentId) || v.manageDepartmentIds.includes(departmentId);
}

/** Departments the viewer may create SOPs in (`null` = all). */
export function creatableDepartmentIds(v: SopViewer): string[] | null {
  if (!sopCan(ctx(v), "CREATE")) return [];
  if (v.isAdmin) return null;
  return Array.from(new Set([...v.memberDepartmentIds, ...v.headedDepartmentIds, ...v.manageDepartmentIds]));
}

/** Departments whose compliance / acknowledgements the viewer may monitor (`null` = all). */
export function monitorableDepartmentIds(v: SopViewer): string[] | null {
  if (v.isAdmin) return null;
  return v.manageDepartmentIds;
}

export function canViewCompliance(v: SopViewer): boolean {
  return v.isAdmin || (v.manageDepartmentIds.length > 0 && (sopCan(ctx(v), "ASSIGN") || sopCan(ctx(v), "PUBLISH")));
}
