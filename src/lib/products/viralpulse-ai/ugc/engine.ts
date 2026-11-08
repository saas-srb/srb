import { parseOffer } from "./offer";
import "server-only";
import { newId, createStamp, updateStamp, notDeleted } from "@/lib/products/viralpulse-ai/db";
import { SmmsInputError, NotFoundError } from "@/lib/products/viralpulse-ai/viewer";
import { assemble } from "./assemble";
import { canProject, backoffMs, istDayStart, JOB_ACTIVE } from "./state";
import { capabilitiesFor, costUsd, DEFAULT_RESOLUTION, estimatePlan } from "./pricing";
import { policyCheck, policySummary, disclosureFor } from "./policy";
import { buildScenePrompt } from "./prompt";
import { generateScenePlan, briefFacts, PlanError } from "./script";
import { validatePlan } from "./validate";
import { applyCastToActors, castDirection, sanitizeCast } from "./cast";
import { looksLikeMp4, mp4DurationSecs } from "./mp4";
import { ProviderError, type RefImage } from "./providers/types";
import { getUgcSettings, jobsCollection, projectsCollection, getProjectDoc, NOT_SAMPLE, type Approval, type Estimate, type JobDoc, type PlanVersion, type ProjectDoc, type UgcSettings } from "./store";
import type { EngineDeps, Actor } from "./deps";
import type { ProductBrief, ProjectStatus, ScenePlan, UgcOptions } from "./types";

/**
 * The AI UGC Studio engine. State lives only in the database (projects + scene jobs), every step is a claim-first atomic update, and the
 * long work (polling providers, downloading, assembling) is done by `runUgcSweep`, which the cron job and a post-response kick both call.
 * No request ever has to stay alive while a video renders, and a restart resumes where it stopped.
 */

const MAX_VERSIONS = 20;
const LEASE_MS = 3 * 60_000;
const RUNNING_TIMEOUT_MS = 25 * 60_000;
const MAX_POLL_ERRORS = 8;
const MAX_REFERENCES = 3;

// ── helpers ─────────────────────────────────────────────────────────────

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => txt(x, max)).filter(Boolean).slice(0, n);

export function parseBrief(input: Record<string, unknown>): ProductBrief {
  const b: ProductBrief = {
    name: txt(input.name, 120),
    description: txt(input.description, 1500),
    keyPoints: list(input.keyPoints, 10, 240),
  };
  const audience = txt(input.audience, 300);
  const cta = txt(input.callToAction, 200);
  if (audience) b.audience = audience;
  if (cta) b.callToAction = cta;
  const offer = parseOffer(input.offer);
  if (offer) b.offer = offer;
  return b;
}

function assertBrief(b: ProductBrief) {
  if (!b.name) throw new SmmsInputError("Enter the product or business name.");
  if (b.description.length < 10) throw new SmmsInputError("Describe the product in a sentence or two. The video can only mention what you write here.");
}

export async function getProjectOrThrow(id: string): Promise<ProjectDoc> {
  return mustGet(id);
}

async function mustGet(id: string): Promise<ProjectDoc> {
  const p = await getProjectDoc(id);
  if (!p) throw new NotFoundError();
  return p;
}

async function setStatus(p: ProjectDoc, to: ProjectStatus, extra: Record<string, unknown> = {}, actorId: string | null = null) {
  if (!canProject(p.status, to)) throw new SmmsInputError(`This video can't go from "${p.status}" to "${to}".`);
  const col = await projectsCollection();
  const r = await col.updateOne({ _id: p._id, status: p.status }, { $set: { status: to, ...extra, ...updateStamp(actorId) } });
  if (r.modifiedCount === 0) throw new SmmsInputError("This video was just changed by someone else. Reload and try again.");
}

export async function spentTodayUsd(d: EngineDeps): Promise<number> {
  const col = await jobsCollection();
  const rows = await col
    .aggregate<{ _id: string; usd: number }>([
      { $match: { reservedAt: { $gte: istDayStart(d.now()) }, status: { $in: ["queued", "submitting", "running", "succeeded"] } } },
      { $group: { _id: "$status", usd: { $sum: { $cond: [{ $eq: ["$status", "succeeded"] }, "$costUsd", "$estimatedUsd"] } } } },
    ])
    .toArray();
  return Math.round(rows.reduce((a, r) => a + r.usd, 0) * 10000) / 10000;
}

function checkCaps(s: UgcSettings, spent: number, add: number) {
  if (!s.enabled) throw new SmmsInputError("AI UGC Studio is switched off for this workspace.");
  if (s.dailySpendCapUsd <= 0) throw new SmmsInputError("Video generation is set to 0 spend per day in the UGC settings.");
  if (spent + add > s.dailySpendCapUsd + 1e-9) {
    const left = Math.max(0, s.dailySpendCapUsd - spent);
    throw new SmmsInputError(`This would cost about $${add.toFixed(2)} but only $${left.toFixed(2)} is left of today's $${s.dailySpendCapUsd.toFixed(2)} video limit. Try a shorter video, or ask an admin to raise the limit.`);
  }
}

function planCtx(p: ProjectDoc, d: EngineDeps) {
  const style = d.resolveStyle(p.styleId);
  return { style, caps: capabilitiesFor(p.options.provider) };
}

function checkPlan(p: ProjectDoc, plan: ScenePlan, d: EngineDeps, factsUsed: Record<string, string[]> = p.factsUsed) {
  const { style, caps } = planCtx(p, d);
  const used: Record<number, string[]> = {};
  for (const [k, v] of Object.entries(factsUsed)) used[Number(k)] = v;
  const v = validatePlan(plan, { caps, totalRange: p.kind === "style-sample" ? undefined : style?.durationRange, maxActors: style?.actorCount ?? 3, briefFacts: briefFacts(plan.productBrief, p.providedFacts), factsUsed: used, offerStyle: p.kind === "style-sample" ? undefined : style ?? undefined });
  const policy = policyCheck(plan.productBrief, plan, { illustrativeStyle: style?.illustrative });
  return { validation: v, policy };
}

// ── projects ────────────────────────────────────────────────────────────

export interface CreateInput {
  title?: string;
  styleId: string;
  brief: Record<string, unknown>;
  providedFacts?: unknown;
  options?: Partial<UgcOptions>;
}

