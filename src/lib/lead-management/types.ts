import type { PortalRole } from "@/lib/portal-roles";
import type { CategorySlug } from "@/lib/categories";

/**
 * Lead Management is the single source of truth for the External Portal. Every
 * website form submission becomes a `lead_record` + a portal account; all
 * lifecycle, timeline, communication, interviews, documents and notifications
 * are driven from here and reflected live in the person's portal.
 */

/** A lead's type == the portal role the account gets. */
export type LeadType = PortalRole; // "job_applicant" | "intern" | "trainee" | "client"

export const LEAD_SOURCES = [
  "job_portal",
  "internship",
  "industrial_training",
  "software_development",
  "digital_marketing",
  "ai_automation",
  "resource_augmentation",
  "client_inquiry",
  "manual",
] as const;
export type LeadManagementSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_META: Record<LeadManagementSource, { label: string; type: LeadType }> = {
  job_portal: { label: "Job Application", type: "job_applicant" },
  internship: { label: "Internship Program", type: "intern" },
  industrial_training: { label: "Industrial Training", type: "trainee" },
  software_development: { label: "Software Development Inquiry", type: "client" },
  digital_marketing: { label: "Digital Marketing Inquiry", type: "client" },
  ai_automation: { label: "AI & Automation Inquiry", type: "client" },
  resource_augmentation: { label: "Resource Augmentation Inquiry", type: "client" },
  client_inquiry: { label: "Client Contact / Project Inquiry", type: "client" },
  manual: { label: "Manual Lead", type: "client" },
};

/** Maps a public `/api/leads/[category]` slug to a lead source + type. */
export const CATEGORY_TO_SOURCE: Record<CategorySlug, LeadManagementSource> = {
  "software-development": "software_development",
  "digital-marketing": "digital_marketing",
  "ai-automations": "ai_automation",
  "industrial-training": "industrial_training",
  "resource-augmentation": "resource_augmentation",
  "internship-program": "internship",
};

export type LeadStatus = "open" | "won" | "lost";

export interface LeadSourceRef {
  kind: "career_application" | "category_lead";
  category?: CategorySlug;
  id: string;
}

export interface LeadRecord {
  _id: string;
  code: string; // LEAD-2026-0001
  type: LeadType;
  source: LeadManagementSource;
  name: string;
  email: string; // lower-cased
  phone: string;
  subService: string | null;
  message: string | null;
  stage: string; // current workflow stage key
  stageEnteredAt: Date;
  status: LeadStatus;
  externalUserId: string;
  ownerStaffId: string | null;
  /** A portal-authored reply landed in the Communication Center since staff last opened this lead. */
  hasUnreadPortalReply: boolean;
  /** The lead asked not to be contacted: DealFlow's email / WhatsApp sends refuse them. Absent means contactable. */
  doNotContact?: boolean;
  sourceRef: LeadSourceRef | null;
  applicationId: string | null; // career_applications._id
  offerId: string | null; // hrms_offers._id
  studentId: string | null; // training_students._id
  clientId: string | null; // pms_clients._id
  projectId: string | null; // pms_projects._id
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
}

export interface SerializedLeadRecord
  extends Omit<LeadRecord, "stageEnteredAt" | "createdAt" | "updatedAt" | "deletedAt"> {
  stageEnteredAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// --- timeline ---------------------------------------------------------------

export type LeadEventKind =
  | "account_created"
  | "lead_submitted"
  | "stage_changed"
  | "note_added"
  | "message_sent"
  | "interview_scheduled"
  | "interview_updated"
  | "document_shared"
  | "document_requested"
  | "linked_student"
  | "linked_project"
  | "offer_released"
  | "enrolled"
  | "certificate_issued"
  | "owner_assigned"
  | "ai_call"
  | "meeting";

export interface LeadTimelineEvent {
  _id: string;
  leadId: string;
  kind: LeadEventKind;
  title: string;
  detail: string | null;
  actor: "system" | "staff" | "applicant";
  actorId: string | null;
  visibleToLead: boolean;
  createdAt: Date;
}

export interface SerializedLeadTimelineEvent extends Omit<LeadTimelineEvent, "createdAt"> {
  createdAt: string;
}

// --- messages / communication center --------------------------------------

export type LeadMessageChannel =
  | "note"
  | "message"
  | "status_update"
  | "document_request"
  | "interview_reminder";

export interface LeadMessage {
  _id: string;
  leadId: string;
  body: string;
  visibility: "internal" | "portal";
  channel: LeadMessageChannel;
  authorType: "staff" | "portal";
  authorStaffId: string | null;
  authorPortalUserId: string | null;
  attachments: LeadMessageAttachment[];
  createdAt: Date;
}

export type LeadMessageAttachmentKind = "image" | "voice" | "video" | "file";

export interface LeadMessageAttachment {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  kind: LeadMessageAttachmentKind;
}

export interface SerializedLeadMessage extends Omit<LeadMessage, "createdAt"> {
  createdAt: string;
}
