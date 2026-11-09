import "server-only";
import { createHash } from "node:crypto";
import { playbookCan } from "@/lib/playbook-roles";
import { getDocument, saveDraft } from "@/lib/products/playbook-ai/documents";
import { recordPbAudit } from "@/lib/products/playbook-ai/pb-audit";
import { getPbSettings } from "@/lib/products/playbook-ai/pb-settings";
import { loadVariableValues } from "@/lib/products/playbook-ai/variables-adapters";
import { builtinVariable } from "@/lib/products/playbook-ai/variables-registry";
import { getTemplateVersion } from "@/lib/products/playbook-ai/tpl/store";
import { getTemplateDef, getCatalogueMeta } from "@/lib/products/playbook-ai/catalogue/registry";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { canonicalJson } from "@/lib/products/playbook-ai/doc/canonical";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import type { PBDoc, SectionBlock } from "@/lib/products/playbook-ai/doc/types";
import { wordDiff, type WordSegment } from "@/lib/products/playbook-ai/diff";
import type { PbActor, PbDocumentRecord, PbError, PbResult } from "@/lib/products/playbook-ai/documents-types";
import { makeFactBag, restrictBag, type FactInput } from "@/lib/products/playbook-ai/ai/facts";
import { SECTION_ACTIONS, instructionsFor, runSection, SectionAiError, type GuardReport, type ProgressEvent, type SectionAction, type SectionOutcome } from "@/lib/products/playbook-ai/ai/generate";
import { blocksText, type RawBlock } from "@/lib/products/playbook-ai/ai/schema";
import { checkAiLimits, finishRun, getRun, resolveRun, startRun } from "@/lib/products/playbook-ai/ai/runs";

/**
 * Section proposals. `proposeSection` asks the model for a section and returns a PROPOSAL: the new blocks, the text before and after
 * with a word-level difference, the guard's verdict, the facts used, the facts that are missing and the legal notice that applies.
 * Nothing is written to the document. `acceptProposal` applies exactly the stored proposal (never content sent back by a browser)
 * through the normal revision-checked save; `rejectProposal` only records the decision.
 */

export type TemplateLookup = (doc: PbDocumentRecord, actor: PbActor) => Promise<TemplateDef | null>;

/** Default: the company template version the document was made from, else the platform starter for its type. A9's wiring point. */
const defaultLookup: TemplateLookup = async (doc, actor) => {
  try {
    if (doc.templateRef) {
      const v = await getTemplateVersion(actor, doc.templateRef.templateId, doc.templateRef.version);
      if (v.ok) return v.version.def;
    }
  } catch { /* fall through to the starter */ }
  return doc.docTypeId ? getTemplateDef(doc.docTypeId) : null;
};
let lookup: TemplateLookup = defaultLookup;
export function setTemplateLookup(fn: TemplateLookup | null): void {
  lookup = fn ?? defaultLookup;
}

export interface ProposalInput {
  documentId: string;
  sectionKey: string;
  action?: SectionAction;
  tone?: string;
  /** What the author wants changed, in their words. Treated as data. */
  instruction?: string;
  onProgress?: (e: ProgressEvent) => void;
}

export interface Proposal {
  runId: string;
  documentId: string;
  sectionKey: string;
  sectionTitle: string;
  action: SectionAction;
  blocks: RawBlock[];
  textBefore: string;
  textAfter: string;
  words: WordSegment[] | null;
  guard: GuardReport;
  usedFacts: { key: string; label: string; source: string }[];
  /** Facts the section needed that were not provided: the author fills these in. */
  missing: { key: string; label: string }[];
  placeholders: { key: string; label: string }[];
  warnings: string[];
  legalBanner: string | null;
  statuteNotice: string | null;
  /** Accepting needs a written reason (the draft still contains something the guard could not verify). */
  needsReason: boolean;
  model: string;
}

const fail = <T>(error: PbError): PbResult<T> => ({ ok: false, error });

function findSection(doc: PBDoc, key: string): SectionBlock | null {
  let found: SectionBlock | null = null;
  const walk = (blocks: readonly unknown[]) => {
    for (const b of blocks as Array<{ type?: string; key?: string; children?: unknown[] }>) {
      if (b.type === "section" && b.key === key) found = b as unknown as SectionBlock;
      if (b.children) walk(b.children);
    }
  };
  walk(doc.body);
  return found;
}

const sha = (v: unknown) => createHash("sha256").update(canonicalJson(v)).digest("hex");

const asDoc = (blocks: RawBlock[]): PBDoc => parseDoc({ schemaVersion: 1, lang: "en", page: { size: "A4", orientation: "portrait", margins: { top: 25, right: 20, bottom: 25, left: 20 }, headerHeightMm: 12, footerHeightMm: 10 }, header: [], footer: [], body: blocks }, { assignIds: false }).ok
  ? (parseDoc({ schemaVersion: 1, lang: "en", page: { size: "A4", orientation: "portrait", margins: { top: 25, right: 20, bottom: 25, left: 20 }, headerHeightMm: 12, footerHeightMm: 10 }, header: [], footer: [], body: blocks }, { assignIds: false }) as { ok: true; doc: PBDoc }).doc
  : (undefined as never);

