import "server-only";
import { newId, updateStamp } from "@/lib/products/agentos/db";
import { maskPhone, normalizeCallingCodes, normalizeE164 } from "@/lib/products/agentos/calls/phone";
import { settingsCollection } from "@/lib/products/agentos/calls/store";
import type { CallSettings } from "@/lib/products/agentos/calls/types";
import { AibotsInputError, ForbiddenError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { recordAudit } from "@/lib/products/agentos/audit";

/**
 * The company's calling rules (one document). Defaults are the safe ones from the design: 09:00-21:00 in the company's time zone,
 * AI disclosure required, and NO country allowed until the company picks the calling codes it may call.
 */
export const DEFAULT_CALL_SETTINGS: CallSettings = {
  allowedCallingCodes: [],
  windowStart: "09:00",
  windowEnd: "21:00",
  duplicateWindowMinutes: 30,
  perUserHourlyCap: 20,
  perCompanyHourlyCap: 100,
  requireDisclosure: true,
  recordingNotice: true,
  callMode: "auto",
  testNumber: null,
};

export const CALL_SETTING_LIMITS = { duplicateMax: 24 * 60, capMax: 1000 } as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export async function getCallSettings(): Promise<CallSettings> {
  const doc = await (await settingsCollection()).findOne({ kind: "main" });
  const d = (doc ?? {}) as Partial<CallSettings>;
  return {
    allowedCallingCodes: Array.isArray(d.allowedCallingCodes) ? d.allowedCallingCodes : DEFAULT_CALL_SETTINGS.allowedCallingCodes,
    windowStart: typeof d.windowStart === "string" && HHMM.test(d.windowStart) ? d.windowStart : DEFAULT_CALL_SETTINGS.windowStart,
    windowEnd: typeof d.windowEnd === "string" && HHMM.test(d.windowEnd) ? d.windowEnd : DEFAULT_CALL_SETTINGS.windowEnd,
    duplicateWindowMinutes: typeof d.duplicateWindowMinutes === "number" ? d.duplicateWindowMinutes : DEFAULT_CALL_SETTINGS.duplicateWindowMinutes,
    perUserHourlyCap: typeof d.perUserHourlyCap === "number" ? d.perUserHourlyCap : DEFAULT_CALL_SETTINGS.perUserHourlyCap,
    perCompanyHourlyCap: typeof d.perCompanyHourlyCap === "number" ? d.perCompanyHourlyCap : DEFAULT_CALL_SETTINGS.perCompanyHourlyCap,
    requireDisclosure: typeof d.requireDisclosure === "boolean" ? d.requireDisclosure : DEFAULT_CALL_SETTINGS.requireDisclosure,
    recordingNotice: typeof d.recordingNotice === "boolean" ? d.recordingNotice : DEFAULT_CALL_SETTINGS.recordingNotice,
    testNumber: normalizeE164(d.testNumber),
    callMode: d.callMode === "conference" || d.callMode === "direct" || d.callMode === "auto" ? d.callMode : DEFAULT_CALL_SETTINGS.callMode,
  };
}

const int = (v: unknown, min: number, max: number, what: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AibotsInputError(`${what} must be a whole number from ${min} to ${max}.`);
  return n;
};

/** Validates and stores the calling rules. Needs VOICE_CALL_MANAGE. */
export async function saveCallSettings(viewer: AibotsViewer, raw: Record<string, unknown>): Promise<CallSettings> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  const windowStart = String(raw.windowStart ?? "");
  const windowEnd = String(raw.windowEnd ?? "");
  if (!HHMM.test(windowStart) || !HHMM.test(windowEnd)) throw new AibotsInputError("Enter the calling hours as HH:MM, for example 09:00.");
  if (minutesOf(windowStart) >= minutesOf(windowEnd)) throw new AibotsInputError("The calling window must end after it starts (overnight windows aren't supported).");
  const before = await getCallSettings();
  // Test number: undefined keeps the saved one; empty switches test mode off; anything else must be a full international number.
  let testNumber: string | null = before.testNumber;
  if (raw.testNumber !== undefined) {
    if (raw.testNumber === null || (typeof raw.testNumber === "string" && !raw.testNumber.trim())) testNumber = null;
    else {
      testNumber = normalizeE164(raw.testNumber);
      if (!testNumber) throw new AibotsInputError("Enter the test number with its country code, for example +91 98765 43210.");
    }
  }
  const next: CallSettings = {
    allowedCallingCodes: normalizeCallingCodes(raw.allowedCallingCodes),
    windowStart,
    windowEnd,
    duplicateWindowMinutes: int(raw.duplicateWindowMinutes, 0, CALL_SETTING_LIMITS.duplicateMax, "The duplicate-call window"),
    perUserHourlyCap: int(raw.perUserHourlyCap, 1, CALL_SETTING_LIMITS.capMax, "The per-person hourly limit"),
    perCompanyHourlyCap: int(raw.perCompanyHourlyCap, 1, CALL_SETTING_LIMITS.capMax, "The company hourly limit"),
    requireDisclosure: raw.requireDisclosure !== false,
    recordingNotice: raw.recordingNotice !== false,
    testNumber,
    // Callers that don't send the field (older forms) keep the saved mode.
    callMode: raw.callMode === undefined ? (await getCallSettings()).callMode : raw.callMode === "conference" || raw.callMode === "direct" || raw.callMode === "auto" ? raw.callMode : (() => { throw new AibotsInputError("Pick automatic, conference or direct calling."); })(),
  };
  await (await settingsCollection()).updateOne({ kind: "main" }, { $set: { ...next, ...updateStamp(viewer.userId) }, $setOnInsert: { _id: newId() } }, { upsert: true });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "settings", entity: "settings", entityId: "calls", entityLabel: "Call settings", summary: "Changed calling rules", metadata: { codes: next.allowedCallingCodes.join(" "), window: `${next.windowStart}-${next.windowEnd}` } });
  if (before.testNumber !== next.testNumber) {
    await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "settings", entity: "settings", entityId: "calls", entityLabel: "Call settings", summary: next.testNumber ? "Switched call test mode on" : "Switched call test mode off", metadata: { from: before.testNumber ? maskPhone(before.testNumber) : "off", to: next.testNumber ? maskPhone(next.testNumber) : "off" } });
  }
  return next;
}

