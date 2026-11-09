import "server-only";
import type OpenAI from "openai";
import { getOpenAI, isOpenAIConfigured, isUnsupportedParamError } from "@/lib/openai";
import { getPrompt } from "@/lib/prompts/store";
import { withAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { aiBlockReason, isBillingLimitError } from "@/lib/platform/billing/enforce";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { smmsCollection, newId, notDeleted } from "@/lib/products/viralpulse-ai/db";
import { brandPrompt, listLiveOffers, serviceCatalogue } from "@/lib/products/viralpulse-ai/brand";
import { aiErrorMessage } from "@/lib/products/viralpulse-ai/ai";
import { ModelUnavailableError, resolveForCall } from "@/lib/products/viralpulse-ai/models";
import { estimateCost, getSettings } from "@/lib/products/viralpulse-ai/settings";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { postsCollection } from "@/lib/products/viralpulse-ai/posts";
import { evaluateLimits, capsFor } from "@/lib/products/viralpulse-ai/ai-field/limits";
import { bestPostingTime, istDate, type PostSample } from "@/lib/products/viralpulse-ai/ai-field/best-time";
import { validateUrl } from "@/lib/products/viralpulse-ai/ai-field/validate";
import type { FieldLlm, ResolveResult, RunDeps, TrustedData } from "@/lib/products/viralpulse-ai/ai-field/run";
import type { AiFieldErrorCode } from "@/lib/products/viralpulse-ai/ai-field/types";

/** The real model, database and clock behind `runAiField`. */

export const FIELD_AI_FEATURE = "ViralPulse field AI";
const FIELD_MAX_OUTPUT_TOKENS = 1500;

class NoKeyError extends SmmsInputError {}

/** Ledger of field requests (rate limits, usage, undo outcome). Company-scoped like every `smms_*` collection. */
export const FIELD_RUNS = "smms_ai_field_runs";

interface FieldRunDoc {
  _id: string;
  userId: string;
  fieldKey: string;
  mode: string;
  hash: string;
  status: "reserved" | "ok" | "error";
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  code: string | null;
  outcome: "applied" | "reverted" | null;
  at: Date;
}

let indexed = false;
async function runsCollection() {
  const col = await smmsCollection<FieldRunDoc>(FIELD_RUNS);
  if (!indexed) {
    indexed = true;
    await Promise.all([col.createIndex({ userId: 1, at: -1 }).catch(() => {}), col.createIndex({ at: -1 }).catch(() => {}), col.createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 }).catch(() => {})]);
  }
  return col;
}

/** Records whether the person kept or undid a result (quality signal; never affects limits). */
export async function markFieldRun(userId: string, runId: string, outcome: "applied" | "reverted"): Promise<void> {
  if (!/^[\w-]{6,64}$/.test(runId)) return;
  const col = await runsCollection();
  await col.updateOne({ _id: runId, userId }, { $set: { outcome } });
}

export function openAiFieldLlm(): FieldLlm {
  return async (req) => {
    if (!(await isOpenAIConfigured())) throw new NoKeyError("OpenAI isn't connected for this workspace (Settings → Connected accounts), so AI is unavailable.");
    const planBlock = await aiBlockReason();
    if (planBlock) throw new SmmsInputError(planBlock);
    const { ai } = await getSettings();
    // The configured model is checked against the company's own OpenAI account; a retired one falls back to a served one.
    const choice = await resolveForCall("text", ai.textModel);
    const openai = await getOpenAI();
    const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: choice.model,
      instructions: req.system,
      input: req.input,
      max_output_tokens: Math.min(ai.maxOutputTokens, FIELD_MAX_OUTPUT_TOKENS),
      text: { format: { type: "json_schema", name: req.schemaName, schema: req.schema, strict: true } },
      store: false,
    };
    // Metering (plan allowance + the AI usage history) happens inside getOpenAI()'s client; the label says where it came from.
    const res = await withAiFeature(FIELD_AI_FEATURE, async () => {
      try {
        return await openai.responses.create(ai.temperature === null ? params : { ...params, temperature: ai.temperature });
      } catch (err) {
        if (ai.temperature !== null && isUnsupportedParamError(err, "temperature")) return openai.responses.create(params);
        throw err;
      }
    });
    if (res.status === "incomplete") throw new SmmsInputError("The AI answer was cut off. Try again with a shorter request.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.output_text);
    } catch {
      throw new SmmsInputError("The AI returned something that couldn't be read. Please try again.");
    }
    const inputTokens = res.usage?.input_tokens ?? 0;
    const outputTokens = res.usage?.output_tokens ?? 0;
    return { parsed, usage: { model: choice.model, inputTokens, outputTokens, costUsd: estimateCost(ai, choice.model, inputTokens, outputTokens) } };
  };
}

