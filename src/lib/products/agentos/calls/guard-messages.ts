import type { CallFailure, CallFailureCode } from "@/lib/products/agentos/calls/types";

/**
 * Plain-language wording for every reason the engine can refuse a call (client-safe, pure). The engine's own message carries the
 * specifics (the allowed countries, the calling hours); this adds a short title and the next step for the person looking at it,
 * which differs for a calls manager and for everyone else.
 */

export type FailureField = "phone" | "agent" | "purpose" | "schedule" | "override" | null;

export interface FailureAdvice {
  code: CallFailureCode | "unknown";
  title: string;
  /** The engine's sentence (specific to this call). */
  message: string;
  /** What to do next, written for this viewer. */
  hint: string | null;
  /** The form field to point at. */
  field: FailureField;
  /** A calls manager may place this call anyway by giving a reason (only the calling window). */
  canOverride: boolean;
  /** A page that fixes it, offered only to people who can use it. */
  link: { label: string; href: string } | null;
  /** Trying again later may work without changing anything. */
  retryLater: boolean;
}

export interface FailureContext {
  isManager: boolean;
  /** The agent that was picked, to link to its settings. */
  agentId?: string | null;
}

const ADMIN_PHONE = "Ask an admin to add a phone number in CommandOS → AgentOS settings → Phone.";

interface Entry {
  title: string;
  field: FailureField;
  retryLater?: boolean;
  hint: (c: FailureContext) => string | null;
  link?: (c: FailureContext) => { label: string; href: string } | null;
}

const managerOnly = (c: FailureContext, link: { label: string; href: string }) => (c.isManager ? link : null);

