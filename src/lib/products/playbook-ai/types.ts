import type { AuditFields } from "@/lib/products/playbook-ai/db";
import type { Confidentiality, SopContent, SopPriority, SopStatus } from "@/lib/products/playbook-ai/constants";

/** Type-only module (no runtime imports) so `sops.ts`, `assignments.ts` and `access.ts` can share shapes without import cycles. */

export interface SopDoc extends AuditFields {
  _id: string;
  /** Human-readable id, e.g. "SOP-HR-0007". Stable for the life of the SOP. */
  code: string;
  /** Denormalised display title: the live version's title once published, else the draft's. */
  title: string;
  departmentId: string;
  functionId: string | null;
  processId: string | null;
  subProcessId: string | null;
  categoryId: string | null;
  ownerId: string;
  authorId: string;
  /** HRMS designation ids this SOP applies to (informational + assignment by role). */
  applicableRoleIds: string[];
  effectiveDate: string | null;
  reviewDate: string | null;
  expiryDate: string | null;
  priority: SopPriority;
  confidentiality: Confidentiality;
  mandatory: boolean;
  allowDownload: boolean;
  tags: string[];
  /** Explicit read grants (used by confidential / highly confidential / restricted). */
  accessUserIds: string[];
  templateId: string | null;
  templateName: string | null;
  status: SopStatus;
  /** Live (last published) version, e.g. "1.2"; null until first publish. */
  version: string | null;
  publishedAt: Date | null;
  lastPublishedBy: string | null;
  /** The published body readers see. */
  live: SopContent | null;
  /** The working copy editors change; becomes `live` on publish. */
  draft: SopContent;
  hasUnpublishedChanges: boolean;
  archivedAt: Date | null;
  archivedBy: string | null;
  statusBeforeArchive: SopStatus | null;
}

/** Immutable snapshot written on every publish. Never updated or deleted. */
export interface SopVersionDoc {
  _id: string;
  sopId: string;
  code: string;
  version: string;
  previousVersion: string | null;
  changeType: "initial" | "minor" | "major";
  changeSummary: string;
  authorId: string;
  authorName: string;
  publishedAt: Date;
  content: SopContent;
  meta: {
    departmentId: string;
    functionId: string | null;
    processId: string | null;
    categoryId: string | null;
    ownerId: string;
    confidentiality: Confidentiality;
    priority: SopPriority;
    mandatory: boolean;
    tags: string[];
    effectiveDate: string | null;
    reviewDate: string | null;
    expiryDate: string | null;
  };
}

/** List projection: no section bodies. */
export interface SopSummary {
  _id: string;
  code: string;
  title: string;
  description: string;
  departmentId: string;
  functionId: string | null;
  processId: string | null;
  subProcessId: string | null;
  categoryId: string | null;
  ownerId: string;
  authorId: string;
  createdBy: string | null;
  applicableRoleIds: string[];
  effectiveDate: string | null;
  reviewDate: string | null;
  expiryDate: string | null;
  priority: SopPriority;
  confidentiality: Confidentiality;
  mandatory: boolean;
  allowDownload: boolean;
  tags: string[];
  accessUserIds: string[];
  /** Status as stored. */
  storedStatus: SopStatus;
  /** Status after applying effective/expiry dates as of today. */
  status: SopStatus;
  version: string | null;
  hasUnpublishedChanges: boolean;
  moduleTags: string[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface AssignmentSource {
  type: "user" | "team" | "department" | "role" | "self" | "mandatory";
  id: string | null;
  label: string;
}

export interface AssignmentDoc {
  _id: string;
  sopId: string;
  sopCode: string;
  userId: string;
  employeeId: string | null;
  userName: string;
  /** SOP-department id of the assignee at assignment time (for department compliance). */
  departmentId: string | null;
  source: AssignmentSource;
  dueDate: string | null;
  assignedBy: string;
  assignedByName: string;
  assignedAt: Date;
  viewedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedVersion: string | null;
  /** Version the assignee is expected to acknowledge. */
  requiredVersion: string | null;
  ackHistory: { version: string; at: Date }[];
  /** "<blockId>:<itemId>" → done */
  checklist: Record<string, boolean>;
  checklistUpdatedAt: Date | null;
  lastReminderAt: Date | null;
}

export type AssignmentState = "acknowledged" | "overdue" | "pending";

export interface SopFileDoc {
  _id: string;
  sopId: string;
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: "image" | "video" | "document";
  uploadedBy: string;
  createdAt: Date;
}

export interface FeedbackDoc {
  _id: string;
  sopId: string;
  sopCode: string;
  sopTitle: string;
  kind: "feedback" | "change_request";
  message: string;
  userId: string;
  userName: string;
  /** The SOP version the person was reading. */
  version: string | null;
  status: "open" | "resolved";
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
}

/** Who is asking — everything access decisions need, resolved once per request. */
export interface SopViewer {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  overrides: Record<string, boolean>;
  employeeId: string | null;
  hrmsDepartmentId: string | null;
  teamId: string | null;
  designationId: string | null;
  /** SOP-department ids of the department this employee belongs to. */
  memberDepartmentIds: string[];
  /** SOP-department ids this employee is the HRMS head of. */
  headedDepartmentIds: string[];
  /** Departments where this user acts as a manager (head of, or member if manager-tier). */
  manageDepartmentIds: string[];
  isAdmin: boolean;
  isManagerTier: boolean;
}