export async function createProject(input: CreateInput, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const settings = await getUgcSettings();
  if (!settings.enabled) throw new SmmsInputError("AI UGC Studio is switched off for this workspace.");
  const style = d.resolveStyle(input.styleId);
  if (!style) throw new SmmsInputError("Choose a video style.");
  const brief = parseBrief(input.brief);
  assertBrief(brief);
  const provider = input.options?.provider === "veo" ? "veo" : input.options?.provider === "omni" ? "omni" : settings.defaultProvider;
  const caps = capabilitiesFor(provider);
  const aspect = input.options?.aspect && style.aspects.includes(input.options.aspect) ? input.options.aspect : style.aspects[0];
  const model = input.options?.model && caps.models.includes(input.options.model) ? input.options.model : provider === settings.defaultProvider ? settings.defaultModel : caps.defaultModel;
  const targetSecs = Math.min(style.durationRange[1], Math.max(style.durationRange[0], Math.round(Number(input.options?.targetSecs) || style.durationRange[0])));
  const pos = input.options?.aiLabel?.position;
  const options: UgcOptions = {
    provider,
    model,
    aspect,
    language: txt(input.options?.language, 20) || "en",
    targetSecs,
    aiLabel: { enabled: input.options?.aiLabel?.enabled ?? settings.aiLabelDefault, position: pos === "top-left" || pos === "top-right" || pos === "bottom-left" || pos === "bottom-right" ? pos : "top-right" },
    burnCaptions: input.options?.burnCaptions ?? true,
  };
  const doc: ProjectDoc = {
    _id: newId(),
    title: txt(input.title, 120) || brief.name,
    styleId: style.id,
    brief,
    providedFacts: list(input.providedFacts, 10, 240),
    options,
    status: "draft",
    plan: null,
    planVersion: 0,
    factsUsed: {},
    versions: [],
    policy: null,
    illustrative: style.illustrative,
    estimate: null,
    pendingApproval: null,
    approvals: [],
    references: [],
    sceneGen: {},
    render: null,
    sceneMedia: {},
    spendUsd: 0,
    cancelRequested: false,
    error: null,
    finalizeLease: null,
    planCostUsd: 0,
    ...createStamp(actor.userId),
  };
  await (await projectsCollection()).insertOne(doc);
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "create", entity: "ugc", entityId: doc._id, entityLabel: doc.title, summary: `Created UGC video "${doc.title}" (${style.label})` });
  return doc;
}

const EDITABLE: ProjectStatus[] = ["draft", "scripted", "failed", "cancelled", "ready"];

export async function updateBrief(id: string, patch: { title?: string; brief?: Record<string, unknown>; providedFacts?: unknown; options?: Partial<UgcOptions> }, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (!EDITABLE.includes(p.status)) throw new SmmsInputError("Cancel the video first to change its brief.");
  const brief = patch.brief ? parseBrief({ ...p.brief, ...patch.brief }) : p.brief;
  assertBrief(brief);
  const style = d.resolveStyle(p.styleId);
  const o = patch.options ?? {};
  const options: UgcOptions = {
    ...p.options,
    language: o.language ? txt(o.language, 20) || p.options.language : p.options.language,
    aspect: o.aspect && style?.aspects.includes(o.aspect) ? o.aspect : p.options.aspect,
    targetSecs: o.targetSecs && style ? Math.min(style.durationRange[1], Math.max(style.durationRange[0], Math.round(o.targetSecs))) : p.options.targetSecs,
    aiLabel: { enabled: o.aiLabel?.enabled ?? p.options.aiLabel.enabled, position: o.aiLabel?.position ?? p.options.aiLabel.position },
    burnCaptions: o.burnCaptions ?? p.options.burnCaptions,
    provider: o.provider === "veo" || o.provider === "omni" ? o.provider : p.options.provider,
    model: p.options.model,
  };
  if (options.provider !== p.options.provider) options.model = capabilitiesFor(options.provider).defaultModel;
  else if (o.model && capabilitiesFor(options.provider).models.includes(o.model)) options.model = o.model;
  // A changed brief or provider makes the written script stale: back to draft so it must be regenerated, never silently reused.
  const briefChanged = JSON.stringify(brief) !== JSON.stringify(p.brief) || options.language !== p.options.language || options.provider !== p.options.provider || options.aspect !== p.options.aspect || options.targetSecs !== p.options.targetSecs;
  const col = await projectsCollection();
  const set: Record<string, unknown> = { brief, options, title: txt(patch.title, 120) || p.title, ...(patch.providedFacts !== undefined ? { providedFacts: list(patch.providedFacts, 10, 240) } : {}), ...updateStamp(actor.userId) };
  if (briefChanged && p.plan && p.status !== "draft") Object.assign(set, { status: "draft", estimate: null, pendingApproval: null });
  await col.updateOne({ _id: id, status: p.status }, { $set: set });
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "ugc", entityId: id, entityLabel: p.title, summary: "Updated the brief" });
  return mustGet(id);
}

/** Saves the cast and look chosen in the wizard. A changed cast makes a written script stale, so it goes back to draft like a changed brief. */
export async function setCast(id: string, cast: unknown, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (!EDITABLE.includes(p.status)) throw new SmmsInputError("Cancel the video first to change its cast.");
  const style = d.resolveStyle(p.styleId);
  if (!style) throw new SmmsInputError("This video's style is no longer available. Pick another style.");
  let next;
  try {
    next = sanitizeCast(style, cast);
  } catch (err) {
    throw new SmmsInputError((err as Error).message);
  }
  const changed = JSON.stringify({ ...next, seed: "" }) !== JSON.stringify({ ...(p.cast ?? {}), seed: "" });
  const set: Record<string, unknown> = { cast: next, ...updateStamp(actor.userId) };
  if (changed && p.plan && p.status !== "draft") Object.assign(set, { status: "draft", estimate: null, pendingApproval: null });
  await (await projectsCollection()).updateOne({ _id: id, status: p.status }, { $set: set });
  if (changed) await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "ugc", entityId: id, entityLabel: p.title, summary: "Chose the cast and look" });
  return mustGet(id);
}

