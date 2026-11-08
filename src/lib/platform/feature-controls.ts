import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";

/**
 * What SelfRun switches on or off for every company at once (`platform_settings`, `_id: "feature_controls"`), set in Platform Console →
 * Notification center and Documents & PDFs. Everything is on until it is switched off here.
 *   notificationCenter / pdfLibrary — show those two company pages (the notifications and documents themselves keep working)
 *   events[key][channel] = false    — that notification event is not delivered on that channel for ANY company (security and billing
 *                                     emails cannot be switched off)
 *   pdfs[type] = false              — that kind of PDF is not produced for ANY company (its download answers "turned off")
 */

export type ControlChannel = "inApp" | "push" | "email";

export interface FeatureControls {
  notificationCenter: boolean;
  pdfLibrary: boolean;
  /** Companies may change the wording of the prompts that allow it (Settings → AI prompts). Off: every company uses the standard text. */
  companyPrompts: boolean;
  events: Record<string, Partial<Record<ControlChannel, false>>>;
  pdfs: Record<string, false>;
  /** prompts[key] = false: companies may not change that prompt (any change they saved stops applying; it comes back if this is switched on again). */
  prompts: Record<string, false>;
}

const DOC_ID = "feature_controls";
const CACHE_MS = 10_000;
const EMPTY: FeatureControls = { notificationCenter: true, pdfLibrary: true, companyPrompts: true, events: {}, pdfs: {}, prompts: {} };

interface Doc {
  _id: typeof DOC_ID;
  notificationCenter?: boolean;
  pdfLibrary?: boolean;
  companyPrompts?: boolean;
  /** Keys of the prompts companies may not change (a list, because prompt keys contain dots). */
  promptsBlocked?: string[];
  events?: FeatureControls["events"];
  pdfs?: FeatureControls["pdfs"];
  updatedAt?: Date;
  updatedBy?: string | null;
}

const g = globalThis as unknown as { __featureControls?: { at: number; value: FeatureControls } };

async function col() {
  return (await getPlatformDb()).collection<Doc>("platform_settings");
}
export const forgetFeatureControls = () => {
  g.__featureControls = undefined;
};

/** The controls in force. A read problem means "everything on", so a database blip never blocks documents or notifications. */
export async function getFeatureControls(): Promise<FeatureControls> {
  if (g.__featureControls && Date.now() - g.__featureControls.at < CACHE_MS) return g.__featureControls.value;
  let value = EMPTY;
  try {
    const doc = await (await col()).findOne({ _id: DOC_ID });
    if (doc) value = { notificationCenter: doc.notificationCenter !== false, pdfLibrary: doc.pdfLibrary !== false, companyPrompts: doc.companyPrompts !== false, events: doc.events ?? {}, pdfs: doc.pdfs ?? {}, prompts: Object.fromEntries((doc.promptsBlocked ?? []).map((k) => [k, false as const])) };
  } catch (err) {
    console.error("[feature-controls] could not read; everything stays on", err);
    return g.__featureControls?.value ?? EMPTY;
  }
  g.__featureControls = { at: Date.now(), value };
  return value;
}

type Actor = { id: string; email: string };
export type ControlResult = { ok: true } | { ok: false; error: string };

async function write(patch: Record<string, unknown>, unset: Record<string, ""> | null, actor: Actor, action: string, target: string, details: Record<string, unknown>): Promise<ControlResult> {
  await (await col()).updateOne({ _id: DOC_ID }, { $set: { ...patch, updatedAt: new Date(), updatedBy: actor.email }, ...(unset ? { $unset: unset } : {}) }, { upsert: true });
  forgetFeatureControls();
  await recordPlatformAudit({ actorId: actor.id, action, target: { type: "feature_control", id: target }, details });
  return { ok: true };
}

export async function setSectionEnabled(section: "notificationCenter" | "pdfLibrary" | "companyPrompts", enabled: boolean, actor: Actor): Promise<ControlResult> {
  return write({ [section]: !!enabled }, null, actor, enabled ? "feature.enable" : "feature.disable", section, { section });
}

/** Turns one channel of one notification event on or off for every company. `known` is the check that the event exists and may be switched off. */
export async function setEventChannel(key: string, channel: ControlChannel, enabled: boolean, actor: Actor, known: { exists: boolean; locked: boolean; channels: ControlChannel[] }): Promise<ControlResult> {
  if (!known.exists) return { ok: false, error: "That notification doesn't exist." };
  if (!known.channels.includes(channel)) return { ok: false, error: "That channel isn't used for this notification." };
  if (!enabled && known.locked) return { ok: false, error: "This is a security or billing email and can't be turned off." };
  const path = `events.${key}.${channel}`;
  return enabled ? write({}, { [path]: "" }, actor, "feature.event.enable", key, { channel }) : write({ [path]: false }, null, actor, "feature.event.disable", key, { channel });
}

export async function setPdfEnabled(type: string, enabled: boolean, actor: Actor, exists: boolean): Promise<ControlResult> {
  if (!exists) return { ok: false, error: "That document doesn't exist." };
  const path = `pdfs.${type}`;
  return enabled ? write({}, { [path]: "" }, actor, "feature.pdf.enable", type, {}) : write({ [path]: false }, null, actor, "feature.pdf.disable", type, {});
}

/** Lets companies change (or not) the wording of one prompt. `exists` is the check that the prompt exists and is one companies may ever change. */
export async function setCompanyPromptAllowed(key: string, allowed: boolean, actor: Actor, exists: boolean): Promise<ControlResult> {
  if (!exists) return { ok: false, error: "Companies can't change that prompt." };
  if (allowed) {
    await (await col()).updateOne({ _id: DOC_ID }, { $pull: { promptsBlocked: key }, $set: { updatedAt: new Date(), updatedBy: actor.email } }, { upsert: true });
  } else {
    await (await col()).updateOne({ _id: DOC_ID }, { $addToSet: { promptsBlocked: key }, $set: { updatedAt: new Date(), updatedBy: actor.email } }, { upsert: true });
  }
  forgetFeatureControls();
  await recordPlatformAudit({ actorId: actor.id, action: allowed ? "feature.prompt.allow" : "feature.prompt.block", target: { type: "feature_control", id: key }, details: {} });
  return { ok: true };
}

/** Whether the platform has switched this event's channel off. */
export const eventChannelOff = (c: FeatureControls, key: string, channel: ControlChannel): boolean => c.events[key]?.[channel] === false;
export const pdfOff = (c: FeatureControls, type: string): boolean => c.pdfs[type] === false;
/** Whether companies may change this prompt right now. */
export const companyMayEditPrompt = (c: FeatureControls, key: string): boolean => c.companyPrompts && c.prompts[key] !== false;
