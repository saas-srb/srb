import "server-only";
import { newId, createStamp, updateStamp, notDeleted } from "@/lib/products/viralpulse-ai/db";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { approveAndGenerate, spentTodayUsd } from "./engine";
import { capabilitiesFor, estimatePlan } from "./pricing";
import { policyCheck, policySummary } from "./policy";
import { buildSamplePlan, sampleBrief, sampleKeyFor, sanitizeSeed, type SampleQuote, type SampleView } from "./sample";
import { pickVariation } from "./styles/variation";
import { getUgcSettings, projectsCollection, type ProjectDoc } from "./store";
import type { Actor, EngineDeps } from "./deps";
import type { UgcOptions } from "./types";

/**
 * Style samples: one optional, paid, short AI clip per (style, variation), company-wide. It is stored as a normal project with
 * `kind: "style-sample"`, so it goes through exactly the same checks as any video: content policy, the company's Gemini key, the daily
 * cap, the manager threshold, the job queue and the AI label. Nothing here ever runs by itself: every sample starts from an explicit
 * confirmation of the exact estimate.
 */

const KIND = "style-sample" as const;

function viewOf(p: ProjectDoc): SampleView | null {
  if (!p.sample) return null;
  let status: SampleView["status"] | null = null;
  if (p.status === "ready" && p.render?.mediaId) status = "ready";
  else if (p.status === "approved" || p.status === "generating") status = "generating";
  else if (p.status === "scripted" && p.pendingApproval) status = "pending_approval";
  else if (p.status === "failed") status = "failed";
  if (!status) return null;
  return {
    key: p.sample.key, projectId: p._id, styleId: p.sample.styleId, seed: p.sample.seed, status,
    mediaId: p.render?.mediaId ?? null, thumbnailId: p.render?.thumbnailId ?? null, durationSecs: p.render?.durationSecs ?? p.plan?.scenes[0]?.durationSecs ?? null,
    costUsd: p.spendUsd, error: status === "failed" ? p.error : null, createdAt: p.createdAt.toISOString(),
  };
}

async function docsForKey(key: string): Promise<ProjectDoc[]> {
  return (await projectsCollection()).find({ kind: KIND, "sample.key": key, ...notDeleted }).sort({ createdAt: 1, _id: 1 }).toArray();
}

/** Every live sample of this company, one per key (a ready one wins over an in-progress or failed one). */
export async function listSamples(): Promise<SampleView[]> {
  const docs = await (await projectsCollection()).find({ kind: KIND, ...notDeleted }).sort({ createdAt: -1 }).limit(500).toArray();
  const rank = { ready: 3, generating: 2, pending_approval: 2, failed: 1 } as const;
  const best = new Map<string, SampleView>();
  for (const p of docs) {
    const v = viewOf(p);
    if (!v) continue;
    const cur = best.get(v.key);
    if (!cur || rank[v.status] > rank[cur.status]) best.set(v.key, v);
  }
  return [...best.values()];
}

function resolve(styleId: string, seedIn: unknown, d: EngineDeps) {
  const style = d.resolveStyle(styleId);
  if (!style) throw new SmmsInputError("Choose a video style.");
  const seed = sanitizeSeed(seedIn);
  const variation = pickVariation(style, seed);
  return { style, seed, variation, key: sampleKeyFor(style.id, variation) };
}

async function setup() {
  const settings = await getUgcSettings();
  const provider = settings.defaultProvider;
  const caps = capabilitiesFor(provider);
  const model = caps.models.includes(settings.defaultModel) ? settings.defaultModel : caps.defaultModel;
  return { settings, provider, caps, model };
}

