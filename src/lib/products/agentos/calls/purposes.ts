/**
 * Call purposes: pure code, no company facts. A purpose is only a label, a description, a prompt scaffold written with
 * {{variables}} and a list of data-collection FIELD SUGGESTIONS the company edits on its agent. The values of the variables come
 * from the person placing the call (the "context"), never from here. Client-safe (no server imports).
 */

export interface DataField {
  /** Machine key, also the ElevenLabs data-collection id (a-z, 0-9, _). */
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "choice";
  /** Allowed answers when type is "choice". */
  options?: string[];
  /** Tells the model how to find the answer in the conversation. */
  description: string;
  required: boolean;
}

export interface PurposeVariable {
  key: string;
  label: string;
}

export interface CallPurpose {
  key: string;
  label: string;
  description: string;
  /** Prompt scaffold. Uses {{variable}} placeholders only; the company's own agent instructions carry every fact. */
  scaffold: string;
  variables: PurposeVariable[];
  suggestedFields: DataField[];
}

const CONTACT: PurposeVariable = { key: "contact_name", label: "Name of the person being called" };
const COMPANY: PurposeVariable = { key: "company_name", label: "Name of the calling company" };
const NOTES: PurposeVariable = { key: "notes", label: "Notes for this call" };
const f = (key: string, label: string, type: DataField["type"], description: string, required = false, options?: string[]): DataField => ({ key, label, type, description, required, ...(options ? { options } : {}) });

