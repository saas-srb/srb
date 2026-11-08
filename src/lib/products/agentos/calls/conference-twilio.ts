import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio plumbing for conference calls: request signatures, the REST calls we make, the browser access token and the TwiML we answer with.
 * No database and no Next here, so every piece is testable with plain values and an injected `fetch`.
 *
 * Sources (read while building this): Twilio "Conference Participant resource" (create with To=app:AP…, update Muted/Hold/HoldUrl),
 * "Conference resource" (Status=completed ends it), TwiML <Conference> / <Start><Transcription> / <Dial>, Voice SDK access tokens
 * (JWT, HS256, grants.voice.outgoing.application_sid), and "Validate Twilio requests" (HMAC-SHA1 of URL + sorted POST params).
 */

import { maskPhonesInText } from "@/lib/products/agentos/calls/phone";

const REST = "https://api.twilio.com/2010-04-01";

// ---------------------------------------------------------------------------
// Request signature (X-Twilio-Signature)
// ---------------------------------------------------------------------------

/** Base64 HMAC-SHA1 over the full URL followed by every parameter name and value, parameters sorted by name (values of a repeated name sorted too). */
export function twilioSignature(authToken: string, url: string, params: URLSearchParams | Record<string, string | string[]>): string {
  const byName = new Map<string, string[]>();
  const add = (k: string, v: string) => byName.set(k, [...(byName.get(k) ?? []), v]);
  if (params instanceof URLSearchParams) for (const [k, v] of params) add(k, v);
  else for (const [k, v] of Object.entries(params)) for (const x of Array.isArray(v) ? v : [v]) add(k, x);
  let data = url;
  for (const k of [...byName.keys()].sort()) for (const v of byName.get(k)!.sort()) data += k + v;
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** True when `header` matches the signature of any candidate URL. Constant time per comparison. */
export function verifyTwilioSignature(authToken: string, header: string | null, urls: readonly string[], params: URLSearchParams): boolean {
  if (!header || !authToken || header.length > 200) return false;
  const got = Buffer.from(header);
  let ok = false;
  for (const url of urls) {
    const want = Buffer.from(twilioSignature(authToken, url, params));
    if (want.length === got.length && timingSafeEqual(want, got)) ok = true; // no early exit: same work whichever URL matches
  }
  return ok;
}

/**
 * The URLs Twilio may have signed. Behind a proxy `req.url` carries the internal host, so the forwarded host / protocol and the company's
 * own app address are tried as well. Twilio also signs the port-less and the :443 form of an https URL, so both are offered.
 */
export function signatureUrlCandidates(input: { pathAndQuery: string; forwardedProto: string | null; forwardedHost: string | null; host: string | null; appOrigin: string | null }): string[] {
  const bases = new Set<string>();
  const proto = (input.forwardedProto ?? "https").split(",")[0].trim().toLowerCase() === "http" ? "http" : "https";
  for (const h of [input.forwardedHost, input.host]) {
    const host = h?.split(",")[0].trim();
    if (host && /^[\w.-]+(:\d{1,5})?$/.test(host)) bases.add(`${proto}://${host}`);
  }
  if (input.appOrigin) bases.add(input.appOrigin.replace(/\/+$/, ""));
  const out = new Set<string>();
  for (const b of bases) {
    out.add(b + input.pathAndQuery);
    try {
      const u = new URL(b);
      const withPort = u.port ? b : `${u.protocol}//${u.hostname}:${u.protocol === "https:" ? 443 : 80}`;
      const without = u.port ? `${u.protocol}//${u.hostname}` : b;
      if (!u.port || u.port === String(u.protocol === "https:" ? 443 : 80)) { out.add(withPort + input.pathAndQuery); out.add(without + input.pathAndQuery); }
    } catch { /* not a URL: skip */ }
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

export class TwilioError extends Error {
  /** `outcomeUnknown`: the request may have been processed although no answer came back (timeout / connection lost / server error). */
  constructor(message: string, readonly status: number | null = null, readonly code: number | null = null, readonly outcomeUnknown: boolean = (status !== null && status >= 500)) {
    super(message);
  }
}

export interface TwilioCreds {
  accountSid: string;
  authToken: string;
}

export function createTwilioRest(creds: TwilioCreds, doFetch: typeof fetch = fetch) {
  const auth = `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`;
  const base = `${REST}/Accounts/${encodeURIComponent(creds.accountSid)}`;
  async function call<T>(method: "GET" | "POST" | "DELETE", path: string, form?: [string, string][]): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: { authorization: auth, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new TwilioError("Couldn't reach Twilio. Check the connection and try again.", null, null, true);
    }
    if (res.status === 204) return {} as T;
    const body = (await res.json().catch(() => null)) as { message?: string; code?: number } | null;
    if (!res.ok) {
      const code = typeof body?.code === "number" ? body.code : null;
      throw new TwilioError(res.status === 401 ? "Twilio rejected the account credentials. Check them in Settings → Integrations." : `Twilio refused the request${body?.message ? `: ${maskPhonesInText(String(body.message)).slice(0, 160)}` : ""}.`, res.status, code);
    }
    return body as T;
  }
  const sid = (v: string) => encodeURIComponent(v);
  return {
    /** Dials the lead. `Url` answers with the conference TwiML once they pick up. */
    async createCall(i: { to: string; from: string; url: string; statusCallback: string; timeoutSecs: number }): Promise<{ sid: string }> {
      const form: [string, string][] = [["To", i.to], ["From", i.from], ["Url", i.url], ["Method", "POST"], ["StatusCallback", i.statusCallback], ["StatusCallbackMethod", "POST"], ["Timeout", String(i.timeoutSecs)]];
      for (const e of ["initiated", "ringing", "answered", "completed"]) form.push(["StatusCallbackEvent", e]);
      const r = await call<{ sid?: string }>("POST", "/Calls.json", form);
      if (!r.sid) throw new TwilioError("Twilio didn't return a call id.");
      return { sid: r.sid };
    },
    /** Calls Twilio placed from `from` to `to` since `since` (to find out whether a dial request that timed out went through). */
    async findCalls(i: { to: string; from: string; since: Date }): Promise<{ sid: string; status: string; startedAt: Date | null }[]> {
      const qs = new URLSearchParams({ To: i.to, From: i.from, "StartTime>": i.since.toISOString().slice(0, 10), PageSize: "20" }).toString();
      const r = await call<{ calls?: { sid?: string; status?: string; date_created?: string; start_time?: string }[] }>("GET", `/Calls.json?${qs}`);
      return (r.calls ?? []).filter((c) => typeof c.sid === "string").map((c) => ({ sid: c.sid!, status: c.status ?? "unknown", startedAt: c.date_created || c.start_time ? new Date((c.date_created ?? c.start_time)!) : null }));
    },
    async hangUp(callSid: string): Promise<void> {
      await call("POST", `/Calls/${sid(callSid)}.json`, [["Status", "completed"]]);
    },
    async getCall(callSid: string): Promise<{ status: string; duration: number | null }> {
      const r = await call<{ status?: string; duration?: string | null }>("GET", `/Calls/${sid(callSid)}.json`);
      return { status: r.status ?? "unknown", duration: r.duration ? Number(r.duration) : null };
    },
    /** Adds the AI to a running conference as a TwiML-App participant (`To=app:AP…`). */
    async addAppParticipant(i: { conferenceSid: string; appSid: string; params: Record<string, string>; from: string; statusCallback: string; label: string }): Promise<{ callSid: string }> {
      const qs = new URLSearchParams(i.params).toString();
      const form: [string, string][] = [
        ["To", `app:${i.appSid}${qs ? `?${qs}` : ""}`], ["From", i.from], ["Label", i.label], ["EarlyMedia", "false"],
        ["StartConferenceOnEnter", "true"], ["EndConferenceOnExit", "false"], ["Muted", "false"], ["Timeout", "30"],
        ["StatusCallback", i.statusCallback], ["StatusCallbackMethod", "POST"], ["ConferenceStatusCallback", i.statusCallback], ["ConferenceStatusCallbackMethod", "POST"],
      ];
      for (const e of ["initiated", "ringing", "answered", "completed"]) form.push(["StatusCallbackEvent", e]);
      for (const e of ["start", "end", "join", "leave", "mute", "hold"]) form.push(["ConferenceStatusCallbackEvent", e]);
      const r = await call<{ call_sid?: string }>("POST", `/Conferences/${sid(i.conferenceSid)}/Participants.json`, form);
      if (!r.call_sid) throw new TwilioError("Twilio didn't return the AI's call id.");
      return { callSid: r.call_sid };
    },
    /** Mute and hold are the two controls takeover uses. Hold plays `holdUrl` (silence) to the held leg instead of the conference. */
    async updateParticipant(conferenceSid: string, callSid: string, change: { muted?: boolean; hold?: boolean; holdUrl?: string; announceUrl?: string }): Promise<void> {
      const form: [string, string][] = [];
      if (change.announceUrl) form.push(["AnnounceUrl", change.announceUrl], ["AnnounceMethod", "POST"]);
      if (change.muted !== undefined) form.push(["Muted", String(change.muted)]);
      if (change.hold !== undefined) form.push(["Hold", String(change.hold)]);
      if (change.hold && change.holdUrl) form.push(["HoldUrl", change.holdUrl], ["HoldMethod", "POST"]);
      await call("POST", `/Conferences/${sid(conferenceSid)}/Participants/${sid(callSid)}.json`, form);
    },
    async removeParticipant(conferenceSid: string, callSid: string): Promise<void> {
      await call("DELETE", `/Conferences/${sid(conferenceSid)}/Participants/${sid(callSid)}.json`);
    },
    async endConference(conferenceSid: string): Promise<void> {
      await call("POST", `/Conferences/${sid(conferenceSid)}.json`, [["Status", "completed"]]);
    },
  };
}
export type TwilioRest = ReturnType<typeof createTwilioRest>;

// ---------------------------------------------------------------------------
// Browser access token (Voice SDK)
// ---------------------------------------------------------------------------

const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");

/**
 * A Twilio AccessToken with a Voice grant, signed with the company's API key secret (never the auth token). `identity` is the browser leg's
 * client name; calls the token makes go to the TwiML App (`outgoing.application_sid`), i.e. our voice route.
 */
export function buildAccessToken(i: { accountSid: string; apiKeySid: string; apiKeySecret: string; appSid: string; identity: string; ttlSecs: number; nowSecs?: number }): string {
  const iat = i.nowSecs ?? Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${i.apiKeySid}-${iat}`, iss: i.apiKeySid, sub: i.accountSid, iat, nbf: iat, exp: iat + i.ttlSecs,
    grants: { identity: i.identity, voice: { incoming: { allow: false }, outgoing: { application_sid: i.appSid } } },
  };
  const unsigned = `${b64(header)}.${b64(payload)}`;
  return `${unsigned}.${createHmac("sha256", i.apiKeySecret).update(unsigned).digest("base64url")}`;
}

// ---------------------------------------------------------------------------
// TwiML
// ---------------------------------------------------------------------------

export const xmlEscape = (v: string) => v.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const doc = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const CONF_EVENTS = "start end join leave mute hold";

export interface TranscriptionTwiml {
  callbackUrl: string;
  languageCode: string;
}

/** The lead's leg: transcribe both directions, then sit in the conference. When the lead hangs up the conference ends (AI and human with it). */
export function leadConferenceTwiml(i: { name: string; statusUrl: string; transcription: TranscriptionTwiml | null; notice?: { text: string; languageCode: string } | null }): string {
  const trans = i.transcription
    ? `<Start><Transcription name="agentos-live" statusCallbackUrl="${xmlEscape(i.transcription.callbackUrl)}" statusCallbackMethod="POST" track="both_tracks" languageCode="${xmlEscape(i.transcription.languageCode)}" partialResults="false" enableAutomaticPunctuation="true"/></Start>`
    : "";
  return doc(`${i.notice ? sayTag(i.notice.text, i.notice.languageCode) : ""}${trans}<Dial><Conference participantLabel="lead" beep="false" waitUrl="" maxParticipants="6" startConferenceOnEnter="true" endConferenceOnExit="true" statusCallback="${xmlEscape(i.statusUrl)}" statusCallbackMethod="POST" statusCallbackEvent="${CONF_EVENTS}">${xmlEscape(i.name)}</Conference></Dial>`);
}

/** A spoken sentence. `languageCode` is a BCP-47 code such as "hi-IN"; "multi" (or empty) lets Twilio use its default voice language. */
export const sayTag = (text: string, languageCode: string): string => `<Say${languageCode && languageCode !== "multi" ? ` language="${xmlEscape(languageCode)}"` : ""}>${xmlEscape(text)}</Say>`;
/** What the lead hears when a team member joins or takes over (played to the lead's leg only, through the participant's announce URL). */
export const announcementTwiml = (text: string, languageCode: string): string => doc(sayTag(text, languageCode));

/** The browser leg: joins MUTED (listening). Takeover unmutes it from the server. Leaving never ends the call. */
export function humanConferenceTwiml(i: { name: string; statusUrl: string }): string {
  return doc(`<Dial><Conference participantLabel="human" muted="true" beep="false" waitUrl="" maxParticipants="6" startConferenceOnEnter="false" endConferenceOnExit="false" statusCallback="${xmlEscape(i.statusUrl)}" statusCallbackMethod="POST" statusCallbackEvent="${CONF_EVENTS}">${xmlEscape(i.name)}</Conference></Dial>`);
}

/** What a held leg hears: nothing. (Twilio's default hold audio is music, which the AI would try to answer.) */
export const holdSilenceTwiml = (): string => doc(`<Pause length="3600"/>`);
export const refuseTwiml = (message: string): string => doc(`<Say>${xmlEscape(message)}</Say><Hangup/>`);
export const hangupTwiml = (): string => doc(`<Hangup/>`);

/** ElevenLabs' register-call answer is TwiML; pass it through only when it looks like a TwiML document of reasonable size. */
export function acceptRegisteredTwiml(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length < 20 || t.length > 16_000 || !/<Response[\s>]/.test(t) || !/<Connect[\s>]/.test(t)) return null;
  return t.startsWith("<?xml") ? t : `<?xml version="1.0" encoding="UTF-8"?>${t}`;
}
