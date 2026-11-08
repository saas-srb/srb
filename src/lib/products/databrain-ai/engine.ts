import { getPrompt } from "@/lib/prompts/store";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import "server-only";
import type OpenAI from "openai";
import { getOpenAI, isUnsupportedParamError } from "@/lib/openai";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { ASSISTANT_MODEL } from "@/lib/platform/ai/assistant";
import type { CatalogView } from "@/lib/products/databrain-ai/catalog/types";
import { buildCatalogView } from "@/lib/products/databrain-ai/catalog/view";
import { DESCRIBE_ENTITY_PARAMETERS, RUN_QUERY_PARAMETERS } from "@/lib/products/databrain-ai/query/plan";
import { resultForModel, runPlan, type QueryResult } from "@/lib/products/databrain-ai/query/execute";
import { checkScope, detectLanguage, languageBlock, refusalText, say, scopeBlock, type Lang } from "@/lib/ai/policy";
import { describeEntityText, systemPrompt } from "@/lib/products/databrain-ai/prompt";
import { FINAL_ANSWER_PARAMETERS, blocksToText, resolveBlocks, sanitizeMarkdown } from "@/lib/products/databrain-ai/answer";
import type { Block, StoredQuery } from "@/lib/products/databrain-ai/blocks";

/**
 * One question → one answer. USER QUESTION → catalog view (what THIS user may
 * read) → the model plans queries with tools → each plan is validated against
 * the view and run read-only (`query/`) → the model finishes with a block
 * recipe → the SERVER resolves it against the real results (`answer.ts`).
 *
 * Deviation from the AI Bots chat: the tool loop uses non-streaming Responses
 * calls (the final answer is a structured tool call, which cannot be shown
 * token by token), so the route streams STATUS events and then the finished
 * blocks instead of text deltas.
 */

const MAX_QUERIES = 6;
const MAX_ROUNDS = 10;
const MAX_REJECTIONS = 2; // the first rejection may be repaired once; a second ends the planning
const MAX_OUTPUT_TOKENS = 3000;
/** One model call may take this long; the whole turn is bounded by `maxDuration` on the route. */
const MODEL_CALL_TIMEOUT_MS = 40_000;
const TURN_DEADLINE_MS = 52_000;

/** An expected failure whose message is safe to show as-is (stored on the answer as its error). */
export class TurnError extends Error {}
export const INTELLIGENCE_MODEL = ASSISTANT_MODEL;

export interface TurnInput {
  user: { id: string; roles: readonly string[]; permissionOverrides?: Record<string, boolean> | null };
  question: string;
  history: { role: "user" | "assistant"; text: string }[];
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
  /** Test seam: a prebuilt view. Production always builds it from the signed-in user. */
  view?: CatalogView;
}

export interface TurnOutput {
  text: string;
  blocks: Block[];
  queries: StoredQuery[];
  tokens: number;
  /** Entity keys actually queried (joins included). */
  entities: string[];
  rows: number;
  outcome: "answered" | "refused" | "failed";
  error: string | null;
  /** What `resolveBlocks` dropped or stripped. */
  notes: string[];
}

interface OutputItem {
  type: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: { type: string; text?: string }[];
}

const TOOLS = [
  { type: "function" as const, name: "run_query", description: "Read company data with a structured plan. Returns columns, rows (at most 60 shown), the row count and totals.", parameters: RUN_QUERY_PARAMETERS as unknown as Record<string, unknown>, strict: false },
  { type: "function" as const, name: "describe_entity", description: "List one entity's fields (labels, valid values, types) and relations.", parameters: DESCRIBE_ENTITY_PARAMETERS as unknown as Record<string, unknown>, strict: false },
  { type: "function" as const, name: "final_answer", description: "Finish: the ordered answer blocks. Call exactly once, after any queries.", parameters: FINAL_ANSWER_PARAMETERS as unknown as Record<string, unknown>, strict: false },
];

function textOf(output: OutputItem[]): string {
  return output
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("")
    .trim();
}

