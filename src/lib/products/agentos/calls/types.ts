import type { Stamps } from "@/lib/products/agentos/db";

/** Documents of the calling engine. One collection per kind; every row is scoped to its company by the data layer. */

export const CALL_COLLECTIONS = {
  calls: "agentos_calls",
  phoneNumbers: "agentos_phone_numbers",
  doNotCall: "agentos_do_not_call",
  settings: "agentos_call_settings",
  webhooks: "agentos_voice_webhooks",
  events: "agentos_call_events",
  conferences: "agentos_call_conferences",
} as const;

export const CALL_STATUSES = ["scheduled", "dialing", "in_progress", "completed", "failed", "no_answer", "busy", "cancelled"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export const TERMINAL_STATUSES: readonly CallStatus[] = ["completed", "failed", "no_answer", "busy", "cancelled"];
export const isTerminal = (s: CallStatus) => TERMINAL_STATUSES.includes(s);

export type CallDirection = "outbound" | "inbound" | "web" | "web_public";

export interface CallTarget {
  /** The product asking for the call, e.g. "dealflow-ai". */
  product: string;
  /** What kind of record it is about, e.g. "lead", "applicant". */
  entityType: string;
  entityId: string;
  /** Shown in lists, e.g. the person's name. */
  label: string;
}

/** The numbers a company has to read back: what the guards decided, kept with the call. */
export interface ComplianceSnapshot {
  checkedAt: Date;
  callingWindow: { start: string; end: string; timeZone: string; overridden: boolean; overrideReason: string | null };
  disclosureRequired: boolean;
  disclosurePresent: boolean;
  recordingNotice: boolean;
  allowedCallingCode: string | null;
  /** The AI disclosure was spoken in the opening words of the call (needs the first-message override, which is off for public agents). */
  openingSpoken?: boolean;
  /** The recording notice was spoken to the person (by Twilio before the AI joined, or in the opening words). */
  recordingNoticeSpoken?: boolean;
}

export interface CollectedValue {
  key: string;
  label: string;
  value: string;
}

export interface CallDoc {
  _id: string;
  /** Unique per company: the same key twice returns the first call instead of placing another. */
  idempotencyKey: string;
  direction: CallDirection;
  /** The AgentOS agent (bot row) and its ElevenLabs agent id at the time of the call. */
  agentId: string;
  elevenAgentId: string | null;
  purpose: string;
  target: CallTarget | null;
  /** E.164, the number dialed (outbound), the caller (inbound) or null (web). */
  phone: string | null;
  phoneHash: string | null;
  phoneLast4: string | null;
  /** The company number the call goes out from / came in on. */
  fromNumberId: string | null;
  initiatedBy: { userId: string; email: string } | null;
  scheduledFor: Date | null;
  /** The moment this call counts for in duplicate checks: when it is due, then when it was dialed. */
  anchorAt: Date;
  dialedAt: Date | null;
  endedAt: Date | null;
  status: CallStatus;
  attempts: number;
  conversationId: string | null;
  callSid: string | null;
  /** The sanitised values passed to the agent as dynamic variables (never free text from the browser). */
  context: Record<string, string>;
  compliance: ComplianceSnapshot | null;
  failure: CallFailure | null;
  collected: CollectedValue[];
  outcome: "success" | "failure" | "unknown" | null;
  summary: string | null;
  summaryTitle: string | null;
  /** `speaker` is set on conference calls (who really spoke: the lead, the AI or a team member); `role` stays agent/user for older readers. */
  transcript: { role: "agent" | "user"; text: string; atSecs: number | null; speaker?: "lead" | "ai" | "human" }[] | null;
  durationSecs: number | null;
  hasAudio: boolean | null;
  terminationReason: string | null;
  /** Counted against the plan once. */
  meteredAt: Date | null;
  meterLeaseUntil: Date | null;
  /** Web calls only: the chat row that holds the legacy record. */
  chatId: string | null;
  cancelledBy: string | null;
  /** Who is speaking for the company on this call, and every change of hands. See live.ts for what each medium really supports. */
  control: CallControl;
  /** Public website sessions only (direction "web_public"): what the abuse and cap logic needs. Never holds the visitor's raw email or phone. */
  publicMeta?: PublicCallMeta | null;
  /** A live phone call moved to a person's phone (take-over): where, who and under which override. Counts in the duplicate window. */
  transfer?: { phoneHash: string; last4: string; at: Date; by: string; overrideReason: string | null } | null;
  /** The dial request ended in an unknown outcome (timeout after the provider may have placed the call). Blocks Retry until it is resolved. */
  dialUnknown?: { at: Date; checkedAt: Date | null; resolved: "linked" | "none" | "unconfirmed" | null } | null;
  /** The call was placed to the company's test number instead of the target's real number (the target stays linked). */
  testMode?: boolean;
  /** Masked: the number the person asked to call (test mode only) and the number actually dialed. */
  requestedPhoneMasked?: string | null;
  dialedPhoneMasked?: string | null;
  /**
   * The call briefing the agent was given: the sections the person ticked (null = the defaults) and, once dialed, an audit summary of what was built.
   * The text itself is never stored.
   */
  briefing?: {
    selection: string[] | null;
    builtAt: Date | null;
    sections: { key: string; count: number; shown: number; condensed: number; omitted: number }[];
    chars: number;
    hash: string | null;
    warnings: number;
  } | null;
  /** Last live-event number written for this call (atomic counter, bounded by LIVE_EVENT_LIMIT). */
  eventSeq: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicCallMeta {
  /** The website the visitor was on (exact origin), or "self" for the company's own site. */
  origin: string;
  /** Keyed fingerprint of the visitor's address (never the address itself). */
  ipHash: string;
  /** Seconds set aside from the day's public cap when the session started; replaced by the real duration when it settles. */
  reservedSecs: number;
  /** SHA-256 of the secret only the visitor's browser holds; needed to link the ElevenLabs conversation to this session. */
  keyHash: string;
  consentAt: Date;
  /** The reservation was reconciled with the real duration. */
  capSettledAt: Date | null;
}

export interface CallControl {
  mode: "ai" | "human";
  /** The person in control while mode is "human". */
  handler: string | null;
  /** False once a transfer removed the AI from the call: it cannot rejoin, a new AI call must be placed. */
  canHandBack: boolean;
  /** A control change is being applied to the phone legs until this time (conference calls): a second change is refused meanwhile. */
  lockUntil?: Date | null;
  history: { at: Date; from: "ai" | "human"; to: "ai" | "human"; by: string }[];
}

export interface CallEventDoc {
  _id: string;
  callId: string;
  seq: number;
  at: Date;
  type: "user" | "agent" | "human" | "agent_correction" | "control" | "note" | "status";
  text: string;
  /** Duplicate guard for replayed monitor history. */
  key: string | null;
  by: string | null;
  expiresAt: Date;
}

export interface PhoneNumberDoc extends Pick<Stamps, "createdAt" | "createdBy"> {
  _id: string;
  /** E.164. */
  number: string;
  label: string;
  provider: "twilio";
  elevenPhoneNumberId: string;
  supportsOutbound: boolean;
  supportsInbound: boolean;
  /** AgentOS agent that answers this number (inbound). */
  assignedAgentId: string | null;
  status: "active";
  updatedAt: Date;
}

export interface DoNotCallDoc {
  _id: string;
  phoneHash: string;
  last4: string;
  reason: string;
  addedBy: string;
  addedAt: Date;
}

export interface CallSettings {
  /** Calling codes the company may call ("+91"). Empty = no outbound calls until the company chooses. */
  allowedCallingCodes: string[];
  /** "HH:MM" in the company's time zone. */
  windowStart: string;
  windowEnd: string;
  duplicateWindowMinutes: number;
  perUserHourlyCap: number;
  perCompanyHourlyCap: number;
  /** Outbound calls need the agent to have an AI disclosure line. */
  requireDisclosure: boolean;
  recordingNotice: boolean;
  /** "auto" = conference when the Twilio voice setup is complete, else direct. */
  callMode: "auto" | "conference" | "direct";
  /** E.164 or null (off). When set, every outbound dial goes to this number instead of the person's real one. */
  testNumber: string | null;
}

export interface CallFailure {
  code: CallFailureCode;
  message: string;
  /** For "duplicate": the call that is already there, so the dialog can show it. Masked: no phone number. */
  existing?: ExistingCallInfo;
}

export interface ExistingCallInfo {
  id: string;
  agentName: string;
  purpose: string;
  status: CallStatus;
  /** When it was dialed, or is scheduled for (ISO). */
  at: string;
  startedBy: string | null;
  mine: boolean;
  canEnd: boolean;
  canCancel: boolean;
  canLive: boolean;
  testMode: boolean;
}

export type CallFailureCode =
  | "invalid_phone"
  | "countries_not_configured"
  | "country_not_allowed"
  | "do_not_call"
  | "do_not_contact"
  | "dnc_check_failed"
  | "target_forbidden"
  | "dial_unconfirmed"
  | "no_timezone"
  | "outside_window"
  | "override_not_allowed"
  | "schedule_in_past"
  | "duplicate"
  | "user_cap"
  | "company_cap"
  | "plan_blocked"
  | "agent_unusable"
  | "disclosure_missing"
  | "not_connected"
  | "no_number"
  | "purpose_unsupported"
  | "provider_error"
  | "cancelled"
  | "not_live"
  | "control_busy"
  | "takeover_unsupported"
  | "handback_unsupported"
  | "monitor_unavailable"
  | "conference_unavailable"
  | "not_joined";
