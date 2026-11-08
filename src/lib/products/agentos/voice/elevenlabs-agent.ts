/**
 * Typed client for the ElevenLabs Conversational AI (ConvAI) REST API. Pure: no database, no Next imports, `fetch` injectable
 * (tests never reach ElevenLabs). Endpoints, all under https://api.elevenlabs.io/v1 with the `xi-api-key` header:
 *   POST   /convai/agents/create                       create agent            -> { agent_id }
 *   PATCH  /convai/agents/{agent_id}                   update agent
 *   DELETE /convai/agents/{agent_id}                   delete agent
 *   POST   /convai/knowledge-base/text                 text document           -> { id, name }
 *   POST   /convai/knowledge-base/file  (multipart)    file document           -> { id, name }
 *   DELETE /convai/knowledge-base/{id}?force=true      delete document
 *   GET    /convai/conversation/get-signed-url?agent_id=…       -> { signed_url }
 *   GET    /convai/conversations?agent_id=…&page_size&cursor    -> { conversations[], has_more, next_cursor }
 *   GET    /convai/conversations/{conversation_id}              -> { status, transcript[], metadata, has_audio, analysis }
 *   GET    /convai/conversations/{conversation_id}/audio        -> the recording (binary)
 *   POST   /convai/phone-numbers                        import a Twilio number  -> { phone_number_id }
 *   PATCH  /convai/phone-numbers/{id}                   assign / unassign (agent_id)
 *   DELETE /convai/phone-numbers/{id}                   remove the imported number
 *   POST   /convai/twilio/outbound-call                 -> { success, message, conversation_id, callSid }
 *   POST   /workspace/webhooks                          { settings: { auth_type: "hmac", name, webhook_url } } -> { webhook_id, webhook_secret }
 *   PATCH  /convai/settings                             { webhooks: { post_call_webhook_id, events } }
 *   POST   /convai/phone-numbers                         import a Twilio number -> { phone_number_id }
 *   PATCH  /convai/phone-numbers/{id}                    assign / unassign (agent_id)
 *   DELETE /convai/phone-numbers/{id}                    remove the imported number
 *   POST   /convai/twilio/outbound-call                  -> { success, message, conversation_id, callSid }
 *   POST   /workspace/webhooks                           { settings: { auth_type: "hmac", name, webhook_url } } -> { webhook_id, webhook_secret }
 *   PATCH  /convai/settings                              { webhooks: { post_call_webhook_id, events } }
 *   GET    /models                                              -> models with languages[{language_id,name}]
 */
import { composeVoicePrompt, type PersonaFields } from "@/lib/products/agentos/voice/prompt";
import { BRIEFING_PLACEHOLDER, BRIEFING_VARIABLE, toDataCollection, usesBriefing, type DataField } from "@/lib/products/agentos/calls/purposes";
import type { VoiceConversationSummary } from "@/lib/products/agentos/voice/types";
import { maskPhonesInText } from "@/lib/products/agentos/calls/phone";

export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/**
 * The text-to-speech model every agent speaks with. It is the multilingual low-latency model, so one value serves every language
 * the picker offers; the language list is read from this model's own `languages` on the company's account.
 */
export const AGENT_TTS_MODEL = "eleven_flash_v2_5";
/** ElevenLabs refuses the multilingual model for English agents ("English Agents must use turbo or flash v2"), so English has its own. */
export const AGENT_TTS_MODEL_ENGLISH = "eleven_flash_v2";
export const ttsModelFor = (language: string) => (language === "en" ? AGENT_TTS_MODEL_ENGLISH : AGENT_TTS_MODEL);

export type FetchLike = typeof fetch;

export class ElevenLabsAgentError extends Error {
  constructor(message: string, public status: number | null = null, public code: "auth" | "not_found" | "invalid" | "rate_limit" | "quota" | "unavailable" | "network" | "other" = "other") {
    super(message);
    this.name = "ElevenLabsAgentError";
  }
}