function parseArgs(raw: string | undefined): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw || "{}") };
  } catch {
    return { ok: false };
  }
}

async function callModel(openai: OpenAI, params: OpenAI.Responses.ResponseCreateParamsNonStreaming, userSignal?: AbortSignal) {
  const signal = AbortSignal.any([...(userSignal ? [userSignal] : []), AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS)]);
  try {
    return await openai.responses.create({ ...params, temperature: 0.1 }, { signal });
  } catch (err) {
    if (isUnsupportedParamError(err, "temperature")) return openai.responses.create(params, { signal });
    throw err;
  }
}

const stored = (r: QueryResult): StoredQuery => ({
  queryId: r.queryId,
  entity: r.entity,
  entityLabel: r.description.entityLabel,
  measures: r.description.measures,
  groupedBy: r.description.groupedBy,
  filters: r.description.filters,
  joins: r.description.joins,
  rowCount: r.rowCount,
  truncated: r.truncated,
});

export async function answerQuestion(input: TurnInput): Promise<TurnOutput> {
  const status = input.onStatus ?? (() => {});
  status("Checking permissions…");
  const lang = detectLanguage([...input.history.filter((h) => h.role === "user").map((h) => h.text), input.question]);
  if (!(await checkScope({ text: input.question, previousAssistant: [...input.history].reverse().find((h) => h.role === "assistant")?.text, kind: "workspace" }))) {
    return { text: refusalText(lang, "workspace"), blocks: [{ type: "text", markdown: refusalText(lang, "workspace") }], queries: [], tokens: 0, entities: [], rows: 0, outcome: "refused", error: null, notes: ["out of scope"] };
  }
  const view = input.view ?? (await buildCatalogView(input.user));
  setAiFeature("AI Intelligence");
  const openai = await getOpenAI();

  const results = new Map<string, QueryResult>();
  const queries: StoredQuery[] = [];
  const entities = new Set<string>();
  let tokens = 0;
  let queryCount = 0;
  let rejections = 0;
  let accessRefused = false;

  const deadline = Date.now() + TURN_DEADLINE_MS;
  const modelInput: unknown[] = [...input.history.map((h) => ({ role: h.role, content: h.text })), { role: "user", content: input.question }];
  const instructions = await getPrompt("databrain.instructions", { system: await systemPrompt(view), scope_block: await scopeBlock("workspace"), language_block: await languageBlock(lang) });

  const finish = (blocks: Block[], notes: string[], error: string | null = null): TurnOutput => {
    const rows = [...results.values()].reduce((n, r) => n + r.rowCount, 0);
    return {
      text: blocksToText(blocks),
      blocks,
      queries,
      tokens,
      entities: [...entities],
      rows,
      outcome: error ? "failed" : results.size === 0 && accessRefused ? "refused" : "answered",
      error,
      notes,
    };
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (input.signal?.aborted) throw new Error("stopped");
    if (Date.now() > deadline) throw new TurnError(say("analystSlow", lang));
    const forceFinal = round === MAX_ROUNDS - 1 || rejections >= MAX_REJECTIONS || queryCount >= MAX_QUERIES + 1;
    if (round > 0) status(forceFinal ? "Writing the answer…" : "Analysing the results…");
    const res = await callModel(
      openai,
      {
        model: INTELLIGENCE_MODEL,
        instructions,
        input: modelInput as never,
        tools: TOOLS,
        tool_choice: forceFinal ? { type: "function", name: "final_answer" } : "auto",
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
      },
      input.signal,
    );
    tokens += res.usage?.total_tokens ?? (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    const output = (res.output ?? []) as unknown as OutputItem[];
    const calls = output.filter((o) => o.type === "function_call" && o.call_id && o.name);

    if (calls.length === 0) {
      // Plain text without final_answer: accept it as a text-only answer.
      const text = sanitizeMarkdown(textOf(output));
      if (!text) return finish([{ type: "text", markdown: say("analystNoAnswer", lang) }], ["empty reply"]);
      return finish([{ type: "text", markdown: text }], ["plain text reply"]);
    }

    for (const call of calls) {
      modelInput.push({ type: "function_call", call_id: call.call_id, name: call.name, arguments: call.arguments ?? "{}" });
      const parsed = parseArgs(call.arguments);
      const reply = (obj: unknown) => modelInput.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(obj) });

      if (call.name === "final_answer") {
        status("Writing the answer…");
        const { blocks, notes } = parsed.ok ? resolveBlocks(parsed.value, results) : { blocks: [], notes: ["unparseable final_answer"] };
        if (blocks.length === 0) return finish([{ type: "text", markdown: say("analystNoAnswer", lang) }], notes);
        return finish(blocks, notes);
      }

      if (call.name === "describe_entity") {
        const key = parsed.ok && parsed.value && typeof parsed.value === "object" ? String((parsed.value as { entity?: unknown }).entity ?? "") : "";
        const e = view.entities.get(key);
        if (e) reply(describeEntityText(e));
        else {
          const restricted = view.restricted.some((r) => r.key === key);
          if (restricted) accessRefused = true;
          reply({ error: restricted ? `Entity "${key}" is not available to this user (access permissions).` : `Unknown entity "${key}". Available: ${[...view.entities.keys()].join(", ")}.` });
        }
        continue;
      }

      if (call.name === "run_query") {
        if (queryCount >= MAX_QUERIES) {
          reply({ error: `Query limit reached (${MAX_QUERIES}). Call final_answer now with what you have.` });
          queryCount++;
          continue;
        }
        queryCount++;
        const queryId = `q${queryCount}`;
        let entityLabel = "data";
        if (parsed.ok && parsed.value && typeof parsed.value === "object") {
          const k = (parsed.value as { entity?: unknown }).entity;
          if (typeof k === "string") entityLabel = view.entities.get(k)?.def.label ?? "data";
        }
        status(`Querying ${entityLabel}…`);
        if (!parsed.ok) {
          rejections++;
          queries.push({ queryId, entity: "", entityLabel: "", measures: [], groupedBy: [], filters: [], joins: [], rowCount: 0, truncated: false, error: "The query plan was not valid JSON." });
          reply({ error: "The arguments were not valid JSON." });
          continue;
        }
        const out = await runPlan(view, parsed.value, queryId);
        // A query that hits the 10 s limit ends the question with a friendly stored error (retrying the same scan would only time out again).
        if (!out.ok && out.code === "timeout") throw new TurnError(out.error);
        if (out.ok) {
          results.set(queryId, out.result);
          queries.push(stored(out.result));
          entities.add(out.result.entity);
          for (const j of out.result.plan.joins) {
            const rel = view.entities.get(out.result.entity)?.relations.get(j);
            if (rel) entities.add(rel.to);
          }
          reply(resultForModel(out.result));
        } else {
          if (out.code === "denied") accessRefused = true;
          if (out.code === "denied" || out.code === "invalid" || out.code === "unknown_entity" || out.code === "unknown_field") rejections++;
          queries.push({ queryId, entity: "", entityLabel, measures: [], groupedBy: [], filters: [], joins: [], rowCount: 0, truncated: false, error: out.code === "denied" ? "Not available because of access permissions." : out.error });
          reply({ error: out.error });
        }
        continue;
      }

      reply({ error: `Unknown tool "${call.name}". Use run_query, describe_entity or final_answer.` });
    }
  }
  return finish([{ type: "text", markdown: say("analystIncomplete", lang) }], ["round limit"]);
}


/** A short, safe message for an error thrown while answering (billing limits keep their own friendly text). */
export function friendlyTurnError(err: unknown, lang: Lang = "english"): string {
  if (isBillingLimitError(err)) return err.message;
  if (err instanceof TurnError) return err.message;
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "TimeoutError" || name === "APIConnectionTimeoutError" || name === "APIUserAbortError") return say("analystSlow", lang);
  const msg = err instanceof Error ? err.message : "";
  if (/OpenAI isn't connected/i.test(msg)) return say("analystNotSetUp", lang);
  return say("analystDown", lang);
}
