"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/products/playbook-ai/tpl/actor";
import {
  acknowledgeStarterUpdate, archiveTemplate, cloneStarter, createTemplate, publishTemplate, restoreTemplate, saveTemplateDraft, setReview, type TplError,
} from "@/lib/products/playbook-ai/tpl/store";
import type { CategoryKey } from "@/lib/products/playbook-ai/catalogue/types";

/**
 * Server actions for the company's templates. Each re-checks its permission inside the data layer (MANAGE_TEMPLATES, REVIEW_TEMPLATES) and
 * returns a plain result: `{ ok: true, id, rev }` or `{ ok: false, error }` with the typed error, never an exception for an expected problem.
 */

export type TemplateActionResult = { ok: true; id: string; rev: number; reviewCleared?: boolean; version?: number } | { ok: false; error: TplError };

const done = (id: string, rev: number, extra: { reviewCleared?: boolean; version?: number } = {}): TemplateActionResult => {
  revalidatePath("/playbook-ai/my-templates");
  revalidatePath(`/playbook-ai/my-templates/${id}`);
  return { ok: true, id, rev, ...extra };
};

export async function cloneStarterAction(starterId: string, name?: string): Promise<TemplateActionResult> {
  const r = await cloneStarter(await requireActor(), starterId, name === undefined ? {} : { name });
  return r.ok ? done(r.template._id, r.template.rev) : r;
}

export async function createTemplateAction(name: string, category: CategoryKey): Promise<TemplateActionResult> {
  const r = await createTemplate(await requireActor(), { name, category });
  return r.ok ? done(r.template._id, r.template.rev) : r;
}

export async function saveTemplateAction(input: { id: string; rev: number; def: unknown; numberingPrefix?: unknown; approval?: unknown }): Promise<TemplateActionResult> {
  const r = await saveTemplateDraft(await requireActor(), input);
  return r.ok ? done(r.template._id, r.template.rev, { reviewCleared: r.reviewCleared }) : r;
}

export async function publishTemplateAction(id: string, note?: string): Promise<TemplateActionResult> {
  const r = await publishTemplate(await requireActor(), { id, note });
  return r.ok ? done(r.template._id, r.template.rev, { version: r.version }) : r;
}

export async function reviewTemplateAction(id: string, reviewed: boolean): Promise<TemplateActionResult> {
  const r = await setReview(await requireActor(), { id, reviewed });
  return r.ok ? done(r.template._id, r.template.rev) : r;
}

export async function archiveTemplateAction(id: string): Promise<TemplateActionResult> {
  const r = await archiveTemplate(await requireActor(), id);
  return r.ok ? done(r.template._id, r.template.rev) : r;
}

export async function restoreTemplateAction(id: string): Promise<TemplateActionResult> {
  const r = await restoreTemplate(await requireActor(), id);
  return r.ok ? done(r.template._id, r.template.rev) : r;
}

export async function dismissStarterUpdateAction(id: string): Promise<TemplateActionResult> {
  const r = await acknowledgeStarterUpdate(await requireActor(), id);
  return r.ok ? done(r.template._id, r.template.rev) : r;
}
