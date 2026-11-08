import "server-only";
import { newId } from "@/lib/products/agentos/db";
import { briefingVariablesFor, variablesFor } from "@/lib/products/agentos/calls/purposes";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import type { CallDoc } from "@/lib/products/agentos/calls/types";
import type { BotDoc } from "@/lib/products/agentos/bots";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";
import type { VoiceCallRecord } from "@/lib/products/agentos/chats";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

/**
 * Web (browser) calls also land in `agentos_calls`: a mirror row is written when the call starts and refreshed when the legacy chat
 * row settles, so listings and the live console see phone and web calls in one place. The chat row stays the source for the existing
 * Call History page (older calls only exist there). Best-effort: a failure here never affects the call itself.
 */

/** Blank-by-default dynamic variables for the agent's purposes, so a browser session can pass every {{variable}} its prompt uses. */
export async function webDynamicVariables(bot: Pick<BotDoc, "voice">): Promise<Record<string, string>> {
  const purposes = bot.voice?.purposes ?? [];
  if (!purposes.length) return {};
  const out: Record<string, string> = { ...briefingVariablesFor(purposes) };
  const company = (await getCompany(await currentCompanyId()))?.name ?? "";
  for (const v of variablesFor(purposes)) out[v.key] = v.key === "company_name" ? company : "";
  return out;
}

export async function mirrorWebCallStart(viewer: AibotsViewer, bot: BotDoc, chatId: string): Promise<void> {
  try {
    const now = new Date();
    const doc: CallDoc = {
      _id: newId(), idempotencyKey: `web:${chatId}`, direction: "web", agentId: bot._id, elevenAgentId: bot.voice?.elevenAgentId ?? null, purpose: "custom",
      target: null, phone: null, phoneHash: null, phoneLast4: null, fromNumberId: null, initiatedBy: { userId: viewer.userId, email: viewer.email },
      scheduledFor: null, anchorAt: now, dialedAt: now, endedAt: null, status: "dialing", attempts: 1, conversationId: null, callSid: null, context: {},
      compliance: null, failure: null, collected: [], outcome: null, summary: null, summaryTitle: null, transcript: null, durationSecs: null, hasAudio: null,
      terminationReason: null, meteredAt: null, meterLeaseUntil: null, chatId, cancelledBy: null,
      control: { mode: "ai", handler: null, canHandBack: true, history: [] }, eventSeq: 0, createdAt: now, updatedAt: now,
    };
    await (await callsCollection()).insertOne(doc);
  } catch (e) {
    console.error("[agentos calls] web call mirror failed", e instanceof Error ? e.message : e);
  }
}

export async function mirrorWebCallUpdate(chatId: string, v: VoiceCallRecord, elevenAgentId: string | null): Promise<void> {
  try {
    const settled = v.status === "done" || v.status === "failed";
    const $set: Record<string, unknown> = {
      updatedAt: new Date(), status: v.status === "done" ? "completed" : v.status === "failed" ? "failed" : "in_progress", durationSecs: v.durationSecs,
      transcript: v.transcript, hasAudio: v.hasAudio ?? null, summary: v.summary ?? null, summaryTitle: v.summaryTitle ?? null, outcome: v.callSuccess ?? null,
      collected: (v.dataCollection ?? []).map((d) => ({ key: d.key, label: d.key, value: d.value })), terminationReason: v.terminationReason ?? null,
      elevenAgentId,
    };
    if (v.conversationId) $set.conversationId = v.conversationId;
    if (settled) $set.endedAt = new Date();
    if (v.meteredAt) $set.meteredAt = v.meteredAt;
    await (await callsCollection()).updateOne({ chatId }, { $set });
  } catch (e) {
    console.error("[agentos calls] web call mirror update failed", e instanceof Error ? e.message : e);
  }
}