export const CALL_PURPOSES: readonly CallPurpose[] = [
  {
    key: "screening", label: "Candidate screening", description: "A first conversation with a job applicant to confirm interest and basic fit.",
    variables: [CONTACT, COMPANY, { key: "role_title", label: "Role applied for" }, NOTES],
    scaffold: "You are calling {{contact_name}} on behalf of {{company_name}}. They applied for the role: {{role_title}}. Greet them, say who you are calling for and why, and ask if it is a good time to talk for a few minutes. If it is not, offer to be called back and end politely. Keep the conversation friendly and structured. Reference notes from the team: {{notes}}",
    suggestedFields: [
      f("interested", "Still interested", "boolean", "Whether the person confirms they are still interested in the role.", true),
      f("current_employment", "Current employment", "text", "Where the person works now, or that they are not working."),
      f("experience_years", "Years of experience", "number", "Total years of relevant work experience the person states."),
      f("availability", "Availability to talk or interview", "text", "When the person says they can attend the next step."),
    ],
  },
  {
    key: "pre_hr", label: "HR pre-qualification", description: "Short HR questions before an interview: job change reason, expectations, notice period.",
    variables: [CONTACT, COMPANY, { key: "role_title", label: "Role applied for" }, NOTES],
    scaffold: "You are calling {{contact_name}} for the HR team of {{company_name}} about the role: {{role_title}}. Explain this is a short pre-qualification call. Ask the questions one at a time, listen fully, and never pressure or judge. Reference notes from the team: {{notes}}",
    suggestedFields: [
      f("looking_for_change", "Looking for a change", "boolean", "Whether the person is actively looking for a new job.", true),
      f("reason_for_change", "Reason for change", "text", "Why the person wants to change jobs, in their own words."),
      f("current_ctc", "Current compensation", "text", "Current compensation as the person states it, with the period."),
      f("expected_ctc", "Expected compensation", "text", "Expected compensation as the person states it, with the period."),
      f("notice_period", "Notice period", "text", "How long a notice period the person has to serve, or whether they can join immediately."),
      f("preferred_location", "Preferred work location", "text", "Where the person is willing to work."),
    ],
  },
  {
    key: "lead_followup", label: "Lead follow-up", description: "Follow up on an enquiry that someone showed interest in.",
    variables: [CONTACT, COMPANY, { key: "enquiry_topic", label: "What they enquired about" }, NOTES],
    scaffold: "You are calling {{contact_name}} on behalf of {{company_name}} to follow up on their enquiry about: {{enquiry_topic}}. Ask if it is a good time. Answer only from what you know; if you do not know something, say a team member will follow up. Never pressure. Reference notes from the team: {{notes}}",
    suggestedFields: [
      f("still_interested", "Still interested", "boolean", "Whether the person is still interested.", true),
      f("requirement", "Requirement", "text", "What the person needs, in their own words."),
      f("timeline", "Timeline", "text", "When the person wants to go ahead."),
      f("next_step", "Preferred next step", "text", "What the person asks to happen next, such as a meeting or a call back."),
    ],
  },
  {
    key: "pre_sale", label: "Pre-sale call", description: "Understand a prospect's needs before a proposal or meeting.",
    variables: [CONTACT, COMPANY, { key: "enquiry_topic", label: "What they are interested in" }, NOTES],
    scaffold: "You are calling {{contact_name}} on behalf of {{company_name}} before a sales conversation about: {{enquiry_topic}}. Your job is to understand their needs and agree on a next step, not to close a deal. Be honest about what you can and cannot answer. Reference notes from the team: {{notes}}",
    suggestedFields: [
      f("need", "Need", "text", "The problem the person wants solved, in their own words."),
      f("budget_range", "Budget range", "text", "The budget the person mentions, if they choose to share it."),
      f("decision_maker", "Decision maker", "boolean", "Whether the person is the one who decides."),
      f("meeting_preference", "Meeting preference", "text", "When and how the person wants to meet."),
    ],
  },
  {
    key: "client_followup", label: "Client follow-up", description: "Check in with an existing client.",
    variables: [CONTACT, COMPANY, { key: "project_name", label: "Project or service" }, NOTES],
    scaffold: "You are calling {{contact_name}}, an existing client of {{company_name}}, to check in about: {{project_name}}. Ask how things are going and listen. Do not make commitments on behalf of the team. Reference notes from the team: {{notes}}",
    suggestedFields: [
      f("satisfaction", "How they feel", "choice", "The person's overall satisfaction.", false, ["happy", "neutral", "unhappy"]),
      f("issues", "Issues raised", "text", "Any problems or concerns the person mentions."),
      f("request", "Requests", "text", "Anything the person asks the team to do."),
    ],
  },
  {
    key: "project_update", label: "Project update", description: "Tell a client where their project stands after delivery or at a milestone.",
    variables: [CONTACT, COMPANY, { key: "project_name", label: "Project name" }, { key: "update_summary", label: "What to tell them" }, NOTES],
    scaffold: "You are calling {{contact_name}} on behalf of {{company_name}} with an update on: {{project_name}}. Share only this update: {{update_summary}}. Do not add details, promises or dates that are not in it; if asked something else, say a team member will reply. Reference notes from the team: {{notes}}",
    suggestedFields: [
      f("update_understood", "Update understood", "boolean", "Whether the person confirms they understood the update.", true),
      f("questions", "Questions asked", "text", "Questions the person asked that need a human answer."),
      f("follow_up_needed", "Follow-up needed", "boolean", "Whether the person asks for a call or message from the team."),
    ],
  },
  {
    key: "upsell", label: "Upsell", description: "Tell an existing client about something that may help them, with no pressure.",
    variables: [CONTACT, COMPANY, { key: "offer_summary", label: "What to tell them" }, NOTES],
    scaffold: "You are calling {{contact_name}} on behalf of {{company_name}} to mention: {{offer_summary}}. Mention it once, plainly, and ask if they would like to hear more. If they say no, thank them and end the call. Never pressure and never invent details. Reference notes from the team: {{notes}}",
    suggestedFields: [
      f("interested", "Interested", "choice", "How interested the person is.", true, ["yes", "maybe", "no"]),
      f("callback_time", "Best time for a team call", "text", "When the person would like to be contacted."),
    ],
  },
  {
    key: "support", label: "Support", description: "Help a person with a question or problem.",
    variables: [CONTACT, COMPANY, { key: "issue_summary", label: "What the call is about" }, NOTES],
    scaffold: "You are speaking with {{contact_name}} on behalf of {{company_name}} about: {{issue_summary}}. Understand the problem, help only from what you know, and say clearly when a team member must take over. Reference notes from the team: {{notes}}",
    suggestedFields: [
      f("issue", "Issue", "text", "The problem the person describes.", true),
      f("resolved", "Resolved on the call", "boolean", "Whether the problem was resolved during the call."),
      f("escalation_needed", "Needs a human", "boolean", "Whether a team member needs to follow up."),
    ],
  },
  {
    key: "custom", label: "Custom", description: "Your own purpose: describe it in the agent's instructions.",
    variables: [CONTACT, COMPANY, NOTES],
    scaffold: "You are calling {{contact_name}} on behalf of {{company_name}}. Reference notes from the team: {{notes}}",
    suggestedFields: [],
  },
] as const;

export const PURPOSE_BY_KEY = new Map(CALL_PURPOSES.map((p) => [p.key, p]));
export const PURPOSE_KEYS = CALL_PURPOSES.map((p) => p.key);
export const isPurposeKey = (v: unknown): v is string => typeof v === "string" && PURPOSE_BY_KEY.has(v);

/**
 * The per-call briefing (what the team knows about the person: their enquiry, chats, earlier calls). It is a dynamic variable the engine fills
 * at dial time (see briefing.ts); it is NOT a purpose variable a caller can type or pass, so `sanitizeContext` never accepts it.
 */
