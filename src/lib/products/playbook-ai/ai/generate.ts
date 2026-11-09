import "server-only";
import { getOpenAI } from "@/lib/openai";
import { withAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { getPrompt } from "@/lib/prompts/store";
import { DEFAULT_TEXT_MODEL, resolveForCall } from "@/lib/products/viralpulse-ai/models";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import { DEFAULT_PAGE } from "@/lib/products/playbook-ai/doc/page";
import type { AiInstructions, TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { LEGAL_REVIEW_BANNER, STATUTE_NOTICE } from "@/lib/products/playbook-ai/catalogue/types";
import { dataBlock, factsBlock, textBlock, type FactBag } from "@/lib/products/playbook-ai/ai/facts";
import { buildAllowSet } from "@/lib/products/playbook-ai/ai/guard";
import {
  SECTION_OUTPUT_SCHEMA, blocksText, guardBlocks, outputToBlocks, scrubBlocks, wordCountOf, type BlockGuardIssue, type RawBlock,
} from "@/lib/products/playbook-ai/ai/schema";

/**
 * One section, one request. Builds the prompt from the registry, asks the model for a strict-schema answer, checks it with the fact guard,
 * repairs it once if it broke a rule, and scrubs whatever still does into visible `[ADD: ...]` placeholders. It never writes into a
 * document: the result is a draft for `propose.ts` to put in front of the author. No database access here, so the whole flow runs
 * against a fake client in tests.
 */

export const SECTION_ACTIONS = ["generate", "improve", "shorten", "expand", "tone"] as const;
export type SectionAction = (typeof SECTION_ACTIONS)[number];

/** Registry keys by action. Written out in full so the registry test can see every key is asked for. */
const PROMPT_KEYS: Record<SectionAction, string> = {
  generate: "playbook.section.generate",
  improve: "playbook.section.improve",
  shorten: "playbook.section.shorten",
  expand: "playbook.section.expand",
  tone: "playbook.section.tone",
};
const FIX_KEY = "playbook.section.fix";

export const AI_FEATURE_LABEL = "Playbook AI";

export interface AiResponseLike { output_text?: string; status?: string; usage?: { input_tokens?: number; output_tokens?: number } | null }
export interface AiClientLike { responses: { create(params: Record<string, unknown>): Promise<AiResponseLike> } }

export interface AiDeps {
  client(): Promise<AiClientLike>;
  model(requested: string | null): Promise<{ model: string; note: string | null }>;
}

const realDeps: AiDeps = {
  client: async () => (await getOpenAI({ timeoutMs: 55_000, maxRetries: 1 })) as unknown as AiClientLike,
  model: async (requested) => {
    const c = await resolveForCall("text", requested || DEFAULT_TEXT_MODEL);
    return { model: c.model, note: c.note };
  },
};
let depsOverride: AiDeps | null = null;
/** Test hook: replace the model client (null restores the real, metered one). */
export function setAiDeps(d: AiDeps | null): void {
  depsOverride = d;
}

export type ProgressStage = "preparing" | "asking" | "checking" | "repairing" | "finishing";
export interface ProgressEvent { stage: ProgressStage; sectionKey: string; attempt: number; message: string }

export interface SectionRequest {
  action: SectionAction;
  company: string;
  docTitle: string;
  docTypeName: string;
  sectionKey: string;
  sectionTitle: string;
  /** The template's instructions for this section, when there is a template. */
  instructions: AiInstructions | null;
  /** The section's blocks as they are now (raw PBDoc blocks). Empty for a new section. */
  currentBlocks: RawBlock[];
  /** Text of the sections this one depends on, for coherence. Data, not instructions. */
  contextText?: string;
  bag: FactBag;
  /** Allowed fact keys that are not in the bag. They are reported and the model is told to leave placeholders. */
  missingFacts: { key: string; label: string }[];
  tone?: string;
  /** Free text from the author ("mention the relocation policy"). Data. */
  instruction?: string;
  legal: { review: boolean; statute: boolean };
  /** The model to ask for (the company's setting); null for the platform default. */
  model: string | null;
  maxOutputTokens: number;
  onProgress?: (e: ProgressEvent) => void;
}

export interface GuardReport {
  /** clean = right first time, repaired = the second pass fixed it, scrubbed = values still outside the facts were replaced by placeholders. */
  status: "clean" | "repaired" | "scrubbed";
  firstPassIssues: number;
  scrubbed: number;
  issues: Array<{ kind: string; text: string; reason: string }>;
}

export interface SectionOutcome {
  /** Typed PBDoc blocks with ids, accepted by the A1 validator. */
  blocks: RawBlock[];
  usedFacts: string[];
  placeholders: { key: string; label: string }[];
  /** Facts the section needed that were not provided. */
  missing: { key: string; label: string }[];
  guard: GuardReport;
  warnings: string[];
  legalBanner: string | null;
  statuteNotice: string | null;
  model: string;
  promptKey: string;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

export class SectionAiError extends Error {
  constructor(message: string, public readonly usage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 }) {
    super(message);
    this.name = "SectionAiError";
  }
}

const TONE_OF: Record<string, string> = { formal: "formal", warm: "warm and friendly", firm: "firm and direct", neutral: "neutral", instructional: "instructional and clear", friendly: "warm and friendly" };

function promptVars(r: SectionRequest, problems = ""): Record<string, string> {
  const i = r.instructions;
  return {
    company_name: r.company || "the company",
    doc_title: r.docTitle,
    doc_type: r.docTypeName,
    section_title: r.sectionTitle,
    brief: i?.brief ?? `Write the "${r.sectionTitle}" section of this document.`,
    tone: TONE_OF[r.tone ?? i?.tone ?? "formal"] ?? (r.tone || "formal"),
    min_words: String(i?.minWords ?? 40),
    max_words: String(i?.maxWords ?? 250),
    never_invent: (i?.neverInvent ?? ["any value that is not in the facts"]).map((x) => `- ${x}`).join("\n"),
    legal_line: r.legal.review
      ? "This is a legal document type. Write plain, precise wording. It will be reviewed by a qualified advocate before use. Do not give legal advice."
      : r.legal.statute ? "This document touches statutory matters. Do not state any figure, rate, period or limit unless it is in the facts." : "",
    problems,
  };
}

function userInput(r: SectionRequest, extra = ""): string {
  const parts = [factsBlock(r.bag)];
  if (r.missingFacts.length) parts.push(`MISSING FACTS (not provided; if the section needs them, write a placeholder run and list them under missing):\n${r.missingFacts.map((m) => `- ${m.key}: ${m.label}`).join("\n")}`);
  if (r.currentBlocks.length) parts.push(textBlock("current section", blocksText(r.currentBlocks)));
  if (r.contextText) parts.push(textBlock("context", r.contextText, 6000));
  if (r.instruction?.trim()) parts.push(dataBlock("instruction", r.instruction.trim().slice(0, 600)));
  if (extra) parts.push(extra);
  parts.push(r.action === "generate" ? "Write the section now." : "Rewrite the section now.");
  return parts.join("\n\n");
}

function parseModelJson(text: string | undefined): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** Checks the converted blocks with the PBDoc validator and returns them with ids, or the problems found. */
function validateBlocks(blocks: RawBlock[], sectionKey: string, sectionTitle: string): { ok: true; blocks: RawBlock[] } | { ok: false; problems: string[] } {
  const r = parseDoc({
    schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [],
    body: [{ type: "section", key: /^[a-z][a-z0-9_]{0,39}$/.test(sectionKey) ? sectionKey : "section", title: sectionTitle.slice(0, 200) || "Section", aiMode: "generate", locked: false, children: blocks }],
  }, { assignIds: true });
  if (!r.ok) return { ok: false, problems: r.issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`) };
  const section = r.doc.body[0] as unknown as { children: RawBlock[] };
  return { ok: true, blocks: section.children };
}

export async function runSection(r: SectionRequest): Promise<SectionOutcome> {
  return withAiFeature(AI_FEATURE_LABEL, () => run(r));
}

async function run(r: SectionRequest): Promise<SectionOutcome> {
  const deps = depsOverride ?? realDeps;
  const progress = (stage: ProgressStage, attempt: number, message: string) => r.onProgress?.({ stage, sectionKey: r.sectionKey, attempt, message });
  progress("preparing", 0, "Gathering the facts for this section");

  const currentText = blocksText(r.currentBlocks);
  // For edits, what the author already wrote stays acceptable; for a fresh section only the facts count.
  const allow = buildAllowSet(r.bag, r.action === "generate" ? [] : [currentText]);
  const promptKey = PROMPT_KEYS[r.action];
  const client = await deps.client();
  const chosen = await deps.model(r.model);
  let inputTokens = 0, outputTokens = 0;

  const ask = async (key: string, vars: Record<string, string>, input: string): Promise<AiResponseLike> => {
    const instructions = await getPrompt(key, vars);
    const res = await client.responses.create({
      model: chosen.model,
      instructions,
      input,
      max_output_tokens: r.maxOutputTokens,
      text: { format: { type: "json_schema", name: "playbook_section", schema: SECTION_OUTPUT_SCHEMA, strict: true } },
      store: false,
    });
    inputTokens += res.usage?.input_tokens ?? 0;
    outputTokens += res.usage?.output_tokens ?? 0;
    return res;
  };

  /** One pass: ask, read, convert, validate, guard. */
  const pass = async (attempt: number, key: string, vars: Record<string, string>, input: string) => {
    progress(attempt === 1 ? "asking" : "repairing", attempt, attempt === 1 ? "Writing the section" : "Correcting the draft");
    const res = await ask(key, vars, input);
    progress("checking", attempt, "Checking every value against your records");
    const problems: string[] = [];
    if (res.status === "incomplete") problems.push("The reply was cut off. Write a shorter section.");
    const json = parseModelJson(res.output_text);
    if (json === null) problems.push("The reply was not valid JSON for the schema.");
    const conv = json === null ? null : outputToBlocks(json, r.bag);
    if (conv) problems.push(...conv.repairable);
    let blocks = conv?.blocks ?? [];
    if (conv && !problems.length) {
      const v = validateBlocks(blocks, r.sectionKey, r.sectionTitle);
      if (!v.ok) problems.push(...v.problems.map((p) => `Invalid structure: ${p}`));
    }
    const issues: BlockGuardIssue[] = conv ? guardBlocks(blocks, allow) : [];
    for (const i of issues) problems.push(`"${i.text}": ${i.reason}`);
    if (conv && conv.problems.length && !blocks.length) blocks = [];
    return { json, conv, blocks, issues, problems };
  };

  let attempts = 1;
  let first = await pass(1, PROMPT_KEYS[r.action], promptVars(r), userInput(r));
  let final = first;
  let repaired = false;
  if (first.problems.length) {
    attempts = 2;
    const list = first.problems.slice(0, 12).map((p) => `- ${p}`).join("\n");
    const previous = first.blocks.length ? textBlock("previous draft", blocksText(first.blocks), 6000) : "";
    final = await pass(2, FIX_KEY, promptVars(r, list), userInput(r, previous));
    repaired = true;
  }
  void first;
  if (!final.conv || !final.blocks.length) {
    throw new SectionAiError(final.problems[0] ? `The AI could not produce a usable section: ${final.problems[0]}` : "The AI could not produce a usable section.", { inputTokens, outputTokens });
  }

  // Anything still outside the facts becomes a visible placeholder.
  let blocks = final.blocks;
  let scrubbedCount = 0;
  const remaining = final.issues;
  const scrubPlaceholders: { key: string; label: string }[] = [];
  if (remaining.length) {
    const s = scrubBlocks(blocks, allow);
    blocks = s.blocks;
    scrubbedCount = s.replaced;
    scrubPlaceholders.push(...s.placeholders);
  }
  progress("finishing", attempts, "Preparing the proposal");
  const valid = validateBlocks(blocks, r.sectionKey, r.sectionTitle);
  if (!valid.ok) throw new SectionAiError(`The AI's section was not a valid document part: ${valid.problems[0]}`, { inputTokens, outputTokens });

  const placeholderMap = new Map<string, string>();
  for (const p of [...final.conv.placeholders, ...scrubPlaceholders]) placeholderMap.set(p.key, p.label);
  const modelMissing = ((final.json as { missing?: { key?: string; label?: string }[] } | null)?.missing ?? []).filter((m) => m && typeof m.label === "string" && m.label.trim());
  const missing = new Map<string, string>();
  for (const m of r.missingFacts) missing.set(m.key, m.label);
  for (const m of modelMissing) { const k = String(m.key || m.label); if (!missing.has(k)) missing.set(k, String(m.label)); }

  const warnings: string[] = [];
  if (chosen.note) warnings.push(chosen.note);
  const words = wordCountOf(blocksText(valid.blocks));
  const i = r.instructions;
  if (i && r.action === "generate") {
    if (words < i.minWords * 0.5) warnings.push(`The section is short (${words} words; the template asks for at least ${i.minWords}).`);
    if (words > i.maxWords * 1.5) warnings.push(`The section is long (${words} words; the template asks for at most ${i.maxWords}).`);
  }
  if (r.bag.facts.some((f) => f.suspicious)) warnings.push("Some record values looked like instructions and were treated as plain data.");

  return {
    blocks: valid.blocks,
    usedFacts: final.conv.usedFacts,
    placeholders: [...placeholderMap].map(([key, label]) => ({ key, label })),
    missing: [...missing].map(([key, label]) => ({ key, label })),
    guard: {
      status: scrubbedCount > 0 ? "scrubbed" : repaired ? "repaired" : "clean",
      firstPassIssues: first.problems.length,
      scrubbed: scrubbedCount,
      issues: remaining.slice(0, 30).map((x) => ({ kind: x.kind, text: x.text, reason: x.reason })),
    },
    warnings,
    legalBanner: r.legal.review ? LEGAL_REVIEW_BANNER : null,
    statuteNotice: r.legal.statute ? STATUTE_NOTICE : null,
    model: chosen.model,
    promptKey,
    inputTokens,
    outputTokens,
    attempts,
  };
}

/** The section a template defines, for the caller that has a `TemplateDef` (A9). */
export function instructionsFor(def: TemplateDef | null, sectionKey: string): { instructions: AiInstructions | null; title: string | null; locked: boolean; fixed: boolean; dependsOn: string[] } {
  const s = def?.sections.find((x) => x.key === sectionKey);
  return { instructions: s?.ai ?? null, title: s?.title ?? null, locked: s?.locked ?? false, fixed: s?.aiMode === "fixed", dependsOn: s?.dependsOn ?? [] };
}