/** Switches the video to another catalogue style: the cast and any script belong to the old style, so they are cleared and the project returns to draft. */
export async function changeStyle(id: string, styleId: string, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (!EDITABLE.includes(p.status)) throw new SmmsInputError("Cancel the video first to change its style.");
  if (styleId === p.styleId) return p;
  const style = d.resolveStyle(styleId);
  if (!style) throw new SmmsInputError("Choose a video style.");
  const options: UgcOptions = {
    ...p.options,
    aspect: style.aspects.includes(p.options.aspect) ? p.options.aspect : style.aspects[0],
    targetSecs: Math.min(style.durationRange[1], Math.max(style.durationRange[0], p.options.targetSecs)),
  };
  await (await projectsCollection()).updateOne(
    { _id: id, status: p.status },
    { $set: { styleId: style.id, options, cast: null, illustrative: style.illustrative, status: "draft", estimate: null, policy: null, pendingApproval: null, plan: null, factsUsed: {}, ...updateStamp(actor.userId) } },
  );
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "ugc", entityId: id, entityLabel: p.title, summary: `Changed the style to ${style.label}` });
  return mustGet(id);
}

function pushVersion(p: ProjectDoc, plan: ScenePlan, source: PlanVersion["source"], by: string, note: string): { versions: PlanVersion[]; planVersion: number } {
  const planVersion = p.planVersion + 1;
  return { planVersion, versions: [...p.versions, { version: planVersion, at: new Date(), by, source, note, plan }].slice(-MAX_VERSIONS) };
}

export async function generatePlan(id: string, actor: Actor, d: EngineDeps, opts: { instruction?: string } = {}): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (!EDITABLE.includes(p.status)) throw new SmmsInputError("Cancel the video first to rewrite its script.");
  const style = d.resolveStyle(p.styleId);
  if (!style) throw new SmmsInputError("This video's style is no longer available. Pick another style.");
  const settings = await getUgcSettings();
  let out;
  try {
    out = await generateScenePlan(p.brief, style, { aspect: p.options.aspect, language: p.options.language, targetSecs: p.options.targetSecs, caps: capabilitiesFor(p.options.provider), providedFacts: p.providedFacts, instruction: opts.instruction, previous: opts.instruction ? p.plan : null, direction: p.cast ? castDirection(p.cast) : undefined }, { llm: d.llm() });
  } catch (err) {
    if (err instanceof PlanError) throw new SmmsInputError(`${err.message}${err.errors.length ? ` (${err.errors.slice(0, 3).join(" ")})` : ""}`);
    throw err;
  }
  const factsUsed = Object.fromEntries(Object.entries(out.factsUsed).map(([k, v]) => [k, v]));
  // The people the client chose are written onto the script's actors (by position), so the cast never drifts from the wizard.
  if (p.cast) out.plan = { ...out.plan, actors: applyCastToActors(out.plan.actors, p.cast) };
  const { policy } = checkPlan(p, out.plan, d, factsUsed);
  const { versions, planVersion } = pushVersion(p, out.plan, "ai", actor.userId, opts.instruction ?? "");
  const estimate = estimatePlan(out.plan, p.options.provider, p.options.model, settings.pricePerSecUsd, planVersion);
  const col = await projectsCollection();
  const r = await col.updateOne(
    { _id: id, status: p.status },
    { $set: { plan: out.plan, factsUsed, versions, planVersion, policy, estimate, illustrative: policy.requiresIllustrativeNotice, status: "scripted", pendingApproval: null, error: null, cancelRequested: false, ...updateStamp(actor.userId) }, $inc: { planCostUsd: out.costUsd } }
  );
  if (r.modifiedCount === 0) throw new SmmsInputError("This video was just changed by someone else. Reload and try again.");
  await d.meter({ projectId: id, kind: "plan", seconds: 0, costUsd: out.costUsd, provider: "openai", model: out.model, own: true });
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "generate", entity: "ugc", entityId: id, entityLabel: p.title, summary: `Wrote the script (v${planVersion}, ${out.plan.scenes.length} scenes)`, metadata: { model: out.model, tokens: out.inputTokens + out.outputTokens, blocked: policy.blocked.length, flagged: policy.flagged.length } });
  return mustGet(id);
}

export async function editPlan(id: string, plan: ScenePlan, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (!EDITABLE.includes(p.status) || !p.plan) throw new SmmsInputError("Write the script first, and cancel any running video before editing it.");
  if (!plan || !Array.isArray(plan.scenes) || !Array.isArray(plan.actors)) throw new SmmsInputError("That script isn't valid.");
  // The user may edit the creative, never the product brief the facts are checked against, the style or the aspect.
  const next: ScenePlan = {
    ...plan,
    styleId: p.plan.styleId,
    aspect: p.plan.aspect,
    language: p.plan.language,
    productBrief: p.plan.productBrief,
    scenes: plan.scenes.map((s, i) => ({ ...s, index: i, dialogue: s.dialogue.map((l) => ({ ...l, language: l.language || p.plan!.language })) })),
  };
  const { validation, policy } = checkPlan(p, next, d, {});
  if (!validation.ok) throw new SmmsInputError(validation.errors.slice(0, 4).join(" "));
  const settings = await getUgcSettings();
  const { versions, planVersion } = pushVersion(p, next, "edit", actor.userId, "");
  const estimate = estimatePlan(next, p.options.provider, p.options.model, settings.pricePerSecUsd, planVersion);
  const col = await projectsCollection();
  const r = await col.updateOne({ _id: id, status: p.status }, { $set: { plan: next, factsUsed: {}, versions, planVersion, policy, estimate, illustrative: policy.requiresIllustrativeNotice, status: "scripted", pendingApproval: null, ...updateStamp(actor.userId) } });
  if (r.modifiedCount === 0) throw new SmmsInputError("This video was just changed by someone else. Reload and try again.");
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "ugc", entityId: id, entityLabel: p.title, summary: `Edited the script (v${planVersion})`, metadata: { blocked: policy.blocked.length, flagged: policy.flagged.length } });
  return mustGet(id);
}

export async function restoreVersion(id: string, version: number, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  const v = p.versions.find((x) => x.version === version);
  if (!v) throw new NotFoundError();
  return editPlan(id, v.plan, actor, d);
}

export async function estimateProject(id: string): Promise<Estimate> {
  const p = await mustGet(id);
  if (!p.plan) throw new SmmsInputError("Write the script first.");
  const settings = await getUgcSettings();
  const est = estimatePlan(p.plan, p.options.provider, p.options.model, settings.pricePerSecUsd, p.planVersion);
  await (await projectsCollection()).updateOne({ _id: id }, { $set: { estimate: est } });
  return est;
}

// ── consent for reference photos ───────────────────────────────────────