export const BRIEFING_VARIABLE = "lead_briefing";
/** Purposes whose agents talk to a lead, client, applicant or candidate and so get the briefing placeholder in their prompt. */
export const BRIEFING_PURPOSES: readonly string[] = ["screening", "pre_hr", "lead_followup", "pre_sale", "client_followup", "project_update", "upsell", "support"];
export const usesBriefing = (purposes: readonly string[] | null | undefined): boolean => (purposes ?? []).some((k) => BRIEFING_PURPOSES.includes(k));
/** The blank briefing variable for an agent that uses it (browser and public sessions pass it empty so the prompt's placeholder always resolves). */
export const briefingVariablesFor = (purposes: readonly string[] | null | undefined): Record<string, string> => (usesBriefing(purposes) ? { [BRIEFING_VARIABLE]: "" } : {});
/** What a {{lead_briefing}} placeholder shows when ElevenLabs has no value for it (an inbound call, a test in their dashboard). */
export const BRIEFING_PLACEHOLDER = "No briefing is available for this call.";

/** Every variable key the given purposes use (deduplicated, in order). */
export function variablesFor(purposes: readonly string[]): PurposeVariable[] {
  const seen = new Set<string>();
  const out: PurposeVariable[] = [];
  for (const k of purposes) for (const v of PURPOSE_BY_KEY.get(k)?.variables ?? []) if (!seen.has(v.key)) { seen.add(v.key); out.push(v); }
  return out;
}

// ---------------------------------------------------------------------------
// Data fields: validation + mapping to ElevenLabs `platform_settings.data_collection`
// ---------------------------------------------------------------------------

export const DATA_FIELD_LIMITS = { max: 25, keyMax: 40, labelMax: 80, descMax: 400, optionMax: 60, optionsMax: 20 } as const;
export const DATA_FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

export class DataFieldError extends Error {}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Validates the list the form sent. Throws DataFieldError with a plain message. */
export function normalizeDataFields(raw: unknown): DataField[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new DataFieldError("The fields to collect must be a list.");
  if (raw.length > DATA_FIELD_LIMITS.max) throw new DataFieldError(`You can collect at most ${DATA_FIELD_LIMITS.max} fields per agent.`);
  const seen = new Set<string>();
  return raw.map((item, i) => {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const label = clean(r.label, DATA_FIELD_LIMITS.labelMax);
    const key = clean(r.key, DATA_FIELD_LIMITS.keyMax);
    const where = `Field ${i + 1}${label ? ` (${label})` : ""}`;
    if (!label) throw new DataFieldError(`${where}: give it a name.`);
    if (!DATA_FIELD_KEY.test(key)) throw new DataFieldError(`${where}: the key must start with a letter and use only lowercase letters, digits and underscores.`);
    if (seen.has(key)) throw new DataFieldError(`${where}: the key "${key}" is used twice.`);
    seen.add(key);
    const type = r.type === "number" || r.type === "boolean" || r.type === "choice" ? r.type : "text";
    const description = clean(r.description, DATA_FIELD_LIMITS.descMax);
    if (!description) throw new DataFieldError(`${where}: describe how to find the answer in the conversation.`);
    const field: DataField = { key, label, type, description, required: r.required === true };
    if (type === "choice") {
      const options = Array.isArray(r.options) ? [...new Set(r.options.map((o) => clean(o, DATA_FIELD_LIMITS.optionMax)).filter(Boolean))].slice(0, DATA_FIELD_LIMITS.optionsMax) : [];
      if (options.length < 2) throw new DataFieldError(`${where}: a choice needs at least two options.`);
      field.options = options;
    }
    return field;
  });
}

/**
 * Fields -> ElevenLabs `platform_settings.data_collection` map (id -> { type, description }). ElevenLabs types are
 * boolean | string | integer | number, so text and choice are strings (a choice lists its options in the description);
 * number maps to "number" (decimals allowed).
 */
export function toDataCollection(fields: readonly DataField[] | null | undefined): Record<string, { type: "boolean" | "string" | "number"; description: string }> {
  const out: Record<string, { type: "boolean" | "string" | "number"; description: string }> = {};
  for (const fd of fields ?? []) {
    const type = fd.type === "boolean" ? "boolean" : fd.type === "number" ? "number" : "string";
    const options = fd.type === "choice" && fd.options?.length ? ` Answer with exactly one of: ${fd.options.join(", ")}.` : "";
    out[fd.key] = { type, description: `${fd.description}${options}`.slice(0, 600) };
  }
  return out;
}