/** Turns an ElevenLabs error response into one sentence a company admin can act on. Never includes the API key. */
export function mapElevenLabsError(status: number, body: unknown): ElevenLabsAgentError {
  const detail = (body && typeof body === "object" ? (body as { detail?: unknown }).detail : null) ?? null;
  let reason = "";
  let apiStatus = "";
  if (typeof detail === "string") reason = detail;
  else if (Array.isArray(detail)) {
    reason = detail
      .map((d) => {
        const e = d as { loc?: unknown[]; msg?: string };
        const where = Array.isArray(e.loc) ? e.loc.filter((x) => x !== "body").join(".") : "";
        return [where, e.msg].filter(Boolean).join(": ");
      })
      .filter(Boolean)
      .slice(0, 3)
      .join("; ");
  } else if (detail && typeof detail === "object") {
    const d = detail as { message?: string; status?: string };
    reason = d.message ?? "";
    apiStatus = d.status ?? "";
  }
  reason = maskPhonesInText(reason.replace(/sk_[A-Za-z0-9]+/g, "[redacted]")).slice(0, 240);
  const withReason = (base: string) => (reason ? `${base} (${reason})` : base);
  if (status === 401 || status === 403) {
    if (/permission/i.test(apiStatus + reason)) return new ElevenLabsAgentError(withReason("The ElevenLabs API key doesn't have the Conversational AI (Agents) permission. Enable it on the key in ElevenLabs"), status, "auth");
    return new ElevenLabsAgentError(withReason("ElevenLabs rejected the API key. Check it in Settings → Integrations"), status, "auth");
  }
  if (status === 404) return new ElevenLabsAgentError(withReason("ElevenLabs couldn't find that item"), status, "not_found");
  if (status === 422 || status === 400) return new ElevenLabsAgentError(withReason("ElevenLabs didn't accept the agent settings"), status, "invalid");
  if (status === 429) return new ElevenLabsAgentError("ElevenLabs is rate limiting this account. Try again in a minute.", status, "rate_limit");
  if (status === 402 || /quota|credit|limit/i.test(apiStatus + reason)) return new ElevenLabsAgentError(withReason("The ElevenLabs account is out of credits or over its plan limit"), status, "quota");
  if (status >= 500) return new ElevenLabsAgentError("ElevenLabs is having trouble right now. Try again shortly.", status, "unavailable");
  return new ElevenLabsAgentError(withReason(`ElevenLabs returned an error (${status})`), status, "other");
}

// ---------------------------------------------------------------------------
// Payload builders (pure)
// ---------------------------------------------------------------------------

export interface KnowledgeRef {
  id: string;
  name: string;
}

export interface AgentPayloadInput {
  name: string;
  instructions: string;
  firstMessage: string;
  language: string;
  voiceId: string;
  maxDurationSecs: number | null;
  knowledge: KnowledgeRef[];
  /** Name / role / tone / disclosure line. Pass the agent's voice block (`persona: voice`). The honesty rule is added whether or not this is set. */
  persona?: PersonaFields | null;
  /** Call purposes (prompt scaffolds) and the data to collect (ElevenLabs data collection). */
  purposes?: readonly string[] | null;
  dataFields?: readonly DataField[] | null;
  /** True for an agent listed publicly: the draft-test overrides stay OFF (see LOCKED_OVERRIDES_PLATFORM_SETTINGS). */
  lockOverrides?: boolean;
}

/**
 * Lets the signed-in editor test DRAFT settings before saving: ElevenLabs only accepts per-conversation overrides for the fields
 * enabled here (Agent -> Security in their dashboard). See https://elevenlabs.io/docs/agents-platform/customization/personalization/overrides
 */
export const PREVIEW_OVERRIDES_PLATFORM_SETTINGS = {
  overrides: { conversation_config_override: { agent: { first_message: true, language: true, prompt: { prompt: true } }, tts: { voice_id: true } } },
} as const;

/**
 * Every per-conversation override OFF. A PUBLIC agent (listed on the company's website) is always synced with these: otherwise anyone holding
 * a signed link could send their own prompt, first message, language or voice in the session's first message and take the agent over.
 */
export const LOCKED_OVERRIDES_PLATFORM_SETTINGS = {
  overrides: { conversation_config_override: { agent: { first_message: false, language: false, prompt: { prompt: false } }, tts: { voice_id: false } } },
} as const;