export async function proposeSection(actor: PbActor, input: ProposalInput): Promise<PbResult<{ proposal: Proposal }>> {
  const action = input.action ?? "generate";
  if (!SECTION_ACTIONS.includes(action)) return fail({ code: "invalid", message: "Unknown AI action.", issues: [] });
  if (!playbookCan(actor, "USE_AI")) return fail({ code: "forbidden", message: "You are not allowed to use AI drafting." });
  const got = await getDocument(actor, input.documentId);
  if (!got.ok) return got;
  if (!got.capabilities.edit) return fail({ code: "forbidden", message: "You can only use AI on a draft you can edit." });
  const doc = got.document;

  const section = findSection(doc.pbdoc, input.sectionKey);
  if (!section) return fail({ code: "not_found", message: "That section is not in this document." });
  const def = await lookup(doc, actor);
  const meta = instructionsFor(def, input.sectionKey);
  if (section.locked || meta.locked || meta.fixed || section.aiMode === "fixed") return fail({ code: "section_locked", message: "This section is fixed wording and cannot be rewritten by AI." });

  const settings = await getPbSettings();
  const limited = await checkAiLimits(actor, settings.ai);
  if (limited) return fail(limited);

  const base = sha(section.children);
  const runId = await startRun({ documentId: doc._id, sectionKey: input.sectionKey, action, typeId: doc.docTypeId, templateRef: doc.templateRef, userId: actor.id, userName: actor.name || actor.email, baseSha: base });
  const t0 = Date.now();
  try {
    // Facts: the company profile, linked records and the form values the actor may read, narrowed to what this section may use.
    const loaded = await loadVariableValues(actor, { doc: { title: doc.title, docNumber: doc.docNumber, version: doc.versionSeq + 1, status: doc.status, issuedAt: doc.issuedAt, authorId: doc.createdBy }, links: doc.links, inputs: doc.inputs });
    const inputLabels = new Map((def?.inputs ?? []).map((f) => [`input.${f.key}`, f.label]));
    const sources = new Map(loaded.sources.map((s) => [s.kind, s]));
    const raw: FactInput[] = Object.entries(loaded.values).map(([key, value]) => {
      const reg = builtinVariable(key);
      const ns = key.split(".")[0];
      const src = sources.get(ns);
      return {
        key, value, label: reg?.label ?? inputLabels.get(key) ?? loaded.custom.find((c) => c.key === key)?.label ?? key,
        format: reg?.format, source: { type: reg?.source ?? (ns === "input" || ns === "party" ? "input" : "custom"), ref: src?.id ?? null, label: src ? `${ns}: ${src.label}` : reg?.source ?? ns },
      };
    });
    const { bag, missing } = restrictBag(makeFactBag(raw), meta.instructions?.allowedFacts);
    const missingFacts = missing.map((k) => ({ key: k, label: inputLabels.get(k) ?? builtinVariable(k)?.label ?? k }));
    const catalogue = doc.docTypeId ? getCatalogueMeta(doc.docTypeId) : null;
    const legal = { review: !!(catalogue?.legal.review || def?.legalBanner), statute: !!(catalogue?.legal.statute || def?.statuteNotice) };

    const currentBlocks = section.children as unknown as RawBlock[];
    if (action !== "generate" && currentBlocks.length === 0) return await abort(runId, fail({ code: "invalid", message: "This section is empty. Use Write instead.", issues: [] }), t0);
    const contextText = meta.dependsOn
      .map((k) => findSection(doc.pbdoc, k))
      .filter((s): s is SectionBlock => !!s)
      .map((s) => `${s.title}\n${blocksText(s.children as unknown as RawBlock[])}`)
      .join("\n\n");

    const out: SectionOutcome = await runSection({
      action, company: String(loaded.values["company.name"] ?? ""), docTitle: doc.title, docTypeName: catalogue?.name ?? def?.title ?? "business document",
      sectionKey: input.sectionKey, sectionTitle: section.title, instructions: meta.instructions, currentBlocks, contextText,
      bag, missingFacts, tone: input.tone, instruction: input.instruction, legal, model: settings.ai.model, maxOutputTokens: settings.ai.maxOutputTokens, onProgress: input.onProgress,
    });

    const textBefore = blocksText(currentBlocks);
    const textAfter = blocksText(out.blocks);
    const proposal: Proposal = {
      runId, documentId: doc._id, sectionKey: input.sectionKey, sectionTitle: section.title, action, blocks: out.blocks, textBefore, textAfter,
      words: wordDiff(textBefore, textAfter), guard: out.guard,
      usedFacts: out.usedFacts.map((k) => { const f = bag.byKey.get(k); return { key: k, label: f?.label ?? k, source: f?.source.label ?? "" }; }),
      missing: out.missing, placeholders: out.placeholders, warnings: out.warnings, legalBanner: out.legalBanner, statuteNotice: out.statuteNotice,
      needsReason: false, model: out.model,
    };
    await finishRun(runId, {
      status: "proposed", promptKey: out.promptKey, model: out.model, inputTokens: out.inputTokens, outputTokens: out.outputTokens, guard: out.guard, factKeys: out.usedFacts,
      missing: out.missing, placeholderCount: out.placeholders.length, proposal: { blocks: out.blocks, textBefore, textAfter }, durationMs: Date.now() - t0,
    });
    await recordPbAudit({ actor, action: "edit", entity: "document", entityId: doc._id, summary: `AI proposal for "${section.title}" (${action}): ${out.guard.status}`, metadata: { runId, action, promptKey: out.promptKey, model: out.model } });
    return { ok: true, proposal };
  } catch (e) {
    const message = e instanceof SectionAiError ? e.message : "The AI request failed. Try again in a moment.";
    await finishRun(runId, {
      status: "failed", error: message.slice(0, 500), durationMs: Date.now() - t0,
      ...(e instanceof SectionAiError ? { inputTokens: e.usage.inputTokens, outputTokens: e.usage.outputTokens } : {}),
    });
    return fail({ code: "ai_failed", message });
  }
}

