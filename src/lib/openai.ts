import "server-only";
import OpenAI from "openai";
import { unstable_rethrow } from "next/navigation";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { assertAiAvailable, assertWritable, meterAiTokens } from "@/lib/platform/billing/enforce";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { recordAiUsage } from "@/lib/platform/billing/ai-usage-log";
import { resolveUsageActor } from "@/lib/platform/billing/usage-actor";
import { SYSTEM_ACTOR, type UsageActor } from "@/lib/platform/billing/usage-actor-store";

// One client per distinct credential set (a company's own OpenAI key, else SelfRun's), reused across hot reloads and invocations.
// Created lazily, so nothing is built until a company actually uses AI. Calls made with a company's OWN key are not counted against
// the plan's AI allowance (they are still logged in the usage history); calls on SelfRun's key are.
const globalForOpenAI = globalThis as unknown as { _openAIClients?: Map<string, OpenAI> };

export const OPENAI_NOT_CONNECTED = "AI isn't available right now. Please contact support.";

export async function getOpenAI(opts: { timeoutMs?: number; maxRetries?: number } = {}): Promise<OpenAI> {
  const resolved = await resolveConnection("openai");
  const creds = resolved?.values;
  if (!creds?.apiKey) throw new Error(OPENAI_NOT_CONNECTED);
  const own = resolved?.source === "workspace";
  const clients = (globalForOpenAI._openAIClients ??= new Map());
  const id = `${own ? "own" : "platform"}|${creds.apiKey}|${creds.organization ?? ""}|${creds.project ?? ""}|${opts.timeoutMs ?? ""}|${opts.maxRetries ?? ""}`;
  let metered = clients.get(id);
  if (!metered) {
    metered = meteredClient(own, new OpenAI({ apiKey: creds.apiKey, organization: creds.organization || undefined, project: creds.project || undefined, ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}), ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}) }));
    clients.set(id, metered);
  }
  return metered;
}

// ---------------------------------------------------------------------------
// Plan enforcement: every token-consuming call made through getOpenAI() is
// checked against the company's monthly AI allowance first (throws a friendly
// BillingLimitError when it's used up) and metered afterwards from the
// response's `usage` — streamed replies are metered when their final event
// arrives. Other endpoints (files, vector stores, conversations) pass through.
// ---------------------------------------------------------------------------