export interface Attestation {
  /** I own this photo or have the written consent of every person in it to be used for AI video. */
  hasConsent: boolean;
  /** No person in it is a public figure, celebrity or politician, and nobody in it is under 18. */
  notPublicFigureOrMinor: boolean;
}

export async function addReference(id: string, mediaId: string, att: Attestation, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (!EDITABLE.includes(p.status)) throw new SmmsInputError("Cancel the video first to change its reference photos.");
  if (!att.hasConsent || !att.notPublicFigureOrMinor) throw new SmmsInputError("Confirm both statements first: you have consent from everyone in the photo, and nobody in it is a public figure or under 18.");
  if (capabilitiesFor(p.options.provider).maxReferenceImages === 0) throw new SmmsInputError("The selected video model can't use reference photos. Switch to Gemini Omni Flash.");
  if (p.references.length >= MAX_REFERENCES) throw new SmmsInputError(`At most ${MAX_REFERENCES} reference photos.`);
  if (p.references.some((r) => r.mediaId === mediaId)) throw new SmmsInputError("That photo is already attached.");
  const m = await d.mediaInfo(mediaId);
  if (!m || m.kind !== "image") throw new SmmsInputError("Pick an image from the media library.");
  if (m.ai) throw new SmmsInputError("Reference photos must be real photos you have consent for, not AI images.");
  const consent = { userId: actor.userId, email: actor.email, at: d.now(), mediaId, statement: "I confirm I own this photo or hold written consent from every person in it to use their likeness for AI-generated video, that nobody in it is a public figure, celebrity or politician, and that nobody in it is under 18." };
  const col = await projectsCollection();
  await col.updateOne({ _id: id, status: p.status }, { $push: { references: { mediaId, consent } }, $set: updateStamp(actor.userId) });
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "ugc", entityId: id, entityLabel: p.title, summary: "Attached a reference photo with a consent attestation", metadata: { mediaId } });
  return mustGet(id);
}

export async function removeReference(id: string, mediaId: string, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (!EDITABLE.includes(p.status)) throw new SmmsInputError("Cancel the video first to change its reference photos.");
  await (await projectsCollection()).updateOne({ _id: id }, { $pull: { references: { mediaId } }, $set: updateStamp(actor.userId) });
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "ugc", entityId: id, entityLabel: p.title, summary: "Removed a reference photo", metadata: { mediaId } });
  return mustGet(id);
}

// ── approve and generate ────────────────────────────────────────────────

export type ApproveResult = { outcome: "started"; project: ProjectDoc } | { outcome: "needs_manager"; estimateUsd: number; thresholdUsd: number; project: ProjectDoc };

export async function approveAndGenerate(id: string, actor: Actor, d: EngineDeps, opts: { acknowledgeFlags?: string[] } = {}): Promise<ApproveResult> {
  const p = await mustGet(id);
  if (p.status !== "scripted" || !p.plan) throw new SmmsInputError(p.status === "generating" || p.status === "approved" ? "This video is already being generated." : "Write and review the script before generating.");
  const settings = await getUgcSettings();
  const { validation, policy } = checkPlan(p, p.plan, d);
  if (!validation.ok) throw new SmmsInputError(`Fix the script first: ${validation.errors.slice(0, 3).join(" ")}`);
  if (!policy.ok) throw new SmmsInputError(`This video can't be generated: ${policySummary({ ...policy, flagged: [] })}`);
  const ack = new Set(opts.acknowledgeFlags ?? []);
  const unack = policy.flagged.filter((f) => !ack.has(f.code));
  if (unack.length) throw new SmmsInputError(`Review and acknowledge these points first: ${unack.map((f) => f.message).join(" ")}`);
  const caps = capabilitiesFor(p.options.provider);
  if (p.references.length && caps.maxReferenceImages === 0) throw new SmmsInputError("The selected video model can't use reference photos.");
  await d.getProvider(p.options.provider); // fails early with a plain message when the Gemini key isn't connected
  const est = estimatePlan(p.plan, p.options.provider, p.options.model, settings.pricePerSecUsd, p.planVersion);
  checkCaps(settings, await spentTodayUsd(d), est.usd);

  if (est.usd > settings.approvalThresholdUsd && !actor.canApprove) {
    const col = await projectsCollection();
    await col.updateOne({ _id: id, status: "scripted" }, { $set: { pendingApproval: { by: actor.userId, email: actor.email, at: d.now(), estimateUsd: est.usd }, estimate: est } });
    await d.notify(await d.managerIds(), { type: "smms_ugc_approval", title: `Approve video spend: ${p.title}`, body: `About $${est.usd.toFixed(2)} for ${est.totalSecs}s of AI video. Over the $${settings.approvalThresholdUsd.toFixed(2)} limit that needs a manager.`, link: `/viralpulse-ai/ugc/${id}` });
    await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "status", entity: "ugc", entityId: id, entityLabel: p.title, summary: `Asked a manager to approve about $${est.usd.toFixed(2)}`, metadata: { estimateUsd: est.usd } });
    return { outcome: "needs_manager", estimateUsd: est.usd, thresholdUsd: settings.approvalThresholdUsd, project: await mustGet(id) };
  }

  const approval: Approval = { by: actor.userId, email: actor.email, at: d.now(), estimateUsd: est.usd, planVersion: p.planVersion, scope: "project", flagsAcknowledged: [...ack] };
  const col = await projectsCollection();
  // Claim first: only one approval can move this exact plan version from "scripted" to "approved".
  const claim = await col.updateOne({ _id: id, status: "scripted", planVersion: p.planVersion }, { $set: { status: "approved", estimate: est, pendingApproval: null, error: null, cancelRequested: false, ...updateStamp(actor.userId) }, $push: { approvals: approval } });
  if (claim.modifiedCount === 0) throw new SmmsInputError("This video was just changed or already approved. Reload and check.");
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "approve", entity: "ugc", entityId: id, entityLabel: p.title, summary: `Approved and started generating: ${est.totalSecs}s, estimated $${est.usd.toFixed(2)}`, metadata: { estimateUsd: est.usd, provider: p.options.provider, model: p.options.model, scenes: est.perScene.length } });
  await createJobs(await mustGet(id), p.plan.scenes.map((s) => s.index), d, settings);
  return { outcome: "started", project: await mustGet(id) };
}