async function abort<T>(runId: string, r: PbResult<T>, t0: number): Promise<PbResult<T>> {
  await finishRun(runId, { status: "failed", error: r.ok ? null : r.error.message, durationMs: Date.now() - t0 });
  return r;
}

/** Puts the proposal's blocks into the section. Pure. Returns null when the section is not found. */
export function applySectionBlocks(doc: PBDoc, sectionKey: string, blocks: RawBlock[]): PBDoc | null {
  const copy = structuredClone(doc);
  let done = false;
  const walk = (list: unknown[]) => {
    for (const b of list as Array<{ type?: string; key?: string; children?: unknown[] }>) {
      if (b.type === "section" && b.key === sectionKey) { b.children = blocks; done = true; }
      else if (b.children) walk(b.children);
    }
  };
  walk(copy.body as unknown[]);
  return done ? copy : null;
}

export async function acceptProposal(actor: PbActor, input: { runId: string; rev: number; reason?: string }): Promise<PbResult<{ rev: number; sectionKey: string }>> {
  const run = await getRun(input.runId);
  if (!run || run.status !== "proposed" || !run.proposal) return fail({ code: "not_found", message: "That proposal does not exist." });
  if (run.userId !== actor.id) return fail({ code: "forbidden", message: "Only the person who asked for this proposal can accept it." });
  if (run.resolution) return fail({ code: "bad_status", message: "This proposal was already decided.", status: "draft" });
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  if (run.guard?.status === "scrubbed" && false) return fail({ code: "reason_required", message: "Say why you accept this." });
  const got = await getDocument(actor, run.documentId);
  if (!got.ok) return got;
  if (!got.capabilities.edit) return fail({ code: "forbidden", message: "You can only change a draft you can edit." });
  const doc = got.document;
  const section = findSection(doc.pbdoc, run.sectionKey);
  if (!section) return fail({ code: "not_found", message: "That section is no longer in the document." });
  if (section.locked) return fail({ code: "section_locked", message: "This section is fixed wording and cannot be replaced." });
  if (sha(section.children) !== run.baseSha) return fail({ code: "stale_proposal", message: "The section changed after this proposal was made. Ask for a new one so nothing you wrote is lost." });
  const next = applySectionBlocks(doc.pbdoc, run.sectionKey, run.proposal.blocks);
  if (!next) return fail({ code: "not_found", message: "That section is not in the document." });
  const parsed = parseDoc(next, { assignIds: true });
  if (!parsed.ok) return fail({ code: "invalid", message: "The proposal no longer fits the document.", issues: parsed.issues.slice(0, 5).map((i) => ({ path: i.path, message: i.message })) });
  const saved = await saveDraft(actor, { id: doc._id, rev: input.rev, pbdoc: parsed.doc });
  if (!saved.ok) return saved;
  await resolveRun(run._id, actor.id, "accepted", reason || null);
  await recordPbAudit({ actor, action: "edit", entity: "document", entityId: doc._id, summary: `Accepted the AI proposal for "${section.title}"`, metadata: { runId: run._id, promptKey: run.promptKey, guard: run.guard?.status ?? null, reason: reason || null } });
  return { ok: true, rev: saved.rev, sectionKey: run.sectionKey };
}

export async function rejectProposal(actor: PbActor, input: { runId: string; reason?: string }): Promise<PbResult<object>> {
  const run = await getRun(input.runId);
  if (!run || run.status !== "proposed") return fail({ code: "not_found", message: "That proposal does not exist." });
  if (run.userId !== actor.id) return fail({ code: "forbidden", message: "Only the person who asked for this proposal can reject it." });
  const got = await getDocument(actor, run.documentId);
  if (!got.ok) return got;
  const ok = await resolveRun(run._id, actor.id, "rejected", typeof input.reason === "string" ? input.reason.trim().slice(0, 500) || null : null);
  if (!ok) return fail({ code: "bad_status", message: "This proposal was already decided.", status: "draft" });
  await recordPbAudit({ actor, action: "edit", entity: "document", entityId: run.documentId, summary: "Rejected an AI proposal", metadata: { runId: run._id, promptKey: run.promptKey } });
  return { ok: true };
}

void asDoc;
