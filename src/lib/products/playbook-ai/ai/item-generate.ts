import "server-only";
import { playbookCan } from "@/lib/playbook-roles";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import { DEFAULT_PAGE } from "@/lib/products/playbook-ai/doc/page";
import { sequentialIds } from "@/lib/products/playbook-ai/doc/ids";
import { parseDoc } from "@/lib/products/playbook-ai/doc/validate";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { PbActor, PbError, PbResult } from "@/lib/products/playbook-ai/documents-types";
import { makeFactBag, type FactInput } from "@/lib/products/playbook-ai/ai/facts";
import { runSection } from "@/lib/products/playbook-ai/ai/generate";
import { checkAiLimits, finishRun, startRun } from "@/lib/products/playbook-ai/ai/runs";
import type { RawBlock } from "@/lib/products/playbook-ai/ai/schema";
import { DESCRIPTION_PLAN, ITEM_NEVER, ITEM_SECTIONS, KIND_DOC_TYPE_NAME, type GeneratedSection, type ItemDetails } from "@/lib/products/playbook-ai/item-sections";
import type { ItemKind } from "@/lib/products/playbook-ai/items-types";
import { recordPbAudit } from "@/lib/products/playbook-ai/pb-audit";
import { getPbSettings } from "@/lib/products/playbook-ai/pb-settings";

/**
 * AI generation for the create wizard (P3). One section per call, so the screen can show progress and regenerate a single section.
 * The model never writes into a saved document: the result goes back to the wizard as a draft, and only "Save" stores it. The engine is the
 * A11 one (fact bag, strict schema, fact guard, registry prompts, run log, per-user and per-company limits, metering).
 */

const fail = <T>(error: PbError): PbResult<T> => ({ ok: false, error });
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export async function generateItemSection(actor: PbActor, input: { kind: ItemKind; sectionKey: string; details: ItemDetails; instruction?: string }): Promise<PbResult<{ section: GeneratedSection }>> {
  if (!playbookCan(actor, "USE_AI")) return fail({ code: "forbidden", message: "You are not allowed to use AI drafting." });
  const plan = input.sectionKey === DESCRIPTION_PLAN.key ? DESCRIPTION_PLAN : ITEM_SECTIONS[input.kind]?.find((s) => s.key === input.sectionKey);
  if (!plan) return fail({ code: "not_found", message: "That section does not exist." });
  const d = input.details;
  const title = clip(d.title ?? "", 200);
  if (title.length < 3) return fail({ code: "invalid", message: "Give the item a title first.", issues: [] });

  const settings = await getPbSettings();
  const limited = await checkAiLimits(actor, settings.ai);
  if (limited) return fail(limited);

  const company = await loadCompanyValues();
  const src = (label: string) => ({ type: "input", ref: null, label });
  const facts: FactInput[] = [
    { key: "company.name", label: "Company name", value: company["company.name"], source: { type: "company_profile", ref: null, label: "Company profile" } },
    { key: "input.title", label: "Title", value: title, kind: "text", source: src("Details you entered") },
    { key: "input.department", label: "Department", value: clip(d.department ?? "", 120), kind: "text", source: src("Details you entered") },
    { key: "input.designation", label: "Designation or role", value: clip(d.designation ?? "", 120), kind: "text", source: src("Details you entered") },
    { key: "input.description", label: "Description", value: clip(d.description ?? "", 1500), kind: "text", source: src("Details you entered") },
    { key: "input.review_period", label: "Review period", value: clip(d.reviewPeriod ?? "", 80), kind: "text", source: src("Details you entered") },
  ];
  const bag = makeFactBag(facts);
  const runId = await startRun({ documentId: `wizard:${actor.id}`, sectionKey: plan.key, action: "generate", typeId: `item.${input.kind}`, templateRef: null, userId: actor.id, userName: actor.name || actor.email, baseSha: null });
  const t0 = Date.now();
  try {
    const out = await runSection({
      action: "generate", company: String(company["company.name"] ?? ""), docTitle: title, docTypeName: KIND_DOC_TYPE_NAME[input.kind],
      sectionKey: plan.key, sectionTitle: plan.title, currentBlocks: [], bag, missingFacts: [], instruction: input.instruction, legal: { review: false, statute: false },
      instructions: { tone: "formal", minWords: plan.minWords, maxWords: plan.maxWords, brief: plan.brief, allowedFacts: [], neverInvent: ITEM_NEVER },
      model: settings.ai.model, maxOutputTokens: settings.ai.maxOutputTokens,
    });
    await finishRun(runId, { status: "proposed", promptKey: out.promptKey, model: out.model, inputTokens: out.inputTokens, outputTokens: out.outputTokens, guard: out.guard, factKeys: out.usedFacts, missing: out.missing, placeholderCount: out.placeholders.length, durationMs: Date.now() - t0 });
    return { ok: true, section: { key: plan.key, title: plan.title, blocks: out.blocks, placeholders: out.placeholders, guardStatus: out.guard.status, warnings: out.warnings } };
  } catch (e) {
    const message = e instanceof Error && e.name === "SectionAiError" ? e.message : "The AI request failed. Try again in a moment.";
    await finishRun(runId, { status: "failed", error: message.slice(0, 500), durationMs: Date.now() - t0 });
    return fail({ code: "ai_failed", message });
  }
}

/** Puts the (possibly edited) sections together into one document, each under its numbered heading. */
export function assembleItemDoc(sections: { title: string; blocks: RawBlock[] }[]): PBDoc | null {
  const body: RawBlock[] = [];
  for (const s of sections) {
    body.push({ type: "heading", level: 1, content: [{ type: "text", text: s.title }] });
    body.push(...s.blocks);
  }
  const r = parseDoc({ schemaVersion: 1, lang: "en", page: DEFAULT_PAGE, header: [], footer: [], body }, { assignIds: true, idFactory: sequentialIds("g") });
  return r.ok ? r.doc : null;
}

export async function auditWizardAi(actor: PbActor, documentId: string, kind: ItemKind): Promise<void> {
  await recordPbAudit({ actor, action: "edit", entity: "document", entityId: documentId, documentId, summary: `Created from the ${kind} wizard with AI-written sections`, metadata: { kind } }).catch(() => {});
}