/** Everything the "Generate a real sample clip" box shows before it asks for confirmation. Free and read-only. */
export async function sampleQuote(styleId: string, seedIn: unknown, actor: Actor, d: EngineDeps): Promise<SampleQuote> {
  const { style, seed, variation, key } = resolve(styleId, seedIn, d);
  const { settings, provider, caps, model } = await setup();
  const plan = buildSamplePlan(style, variation, caps);
  const est = estimatePlan(plan, provider, model, settings.pricePerSecUsd, 1);
  const policy = policyCheck(plan.productBrief, plan, { illustrativeStyle: style.illustrative });
  const spent = await spentTodayUsd(d);
  const withinCap = settings.dailySpendCapUsd > 0 && spent + est.usd <= settings.dailySpendCapUsd + 1e-9;
  const connected = await d.getProvider(provider).then(() => true, () => false);
  let blocker: string | null = null;
  if (!settings.enabled) blocker = "AI UGC Studio is switched off for this workspace.";
  else if (!connected) blocker = "Connect your Google Gemini API key in Settings -> Integrations to create sample clips.";
  else if (!policy.ok) blocker = policySummary({ ...policy, flagged: [] });
  else if (settings.dailySpendCapUsd <= 0) blocker = "Video generation is set to 0 spend per day in the UGC settings.";
  else if (!withinCap) blocker = `This would cost about $${est.usd.toFixed(2)} but only $${Math.max(0, settings.dailySpendCapUsd - spent).toFixed(2)} is left of today's $${settings.dailySpendCapUsd.toFixed(2)} video limit.`;
  const existing = (await listSamples()).find((s) => s.key === key) ?? null;
  return {
    styleId: style.id, seed, key, secs: plan.scenes[0].durationSecs, estimateUsd: est.usd, provider, model, dailyCapUsd: settings.dailySpendCapUsd, spentTodayUsd: spent,
    thresholdUsd: settings.approvalThresholdUsd, needsManager: est.usd > settings.approvalThresholdUsd && !actor.canApprove, withinCap, blocker, connected,
    policyOk: policy.ok, policyBlocked: policy.blocked, policyFlagged: policy.flagged, existing,
  };
}

export type SampleOutcome =
  | { outcome: "exists" | "in_progress" | "started"; sample: SampleView | null }
  | { outcome: "needs_manager"; sample: SampleView | null; estimateUsd: number; thresholdUsd: number };

async function dropDocs(docs: ProjectDoc[], actor: Actor, d: EngineDeps, withMedia: boolean) {
  const col = await projectsCollection();
  for (const p of docs) {
    await col.updateOne({ _id: p._id }, { $set: { deletedAt: d.now(), ...updateStamp(actor.userId) } });
    if (!withMedia || !d.deleteMedia) continue;
    const ids = new Set<string>([...Object.values(p.sceneMedia), ...(p.render?.mediaId ? [p.render.mediaId] : []), ...(p.render?.thumbnailId ? [p.render.thumbnailId] : [])]);
    for (const id of ids) await d.deleteMedia(id, actor.userId).catch(() => {}); // best effort: a clip that is attached elsewhere stays in the library
  }
}

/**
 * Starts (or reuses) the sample for a style and look. `confirmUsd` must equal the current estimate: the person has seen the exact cost.
 * Never regenerates an existing sample unless `replace` is set. Throws plain-language errors for a missing connection, a blocked brief,
 * the daily cap and so on, and creates nothing when it does.
 */