/**
 * `conversation_initiation_client_data` for an outbound call. `firstMessage` replaces the agent's greeting for this one call (recording notice +
 * AI disclosure + greeting); ElevenLabs only accepts it when the agent allows the first-message override, which is OFF for public agents, so
 * callers pass it only for agents that are not public.
 */
export function openingOverride(dynamicVariables: Record<string, string | number | boolean> | undefined, firstMessage: string | null | undefined) {
  return { dynamic_variables: dynamicVariables ?? {}, ...(firstMessage ? { conversation_config_override: { agent: { first_message: firstMessage } } } : {}) };
}

/** Body for create (POST) and update (PATCH): the agent's prompt, greeting, language, voice, call length and knowledge. */
export function buildAgentPayload(i: AgentPayloadInput) {
  return {
    name: i.name.slice(0, 120),
    conversation_config: {
      agent: {
        first_message: i.firstMessage,
        language: i.language,
        // The briefing placeholder resolves even when a call carries no value (an inbound call, a test in ElevenLabs' own dashboard).
        ...(usesBriefing(i.purposes) ? { dynamic_variables: { dynamic_variable_placeholders: { [BRIEFING_VARIABLE]: BRIEFING_PLACEHOLDER } } } : {}),
        prompt: {
          prompt: composeVoicePrompt(i.instructions, i.persona, { purposes: i.purposes, dataFields: i.dataFields }),
          knowledge_base: i.knowledge.map((k) => ({ type: "text" as const, name: k.name.slice(0, 120), id: k.id, usage_mode: "auto" as const })),
        },
      },
      tts: { voice_id: i.voiceId, model_id: ttsModelFor(i.language) },
      conversation: i.maxDurationSecs ? { max_duration_seconds: i.maxDurationSecs } : {},
    },
    // data_collection is always sent (empty when none) so a field the company removed stops being collected.
    platform_settings: { ...(i.lockOverrides ? LOCKED_OVERRIDES_PLATFORM_SETTINGS : PREVIEW_OVERRIDES_PLATFORM_SETTINGS), data_collection: toDataCollection(i.dataFields) },
  };
}

interface RawTranscriptItem {
  role?: string;
  message?: string | null;
  time_in_call_secs?: number | null;
}

/** ElevenLabs transcript -> ours: empty/tool-only turns are dropped, unknown roles read as the agent. */
export function mapTranscript(raw: unknown): NonNullable<VoiceConversationSummary["transcript"]> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<VoiceConversationSummary["transcript"]> = [];
  for (const item of raw as RawTranscriptItem[]) {
    const text = typeof item?.message === "string" ? item.message.trim() : "";
    if (!text) continue;
    out.push({ role: item.role === "user" ? "user" : "agent", text: text.slice(0, 4000), atSecs: typeof item.time_in_call_secs === "number" ? item.time_in_call_secs : null });
    if (out.length >= 1000) break;
  }
  return out;
}

export type CallSuccess = "success" | "failure" | "unknown";

export interface ConversationAnalysis {
  summary: string | null;
  title: string | null;
  callSuccess: CallSuccess | null;
  /** ElevenLabs "data collection" results the company configured on the agent, flattened to label/value pairs. */
  data: { key: string; value: string }[];
}

export interface ConversationDetail extends VoiceConversationSummary {
  /** Whether ElevenLabs reports a recording for this call (null when the field wasn't returned). */
  hasAudio: boolean | null;
  analysis: ConversationAnalysis | null;
  terminationReason: string | null;
  /** True once ElevenLabs finished processing the call (status "done" or "failed"); the transcript is only complete then. */
  settled: boolean;
  /** Telephony calls only (null for browser calls): which way it went and the two numbers, from ElevenLabs' call metadata. */
  phoneCall?: { direction: "inbound" | "outbound" | null; externalNumber: string | null; agentNumber: string | null } | null;
}

interface RawConversation {
  conversation_id?: string;
  agent_id?: string;
  status?: string;
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  transcript?: unknown;
  metadata?: { start_time_unix_secs?: number; call_duration_secs?: number; termination_reason?: string | null; phone_call?: { direction?: string | null; external_number?: string | null; agent_number?: string | null } | null };
  has_audio?: boolean;
  analysis?: {
    call_successful?: string;
    transcript_summary?: string | null;
    call_summary_title?: string | null;
    data_collection_results?: Record<string, { value?: unknown; rationale?: string; data_collection_id?: string } | null> | null;
  } | null;
}