export function classifyFieldError(err: unknown): { code: AiFieldErrorCode; error: string } {
  if (err instanceof ModelUnavailableError) return { code: "PROVIDER", error: err.message };
  if (err instanceof NoKeyError) return { code: "NO_KEY", error: err.message };
  if (isBillingLimitError(err)) return { code: "LIMIT", error: err.message };
  if (err instanceof SmmsInputError) return { code: "BLOCKED", error: err.message };
  const status = (err as { status?: number })?.status;
  if (status === 429) return { code: "RATE", error: "OpenAI rate limit or quota reached. Try again shortly." };
  if (typeof status === "number") return { code: "PROVIDER", error: aiErrorMessage(err) };
  if ((err as Error)?.message === "AI isn't available right now. Please contact support.") return { code: "NO_KEY", error: "OpenAI isn't connected for this workspace (Settings → Connected accounts), so AI is unavailable." };
  console.error("[smms field ai]", (err as Error)?.message?.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]"));
  return { code: "PROVIDER", error: "The AI didn't respond as expected. Please try again." };
}

async function loadTrusted(ids: { clientId: string; offerId: string }): Promise<TrustedData> {
  const clientId = /^[\w-]{1,64}$/.test(ids.clientId) ? ids.clientId : null;
  const offerId = /^[\w-]{1,64}$/.test(ids.offerId) ? ids.offerId : null;
  const [text, company] = await Promise.all([brandPrompt({ clientId, offerId }), getCompanyDetails().catch(() => null)]);
  const sources: TrustedData["sources"] = [{ kind: "brand", ref: clientId ? "Client brand" : "Brand voice (Settings)" }];
  if (company?.name && !clientId) sources.push({ kind: "company", ref: company.name });
  if (offerId) sources.push({ kind: "offer", ref: "Selected live offer" });
  return { text, sources, catalogue: serviceCatalogue().map((s) => s.value) };
}

