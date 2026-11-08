import "server-only";
import { getBot, getUsableBot, type BotDoc } from "@/lib/products/agentos/bots";
import { NotFoundError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { inAllowedCodes, normalizeE164 } from "@/lib/products/agentos/calls/phone";
import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";
import { getCallSettings, minutesOf } from "@/lib/products/agentos/calls/settings";
import { callsCollection, numbersCollection, phoneFingerprint } from "@/lib/products/agentos/calls/store";
import { checkProviders, isOnDoNotCallList } from "@/lib/products/agentos/calls/dnc";
import { ensureIntegrations } from "@/lib/products/agentos/calls/integrations";
import type { Filter } from "mongodb";
import type { CallDoc, CallFailure, CallStatus, ExistingCallInfo, CallSettings, CallTarget, ComplianceSnapshot, PhoneNumberDoc } from "@/lib/products/agentos/calls/types";

/**
 * Every guard that stands between a person's click (or a due schedule) and a real phone ringing. Server-side only; the UI can show
 * the same messages but can never skip a check. `evaluateGuards` is pure (facts in, first failure out); `checkCallAllowed` gathers the
 * facts from the database and the other products.
 */

const fail = (code: CallFailure["code"], message: string): CallFailure => ({ code, message });
const HOUR = 60 * 60 * 1000;

/** The wall-clock minutes since midnight of `at` in `timeZone`. */
export function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

/** Start is inclusive, end is exclusive: 09:00-21:00 allows 09:00 and refuses 21:00. */
export function isWithinWindow(at: Date, timeZone: string, start: string, end: string): boolean {
  const now = localMinutes(at, timeZone);
  return now >= minutesOf(start) && now < minutesOf(end);
}

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface GuardFacts {
  rawPhone: unknown;
  settings: CallSettings;
  timeZone: string | null;
  at: Date;
  now: Date;
  /** "now" counts hourly caps; "later" (a schedule being created) leaves them to dial time. */
  when: "now" | "later";
  /** The window may be skipped (a manager gave a reason, now or when the call was created). */
  windowOverride: boolean;
  /** A non-manager sent an override reason. */
  overrideRefused: boolean;
  agentProblem: string | null;
  purposeSupported: boolean;
  onList: boolean;
  provider: { blocked: string | null; error: string | null };
  duplicates: number;
  userCalls: number;
  companyCalls: number;
  planBlock: string | null;
  disclosurePresent: boolean;
  connected: boolean;
  hasNumber: boolean;
}

export function evaluateGuards(f: GuardFacts): { failure: CallFailure | null; phone: string | null } {
  const phone = normalizeE164(f.rawPhone);
  if (!phone) return { phone: null, failure: fail("invalid_phone", "That isn't a valid phone number. Enter it with the country code, for example +91 98765 43210.") };
  if (f.overrideRefused) return { phone, failure: fail("override_not_allowed", "Only a calls manager can call outside the calling hours.") };
  if (!f.settings.allowedCallingCodes.length) return { phone, failure: fail("countries_not_configured", "Calling isn't set up yet. A calls manager must choose which countries you may call in the call settings.") };
  if (!inAllowedCodes(phone, f.settings.allowedCallingCodes)) return { phone, failure: fail("country_not_allowed", `Calls to this country aren't allowed. Your workspace may call numbers starting with ${f.settings.allowedCallingCodes.join(", ")}.`) };
  if (f.agentProblem) return { phone, failure: fail("agent_unusable", f.agentProblem) };
  if (!f.purposeSupported) return { phone, failure: fail("purpose_unsupported", "This agent isn't set up for that kind of call. Add the purpose to the agent first.") };
  if (f.onList) return { phone, failure: fail("do_not_call", "This number is on your do-not-call list.") };
  if (f.provider.blocked) return { phone, failure: fail("do_not_contact", "This person has asked not to be contacted.") };
  if (f.provider.error) return { phone, failure: fail("dnc_check_failed", "Couldn't confirm that this person may be called, so the call wasn't placed. Try again in a moment.") };
  if (f.at.getTime() < f.now.getTime() - 60_000 && f.when === "later") return { phone, failure: fail("schedule_in_past", "Pick a time in the future.") };
  if (!f.timeZone) return { phone, failure: fail("no_timezone", "Your workspace's time zone isn't set, so calling hours can't be checked. Set it in the workspace settings.") };
  if (!f.windowOverride && !isWithinWindow(f.at, f.timeZone, f.settings.windowStart, f.settings.windowEnd)) {
    return { phone, failure: fail("outside_window", `Calls are only allowed between ${f.settings.windowStart} and ${f.settings.windowEnd} (${f.timeZone}). Schedule it inside those hours${f.when === "now" ? " or ask a calls manager to override" : ""}.`) };
  }
  if (f.duplicates > 0) return { phone, failure: fail("duplicate", `This number was already called or is already scheduled within the last ${f.settings.duplicateWindowMinutes} minutes.`) };
  if (f.when === "now") {
    if (f.userCalls >= f.settings.perUserHourlyCap) return { phone, failure: fail("user_cap", `You've reached your limit of ${f.settings.perUserHourlyCap} calls per hour. Try again later.`) };
    if (f.companyCalls >= f.settings.perCompanyHourlyCap) return { phone, failure: fail("company_cap", `Your workspace has reached its limit of ${f.settings.perCompanyHourlyCap} calls per hour. Try again later.`) };
  }
  if (f.planBlock) return { phone, failure: fail("plan_blocked", f.planBlock) };
  if (f.settings.requireDisclosure && !f.disclosurePresent) return { phone, failure: fail("disclosure_missing", "This agent has no AI disclosure line. Add one in the agent's settings, or switch the requirement off in the call settings.") };
  if (!f.connected) return { phone, failure: fail("not_connected", "ElevenLabs isn't connected for this workspace. Add your ElevenLabs key in Settings → Integrations.") };
  if (!f.hasNumber) return { phone, failure: fail("no_number", "No phone number is set up for outbound calls. A calls manager must import one first.") };
  return { phone, failure: null };
}

/** Why this agent can't take a call right now (null = fine). Pure. */
export function agentProblem(bot: Pick<BotDoc, "kind" | "voice" | "status" | "deletedAt"> | null): string | null {
  if (!bot || bot.deletedAt || bot.kind !== "voice" || !bot.voice) return "That voice agent isn't available.";
  if (bot.status !== "active") return "This agent is switched off.";
  if (!bot.voice.elevenAgentId) return bot.voice.syncError ? `This agent isn't ready: ${bot.voice.syncError}` : "This agent hasn't been set up on ElevenLabs yet. An editor needs to save it or retry the sync.";
  return null;
}

export interface CheckInput {
  /** Set when a person is asking; omitted at dial time (the agent's access list was checked when the call was created). */
  viewer?: AibotsViewer;
  agentId: string;
  purpose: string;
  rawPhone: unknown;
  target: CallTarget | null;
  /** When the call would ring. */
  at: Date;
  now?: Date;
  /** The call being re-checked at dial time: it never counts against itself. */
  excludeCallId?: string | null;
  initiatorId: string;
  windowOverride: boolean;
  overrideRefused?: boolean;
  fromNumberId?: string | null;
  deps?: GuardDeps;
}

export interface GuardDeps {
  gate?: () => Promise<string | null>;
  connected?: () => Promise<boolean>;
  timeZone?: () => Promise<string | null>;
}

export type CheckResult =
  | { ok: true; phone: string; testMode: boolean; requestedPhone: string | null; bot: BotDoc; number: PhoneNumberDoc; settings: CallSettings; timeZone: string; compliance: ComplianceSnapshot }
  | { ok: false; failure: CallFailure };

async function defaultConnected(): Promise<boolean> {
  const { workspaceAgentClient } = await import("@/lib/products/agentos/voice/connection");
  return Boolean(await workspaceAgentClient());
}
async function defaultGate(): Promise<string | null> {
  const { voiceBlockReason } = await import("@/lib/platform/billing/enforce");
  return voiceBlockReason();
}

export async function companyTimeZone(): Promise<string | null> {
  const tz = (await getCompany(await currentCompanyId()))?.timezone;
  return validTimeZone(tz) ? tz : null;
}

/** Picks the number the call goes out from: the one asked for, else the only active outbound number. */
export async function pickOutboundNumber(fromNumberId?: string | null): Promise<PhoneNumberDoc | null> {
  const col = await numbersCollection();
  if (fromNumberId) return col.findOne({ _id: fromNumberId, supportsOutbound: true, status: "active" });
  const all = await col.find({ supportsOutbound: true, status: "active" }).sort({ createdAt: 1 }).limit(2).toArray();
  return all.length === 1 ? all[0] : all[0] ?? null;
}

/** What the dialog shows about the call that is already there (no phone number). */
async function existingCallInfo(found: Promise<CallDoc | null>, viewer?: AibotsViewer): Promise<ExistingCallInfo | null> {
  const c = await found;
  if (!c) return null;
  const mine = Boolean(viewer && c.initiatedBy?.userId === viewer.userId);
  const oversee = Boolean(viewer && (can(viewer, "VOICE_CALL_TAKEOVER") || can(viewer, "VOICE_CALL_MANAGE")));
  const live = c.status === "dialing" || c.status === "in_progress";
  return {
    id: c._id, agentName: (await getBot(c.agentId))?.name ?? "Deleted agent", purpose: c.purpose, status: c.status,
    at: (c.status === "scheduled" ? c.scheduledFor ?? c.createdAt : c.dialedAt ?? c.createdAt).toISOString(), startedBy: c.initiatedBy?.email ?? null,
    mine, canEnd: live && (mine || oversee), canCancel: c.status === "scheduled" && (mine || Boolean(viewer && can(viewer, "VOICE_CALL_MANAGE"))), canLive: live && (mine || oversee), testMode: c.testMode === true,
  };
}

/** Runs every guard. Never places a call and writes nothing. */
export async function checkCallAllowed(i: CheckInput): Promise<CheckResult> {
  const now = i.now ?? new Date();
  const settings = await getCallSettings();
  let bot: BotDoc | null = null;
  try {
    bot = i.viewer ? await getUsableBot(i.viewer, i.agentId) : await getBot(i.agentId);
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  // TEST MODE: with a test number set, the number that would be dialed is the test number, and every guard below judges THAT number (valid, allowed
  // country, hours, caps, duplicates, do-not-call list). Nobody real is called, so the person's own do-not-contact flag (their record) is not asked.
  const testMode = Boolean(settings.testNumber);
  const requestedPhone = normalizeE164(i.rawPhone);
  const dialedRaw: unknown = settings.testNumber ?? i.rawPhone;
  const phone = normalizeE164(dialedRaw);
  const timeZone = await (i.deps?.timeZone ?? companyTimeZone)();
  const when: "now" | "later" = i.at.getTime() - now.getTime() > 60_000 ? "later" : "now";
  const calls = await callsCollection();
  const exclude = i.excludeCallId ? { _id: { $ne: i.excludeCallId } } : {};
  // A call a person ended themselves (cancelledBy) no longer keeps the number blocked: they chose to be able to call again.
  const live = { status: { $nin: ["failed", "cancelled"] as CallStatus[] }, cancelledBy: null, ...exclude };

  let onList = false;
  let provider: GuardFacts["provider"] = { blocked: null, error: null };
  let duplicates = 0;
  let duplicatesFilter: Filter<CallDoc> = {};
  if (phone) {
    onList = await isOnDoNotCallList(phone);
    // The products' do-not-contact hooks must be loaded before the question is asked: an empty registry would read as "nobody objects".
    try {
      await ensureIntegrations();
      provider = await checkProviders({ phone, target: testMode ? null : i.target });
    } catch {
      provider = { blocked: null, error: "integrations" };
    }
    const w = settings.duplicateWindowMinutes * 60_000;
    if (w > 0) {
      const fp = await phoneFingerprint(phone);
      const range = { $gte: new Date(i.at.getTime() - w), $lte: new Date(i.at.getTime() + w) };
      // A number a live call was moved to counts like a call to it.
      // Inside the window, or still going (a call can outlast the window; with the window off, an active call still blocks).
      duplicatesFilter = { $or: [{ phoneHash: fp, direction: "outbound", anchorAt: range }, { "transfer.phoneHash": fp, "transfer.at": range }, { phoneHash: fp, direction: "outbound", status: { $in: ["dialing", "in_progress"] } }], ...live };
    } else {
      duplicatesFilter = { phoneHash: await phoneFingerprint(phone), direction: "outbound", ...live, status: { $in: ["dialing", "in_progress"] } };
    }
    duplicates = await calls.countDocuments(duplicatesFilter);
  }
  const since = new Date(now.getTime() - HOUR);
  const hourly = { direction: "outbound" as const, dialedAt: { $gte: since }, ...exclude };
  const [userCalls, companyCalls] = when === "now" ? await Promise.all([calls.countDocuments({ ...hourly, "initiatedBy.userId": i.initiatorId }), calls.countDocuments(hourly)]) : [0, 0];
  const planBlock = await (i.deps?.gate ?? defaultGate)();
  const connected = await (i.deps?.connected ?? defaultConnected)();
  const number = await pickOutboundNumber(i.fromNumberId);
  const purposeKnown = PURPOSE_BY_KEY.has(i.purpose);
  const purposes = bot?.voice?.purposes ?? [];

  const facts: GuardFacts = {
    rawPhone: dialedRaw, settings, timeZone, at: i.at, now, when,
    windowOverride: i.windowOverride, overrideRefused: i.overrideRefused === true,
    agentProblem: agentProblem(bot),
    purposeSupported: purposeKnown && (purposes.length === 0 ? i.purpose === "custom" : purposes.includes(i.purpose)),
    onList, provider, duplicates, userCalls, companyCalls, planBlock,
    disclosurePresent: Boolean(bot?.voice?.disclosureLine?.trim()),
    connected, hasNumber: Boolean(number),
  };
  const { failure } = evaluateGuards(facts);
  if (failure) {
    if (failure.code === "duplicate") {
      const existing = await existingCallInfo(calls.find(duplicatesFilter).sort({ createdAt: -1 }).limit(1).next(), i.viewer);
      if (existing) failure.existing = existing;
    }
    return { ok: false, failure };
  }
  const compliance: ComplianceSnapshot = {
    checkedAt: now,
    callingWindow: { start: settings.windowStart, end: settings.windowEnd, timeZone: timeZone!, overridden: i.windowOverride && !isWithinWindow(i.at, timeZone!, settings.windowStart, settings.windowEnd), overrideReason: null },
    disclosureRequired: settings.requireDisclosure,
    disclosurePresent: facts.disclosurePresent,
    recordingNotice: settings.recordingNotice,
    allowedCallingCode: settings.allowedCallingCodes.find((c) => phone!.startsWith(c)) ?? null,
  };
  return { ok: true, phone: phone!, testMode, requestedPhone, bot: bot!, number: number!, settings, timeZone: timeZone!, compliance };
}