/** ElevenLabs analysis block -> ours. Null when there is nothing worth showing. */
export function mapAnalysis(raw: RawConversation["analysis"]): ConversationAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const summary = typeof raw.transcript_summary === "string" && raw.transcript_summary.trim() ? raw.transcript_summary.trim().slice(0, 4000) : null;
  const title = typeof raw.call_summary_title === "string" && raw.call_summary_title.trim() ? raw.call_summary_title.trim().slice(0, 200) : null;
  const callSuccess = raw.call_successful === "success" || raw.call_successful === "failure" || raw.call_successful === "unknown" ? raw.call_successful : null;
  const data: ConversationAnalysis["data"] = [];
  for (const [k, v] of Object.entries(raw.data_collection_results ?? {})) {
    const val = v?.value;
    if (val === undefined || val === null || val === "") continue;
    data.push({ key: k.slice(0, 80), value: (typeof val === "string" ? val : JSON.stringify(val)).slice(0, 500) });
    if (data.length >= 30) break;
  }
  if (!summary && !title && !callSuccess && !data.length) return null;
  return { summary, title, callSuccess, data };
}

export function mapConversation(raw: RawConversation, agentIdFallback = ""): ConversationDetail {
  const started = raw.metadata?.start_time_unix_secs ?? raw.start_time_unix_secs;
  const duration = raw.metadata?.call_duration_secs ?? raw.call_duration_secs;
  const status = raw.status ?? "unknown";
  return {
    conversationId: raw.conversation_id ?? "",
    agentId: raw.agent_id ?? agentIdFallback,
    startedAt: typeof started === "number" ? new Date(started * 1000).toISOString() : "",
    durationSecs: typeof duration === "number" ? duration : null,
    status,
    transcript: raw.transcript === undefined ? null : mapTranscript(raw.transcript),
    settled: status === "done" || status === "failed",
    hasAudio: typeof raw.has_audio === "boolean" ? raw.has_audio : null,
    analysis: mapAnalysis(raw.analysis),
    terminationReason: typeof raw.metadata?.termination_reason === "string" && raw.metadata.termination_reason ? raw.metadata.termination_reason.slice(0, 300) : null,
    phoneCall: mapPhoneCall(raw.metadata?.phone_call),
  };
}