/** Idempotent: a job's requestKey is projectId:scene:generation, unique, so a repeated call (or a crash and a sweep) never double-creates. */
async function createJobs(p: ProjectDoc, indexes: number[], d: EngineDeps, settings: UgcSettings, note = "") {
  const plan = p.plan!;
  const style = d.resolveStyle(p.styleId);
  const col = await jobsCollection();
  const gens: Record<string, number> = { ...p.sceneGen };
  for (const idx of indexes) {
    const scene = plan.scenes[idx];
    const generation = (p.sceneGen[String(idx)] ?? 0) + 1;
    gens[String(idx)] = generation;
    const prompt = buildScenePrompt(plan, scene, { promptTag: style?.promptTag, negativeCues: style?.negativeCues, realismCues: style?.realismCues, cap: style?.promptCharCap && style.promptCharCap > 900 ? style.promptCharCap : 3500 });
    const job: JobDoc = {
      _id: newId(),
      projectId: p._id,
      sceneIndex: idx,
      generation,
      requestKey: `${p._id}:${idx}:${generation}`,
      planVersion: p.planVersion,
      status: "queued",
      provider: p.options.provider,
      model: p.options.model,
      providerJobId: null,
      prompt: note ? `${prompt}\nDirector's note: ${note}` : prompt,
      aspect: plan.aspect === "16:9" ? "16:9" : "9:16",
      resolution: DEFAULT_RESOLUTION,
      durationSecs: scene.durationSecs,
      attempts: 0,
      maxAttempts: settings.maxAttemptsPerScene,
      nextAttemptAt: d.now(),
      lease: null,
      pollErrors: 0,
      error: null,
      errorCode: null,
      estimatedUsd: costUsd(p.options.provider, p.options.model, scene.durationSecs, settings.pricePerSecUsd),
      costUsd: 0,
      actualSecs: null,
      mediaId: null,
      storageKey: null,
      reservedAt: d.now(),
      submittedAt: null,
      finishedAt: null,
      ...createStamp(null),
    };
    try {
      await col.insertOne(job);
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err; // already created by an earlier attempt
    }
  }
  await (await projectsCollection()).updateOne({ _id: p._id, status: { $in: ["approved", "ready", "failed", "generating"] } }, { $set: { sceneGen: gens, status: "generating", error: null, cancelRequested: false, updatedAt: d.now() } });
}

export async function regenerateScene(id: string, sceneIndex: number, actor: Actor, d: EngineDeps, opts: { note?: string; acknowledgeFlags?: string[] } = {}): Promise<ApproveResult> {
  const p = await mustGet(id);
  if (!p.plan || !p.plan.scenes[sceneIndex]) throw new NotFoundError();
  if (p.status !== "ready" && p.status !== "failed") throw new SmmsInputError("A scene can be redone once the video has finished or failed.");
  const settings = await getUgcSettings();
  const note = txt(opts.note, 300);
  if (note) {
    const pol = policyCheck(p.plan.productBrief, null);
    const f = policyCheck({ ...p.plan.productBrief, name: note, description: note, keyPoints: [] }, null);
    if (!f.ok || !pol.ok) throw new SmmsInputError(`That note can't be used: ${policySummary(f.ok ? pol : f)}`);
  }
  const est = estimatePlan(p.plan, p.options.provider, p.options.model, settings.pricePerSecUsd, p.planVersion, [sceneIndex]);
  checkCaps(settings, await spentTodayUsd(d), est.usd);
  await d.getProvider(p.options.provider);
  if (est.usd > settings.approvalThresholdUsd && !actor.canApprove) {
    await d.notify(await d.managerIds(), { type: "smms_ugc_approval", title: `Approve scene redo: ${p.title}`, body: `About $${est.usd.toFixed(2)} for scene ${sceneIndex + 1}.`, link: `/viralpulse-ai/ugc/${id}` });
    return { outcome: "needs_manager", estimateUsd: est.usd, thresholdUsd: settings.approvalThresholdUsd, project: p };
  }
  const approval: Approval = { by: actor.userId, email: actor.email, at: d.now(), estimateUsd: est.usd, planVersion: p.planVersion, scope: `scene:${sceneIndex}`, flagsAcknowledged: opts.acknowledgeFlags ?? [] };
  const col = await projectsCollection();
  // Claim: only the current "ready"/"failed" state may start one redo.
  const claim = await col.updateOne({ _id: id, status: p.status, planVersion: p.planVersion }, { $set: { status: "approved", ...updateStamp(actor.userId) }, $push: { approvals: approval } });
  if (claim.modifiedCount === 0) throw new SmmsInputError("This video was just changed. Reload and try again.");
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "regenerate", entity: "ugc", entityId: id, entityLabel: p.title, summary: `Redoing scene ${sceneIndex + 1}, estimated $${est.usd.toFixed(2)}`, metadata: { estimateUsd: est.usd, scene: sceneIndex } });
  await createJobs(await mustGet(id), [sceneIndex], d, settings, note);
  return { outcome: "started", project: await mustGet(id) };
}

/** Retry just the assembly (or any scenes that failed) without paying again for scenes that already rendered: only valid when every scene's latest job succeeded. */
export async function resumeProject(id: string, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (p.status !== "failed") throw new SmmsInputError("Only a failed video can be resumed.");
  const jobs = await latestJobs(p);
  if (jobs.length === 0 || jobs.some((j) => j.status !== "succeeded")) throw new SmmsInputError("Some scenes failed to render. Redo those scenes instead.");
  await setStatus(p, "generating", { error: null, finalizeLease: null }, actor.userId);
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "status", entity: "ugc", entityId: id, entityLabel: p.title, summary: "Retrying the final assembly" });
  return mustGet(id);
}

export async function latestJobs(p: ProjectDoc): Promise<JobDoc[]> {
  const col = await jobsCollection();
  const all = await col.find({ projectId: p._id }).sort({ sceneIndex: 1, generation: -1 }).toArray();
  const out: JobDoc[] = [];
  const seen = new Set<number>();
  for (const j of all) {
    if (seen.has(j.sceneIndex)) continue;
    if (j.generation !== (p.sceneGen[String(j.sceneIndex)] ?? j.generation)) continue;
    seen.add(j.sceneIndex);
    out.push(j);
  }
  return out;
}

// ── cancel ─────────────────────────────────────────────────────────────