type Usage = { total_tokens?: number; input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null | undefined;

function tokensOf(usage: Usage): number {
  if (!usage) return 0;
  if (typeof usage.total_tokens === "number") return usage.total_tokens;
  return (usage.input_tokens ?? usage.prompt_tokens ?? 0) + (usage.output_tokens ?? usage.completion_tokens ?? 0);
}

/** Usage carried by a stream event (Responses: `response.completed` etc.; Chat Completions: the final chunk). */
function streamEventUsage(event: unknown): Usage {
  if (!event || typeof event !== "object") return null;
  const e = event as { response?: { usage?: Usage }; usage?: Usage };
  return e.response?.usage ?? e.usage ?? null;
}

/** About 3.5 characters to a token: used only when the provider never reports usage (a stream cut short, an image endpoint without usage). */
const estimateTokens = (chars: number) => Math.ceil(chars / 3.5);
/** A generated image bills as image tokens; when the response carries no usage, count this much per image so it is never free. */
const IMAGE_FALLBACK_TOKENS = 4000;

function meterStream<T extends object>(own: boolean, stream: T, companyId: string, model: string, endpoint: string, promptChars: number, actor: UsageActor): T {
  let metered = false;
  let chars = 0;
  // A reply that ends without the final usage event (the visitor closed the tab, a network cut) still cost tokens: count an estimate.
  const settle = async () => {
    if (metered) return;
    metered = true;
    if (chars > 0) {
      const tokens = estimateTokens(promptChars + chars);
      if (!own) await meterAiTokens(tokens, companyId);
      await recordAiUsage({ usage: { total_tokens: tokens }, model, endpoint: `${endpoint} (estimated)`, companyId, actor });
    }
  };
  return new Proxy(stream, {
    get(target, prop) {
      if (prop === Symbol.asyncIterator) {
        return () => {
          const it = (target as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]();
          return {
            async next() {
              const r = await it.next();
              if (!r.done) {
                const delta = (r.value as { delta?: unknown } | null)?.delta;
                if (typeof delta === "string") chars += delta.length;
                else {
                  const c = (r.value as { choices?: { delta?: { content?: unknown } }[] } | null)?.choices?.[0]?.delta?.content; // Chat Completions chunks
                  if (typeof c === "string") chars += c.length;
                }
                if (!metered) {
                  const tokens = tokensOf(streamEventUsage(r.value));
                  if (tokens > 0) {
                    metered = true;
                    if (!own) await meterAiTokens(tokens, companyId);
                    await recordAiUsage({ usage: streamEventUsage(r.value), model, endpoint, companyId, actor });
                  }
                }
              } else {
                await settle();
              }
              return r;
            },
            return: async (v?: unknown) => {
              await settle();
              return it.return ? it.return(v) : { done: true as const, value: v };
            },
            throw: it.throw ? (e?: unknown) => it.throw!(e) : undefined,
            [Symbol.asyncIterator]() {
              return this;
            },
          };
        };
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

function meteredMethod(own: boolean, owner: object, fn: (...args: unknown[]) => unknown, endpoint: string) {
  return async (...args: unknown[]) => {
    let companyId: string | null = null;
    try {
      companyId = await currentCompanyIdOrNull();
    } catch (err) {
      unstable_rethrow(err);
    }
    // Outside any company (scripts) there is no plan to check or meter against.
    if (companyId) await (own ? assertWritable() : assertAiAvailable());
    // Who is asking, captured now (a streamed reply finishes after the request context is gone).
    const actor = companyId ? await resolveUsageActor() : SYSTEM_ACTOR;
    const result = await fn.apply(owner, args);
    const model = String((args[0] as { model?: string } | undefined)?.model ?? "");
    const streaming = Boolean((args[0] as { stream?: boolean } | undefined)?.stream);
    if (companyId && streaming && result && typeof result === "object" && Symbol.asyncIterator in result) return meterStream(own, result, companyId, model, endpoint, JSON.stringify((args[0] as { input?: unknown; messages?: unknown } | undefined)?.input ?? (args[0] as { messages?: unknown } | undefined)?.messages ?? "").length, actor);
    if (companyId) {
      let usage = (result as { usage?: Usage } | null)?.usage;
      let tokens = tokensOf(usage);
      if (tokens === 0 && endpoint.startsWith("images.")) {
        const n = Math.max(1, Number((args[0] as { n?: number } | undefined)?.n ?? 1));
        tokens = IMAGE_FALLBACK_TOKENS * n;
        usage = { total_tokens: tokens };
      }
      if (!own) await meterAiTokens(tokens, companyId);
      await recordAiUsage({ usage, model, endpoint, companyId, actor });
    }
    return result;
  };
}

/** Wraps `resource[method]` (e.g. `responses.create`) with the check + meter; everything else is untouched. */
function wrapResource<T extends object>(own: boolean, resource: T, methods: string[], children: Record<string, string[]> = {}, path = ""): T {
  return new Proxy(resource, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target);
      if (typeof prop === "string" && methods.includes(prop) && typeof v === "function") return meteredMethod(own, target, v as (...args: unknown[]) => unknown, `${path}${prop}`);
      if (typeof prop === "string" && prop in children && v && typeof v === "object") return wrapResource(own, v as object, children[prop], {}, `${path}${prop}.`);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

function meteredClient(own: boolean, client: OpenAI): OpenAI {
  const wrapped: Record<string, [string[], Record<string, string[]>?]> = {
    responses: [["create"]],
    images: [["generate", "edit"]],
    embeddings: [["create"]],
    chat: [[], { completions: ["create"] }],
  };
  return new Proxy(client, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target);
      if (typeof prop === "string" && prop in wrapped && v && typeof v === "object") {
        const [methods, children] = wrapped[prop];
        return wrapResource(own, v as object, methods, children, `${prop}.`);
      }
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/** True when this workspace can use AI: it saved its own OpenAI key, or SelfRun's is available. */
export async function isOpenAIConfigured(): Promise<boolean> {
  return Boolean((await resolveConnection("openai"))?.values.apiKey);
}

/**
 * True when OpenAI rejected a request because the model doesn't accept `param`
 * (e.g. reasoning models refuse `temperature`) — callers retry without it.
 */
export function isUnsupportedParamError(err: unknown, param: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; param?: string; message?: string };
  if (e.status !== 400) return false;
  if (e.param === param) return true;
  return typeof e.message === "string" && e.message.toLowerCase().includes(param);
}