function mapPhoneCall(raw: NonNullable<RawConversation["metadata"]>["phone_call"]): ConversationDetail["phoneCall"] {
  if (!raw || typeof raw !== "object") return null;
  const num = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : null);
  return { direction: raw.direction === "inbound" || raw.direction === "outbound" ? raw.direction : null, externalNumber: num(raw.external_number), agentNumber: num(raw.agent_number) };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface AgentClientOptions {
  apiKey: string;
  fetch?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface ElevenLanguage {
  id: string;
  name: string;
}

export function createAgentClient(opts: AgentClientOptions) {
  const doFetch: FetchLike = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? ELEVENLABS_API_BASE;

  async function call<T>(method: string, path: string, init: { json?: unknown; form?: FormData; query?: Record<string, string | number | boolean | undefined> } = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== "") qs.set(k, String(v));
    const url = `${base}${path}${qs.size ? `?${qs}` : ""}`;
    const headers: Record<string, string> = { "xi-api-key": opts.apiKey, accept: "application/json" };
    if (init.json !== undefined) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
        cache: "no-store",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
      });
    } catch {
      throw new ElevenLabsAgentError("Couldn't reach ElevenLabs. Check the connection and try again.", null, "network");
    }
    const text = await res.text().catch(() => "");
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!res.ok) throw mapElevenLabsError(res.status, body);
    return (body ?? {}) as T;
  }

  return {
    async createAgent(payload: ReturnType<typeof buildAgentPayload>): Promise<{ agentId: string }> {
      const r = await call<{ agent_id?: string }>("POST", "/convai/agents/create", { json: payload });
      if (!r.agent_id) throw new ElevenLabsAgentError("ElevenLabs didn't return an agent id.");
      return { agentId: r.agent_id };
    },
    async updateAgent(agentId: string, payload: ReturnType<typeof buildAgentPayload>): Promise<void> {
      await call("PATCH", `/convai/agents/${encodeURIComponent(agentId)}`, { json: payload });
    },
    /** Turns on the draft-test overrides for an agent that was synced before they existed (idempotent). */
    async enablePreviewOverrides(agentId: string): Promise<void> {
      await call("PATCH", `/convai/agents/${encodeURIComponent(agentId)}`, { json: { platform_settings: PREVIEW_OVERRIDES_PLATFORM_SETTINGS } });
    },
    /** Switches every per-conversation override off for an agent (idempotent). Used before a public agent takes its first visitor. */
    async lockOverrides(agentId: string): Promise<void> {
      await call("PATCH", `/convai/agents/${encodeURIComponent(agentId)}`, { json: { platform_settings: LOCKED_OVERRIDES_PLATFORM_SETTINGS } });
    },
    async deleteAgent(agentId: string): Promise<void> {
      await call("DELETE", `/convai/agents/${encodeURIComponent(agentId)}`);
    },
    async createKnowledgeText(name: string, text: string): Promise<KnowledgeRef> {
      const r = await call<{ id?: string; name?: string }>("POST", "/convai/knowledge-base/text", { json: { name: name.slice(0, 120), text } });
      if (!r.id) throw new ElevenLabsAgentError("ElevenLabs didn't return a knowledge document id.");
      return { id: r.id, name: r.name ?? name };
    },
    async createKnowledgeFile(name: string, file: Blob, filename: string): Promise<KnowledgeRef> {
      const form = new FormData();
      form.append("file", file, filename);
      form.append("name", name.slice(0, 120));
      const r = await call<{ id?: string; name?: string }>("POST", "/convai/knowledge-base/file", { form });
      if (!r.id) throw new ElevenLabsAgentError("ElevenLabs didn't return a knowledge document id.");
      return { id: r.id, name: r.name ?? name };
    },
    async deleteKnowledgeDoc(id: string): Promise<void> {
      await call("DELETE", `/convai/knowledge-base/${encodeURIComponent(id)}`, { query: { force: true } });
    },
    /** A short-lived wss URL the browser connects with; the API key never leaves the server. */
    async getSignedUrl(agentId: string): Promise<string> {
      const r = await call<{ signed_url?: string }>("GET", "/convai/conversation/get-signed-url", { query: { agent_id: agentId } });
      if (!r.signed_url) throw new ElevenLabsAgentError("ElevenLabs didn't return a call link.");
      return r.signed_url;
    },
    async listConversations(agentId: string, o: { pageSize?: number; cursor?: string } = {}): Promise<{ items: ConversationDetail[]; nextCursor: string | null }> {
      const r = await call<{ conversations?: RawConversation[]; has_more?: boolean; next_cursor?: string | null }>("GET", "/convai/conversations", {
        query: { agent_id: agentId, page_size: Math.min(Math.max(o.pageSize ?? 30, 1), 100), cursor: o.cursor },
      });
      return { items: (r.conversations ?? []).map((c) => mapConversation(c, agentId)).map((c) => ({ ...c, transcript: null })), nextCursor: r.has_more ? (r.next_cursor ?? null) : null };
    },
    async getConversation(conversationId: string): Promise<ConversationDetail> {
      const r = await call<RawConversation>("GET", `/convai/conversations/${encodeURIComponent(conversationId)}`);
      return mapConversation({ ...r, conversation_id: r.conversation_id ?? conversationId });
    },
    /**
     * The call's recording, fetched whole (the route slices it for Range requests, so seeking works whatever ElevenLabs supports).
     * Returns null when ElevenLabs has no audio for it (never recorded, or past the retention window).
     */
    async getConversationAudio(conversationId: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
      let res: Response;
      try {
        res = await doFetch(`${base}/convai/conversations/${encodeURIComponent(conversationId)}/audio`, {
          method: "GET",
          headers: { "xi-api-key": opts.apiKey, accept: "audio/*" },
          cache: "no-store",
          signal: AbortSignal.timeout(Math.max(opts.timeoutMs ?? 30000, 60000)),
        });
      } catch {
        throw new ElevenLabsAgentError("Couldn't reach ElevenLabs. Check the connection and try again.", null, "network");
      }
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw mapElevenLabsError(res.status, body);
      }
      const bytes = await res.arrayBuffer();
      if (!bytes.byteLength) return null;
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      return { bytes, contentType: type.startsWith("audio/") ? type : "audio/mpeg" };
    },
    /** Imports a Twilio number into ElevenLabs (the company's own Twilio account sid + auth token). Never logs the token. */
    async importTwilioNumber(i: { phoneNumber: string; label: string; sid: string; token: string }): Promise<{ phoneNumberId: string }> {
      const r = await call<{ phone_number_id?: string }>("POST", "/convai/phone-numbers", { json: { phone_number: i.phoneNumber, label: i.label.slice(0, 120), sid: i.sid, token: i.token, provider: "twilio" } });
      if (!r.phone_number_id) throw new ElevenLabsAgentError("ElevenLabs didn't return a phone number id.");
      return { phoneNumberId: r.phone_number_id };
    },
    /** Assigns the number to an agent for inbound calls; null unassigns (ElevenLabs documents agent_id as nullable). */
    async assignPhoneNumber(phoneNumberId: string, agentId: string | null): Promise<void> {
      await call("PATCH", `/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`, { json: { agent_id: agentId } });
    },
    async deletePhoneNumber(phoneNumberId: string): Promise<void> {
      await call("DELETE", `/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`);
    },
    /** Starts an outbound call. `dynamicVariables` fill the {{variables}} in the agent's prompt and first message. */
    async outboundCall(i: { agentId: string; phoneNumberId: string; toNumber: string; dynamicVariables?: Record<string, string | number | boolean>; firstMessage?: string | null }): Promise<{ conversationId: string | null; callSid: string | null }> {
      const r = await call<{ success?: boolean; message?: string; conversation_id?: string | null; callSid?: string | null }>("POST", "/convai/twilio/outbound-call", {
        json: {
          agent_id: i.agentId,
          agent_phone_number_id: i.phoneNumberId,
          to_number: i.toNumber,
          conversation_initiation_client_data: openingOverride(i.dynamicVariables, i.firstMessage),
        },
      });
      if (r.success === false) throw new ElevenLabsAgentError(r.message ? `ElevenLabs couldn't place the call (${maskPhonesInText(String(r.message)).slice(0, 160)})` : "ElevenLabs couldn't place the call.");
      return { conversationId: r.conversation_id ?? null, callSid: r.callSid ?? null };
    },
    /** Creates the HMAC post-call webhook. The secret is returned once and must be stored by the caller. */
    async createWorkspaceWebhook(i: { name: string; url: string }): Promise<{ webhookId: string; secret: string | null }> {
      const r = await call<{ webhook_id?: string; webhook_secret?: string | null }>("POST", "/workspace/webhooks", { json: { settings: { auth_type: "hmac", name: i.name.slice(0, 80), webhook_url: i.url } } });
      if (!r.webhook_id) throw new ElevenLabsAgentError("ElevenLabs didn't return a webhook id.");
      return { webhookId: r.webhook_id, secret: r.webhook_secret ?? null };
    },
    /** Makes that webhook the workspace's post-call webhook (transcripts and failed call set-ups). */
    async setPostCallWebhook(webhookId: string): Promise<void> {
      await call("PATCH", "/convai/settings", { json: { webhooks: { post_call_webhook_id: webhookId, events: ["transcript", "call_initiation_failure"] } } });
    },
    /** Languages the agent TTS model supports, read live from the account (not a built-in list). */
    async listLanguages(): Promise<ElevenLanguage[]> {
      const r = await call<Array<{ model_id?: string; languages?: Array<{ language_id?: string; name?: string }> }>>("GET", "/models");
      const model = Array.isArray(r) ? r.find((m) => m.model_id === AGENT_TTS_MODEL) : undefined;
      const seen = new Set<string>();
      const out: ElevenLanguage[] = [];
      for (const l of model?.languages ?? []) {
        if (!l.language_id || !l.name || seen.has(l.language_id)) continue;
        seen.add(l.language_id);
        out.push({ id: l.language_id, name: l.name });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

export type AgentClient = ReturnType<typeof createAgentClient>;