export async function cancelProject(id: string, actor: Actor, d: EngineDeps): Promise<ProjectDoc> {
  const p = await mustGet(id);
  if (p.status === "cancelled") return p;
  if (!canProject(p.status, "cancelled")) throw new SmmsInputError("Only a video that hasn't finished can be cancelled.");
  const col = await projectsCollection();
  await col.updateOne({ _id: id }, { $set: { cancelRequested: true, ...updateStamp(actor.userId) } });
  await settleCancel(await mustGet(id), d);
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "status", entity: "ugc", entityId: id, entityLabel: p.title, summary: "Cancelled" });
  return mustGet(id);
}

async function settleCancel(p: ProjectDoc, d: EngineDeps) {
  const jobs = await jobsCollection();
  const active = await jobs.find({ projectId: p._id, status: { $in: JOB_ACTIVE } }).toArray();
  for (const j of active) {
    if (j.providerJobId) {
      try {
        await (await d.getProvider(j.provider as "omni" | "veo")).cancel(j.providerJobId);
      } catch {
        /* provider unreachable: the job is still marked cancelled here and never polled again */
      }
    }
    await jobs.updateOne({ _id: j._id, status: { $in: JOB_ACTIVE } }, { $set: { status: "cancelled", lease: null, finishedAt: d.now(), error: "Cancelled" } });
  }
  const col = await projectsCollection();
  await col.updateOne({ _id: p._id, status: { $in: ["draft", "scripted", "approved", "generating"] } }, { $set: { status: "cancelled", pendingApproval: null } });
}

export async function deleteProject(id: string, actor: Actor, d: EngineDeps): Promise<void> {
  const p = await mustGet(id);
  if (p.status === "generating" || p.status === "approved") throw new SmmsInputError("Cancel the video before deleting it.");
  await (await projectsCollection()).updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actor.userId) } });
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "delete", entity: "ugc", entityId: id, entityLabel: p.title, summary: "Deleted" });
}

// ── the sweep: submit, poll, retry, finish ────────────────────────────

export interface SweepResult {
  projects: number;
  submitted: number;
  succeeded: number;
  retried: number;
  failed: number;
  finished: number;
}

export async function runUgcSweep(d: EngineDeps, opts: { projectId?: string; budgetMs?: number } = {}): Promise<SweepResult> {
  const res: SweepResult = { projects: 0, submitted: 0, succeeded: 0, retried: 0, failed: 0, finished: 0 };
  const started = Date.now();
  const col = await projectsCollection();
  const filter = opts.projectId ? { _id: opts.projectId, ...notDeleted } : { status: { $in: ["approved", "generating"] as ProjectStatus[] }, ...notDeleted };
  const projects = await col.find(filter).sort({ updatedAt: 1 }).limit(25).toArray();
  const settings = await getUgcSettings();
  for (const p of projects) {
    if (Date.now() - started > (opts.budgetMs ?? 240_000)) break;
    if (p.status !== "approved" && p.status !== "generating") continue;
    res.projects++;
    try {
      await processProject(p._id, d, settings, res);
    } catch (err) {
      console.error("[ugc sweep]", p._id, (err as Error).message);
    }
  }
  return res;
}

async function claimLease(col: Awaited<ReturnType<typeof jobsCollection>>, filter: Record<string, unknown>, d: EngineDeps, extra: Record<string, unknown> = {}, inc?: Record<string, number>) {
  const token = d.token();
  const now = d.now();
  const job = await col.findOneAndUpdate(
    { ...filter, $or: [{ lease: null }, { "lease.until": { $lt: now } }] },
    { $set: { lease: { token, until: new Date(now.getTime() + LEASE_MS) }, ...extra }, ...(inc ? { $inc: inc } : {}) },
    { returnDocument: "after" }
  );
  return job ? { job, token } : null;
}

async function processProject(id: string, d: EngineDeps, settings: UgcSettings, res: SweepResult) {
  let p = await mustGet(id);
  const jobs = await jobsCollection();
  const now = d.now();

  if (p.status === "approved") {
    // Crash between "approved" and the jobs being created: create them now (idempotent).
    if (p.plan && now.getTime() - p.updatedAt.getTime() > 30_000) await createJobs(p, p.plan.scenes.map((s) => s.index), d, settings);
    return;
  }
  if (p.cancelRequested) {
    await settleCancel(p, d);
    return;
  }
  // A submit that died before recording the provider id: put it back in the queue (the attempt stays counted).
  await jobs.updateMany({ projectId: id, status: "submitting", providerJobId: null, "lease.until": { $lt: now } }, { $set: { status: "queued", lease: null, error: "Interrupted; retrying", nextAttemptAt: new Date(now.getTime() + 5000) } });

  const current = await latestJobs(p);

  // 1. poll running jobs
  for (const j of current.filter((x) => x.status === "running")) await pollJob(j, p, d, res);

  // 2. submit due queued jobs within the concurrency and spend limits
  p = await mustGet(id);
  if (p.status !== "generating") return;
  const queued = (await latestJobs(p)).filter((x) => x.status === "queued" && x.nextAttemptAt <= d.now());
  if (queued.length) {
    const active = await jobs.countDocuments({ status: { $in: ["submitting", "running"] } });
    let slots = Math.max(0, settings.maxConcurrentJobs - active);
    let spent = -1;
    for (const j of queued) {
      if (slots <= 0) break;
      if (j.attempts > 0) {
        // A retry is spend that was not reserved by the first attempt only if the first was billed; keep the daily cap honest anyway.
        if (spent < 0) spent = await spentTodayUsd(d);
        if (spent > settings.dailySpendCapUsd + 1e-9) continue;
      }
      if (await submitJob(j, p, d, res)) slots--;
    }
  }

  // 3. finish
  p = await mustGet(id);
  if (p.status !== "generating") return;
  const now2 = await latestJobs(p);
  if (now2.length === 0 || now2.some((j) => JOB_ACTIVE.includes(j.status))) return;
  if (now2.some((j) => j.status === "cancelled")) {
    await settleCancel(p, d);
    return;
  }
  const bad = now2.filter((j) => j.status === "failed");
  if (bad.length) {
    const msg = `Scene ${bad.map((b) => b.sceneIndex + 1).join(", ")} couldn't be rendered: ${bad[0].error ?? "unknown error"}`;
    const upd = await (await projectsCollection()).updateOne({ _id: id, status: "generating" }, { $set: { status: "failed", error: msg, updatedAt: d.now() } });
    if (upd.modifiedCount) {
      res.failed++;
      if (p.createdBy) await d.notify([p.createdBy], { type: "smms_ugc_failed", title: `Video failed: ${p.title}`, body: msg, link: `/viralpulse-ai/ugc/${id}` });
      await d.audit({ actorId: "system", actorEmail: null, action: "status", entity: "ugc", entityId: id, entityLabel: p.title, summary: `Failed: ${msg.slice(0, 160)}` });
    }
    return;
  }
  await finalize(p, now2, d, res);
}

