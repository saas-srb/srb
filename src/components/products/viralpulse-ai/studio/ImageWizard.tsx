"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import WizardFrame, { SaveStatus, type SaveState } from "@/components/products/viralpulse-ai/shared/WizardFrame";
import FormatGallery from "@/components/products/viralpulse-ai/studio/FormatGallery";
import ImageBriefStep from "@/components/products/viralpulse-ai/studio/ImageBriefStep";
import ImageBrandStep from "@/components/products/viralpulse-ai/studio/ImageBrandStep";
import ImageVariantsStep from "@/components/products/viralpulse-ai/studio/ImageVariantsStep";
import ImageReviewStep from "@/components/products/viralpulse-ai/studio/ImageReviewStep";
import type { StudioConfig } from "@/components/products/viralpulse-ai/studio/config";
import { estimateBriefAction, generateAction, saveDraftAction } from "@/app/(products)/viralpulse-ai/(protected)/image-studio/actions";
import { advance, blankBrief, hasContent, policyOf, initialWizard, QUICK_STEPS, resumeStep, restoreDraft, serializeDraft, validateStep, WIZARD_STEPS, wizardReducer, type Errors, type EstimateView } from "@/lib/products/viralpulse-ai/images/wizard";
import { isEditable } from "@/lib/products/viralpulse-ai/images/state";
import type { Brief, ProjectView } from "@/lib/products/viralpulse-ai/images/types";

export type WizardMode = "create" | "quick";
const draftKey = (m: WizardMode) => `image-studio-draft:${m}`;
const resumeUrl = (m: WizardMode, id: string) => (m === "quick" ? `/viralpulse-ai/generate-image?project=${id}` : `/viralpulse-ai/image-studio?tab=create&project=${id}`);