async function resolveField(id: Parameters<RunDeps["resolve"]>[0], input: Parameters<RunDeps["resolve"]>[1]): Promise<ResolveResult> {
  switch (id) {
    case "company_location": {
      const c = await getCompanyDetails();
      const place = [c.city, c.state, c.country].map((x) => x?.trim()).filter(Boolean).join(", ");
      if (!place) return { ok: false, error: "Your company address isn't filled in yet. Add it under TalentOS → Settings → Company." };
      return { ok: true, value: place, note: "Taken from your company address.", sources: [{ kind: "company", ref: "Company address" }] };
    }
    case "company_website": {
      const c = await getCompanyDetails();
      const raw = (c.website ?? "").trim();
      const url = raw ? validateUrl(/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : `https://${raw}`) : null;
      if (!url) return { ok: false, error: "Your company website isn't filled in yet. Add it under TalentOS → Settings → Company." };
      return { ok: true, value: url, note: "Your company website. Change it if this campaign has its own page.", sources: [{ kind: "company", ref: "Company website" }] };
    }
    case "offer_end": {
      const offerId = typeof input.ctx.offerId === "string" ? input.ctx.offerId : "";
      if (!offerId) return { ok: false, error: "Choose a live offer first. The end date is the offer's own end date." };
      const offer = (await listLiveOffers(100)).find((o) => o._id === offerId);
      if (!offer) return { ok: false, error: "That offer is no longer live." };
      return { ok: true, value: istDate(new Date(offer.validUntil)), note: `The offer "${offer.title}" is valid until this date.`, sources: [{ kind: "offer", ref: offer.title }] };
    }
    case "start_today":
      return { ok: true, value: istDate(input.now), note: "Starts today (India time).", sources: [] };
    case "best_time": {
      // Synced platform numbers first (real, per post); the hand-entered numbers are only a fallback for companies with nothing synced.
      const synced = await (await import("@/lib/products/viralpulse-ai/metrics/queries")).loadSyncedPostSamples().catch(() => []);
      if (synced.length > 0) {
        const best = bestPostingTime(synced, input.now);
        if (!best.ok) return { ok: false, error: best.reason };
        return { ok: true, value: best.value, note: `Your posts get the most engagement around ${String(best.hour).padStart(2, "0")}:00 India time (average ${best.avg}, from ${best.basedOn} published posts with numbers synced from the platforms).`, sources: [{ kind: "analytics", ref: `${best.basedOn} published posts (synced)` }] };
      }
      const col = await postsCollection();
      const rows = await col.find({ ...notDeleted, publishedAt: { $ne: null } }, { projection: { publishedAt: 1, variants: 1 } }).sort({ publishedAt: -1 }).limit(300).toArray();
      const samples: PostSample[] = [];
      for (const p of rows) {
        const ms = p.variants.map((v) => v.metrics).filter((m): m is NonNullable<typeof m> => Boolean(m));
        if (!p.publishedAt || ms.length === 0) continue;
        const engagement = ms.reduce((s, m) => s + (m.engagements || m.likes + m.comments + m.shares + m.saves), 0);
        samples.push({ publishedAt: p.publishedAt, engagement });
      }
      const best = bestPostingTime(samples, input.now);
      if (!best.ok) return { ok: false, error: best.reason };
      return { ok: true, value: best.value, note: `Your posts get the most engagement around ${String(best.hour).padStart(2, "0")}:00 India time (average ${best.avg}, from ${best.basedOn} published posts with recorded results).`, sources: [{ kind: "analytics", ref: `${best.basedOn} published posts` }] };
    }
  }
}

export function makeRunDeps(user: { id: string }): RunDeps {
  return {
    llm: openAiFieldLlm(),
    trusted: loadTrusted,
    resolve: resolveField,
    now: () => new Date(),
    classifyError: classifyFieldError,
    prompt: (key, vars) => getPrompt(key, vars),
    async reserve({ fieldKey, mode, hash }) {
      const { ai } = await getSettings();
      const col = await runsCollection();
      const id = newId();
      const at = new Date();
      await col.insertOne({ _id: id, userId: user.id, fieldKey, mode, hash, status: "reserved", model: null, inputTokens: 0, outputTokens: 0, costUsd: 0, code: null, outcome: null, at });
      const minAgo = new Date(at.getTime() - 60_000);
      const dayAgo = new Date(at.getTime() - 86_400_000);
      const [userLastMinute, userLastDay, companyLastDay, duplicates] = await Promise.all([
        col.countDocuments({ userId: user.id, at: { $gte: minAgo } }),
        col.countDocuments({ userId: user.id, at: { $gte: dayAgo } }),
        col.countDocuments({ at: { $gte: dayAgo } }),
        col.countDocuments({ userId: user.id, hash, status: "reserved", at: { $gte: new Date(at.getTime() - 20_000) }, _id: { $ne: id } }),
      ]);
      if (duplicates > 0) {
        await col.deleteOne({ _id: id });
        return { ok: false, code: "RATE", error: "That request is already running." };
      }
      const verdict = evaluateLimits({ userLastMinute, userLastDay, companyLastDay }, capsFor(ai.dailyGenerationLimit));
      if (!verdict.ok) {
        await col.deleteOne({ _id: id });
        return verdict;
      }
      return {
        ok: true,
        handle: {
          runId: id,
          async finish(r) {
            await col.updateOne({ _id: id }, { $set: { status: r.status, model: r.usage?.model ?? null, inputTokens: r.usage?.inputTokens ?? 0, outputTokens: r.usage?.outputTokens ?? 0, costUsd: r.usage?.costUsd ?? 0, code: r.code ?? null } });
          },
        },
      };
    },
  };
}
