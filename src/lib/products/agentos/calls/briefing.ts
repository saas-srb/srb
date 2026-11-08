import "server-only";
import { createHash } from "node:crypto";
import { getPrompt } from "@/lib/prompts/store";
import { recordAudit } from "@/lib/products/agentos/audit";
import { authorizeTarget, ensureIntegrations } from "@/lib/products/agentos/calls/integrations";
import { BRIEFING_BUDGET, cleanBriefingText, fitSections, type BriefingKind, type BriefingSection, type Condenser, type SectionOutcome } from "@/lib/products/agentos/calls/briefing-core";
import type { CallDoc, CallTarget } from "@/lib/products/agentos/calls/types";
import { viewerForUserId, type AibotsViewer } from "@/lib/products/agentos/viewer";

export { BRIEFING_BUDGET } from "@/lib/products/agentos/calls/briefing-core";
export type { BriefingKind, BriefingSection, BriefingItem, Condenser } from "@/lib/products/agentos/calls/briefing-core";

/**
 * THE CALL BRIEFING
 * -----------------
 * Whoever the agent calls, it should know the person's history like a colleague would: what they wrote when they enquired, what was said in the
 * chats, emails and WhatsApp messages, what was discussed on earlier calls. Each product registers a PROVIDER that returns structured sections for
 * a target record, limited to what the caller's own role may see. The engine builds the briefing fresh each time a call is dialed (never reused
 * from when it was scheduled), fits it into the size budget (older history is condensed with the company's own OpenAI connection, or left out
 * with an explicit marker; the newest stays word for word) and passes it to the agent as the `lead_briefing` dynamic variable.
 *
 * Nothing but an audit summary is stored on the call: which sections, how many records, a hash and when it was built. The text itself lives only
 * in the request to the voice provider (and, for a phone call joined through Twilio, briefly on the conference row until the AI leg joins).
 */

export type BriefingProvider = (viewer: AibotsViewer, target: CallTarget) => Promise<BriefingSection[]>;

const g = globalThis as unknown as { __agentosBriefingProviders?: Map<string, BriefingProvider> };
const providers = (g.__agentosBriefingProviders ??= new Map());
export function registerBriefingProvider(product: string, fn: BriefingProvider): void {
  providers.set(product, fn);
}
export function clearBriefingProviders(): void {
  providers.clear();
}

export interface BriefingDeps {
  /** Test hook / override: how the caller is re-read at dial time (default: the account, read fresh). */
  viewerFor?: (userId: string) => Promise<AibotsViewer | null>;
  /** `null` = no condensation (as if OpenAI were not connected). Default: the company's own OpenAI connection when configured. */
  condense?: Condenser | null;
  budget?: number;
}

export const BRIEFING_NOTICE = "The briefing is sent to the voice provider (ElevenLabs) so the agent can use it on this call. It is not stored on the call record; only which parts were included is kept.";

/** The company's own OpenAI connection (or SelfRun's, when the platform allows it). Null when none is connected: older history is then left out with a marker. */
async function openAICondenser(): Promise<Condenser | null> {
  try {
    const { getOpenAI, isOpenAIConfigured } = await import("@/lib/openai");
    if (!(await isOpenAIConfigured())) return null;
    const deadline = Date.now() + 45_000; // the whole briefing, so a very long history cannot hold up the dial
    return async ({ title, text, previous, targetChars }) => {
      if (Date.now() > deadline) throw new Error("condensation took too long");
      const openai = await getOpenAI({ timeoutMs: 20_000, maxRetries: 1 });
      const input = `${previous ? `Summary so far of the even older part (continue it, merge, keep every fact):\n${previous}\n\n` : ""}Section: ${title}\nText to condense (oldest first):\n${text}\n\nWrite at most ${targetChars} characters.`;
      const res = await openai.responses.create({ model: "gpt-4.1-mini", instructions: await getPrompt("agentos.briefing.condense"), input, max_output_tokens: Math.min(4000, Math.ceil(targetChars / 2.5) + 200) });
      return res.output_text ?? "";
    };
  } catch {
    return null;
  }
}

async function condenserOf(deps: BriefingDeps): Promise<Condenser | null> {
  return deps.condense === undefined ? openAICondenser() : deps.condense;
}

export interface BriefingSectionInfo {
  key: string;
  title: string;
  kind: BriefingKind;
  internal: boolean;
  sourceCount: number;
  selected: boolean;
  defaultOn: boolean;
  shown: number;
  condensed: number;
  omitted: number;
  /** What the agent will read for this section (empty when it is not selected). Plain text, safe to render as text. */
  text: string;
}

export interface BuiltBriefing {
  /** False when no provider exists for this target or nothing could be read. */
  available: boolean;
  sections: BriefingSectionInfo[];
  /** The final text for the `lead_briefing` variable ("" when there is nothing). */
  text: string;
  warnings: string[];
  chars: number;
  budget: number;
  hash: string | null;
  builtAt: string;
}

const KEY = /^[\w.:-]{1,60}$/;
/** The section keys a person ticked. Anything that is not a plain key is dropped; null means "the defaults". */
export function cleanSelection(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((k): k is string => typeof k === "string" && KEY.test(k)))].slice(0, 40);
}

function dedupe(sections: BriefingSection[]): BriefingSection[] {
  const seen = new Set<string>();
  return sections.filter((s) => s && typeof s.key === "string" && s.key && !seen.has(s.key) && seen.add(s.key));
}

