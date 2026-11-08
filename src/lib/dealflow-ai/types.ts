export type PipelineTab = "jobs" | "interns" | "trainees" | "clients";

export type ClientLeadSource =
  | "facebook"
  | "instagram"
  | "meta"
  | "upwork"
  | "website"
  | "portal"
  | "manual";

export interface UnifiedPipelineContact {
  id: string;
  pipeline: PipelineTab;
  name: string;
  email: string;
  phone: string;
  companyOrCollege?: string;
  titleOrService: string; // e.g. "Senior Full Stack Dev", "AI Automations", "6-Months Industrial Training"
  source: string; // "facebook" | "instagram" | "meta" | "upwork" | "website" | "portal"
  sourceLabel: string; // "Facebook Lead Form", "Instagram Ad", "Upwork Fixed", "Website Form"
  budgetOrSalary?: string;
  status: string;
  statusLabel: string;
  message?: string;
  resumeUrl?: string;
  skills?: string[];
  submittedAt: string;
  campaignInfo?: {
    campaignName?: string;
    adName?: string;
    formName?: string;
  };
  detailUrl?: string;
  /** Which kind of record this is, for the "Call with AI" button: a lead record, a career application or a website form submission. */
  callEntity?: "lead" | "applicant" | "submission";
  /** Submissions only: the form category (the submission page and the call target need it). */
  submissionCategory?: string;
  /** Lead records only. */
  doNotContact?: boolean;
}

export type LeadSourcePlatform = "facebook" | "instagram" | "meta" | "upwork" | "website" | "portal" | "manual";

export type DealLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal_sent"
  | "negotiation"
  | "won"
  | "lost";

export interface MetaLeadDetails {
  campaignId: string;
  campaignName: string;
  adId?: string;
  adName?: string;
  adSetId?: string;
  adSetName?: string;
  formId: string;
  formName: string;
  rawFieldData?: Record<string, string>;
}

export interface UpworkLeadDetails {
  jobId: string;
  jobTitle: string;
  projectType: "fixed" | "hourly";
  budgetOrRate: string;
  clientCountry: string;
  clientRating: number;
  clientTotalSpend: string;
  skillsRequired: string[];
  jobUrl?: string;
}

export interface DealLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  source: LeadSourcePlatform;
  status: DealLeadStatus;
  budget?: string;
  serviceCategory: string;
  message?: string;
  assignedStaffId?: string | null;
  assignedStaffName?: string | null;
  metaDetails?: MetaLeadDetails;
  upworkDetails?: UpworkLeadDetails;
  aiSuggestedStatus?: string;
  lastContactedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JobApplicationStatus =
  | "new"
  | "under_review"
  | "shortlisted"
  | "interview"
  | "selected"
  | "rejected"
  | "on_hold";

export interface CandidateDocument {
  id: string;
  filename: string;
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
}

export interface DealJobApplication {
  id: string;
  pipelineType: "jobs" | "interns" | "trainees";
  applicantName: string;
  email: string;
  phone: string;
  positionId: string;
  positionTitle: string;
  experienceYears: number | string;
  currentCompany?: string;
  expectedSalary?: string;
  skills: string[];
  status: JobApplicationStatus;
  resumeUrl: string;
  resumeFilename: string;
  resumeSize: number;
  coverLetter?: string;
  documents?: CandidateDocument[];
  source: "website_portal" | "referral" | "linkedin" | "college_drive";
  interviewDate?: string | null;
  interviewNotes?: string | null;
  rating?: number;
  submittedAt: string;
  updatedAt: string;
}

export type CommunicationChannel = "chat" | "email" | "whatsapp" | "voice";

export interface OmnichannelMessage {
  id: string;
  pipeline: PipelineTab;
  contactId: string;
  channel: CommunicationChannel;
  direction: "inbound" | "outbound";
  senderName: string;
  senderIdentifier: string; // email or phone
  recipientIdentifier: string;
  subject?: string; // For emails
  body: string;
  attachments?: {
    id: string;
    filename: string;
    url: string;
    size: number;
    contentType: string;
  }[];
  deliveryStatus: "queued" | "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  isAiGenerated?: boolean;
}

export interface VoiceCallRecord {
  id: string;
  pipeline: PipelineTab;
  contactId: string;
  contactName: string;
  phoneNumber: string;
  direction: "outbound_ai" | "inbound_ai";
  status: "initiated" | "ringing" | "in_progress" | "completed" | "missed" | "declined";
  durationSeconds: number;
  initiatedBy: string;
  recordingUrl?: string;
  audioDuration?: string;
  transcript: {
    speaker: "ai_assistant" | "contact" | "human_agent";
    text: string;
    timestamp: string;
  }[];
  aiSummary: string;
  sentiment: "positive" | "neutral" | "negative";
  nextActionItems: string[];
  humanTakenOver: boolean;
  startedAt: string;
  endedAt?: string;
}

export interface WhatsAppNotificationLog {
  id: string;
  triggerType: "new_lead" | "new_job_application" | "new_intern" | "new_trainee";
  entityId: string;
  recipientPhone: string;
  messageText: string;
  status: "sent" | "delivered" | "failed";
  dealflowLink: string;
  sentAt: string;
}

/** A connection from the platform connections system (Workspace → Settings → Integrations), as the DealFlow Integrations page shows it. */
export interface IntegrationConnectionStatus {
  key: string;
  name: string;
  connected: boolean;
  /** "workspace" = the company's own keys; "platform" = SelfRun's fallback keys. */
  source: "workspace" | "platform" | null;
}

export interface IntegrationStatus {
  /** Connection state of the providers DealFlow uses (only providers that exist in the connections catalog). */
  connections: {
    meta: IntegrationConnectionStatus;
    whatsapp: IntegrationConnectionStatus;
  };
  /** Leads and applicants recorded in the lead inbox, by where they came from. Only sources with at least one record. */
  leadSources: { source: string; label: string; count: number }[];
  website: {
    portalUrl: string;
    openJobPositions: number;
    totalApplications: number;
    lastApplicationReceivedAt: string | null;
  };
}