// ---------------------------------------------------------------------------
// Public (website) calls and inbound display. Stored in the same settings document as the rules above; saved on their own so the
// calling-rules form never overwrites them and this one never overwrites the rules.
// ---------------------------------------------------------------------------

export interface PublicCallSettings {
  /** Emergency stop: no website visitor can start a call while this is on, whatever each agent says. */
  publicKillSwitch: boolean;
  /** Most minutes of website calls per day (UTC) across the whole company. */
  publicDailyMinutes: number;
  /** Website calls one address may start per hour. */
  publicPerIpHourly: number;
  /** Website calls one agent may start per hour, from all visitors. */
  publicPerAgentHourly: number;
  /** Longest website call in seconds (an agent's own shorter limit wins). */
  publicMaxSessionSecs: number;
  /** Show callers' numbers masked ("+91••••••3210") in call lists. Staff with call management can still open the full number. */
  maskInboundNumbers: boolean;
}

export const DEFAULT_PUBLIC_CALL_SETTINGS: PublicCallSettings = {
  publicKillSwitch: false,
  publicDailyMinutes: 30,
  publicPerIpHourly: 3,
  publicPerAgentHourly: 30,
  publicMaxSessionSecs: 300,
  maskInboundNumbers: true,
};

export const PUBLIC_SETTING_LIMITS = { dailyMinutesMax: 10_000, hourlyMax: 1000, sessionMin: 30, sessionMax: 3600 } as const;

const posInt = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback);

export async function getPublicCallSettings(): Promise<PublicCallSettings> {
  const d = ((await (await settingsCollection()).findOne({ kind: "main" })) ?? {}) as Partial<PublicCallSettings>;
  const L = PUBLIC_SETTING_LIMITS;
  return {
    publicKillSwitch: d.publicKillSwitch === true,
    publicDailyMinutes: posInt(d.publicDailyMinutes, DEFAULT_PUBLIC_CALL_SETTINGS.publicDailyMinutes, 0, L.dailyMinutesMax),
    publicPerIpHourly: posInt(d.publicPerIpHourly, DEFAULT_PUBLIC_CALL_SETTINGS.publicPerIpHourly, 1, L.hourlyMax),
    publicPerAgentHourly: posInt(d.publicPerAgentHourly, DEFAULT_PUBLIC_CALL_SETTINGS.publicPerAgentHourly, 1, L.hourlyMax),
    publicMaxSessionSecs: posInt(d.publicMaxSessionSecs, DEFAULT_PUBLIC_CALL_SETTINGS.publicMaxSessionSecs, L.sessionMin, L.sessionMax),
    maskInboundNumbers: d.maskInboundNumbers !== false,
  };
}

/** Validates and stores the website-call limits. A field that isn't sent keeps its stored value. Needs VOICE_CALL_MANAGE. */
export async function savePublicCallSettings(viewer: AibotsViewer, raw: Record<string, unknown>): Promise<PublicCallSettings> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  const cur = await getPublicCallSettings();
  const L = PUBLIC_SETTING_LIMITS;
  const pick = <T,>(key: keyof PublicCallSettings, parse: (v: unknown) => T, current: T): T => (raw[key] === undefined ? current : parse(raw[key]));
  const next: PublicCallSettings = {
    publicKillSwitch: pick("publicKillSwitch", (v) => v === true, cur.publicKillSwitch),
    publicDailyMinutes: pick("publicDailyMinutes", (v) => int(v, 0, L.dailyMinutesMax, "The daily website-call minutes"), cur.publicDailyMinutes),
    publicPerIpHourly: pick("publicPerIpHourly", (v) => int(v, 1, L.hourlyMax, "The hourly limit per visitor address"), cur.publicPerIpHourly),
    publicPerAgentHourly: pick("publicPerAgentHourly", (v) => int(v, 1, L.hourlyMax, "The hourly limit per agent"), cur.publicPerAgentHourly),
    publicMaxSessionSecs: pick("publicMaxSessionSecs", (v) => int(v, L.sessionMin, L.sessionMax, "The longest website call (seconds)"), cur.publicMaxSessionSecs),
    maskInboundNumbers: pick("maskInboundNumbers", (v) => v !== false, cur.maskInboundNumbers),
  };
  await (await settingsCollection()).updateOne({ kind: "main" }, { $set: { ...next, ...updateStamp(viewer.userId) }, $setOnInsert: { _id: newId() } }, { upsert: true });
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "settings", entity: "settings", entityId: "calls-public", entityLabel: "Website call limits", summary: next.publicKillSwitch ? "Switched website calls off" : "Changed website call limits", metadata: { dailyMinutes: String(next.publicDailyMinutes), killSwitch: String(next.publicKillSwitch) } });
  return next;
}