/** The briefing for a target, as `viewer` is allowed to see it. Never throws: a failure is returned as an unavailable briefing with a warning. */
export async function buildBriefing(viewer: AibotsViewer, target: CallTarget | null, opts: { selection?: string[] | null; deps?: BriefingDeps; now?: () => Date } = {}): Promise<BuiltBriefing> {
  const deps = opts.deps ?? {};
  const builtAt = (opts.now ?? (() => new Date()))().toISOString();
  const budget = Math.min(deps.budget ?? BRIEFING_BUDGET, BRIEFING_BUDGET * 2);
  const none = (warnings: string[] = []): BuiltBriefing => ({ available: false, sections: [], text: "", warnings, chars: 0, budget, hash: null, builtAt });
  if (!target) return none();
  try {
    await ensureIntegrations();
  } catch {
    return none(["The product's data could not be loaded, so no briefing was built."]);
  }
  const provider = providers.get(target.product);
  if (!provider) return none();
  // The person must be allowed to act on this record (the same default-deny rule as placing the call); the provider then filters further by role.
  if (!(await authorizeTarget(viewer, target))) return none(["You don't have access to this record, so no briefing was built."]);
  let all: BriefingSection[];
  try {
    all = dedupe(await provider(viewer, target));
  } catch (e) {
    console.error(`[agentos briefing] provider failed (${target.product})`, e instanceof Error ? e.message.slice(0, 200) : "error");
    return none(["The history could not be read, so the agent will not have a briefing."]);
  }
  const sel = cleanSelection(opts.selection);
  const isSelected = (s: BriefingSection) => (sel ? sel.includes(s.key) : s.defaultOn !== false);
  const chosen = all.filter(isSelected);
  const fit = await fitSections(chosen, { budget, condense: chosen.some((s) => s.sourceCount > 0) ? await condenserOf(deps) : null });
  const byKey = new Map<string, SectionOutcome>(fit.outcomes.map((o) => [o.key, o]));
  const sections: BriefingSectionInfo[] = [];
  for (const s of all) {
    const o = byKey.get(s.key);
    const selected = isSelected(s);
    // What the agent reads for a ticked section is exactly its block in the final text; an unticked one is shown (shortened) so the person can judge it.
    const text = selected ? (o?.block ?? "") : (await fitSections([s], { budget: 3000, condense: null })).outcomes[0]?.block ?? "";
    sections.push({
      key: s.key, title: cleanBriefingText(s.title, 80).text || s.key, kind: s.kind, internal: s.internal === true, sourceCount: s.sourceCount, selected, defaultOn: s.defaultOn !== false,
      shown: o?.shown ?? 0, condensed: o?.condensed ?? 0, omitted: o?.omitted ?? 0,
      text,
    });
  }
  return { available: all.length > 0, sections, text: fit.text, warnings: fit.warnings, chars: fit.chars, budget, hash: fit.text ? createHash("sha256").update(fit.text).digest("hex") : null, builtAt };
}

/** The audit record kept on the call (never the text). */
export function briefingAuditOf(b: BuiltBriefing, selection: string[] | null): NonNullable<CallDoc["briefing"]> {
  return {
    selection,
    builtAt: new Date(b.builtAt),
    sections: b.sections.filter((s) => s.selected).map((s) => ({ key: s.key, count: s.sourceCount, shown: s.shown, condensed: s.condensed, omitted: s.omitted })),
    chars: b.chars,
    hash: b.hash,
    warnings: b.warnings.length,
  };
}

/**
 * Called by the engine each time a call is dialed (immediately or from the schedule): the caller is re-read now, their permissions re-applied, the data
 * read now. Never throws and never blocks the call: if anything fails the call goes ahead with an empty briefing (the agent then says it has no history).
 */
export async function briefingForDial(call: CallDoc, deps: BriefingDeps = {}): Promise<string> {
  const empty = async (why: string) => {
    await recordAudit({ actorId: call.initiatedBy?.userId ?? "system", actorEmail: call.initiatedBy?.email ?? null, action: "update", entity: "call", entityId: call._id, botId: call.agentId, summary: `Call briefing not built: ${why}` });
    return "";
  };
  try {
    if (!call.target) return "";
    try {
      await ensureIntegrations();
    } catch {
      return await empty("product data unavailable");
    }
    if (!providers.has(call.target.product)) return "";
    const viewer = call.initiatedBy ? await (deps.viewerFor ?? viewerForUserId)(call.initiatedBy.userId) : null;
    if (!viewer) return await empty("the person who placed the call no longer has access");
    const selection = cleanSelection(call.briefing?.selection ?? null);
    const b = await buildBriefing(viewer, call.target, { selection, deps });
    const { callsCollection } = await import("@/lib/products/agentos/calls/store");
    await (await callsCollection()).updateOne({ _id: call._id }, { $set: { briefing: briefingAuditOf(b, selection) } });
    await recordAudit({
      actorId: viewer.userId, actorEmail: viewer.email, action: "update", entity: "call", entityId: call._id, botId: call.agentId,
      summary: b.text ? "Call briefing built for the agent" : "Call briefing was empty",
      metadata: { sections: b.sections.filter((s) => s.selected).map((s) => `${s.key}:${s.sourceCount}`), chars: b.chars, hash: b.hash?.slice(0, 16) ?? null, warnings: b.warnings.length },
    });
    return b.text;
  } catch (e) {
    console.error("[agentos briefing] could not build for dial", e instanceof Error ? e.message.slice(0, 200) : "error");
    return "";
  }
}
