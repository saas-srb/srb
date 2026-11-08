import "server-only";
import { newId } from "@/lib/products/agentos/db";
import { normalizeE164, last4Of } from "@/lib/products/agentos/calls/phone";
import { dncCollection, isDuplicateKey, phoneFingerprint } from "@/lib/products/agentos/calls/store";
import type { CallTarget } from "@/lib/products/agentos/calls/types";
import { AibotsInputError, ForbiddenError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";
import { recordAudit } from "@/lib/products/agentos/audit";

/**
 * The company's do-not-call list (numbers are stored as a fingerprint plus the last four digits, never in full) and the provider
 * interface other products use to say "this person asked not to be contacted" (for example a lead's doNotContact flag).
 */

export interface DoNotContactQuery {
  phone: string;
  target: CallTarget | null;
}
/** Returns true when the person must not be called. Throwing means "could not check", and the call is refused. */
export type DoNotContactProvider = (q: DoNotContactQuery) => Promise<boolean>;

const g = globalThis as unknown as { __agentosDncProviders?: Map<string, DoNotContactProvider> };
const providers = (g.__agentosDncProviders ??= new Map());

/** A product registers once (module load); the same name replaces its earlier provider. */
export function registerDoNotContactProvider(name: string, provider: DoNotContactProvider): void {
  providers.set(name, provider);
}
export function clearDoNotContactProviders(): void {
  providers.clear();
}

/**
 * Asks every registered product. `blocked` is the first that says yes; `error` is set when any provider could not answer, AND when no
 * provider is registered at all (an empty registry means the products' hooks never loaded, which must never read as "nobody objects").
 */
export async function checkProviders(q: DoNotContactQuery): Promise<{ blocked: string | null; error: string | null }> {
  if (providers.size === 0) {
    console.error("[agentos calls] no do-not-contact provider is registered; refusing to treat the number as callable");
    return { blocked: null, error: "none-registered" };
  }
  let error: string | null = null;
  for (const [name, fn] of providers) {
    try {
      if (await fn(q)) return { blocked: name, error: null };
    } catch (e) {
      error = name;
      console.error(`[agentos calls] do-not-contact provider ${name} failed`, e instanceof Error ? e.message : e);
    }
  }
  return { blocked: null, error };
}

export async function isOnDoNotCallList(e164: string): Promise<boolean> {
  return Boolean(await (await dncCollection()).findOne({ phoneHash: await phoneFingerprint(e164) }, { projection: { _id: 1 } }));
}

export interface DncEntryView {
  id: string;
  last4: string;
  reason: string;
  addedBy: string;
  addedAt: string;
}

export async function addDoNotCall(viewer: AibotsViewer, phone: string, reason: string): Promise<void> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  const e164 = normalizeE164(phone);
  if (!e164) throw new AibotsInputError("Enter the number with its country code, for example +91 98765 43210.");
  const why = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (why.length < 3) throw new AibotsInputError("Say why this number is on the list.");
  try {
    await (await dncCollection()).insertOne({ _id: newId(), phoneHash: await phoneFingerprint(e164), last4: last4Of(e164), reason: why, addedBy: viewer.userId, addedAt: new Date() });
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    return; // already listed
  }
  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "create", entity: "dnc", entityId: "list", entityLabel: `…${last4Of(e164)}`, summary: "Added a number to the do-not-call list" });
}

export async function removeDoNotCall(viewer: AibotsViewer, entryId: string): Promise<void> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  const r = await (await dncCollection()).findOneAndDelete({ _id: String(entryId).slice(0, 64) });
  if (r) await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "delete", entity: "dnc", entityId: "list", entityLabel: `…${r.last4}`, summary: "Removed a number from the do-not-call list" });
}

export async function listDoNotCall(viewer: AibotsViewer): Promise<DncEntryView[]> {
  if (!can(viewer, "VOICE_CALL_MANAGE")) throw new ForbiddenError("VOICE_CALL_MANAGE");
  const rows = await (await dncCollection()).find({}).sort({ addedAt: -1 }).limit(500).toArray();
  return rows.map((r) => ({ id: r._id, last4: r.last4, reason: r.reason, addedBy: r.addedBy, addedAt: r.addedAt.toISOString() }));
}