async function submitJob(j: JobDoc, p: ProjectDoc, d: EngineDeps, res: SweepResult): Promise<boolean> {
  const jobs = await jobsCollection();
  const claimed = await claimLease(jobs, { _id: j._id, status: "queued", nextAttemptAt: { $lte: d.now() } }, d, { status: "submitting" }, { attempts: 1 });
  if (!claimed) return false; // someone else has it
  const { job, token } = claimed;
  try {
    const provider = await d.getProvider(job.provider as "omni" | "veo");
    const refs: RefImage[] = [];
    if (provider.capabilities.maxReferenceImages > 0) for (const r of p.references.slice(0, provider.capabilities.maxReferenceImages)) {
      const img = await d.readReference(r.mediaId);
      if (img) refs.push(img);
    }
    const { providerJobId } = await provider.submit({ prompt: job.prompt, aspect: job.aspect, durationSecs: job.durationSecs, resolution: job.resolution, model: job.model, referenceImages: refs.length ? refs : undefined });
    const upd = await jobs.updateOne({ _id: job._id, status: "submitting", "lease.token": token }, { $set: { status: "running", providerJobId, lease: null, submittedAt: d.now(), error: null, errorCode: null, pollErrors: 0 } });
    if (upd.modifiedCount === 0) await provider.cancel(providerJobId); // cancelled while the request was in flight: don't leave a paid orphan
    else res.submitted++;
    return true;
  } catch (err) {
    await failOrRetry(job, token, err, d, res);
    return true;
  }
}

function toFailure(err: unknown) {
  if (err instanceof ProviderError) return err.failure;
  const msg = (err as Error)?.message ?? "";
  if (/OpenAI|Gemini|Connect your/i.test(msg)) return { code: "auth" as const, retryable: false, message: msg };
  return { code: "provider_error" as const, retryable: true, message: "Something went wrong talking to the video provider. It will be retried automatically." };
}

async function failOrRetry(job: JobDoc, token: string, err: unknown, d: EngineDeps, res: SweepResult) {
  const f = toFailure(err);
  const jobs = await jobsCollection();
  const retry = f.retryable && job.attempts < job.maxAttempts;
  if (retry) {
    await jobs.updateOne({ _id: job._id, "lease.token": token }, { $set: { status: "queued", providerJobId: null, lease: null, error: f.message, errorCode: f.code, nextAttemptAt: new Date(d.now().getTime() + backoffMs(job.attempts)) } });
    res.retried++;
  } else {
    await jobs.updateOne({ _id: job._id, "lease.token": token }, { $set: { status: "failed", lease: null, error: f.message, errorCode: f.code, finishedAt: d.now() } });
    res.failed++;
  }
}

async function pollJob(j: JobDoc, p: ProjectDoc, d: EngineDeps, res: SweepResult) {
  const jobs = await jobsCollection();
  const claimed = await claimLease(jobs, { _id: j._id, status: "running" }, d);
  if (!claimed || !claimed.job.providerJobId) return;
  const { job, token } = claimed;
  try {
    const provider = await d.getProvider(job.provider as "omni" | "veo");
    const st = await provider.poll(job.providerJobId!);
    if (st.state === "running") {
      if (job.submittedAt && d.now().getTime() - job.submittedAt.getTime() > RUNNING_TIMEOUT_MS) {
        await provider.cancel(job.providerJobId!);
        await failOrRetry(job, token, new ProviderError({ code: "timeout", retryable: true, message: "The video took too long to render. It will be retried automatically." }), d, res);
      } else await jobs.updateOne({ _id: job._id, "lease.token": token }, { $set: { lease: null, pollErrors: 0 } });
      return;
    }
    if (st.state === "cancelled") {
      await jobs.updateOne({ _id: job._id, "lease.token": token }, { $set: { status: "cancelled", lease: null, finishedAt: d.now() } });
      return;
    }
    if (st.state === "failed") {
      await failOrRetry(job, token, new ProviderError(st.error), d, res);
      return;
    }
    // succeeded: download immediately (providers drop their files after hours or days), check it, store it
    const file = await provider.fetchResult(job.providerJobId!);
    if (!looksLikeMp4(file.data)) throw new ProviderError({ code: "provider_error", retryable: true, message: "The provider returned a file that isn't a valid video. It will be retried automatically." });
    const actual = mp4DurationSecs(file.data) ?? job.durationSecs;
    const settings = await getUgcSettings();
    const cost = costUsd(job.provider as "omni" | "veo", job.model, actual, settings.pricePerSecUsd, job.resolution);
    const saved = await d.saveClip(file.data, { projectId: p._id, sceneIndex: job.sceneIndex, provider: job.provider, model: job.model, prompt: job.prompt, durationSecs: actual, aspect: job.aspect, name: `${p.title} - scene ${job.sceneIndex + 1}` }, p.createdBy ?? "system");
    const upd = await jobs.updateOne({ _id: job._id, "lease.token": token, status: "running" }, { $set: { status: "succeeded", lease: null, costUsd: cost, actualSecs: actual, mediaId: saved.mediaId, storageKey: saved.storageKey, finishedAt: d.now(), error: null } });
    if (upd.modifiedCount === 0) return;
    await (await projectsCollection()).updateOne({ _id: p._id }, { $inc: { spendUsd: cost }, $set: { [`sceneMedia.${job.sceneIndex}`]: saved.mediaId } });
    await d.meter({ projectId: p._id, kind: "video", seconds: actual, costUsd: cost, provider: job.provider, model: job.model, own: true });
    res.succeeded++;
  } catch (err) {
    const f = toFailure(err);
    if (err instanceof ProviderError && f.retryable && !f.code.startsWith("timeout")) {
      // A hiccup while polling or downloading: leave the job running and look again next sweep, up to a limit.
      const n = job.pollErrors + 1;
      if (n < MAX_POLL_ERRORS) {
        await jobs.updateOne({ _id: job._id, "lease.token": token }, { $set: { lease: null, pollErrors: n } });
        return;
      }
    }
    await failOrRetry(job, token, err, d, res);
  }
}