export async function requestSample(styleId: string, seedIn: unknown, actor: Actor, d: EngineDeps, opts: { confirmUsd?: number; replace?: boolean; acknowledgeFlags?: string[] } = {}): Promise<SampleOutcome> {
  const { style, seed, variation, key } = resolve(styleId, seedIn, d);
  const docs = await docsForKey(key);
  const views = docs.map((p) => ({ p, v: viewOf(p) }));
  const running = views.find((x) => x.v?.status === "generating");
  if (running) return { outcome: "in_progress", sample: running.v };
  const ready = views.find((x) => x.v?.status === "ready");
  if (ready && !opts.replace) return { outcome: "exists", sample: ready.v };

  const { settings, provider, caps, model } = await setup();
  if (!settings.enabled) throw new SmmsInputError("AI UGC Studio is switched off for this workspace.");
  const plan = buildSamplePlan(style, variation, caps);
  const policy = policyCheck(plan.productBrief, plan, { illustrativeStyle: style.illustrative });
  if (!policy.ok) throw new SmmsInputError(`A sample can't be generated for this style: ${policySummary({ ...policy, flagged: [] })}`);
  const est = estimatePlan(plan, provider, model, settings.pricePerSecUsd, 1);
  if (typeof opts.confirmUsd !== "number" || Math.abs(opts.confirmUsd - est.usd) > 0.005) throw new SmmsInputError(`Confirm the cost first: this sample is estimated at $${est.usd.toFixed(2)}. Review it and confirm again.`);

  let target = views.find((x) => x.v?.status === "pending_approval")?.p ?? null;
  let created: ProjectDoc | null = null;
  if (!target) {
    const options: UgcOptions = { provider, model, aspect: plan.aspect, language: "en", targetSecs: plan.scenes[0].durationSecs, aiLabel: { enabled: true, position: "top-right" }, burnCaptions: false };
    created = {
      _id: newId(), title: plan.title, styleId: style.id, brief: sampleBrief(style), providedFacts: [], options, status: "scripted", plan, planVersion: 1, factsUsed: {},
      versions: [{ version: 1, at: d.now(), by: actor.userId, source: "edit", note: "Built-in style sample", plan }], policy, illustrative: style.illustrative, estimate: est,
      pendingApproval: null, approvals: [], references: [], cast: variation, sceneGen: {}, render: null, sceneMedia: {}, spendUsd: 0, cancelRequested: false, error: null,
      finalizeLease: null, planCostUsd: 0, kind: KIND, sample: { key, styleId: style.id, seed }, ...createStamp(actor.userId),
    };
    const col = await projectsCollection();
    await col.insertOne(created);
    // Two people pressing the button together: the earliest document wins, the other is dropped before any spend.
    const rivals = (await docsForKey(key)).filter((p) => ["scripted", "approved", "generating"].includes(p.status) && !docs.some((o) => o._id === p._id));
    if (rivals[0] && rivals[0]._id !== created._id) {
      await dropDocs([created], actor, d, false);
      return { outcome: "in_progress", sample: viewOf(rivals[0]) };
    }
    target = created;
  }

  let out;
  try {
    out = await approveAndGenerate(target._id, actor, d, { acknowledgeFlags: opts.acknowledgeFlags });
  } catch (e) {
    if (created) await dropDocs([created], actor, d, false); // nothing was spent; leave no half-made sample behind
    throw e;
  }
  if (out.outcome === "needs_manager") return { outcome: "needs_manager", sample: viewOf(out.project), estimateUsd: out.estimateUsd, thresholdUsd: out.thresholdUsd };

  // Started: the old sample (replace) and any leftovers from earlier failed tries are now obsolete.
  const obsolete = docs.filter((p) => p._id !== target._id && (opts.replace || !viewOf(p) || viewOf(p)?.status === "failed" || viewOf(p)?.status === "pending_approval"));
  await dropDocs(obsolete, actor, d, true);
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "generate", entity: "ugc", entityId: target._id, entityLabel: target.title, summary: `Started a ${plan.scenes[0].durationSecs}s style sample (estimated $${est.usd.toFixed(2)})`, metadata: { styleId: style.id, sampleKey: key, estimateUsd: est.usd, aiGenerated: true } });
  return { outcome: "started", sample: viewOf(out.project) };
}

/** Removes the sample for a key (and its clip from the library, when nothing else uses it). Refused while it is being made. */
export async function deleteSample(key: string, actor: Actor, d: EngineDeps): Promise<void> {
  if (typeof key !== "string" || key.length > 120) throw new SmmsInputError("That sample no longer exists.");
  const docs = await docsForKey(key);
  if (docs.length === 0) throw new SmmsInputError("That sample no longer exists.");
  if (docs.some((p) => p.status === "approved" || p.status === "generating")) throw new SmmsInputError("This sample is still being made. Wait for it to finish first.");
  await dropDocs(docs, actor, d, true);
  await d.audit({ actorId: actor.userId, actorEmail: actor.email, action: "delete", entity: "ugc", entityId: docs[0]._id, entityLabel: docs[0].title, summary: "Deleted a style sample", metadata: { sampleKey: key } });
}