/** The Image Studio wizard. `create` is the five-step flow; `quick` is the same screens in three steps. Drafts are saved to the server as projects. */
export default function ImageWizard({ config, mode, initialProject, canGenerate }: { config: StudioConfig; mode: WizardMode; initialProject: ProjectView | null; canGenerate: boolean }) {
  const quick = mode === "quick";
  const steps = quick ? QUICK_STEPS : WIZARD_STEPS;
  const ctx = useMemo(() => ({ maxVariants: config.settings.maxVariants, providers: config.providers }), [config]);
  const router = useRouter();
  const [project, setProject] = useState<ProjectView | null>(initialProject);
  const [state, dispatch] = useReducer(wizardReducer, null, () => {
    if (initialProject) return initialWizard(initialProject.brief, resumeStep(initialProject.brief, steps, ctx));
    return initialWizard(blankBrief({ provider: config.defaultProvider, quality: config.defaultQuality, badge: config.settings.badgeForPeopleDefault }, quick));
  });
  const [errors, setErrors] = useState<Errors>({});
  const [save, setSave] = useState<SaveState>(initialProject ? "saved" : "idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [busy, setBusy] = useState<null | "next" | "generate" | "close">(null);
  const [restore, setRestore] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<EstimateView | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastSaved = useRef<string>(initialProject ? JSON.stringify(initialProject.brief) : "");
  const inFlight = useRef<Promise<boolean> | null>(null);
  const idRef = useRef<string | null>(initialProject?.id ?? null);
  const mounted = useRef(false);

  const brief = state.brief;
  const stepDef = steps[state.step];
  const editable = !project || isEditable(project.status);
  const snapshot = useMemo(() => JSON.stringify(brief), [brief]);
  const set = useCallback((patch: Partial<Brief>) => dispatch({ type: "set", patch }), []);

  // Offer an unsaved draft kept in this browser (before the project exists on the server).
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    try {
      if (!initialProject) {
        const raw = localStorage.getItem(draftKey(mode));
        const d = restoreDraft(raw, steps.length);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
        if (d && hasContent(d.brief)) setRestore(raw);
      }
    } catch { /* storage unavailable: the server draft still works */ }
  }, [initialProject, mode, steps.length]);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [state.step]);

  useEffect(() => {
    if (!mounted.current || project || !hasContent(brief)) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(mode), serializeDraft(state)); setSave("local"); } catch { /* ignore */ }
    }, 600);
    return () => clearTimeout(t);
  }, [state, project, brief, mode]);

  /** Writes the brief to the project (creating it the first time). Serialised, so two saves never race. */
  const persist = useCallback(async (opts: { create?: boolean; override?: Partial<Brief> } = {}): Promise<boolean> => {
    if (inFlight.current) await inFlight.current.catch(() => false);
    const run = async (): Promise<boolean> => {
      if (!editable) return false;
      if (!project && !opts.create) return true;
      const payload: Brief = { ...brief, ...opts.override };
      const snap = JSON.stringify(payload);
      if (project && snap === lastSaved.current) return true;
      setSave("saving");
      const r = await saveDraftAction(project?.id ?? null, payload as unknown as Record<string, unknown>);
      if (!r.ok) { setSave("error"); setSaveMsg(r.error); if (opts.create) toast.error(r.error); return false; }
      setProject(r.project);
      idRef.current = r.project.id;
      // The server writes who confirmed the consent and when; take it back so the next save sees no change.
      const merged = { ...payload, consent: r.project.brief.consent };
      if (JSON.stringify(r.project.brief.consent) !== JSON.stringify(payload.consent)) dispatch({ type: "set", patch: { consent: r.project.brief.consent } });
      lastSaved.current = JSON.stringify(merged);
      if (!project) {
        try { localStorage.removeItem(draftKey(mode)); } catch { /* ignore */ }
        window.history.replaceState(null, "", resumeUrl(mode, r.project.id));
      }
      setSave("saved");
      setSaveMsg("");
      return true;
    };
    const pr = run();
    inFlight.current = pr;
    try { return await pr; } finally { if (inFlight.current === pr) inFlight.current = null; }
  }, [brief, editable, mode, project]);

  // Autosave a moment after the last edit once the draft exists on the server.
  useEffect(() => {
    if (!project || !editable || busy || state.step >= steps.length - 1) return;
    if (JSON.stringify({ ...brief }) === lastSaved.current || snapshot === lastSaved.current) return;
    const t = setTimeout(() => { void persist(); }, 1500);
    return () => clearTimeout(t);
  }, [snapshot, brief, project, editable, busy, state.step, steps.length, persist]);

  // The live estimate follows the choices from the Variants step on.
  const estKey = JSON.stringify([brief.goalId, brief.specKeys, brief.variants, brief.quality, brief.provider, brief.overlayText.length]);
  const needsEstimate = stepDef.key === "variants" || stepDef.key === "review";
  useEffect(() => {
    if (!needsEstimate || Object.keys(validateStep(brief, "goal")).length) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setEstimating(true);
      const r = await estimateBriefAction(brief as unknown as Record<string, unknown>);
      if (cancelled) return;
      setEstimating(false);
      if (r.ok) { setEstimate({ ...r.estimate }); setEstimateError(null); } else setEstimateError(r.error);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when a choice that changes the price changes
  }, [needsEstimate, estKey]);

  async function goTo(to: number) {
    if (busy) return;
    if (to <= state.step) { setErrors({}); dispatch({ type: "goto", step: to }); return; }
    const r = advance(brief, steps, state.step, to, ctx);
    if (r.blocked) { setErrors(r.errors); toast.error(r.blocked); return; }
    setErrors({});
    setBusy("next");
    const ok = await persist({ create: !project });
    setBusy(null);
    if (!ok) return;
    dispatch({ type: "goto", step: to });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onApprove(acknowledge: string[]) {
    setBusy("generate");
    const badge = brief.badge ?? (policyOf(brief).suggestAiBadge && config.settings.badgeForPeopleDefault);
    const ok = await persist({ create: !project, override: { badge } });
    if (!ok) { setBusy(null); return; }
    const id = idRef.current;
    if (!id) { setBusy(null); return; }
    const r = await generateAction(id, acknowledge);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    if (r.outcome === "needs_ack") { toast.error("Tick the points under “Please check”."); return; }
    if (r.outcome === "needs_manager") toast.info(`A manager was asked to approve about $${r.estimateUsd.toFixed(2)}.`);
    else toast.success("Started. Your pictures are being drawn.");
    router.push(`/viralpulse-ai/image-studio/${id}`);
  }
  const subtitle = stepDef.hint;
  const last = state.step === steps.length - 1;
  const wizardSteps = steps.map((s, i) => ({ key: s.key, n: i + 1, label: s.label }));
  const editedLocked = !editable && project;

  return (
    <WizardFrame
      steps={wizardSteps}
      step={state.step + 1}
      reached={state.reached + 1}
      busy={!!busy}
      navLabel={quick ? "Generate image steps" : "Image Studio steps"}
      onGoTo={(n) => void goTo(n - 1)}
      title={`${state.step + 1}. ${stepDef.label}`}
      subtitle={subtitle}
      headingRef={headingRef}
      status={<SaveStatus save={save} msg={saveMsg} localText="Kept in this browser until you continue" />}
      banner={restore && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="flex-1">You have an unfinished brief saved in this browser.</span>
          <Button type="button" size="sm" onClick={() => { const d = restoreDraft(restore, steps.length); if (d) dispatch({ type: "load", state: { ...d, step: Math.min(d.step, 1), reached: Math.min(d.reached, 1) } }); setRestore(null); }}>Restore it</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { try { localStorage.removeItem(draftKey(mode)); } catch { /* ignore */ } setRestore(null); }}>Start fresh</Button>
        </div>
      )}
      backDisabled={state.step === 0}
      onBack={() => void goTo(state.step - 1)}
      actions={
        <>
          {project && <Button type="button" variant="ghost" disabled={!!busy} onClick={async () => { setBusy("close"); const ok = await persist(); setBusy(null); if (ok) router.push(`/viralpulse-ai/image-studio/${project.id}`); }}>{busy === "close" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} <span className="max-sm:hidden">Save and close</span><span className="sm:hidden">Close</span></Button>}
          {!last && (
            <Button type="button" disabled={!!busy || !editable} onClick={() => goTo(state.step + 1)}>
              {busy === "next" ? <Loader2 className="size-4 animate-spin" /> : null}
              {state.step === steps.length - 2 ? "Review and estimate" : "Next"} <ArrowRight className="size-4" />
            </Button>
          )}
        </>
      }
    >
      {editedLocked && <p className="rounded-xl bg-muted/60 p-3 text-xs">These pictures are being drawn, so the brief can&apos;t be edited. <Link href={`/viralpulse-ai/image-studio/${project.id}`} className="font-semibold text-primary underline">Open the project</Link>.</p>}
      {stepDef.key === "goal" && <FormatGallery goalId={brief.goalId} textPosition={brief.textPosition} error={errors.goalId ?? errors.specKeys} onPick={(id) => { dispatch({ type: "selectGoal", goalId: id }); setErrors({}); toast.success("Format selected"); }} />}
      {stepDef.key === "brief" && <ImageBriefStep brief={brief} set={set} errors={errors} config={config} quick={quick} disabled={!editable} />}
      {stepDef.key === "brand" && <ImageBrandStep brief={brief} set={set} errors={errors} config={config} disabled={!editable} />}
      {stepDef.key === "variants" && <ImageVariantsStep brief={brief} set={set} errors={errors} config={config} estimate={estimate} estimating={estimating} estimateError={estimateError} disabled={!editable} />}
      {stepDef.key === "review" && (
        <ImageReviewStep brief={brief} set={set} config={config} estimate={estimate} estimating={estimating} pendingApproval={project?.pendingApproval ? { estimateUsd: project.pendingApproval.estimateUsd, at: project.pendingApproval.at } : null} busy={busy === "generate" || !editable} quick={quick} canGenerate={canGenerate} onApprove={onApprove} />
      )}
    </WizardFrame>
  );
}