async function finalize(p: ProjectDoc, jobsDone: JobDoc[], d: EngineDeps, res: SweepResult) {
  const col = await projectsCollection();
  const token = d.token();
  const now = d.now();
  const lease = await col.findOneAndUpdate({ _id: p._id, status: "generating", $or: [{ finalizeLease: null }, { "finalizeLease.until": { $lt: now } }] }, { $set: { finalizeLease: { token, until: new Date(now.getTime() + 5 * 60_000) } } }, { returnDocument: "after" });
  if (!lease) return;
  const plan = lease.plan!;
  try {
    const ordered = [...jobsDone].sort((a, b) => a.sceneIndex - b.sceneIndex);
    const durations = ordered.map((j) => j.actualSecs ?? j.durationSecs);
    const total = durations.reduce((a, b) => a + b, 0);
    const label = lease.options.aiLabel;
    const overlays = lease.options.burnCaptions || label.enabled || lease.illustrative;
    const run = await d.ffmpeg();
    let render: ProjectDoc["render"];
    const disclosureRequired = true;
    if (run) {
      const clips = await Promise.all(ordered.map((j) => d.readBlob(j.storageKey!)));
      const out = await assemble({ clips, clipDurations: durations, plan, captions: lease.options.burnCaptions, aiLabel: label, illustrativeNotice: lease.illustrative }, run);
      const saved = await d.saveRender({ video: out.video, thumbnail: out.thumbnail, projectId: p._id, provider: lease.options.provider, model: lease.options.model, name: lease.title, aspect: plan.aspect, durationSecs: out.durationSecs, script: scriptText(plan), caption: "", disclosureRequired }, lease.createdBy ?? "system");
      render = { mediaId: saved.mediaId, thumbnailId: saved.thumbnailId, durationSecs: out.durationSecs, strategy: ordered.length === 1 ? "single" : "assembled", labelBurned: label.enabled, captionsBurned: lease.options.burnCaptions, srt: out.srt, at: d.now() };
    } else if (ordered.length === 1 && !overlays) {
      render = { mediaId: ordered[0].mediaId, thumbnailId: null, durationSecs: total, strategy: "single", labelBurned: false, captionsBurned: false, srt: "", at: d.now() };
    } else {
      // No ffmpeg on this server: keep the scene clips (already in the media library, flagged AI) and say so. Nothing is faked.
      render = { mediaId: ordered.length === 1 ? ordered[0].mediaId : null, thumbnailId: null, durationSecs: total, strategy: ordered.length === 1 ? "single" : "clips-only", labelBurned: false, captionsBurned: false, srt: "", at: d.now() };
    }
    const upd = await col.updateOne({ _id: p._id, status: "generating", "finalizeLease.token": token }, { $set: { status: "ready", render, finalizeLease: null, error: render.strategy === "clips-only" ? "The scenes are rendered, but this server can't join them into one video (ffmpeg isn't available). Each scene is in the media library." : null, updatedAt: d.now() } });
    if (upd.modifiedCount) {
      res.finished++;
      if (lease.createdBy) await d.notify([lease.createdBy], { type: "smms_ugc_ready", title: `Video ready: ${lease.title}`, body: `${Math.round(total)}s, ${render.strategy === "clips-only" ? "scene clips" : "final video"} in the media library.`, link: `/viralpulse-ai/ugc/${p._id}` });
      await d.audit({ actorId: "system", actorEmail: null, action: "generate", entity: "ugc", entityId: p._id, entityLabel: lease.title, summary: `Video ready (${render.strategy}, ${Math.round(total)}s, $${lease.spendUsd.toFixed(2)})`, metadata: { provider: lease.options.provider, model: lease.options.model, aiGenerated: true } });
    }
  } catch (err) {
    await col.updateOne({ _id: p._id, status: "generating", "finalizeLease.token": token }, { $set: { status: "failed", finalizeLease: null, error: `Putting the scenes together failed: ${(err as Error).message.slice(0, 200)}. The scene clips are kept; use "retry" to try again.`, updatedAt: d.now() } });
    res.failed++;
  }
}

export function scriptText(plan: ScenePlan): string {
  const name = new Map(plan.actors.map((a) => [a.id, a.label]));
  return plan.scenes.map((s, i) => `Scene ${i + 1} (${s.durationSecs}s): ${s.setting}\n${s.dialogue.map((l) => `${name.get(l.speakerId) ?? l.speakerId}: ${l.text}`).join("\n")}`).join("\n\n");
}

// ── attach to post ─────────────────────────────────────────────────────

export async function attachToPost(id: string, postId: string, actor: Actor, d: EngineDeps): Promise<{ postTitle: string; mediaId: string; suffixes: { platform: string; action: string; captionSuffix: string }[]; labelBurned: boolean }> {
  const p = await mustGet(id);
  if (!p.render?.mediaId) throw new SmmsInputError(p.render ? "This video was rendered as separate scene clips, not one video. Attach a scene clip from the media library instead." : "The video isn't finished yet.");
  const info = await d.mediaInfo(p.render.mediaId);
  if (!info || info.kind !== "video") throw new NotFoundError();
  if (!info.ai) throw new SmmsInputError("This media item has lost its AI-generated flag and can't be attached.");
  const post = await d.attachMedia(postId, p.render.mediaId, p.render.thumbnailId, actor.userId);
  const suffixes = post.platforms.map((pl) => {
    const x = disclosureFor(pl, p.options.language);
    return { platform: pl, action: x.action, captionSuffix: x.captionSuffix };
  });
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "post", entityId: postId, entityLabel: post.title, summary: `Attached AI-generated video from UGC project "${p.title}"`, metadata: { projectId: id, mediaId: p.render.mediaId, aiGenerated: true } });
  return { postTitle: post.title, mediaId: p.render.mediaId, suffixes, labelBurned: p.render.labelBurned };
}

export async function listProjectDocs(filter: { status?: ProjectStatus } = {}, limit = 50): Promise<ProjectDoc[]> {
  return (await projectsCollection()).find({ ...notDeleted, ...NOT_SAMPLE, ...(filter.status ? { status: filter.status } : {}) }, { projection: { versions: 0 } }).sort({ updatedAt: -1 }).limit(Math.min(limit, 100)).toArray() as Promise<ProjectDoc[]>;
}