const ENTRIES: Record<CallFailureCode, Entry> = {
  invalid_phone: { title: "That number can't be dialed", field: "phone", hint: () => "Check the digits and include the country code, for example +91 98765 43210." },
  countries_not_configured: {
    title: "Calling isn't set up yet",
    field: null,
    hint: (c) => (c.isManager ? "Choose the countries you may call in the call settings." : "Ask an admin to choose the allowed countries in CommandOS → AgentOS settings → Phone → Call settings."),
    link: (c) => managerOnly(c, { label: "Open call settings in CommandOS", href: "/commandos/settings/products/agentos/phone/settings" }),
  },
  country_not_allowed: {
    title: "This country isn't allowed",
    field: "phone",
    hint: (c) => (c.isManager ? "Add the country code in the call settings if your company may call there." : "Use a number in an allowed country, or ask an admin to allow this one."),
    link: (c) => managerOnly(c, { label: "Open call settings in CommandOS", href: "/commandos/settings/products/agentos/phone/settings" }),
  },
  do_not_call: {
    title: "On the do-not-call list",
    field: "phone",
    hint: (c) => (c.isManager ? "If the person has agreed to be called again, remove the number from the do-not-call list first." : "This number can't be called. Ask a calls manager if you think this is a mistake."),
    link: (c) => managerOnly(c, { label: "Open the do-not-call list in CommandOS", href: "/commandos/settings/products/agentos/phone/do-not-call" }),
  },
  do_not_contact: { title: "Asked not to be contacted", field: "phone", hint: () => "This person's record says they don't want to be contacted, so no call can be placed." },
  target_forbidden: { title: "No access to that record", field: null, hint: () => "You don't have access to the record this call is about, so no call was placed. Ask an admin for access in the product that owns it." },
  dial_unconfirmed: { title: "Waiting to confirm the earlier attempt", field: null, retryLater: true, hint: () => "The earlier attempt may have reached the phone. Nothing is redialed until the provider has been checked; try again after a few minutes." },
  dnc_check_failed: { title: "Couldn't check the contact rules", field: null, retryLater: true, hint: () => "Nothing was dialed. Wait a moment and try again." },
  no_timezone: {
    title: "Time zone not set",
    field: null,
    hint: () => "The workspace time zone is needed to check the calling hours. Ask an admin to set it in the workspace settings.",
  },
  outside_window: {
    title: "Outside the calling hours",
    field: "schedule",
    hint: (c) => (c.isManager ? "Schedule it inside the hours, or give a reason below to call anyway. The reason is saved with the call." : "Schedule the call inside the calling hours, or ask a calls manager to place it."),
  },
  override_not_allowed: { title: "Only a calls manager can do that", field: "override", hint: () => "Clear the reason and schedule the call inside the calling hours." },
  schedule_in_past: { title: "That time has passed", field: "schedule", hint: () => "Pick a date and time in the future." },
  duplicate: { title: "Already called recently", field: "phone", hint: () => "This number was just called or is already scheduled. Check Calls before trying again." },
  user_cap: { title: "Hourly limit reached", field: null, retryLater: true, hint: () => "Try again later, or schedule the call for a later time." },
  company_cap: { title: "Workspace hourly limit reached", field: null, retryLater: true, hint: () => "Try again later, or schedule the call for a later time." },
  plan_blocked: { title: "Not available on your plan right now", field: null, hint: (c) => (c.isManager ? "Check your plan and voice minutes in the billing settings." : "Ask an admin to check the plan's voice minutes.") },
  agent_unusable: {
    title: "This agent can't take calls",
    field: "agent",
    hint: (c) => (c.isManager ? "Open the agent, fix what is listed and save it, or pick another agent." : "Pick another agent, or ask an editor to fix this one."),
    link: (c) => (c.isManager && c.agentId ? { label: "Open the agent", href: `/agentos/bots/${encodeURIComponent(c.agentId)}` } : null),
  },
  disclosure_missing: {
    title: "The agent has no AI disclosure line",
    field: "agent",
    hint: (c) => (c.isManager ? "Add a disclosure line to the agent, or switch the requirement off in the call settings." : "Ask an editor to add a disclosure line to this agent."),
    link: (c) => (c.isManager && c.agentId ? { label: "Open the agent", href: `/agentos/bots/${encodeURIComponent(c.agentId)}` } : null),
  },
  not_connected: {
    title: "ElevenLabs isn't connected",
    field: null,
    hint: (c) => (c.isManager ? "Add your ElevenLabs key under Settings → Integrations." : "Ask an admin to connect ElevenLabs under Settings → Integrations."),
    link: (c) => managerOnly(c, { label: "Open integrations", href: "/commandos/settings/integrations" }),
  },
  no_number: {
    title: "No phone number to call from",
    field: null,
    hint: (c) => (c.isManager ? "Import a number from your Twilio account." : ADMIN_PHONE),
    link: (c) => managerOnly(c, { label: "Open phone numbers in CommandOS", href: "/commandos/settings/products/agentos/phone" }),
  },
  purpose_unsupported: {
    title: "The agent isn't set up for this kind of call",
    field: "purpose",
    hint: (c) => (c.isManager ? "Add the call purpose to the agent, or pick another purpose or agent." : "Pick another purpose or agent, or ask an editor to add this purpose to the agent."),
    link: (c) => (c.isManager && c.agentId ? { label: "Open the agent", href: `/agentos/bots/${encodeURIComponent(c.agentId)}` } : null),
  },
  provider_error: { title: "The phone provider didn't accept the call", field: null, retryLater: true, hint: () => "Nothing more was done. Try again in a moment." },
  cancelled: { title: "Call cancelled", field: null, hint: () => null },
  not_live: { title: "That can't be done now", field: null, hint: () => "The call has already moved on. Refresh to see where it stands." },
  control_busy: { title: "Someone else is on the call", field: null, hint: () => null },
  takeover_unsupported: { title: "Not possible for this call", field: null, hint: () => null },
  handback_unsupported: { title: "Not possible for this call", field: null, hint: () => null },
  conference_unavailable: { title: "Live control isn't available for this call", field: null, hint: () => null },
  not_joined: { title: "Join the call first", field: null, hint: () => null },
  monitor_unavailable: { title: "Live view isn't available", field: null, hint: () => null },
};

/** The advice for one failure. Unknown codes still produce a readable message instead of nothing. */
export function describeFailure(failure: Pick<CallFailure, "code" | "message">, ctx: FailureContext): FailureAdvice {
  const entry = (ENTRIES as Partial<Record<string, Entry>>)[failure.code];
  if (!entry) {
    return { code: "unknown", title: "The call wasn't placed", message: failure.message || "Something went wrong.", hint: null, field: null, canOverride: false, link: null, retryLater: false };
  }
  return {
    code: failure.code,
    title: entry.title,
    message: failure.message,
    hint: entry.hint(ctx),
    field: failure.code === "outside_window" && ctx.isManager ? "override" : entry.field,
    canOverride: failure.code === "outside_window" && ctx.isManager,
    link: entry.link?.(ctx) ?? null,
    retryLater: entry.retryLater === true,
  };
}

export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 300;

/** Whether a manager's reason is long enough for the engine to accept (it refuses 1-9 characters). */
export function overrideReasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (!r) return "Give a reason to call outside the calling hours.";
  if (r.length < OVERRIDE_REASON_MIN) return `Explain in at least ${OVERRIDE_REASON_MIN} characters why this call must happen now.`;
  return null;
}

export const CODES_WITH_MESSAGES = Object.keys(ENTRIES) as CallFailureCode[];
