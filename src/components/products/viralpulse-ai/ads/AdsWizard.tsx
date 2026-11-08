"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CloudOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import Stepper from "@/components/products/viralpulse-ai/shared/Stepper";
import { accountContextAction, saveWizardAction, validateAction } from "@/app/(products)/viralpulse-ai/(protected)/campaigns/ads-actions";
import { META_OBJECTIVE_LABEL } from "@/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import type { AdAccountInfo } from "@/lib/products/viralpulse-ai/ads-platforms/meta/account";
import type { Commitment, GuardVerdict } from "@/lib/products/viralpulse-ai/ads-platforms/guard";
import type { FieldError } from "@/lib/products/viralpulse-ai/ads-platforms/types";
import type { GuardSummary, LaunchView, WizardAccounts, WizardLoad } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import {
  WIZARD_STEPS, adIdOf, adSetIndexOf, blankAd, canAutosave, draftSnapshot, fieldId, stepForPath, wizardReducer,
  type WizardStepKey,
} from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import { ErrorsContext, Note } from "./ads-bits";
import type { AccountContext, StepCtx } from "./ads-ctx";
import StepAccount from "./StepAccount";
import StepCampaign from "./StepCampaign";
import StepAdSets from "./StepAdSets";
import StepAds from "./StepAds";
import StepReview from "./StepReview";
import ValidateOnlyPlanner from "./ValidateOnlyPlanner";
import type { LaunchPerms } from "./LaunchPanel";

export interface ValidationView {
  ok: boolean;
  errors: FieldError[];
  warnings: FieldError[];
  commitment: Commitment;
  guard: GuardVerdict | null;
  account: AdAccountInfo | null;
  checkedAt: string;
}

export interface WizardPerms extends LaunchPerms {
  canGenerate: boolean;
  canUpload: boolean;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "local" } | { kind: "error"; message: string };
const LOCAL_KEY = "ads-wizard-draft";

export default function AdsWizard({ initial, accounts, guard, perms, handoff, handoffMedia, limitsHref }: {
  initial: WizardLoad; accounts: WizardAccounts; guard: GuardSummary; perms: WizardPerms; handoff: { step: WizardStepKey | null; mediaIds: string[]; ugcProjectId: string | null }; handoffMedia: MediaCard[]; limitsHref: string | null;
}) {
  const [state, dispatch] = useReducer(wizardReducer, initial.state, (s) => ({ ...s, step: handoff.step ?? (handoffMedia.length > 0 && !s.campaignId ? "ads" : s.step) }));
  const [launch, setLaunch] = useState<LaunchView | null>(initial.launch);
  const [save, setSave] = useState<SaveState>(initial.lastSavedAt ? { kind: "saved", at: initial.lastSavedAt } : { kind: "idle" });
  const [validation, setValidation] = useState<ValidationView | null>(null);
  const [validating, setValidating] = useState(false);
  const [extraErrors, setExtraErrors] = useState<FieldError[]>([]);
  const [acct, setAcct] = useState<{ id: string | null; data: AccountContext | null; status: "idle" | "loading" | "error"; error: string | null }>({ id: null, data: null, status: "idle", error: null });
  const [activeSet, setActiveSet] = useState(0);
  const [activeAd, setActiveAd] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ path: string; n: number } | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const lastSaved = useRef<string>(initial.lastSavedAt ? draftSnapshot(initial.state) : "");
  const inFlight = useRef<Promise<boolean> | null>(null);
  const stateRef = useRef(state);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => { stateRef.current = state; }, [state]);

  const locked = Boolean(launch && ["ready", "creating", "partial"].includes(launch.state));
  const editable = perms.canEdit && !locked;
  const isMeta = state.platform === "meta";
  const steps = isMeta ? WIZARD_STEPS.map((s) => ({ key: s.key, label: s.label })) : [{ key: "account", label: "Platform & account" }, { key: "campaign", label: "Plan (check only)" }];
  const stepKey = steps.some((s) => s.key === state.step) ? state.step : "account";
  const stepIndex = steps.findIndex((s) => s.key === stepKey);

  // Handoff: put the picked media into a first ad (once, for a campaign that does not exist yet).
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (handoffMedia.length > 0 && !initial.state.campaignId) {
      dispatch({ type: "addAdSet" });
      const first = handoffMedia[0];
      const kind = first.kind === "video" ? "video" : "image";
      dispatch({ type: "addAd", adSetKey: "set1", ad: { format: kind, name: first.name.slice(0, 80), mediaIds: handoffMedia.filter((m) => m.kind === kind).map((m) => m._id), mediaInfo: Object.fromEntries(handoffMedia.map((m) => [m._id, { name: m.name, kind: m.kind, width: m.width, height: m.height, durationSec: m.durationSec, aiDisclosed: Boolean(m.aiDisclosed) }])), meta: { ...blankAd("x", "set1").meta, creativeType: kind } } });
    } else if (!initial.state.campaignId) {
      setTimeout(() => { try { const raw = localStorage.getItem(LOCAL_KEY); if (raw) setRestore(raw); } catch { /* storage unavailable */ } }, 0);
    }
  }, [handoffMedia, initial.state.campaignId]);

  // ── account facts ──
  const adAccountId = state.meta.adAccountId;
  const loadAccount = useCallback(async (id: string) => {
    setAcct({ id, data: null, status: "loading", error: null });
    const r = await accountContextAction(id);
    if (stateRef.current.meta.adAccountId !== id) return;
    if (r.ok) {
      setAcct({ id, data: { info: r.info, pixels: r.pixels, audiences: r.audiences, instagram: r.instagram, problems: r.problems, readAt: r.readAt }, status: "idle", error: null });
      dispatch({ type: "currency", currency: r.info.currency });
    } else setAcct({ id, data: null, status: "error", error: r.error });
  }, []);
  useEffect(() => {
    if (!adAccountId || state.platform !== "meta") return;
    const t = setTimeout(() => void loadAccount(adAccountId), 0);
    return () => clearTimeout(t);
  }, [adAccountId, state.platform, loadAccount]);

  // ── saving ──
  const persist = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current.catch(() => false);
    const run = async (): Promise<boolean> => {
      const s = stateRef.current;
      if (s.platform !== "meta" || !perms.canEdit) return true;
      if (!canAutosave(s)) { setSave({ kind: "local" }); return false; }
      const snap = draftSnapshot(s);
      if (snap === lastSaved.current && s.campaignId) return true;
      setSave({ kind: "saving" });
      const r = await saveWizardAction({ campaignId: s.campaignId, name: s.name, brief: s.brief, currency: s.currency, meta: s.meta, ads: s.ads.map((a) => ({ key: a.key, id: a.id, name: a.name, platform: a.platform, format: a.format, headline: a.headline, primaryText: a.primaryText, description: a.description, mediaIds: a.mediaIds, meta: a.meta })) });
      if (!r.ok) { setSave({ kind: "error", message: r.error }); return false; }
      lastSaved.current = snap;
      dispatch({ type: "saved", campaignId: r.campaignId, adIds: r.adIds });
      setActiveAd((k) => (k && r.adIds[k] ? r.adIds[k] : k));
      if (!s.campaignId) { try { window.history.replaceState(null, "", `/viralpulse-ai/campaigns/${r.campaignId}/edit`); localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ } }
      setSave({ kind: "saved", at: r.savedAt });
      return true;
    };
    inFlight.current = run();
    try { return await inFlight.current; } finally { inFlight.current = null; }
  }, [perms.canEdit]);

  const snapshot = useMemo(() => draftSnapshot(state), [state]);
  useEffect(() => {
    if (!mounted.current || !editable) return;
    const t = setTimeout(() => {
      if (!canAutosave(stateRef.current)) {
        try { if (!stateRef.current.campaignId && snapshot.length > 200) localStorage.setItem(LOCAL_KEY, JSON.stringify(stateRef.current)); setSave({ kind: "local" }); } catch { /* ignore */ }
        return;
      }
      void persist();
    }, 1500);
    return () => clearTimeout(t);
  }, [snapshot, editable, persist]);

  // ── validation ──
  const validate = useCallback(async () => {
    setValidating(true);
    const ok = await persist();
    const id = stateRef.current.campaignId;
    if (!ok || !id) { setValidating(false); return; }
    const r = await validateAction(id);
    setValidating(false);
    if (r.ok) setValidation({ ok: r.ok, errors: r.errors, warnings: r.warnings, commitment: r.commitment, guard: r.guard, account: r.account, checkedAt: r.checkedAt });
    else setSave({ kind: "error", message: r.error });
  }, [persist]);

  const go = useCallback(async (key: WizardStepKey) => {
    dispatch({ type: "step", step: key });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (key === "review" && stateRef.current.campaignId === null) await persist();
  }, [persist]);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [stepKey]);

  const allErrors = useMemo(() => [...(validation ? [...validation.errors, ...validation.warnings] : []), ...extraErrors], [validation, extraErrors]);

  // Jump to the field an error points at: switch step, pick the ad set / ad, then focus the field once it is rendered.
  const gotoPath = useCallback((path: string) => {
    const step = stepForPath(path);
    const i = adSetIndexOf(path);
    if (i !== null) setActiveSet(i);
    const adId = adIdOf(path);
    if (adId) { const a = stateRef.current.ads.find((x) => x.id === adId || x.key === adId); if (a) setActiveAd(a.key); }
    dispatch({ type: "step", step });
    setFocus({ path, n: Date.now() });
  }, []);
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const el = document.getElementById(fieldId(focus.path));
      if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); }
    }, 120);
    return () => clearTimeout(t);
  }, [focus]);

  const aiContext = useCallback(() => {
    const s = stateRef.current;
    return { name: s.name, objective: s.meta.objective ? META_OBJECTIVE_LABEL[s.meta.objective] : "", targetAudience: s.brief.targetAudience, industry: s.brief.industry, offerService: s.brief.offerService, language: s.brief.language, tone: s.brief.tone, brandInfo: s.brief.brandInfo, landingPage: s.brief.landingPage, platforms: ["facebook", "instagram"] };
  }, []);

  const ctx: StepCtx = {
    state, dispatch, editable, accounts,
    account: { data: acct.id === adAccountId ? acct.data : null, status: acct.id === adAccountId ? acct.status : "idle", error: acct.error, reload: () => adAccountId && void loadAccount(adAccountId) },
    canGenerate: perms.canGenerate, aiContext, strategy: initial.strategy,
  };

  const stepErrors = validation ? allErrors.filter((e) => e.severity === "error" && stepForPath(e.path) === stepKey) : [];
  const last = stepIndex === steps.length - 1;
  const next = steps[stepIndex + 1];
  const prev = steps[stepIndex - 1];
  const cannotNext = stepKey === "campaign" && isMeta && !state.meta.objective ? "Choose an objective to continue." : stepKey === "campaign" && isMeta && state.meta.specialAdCategories.length === 0 && !state.confirm.noSpecialCategory ? "Answer the special ad categories question to continue." : stepKey === "account" && isMeta && (!state.meta.adAccountId || !state.meta.pageAccountId) ? "Choose the ad account and the Page to continue." : null;

  return (
    <ErrorsContext.Provider value={allErrors}>
      <div className="space-y-4">
        {restore && !state.campaignId && (
          <Note tone="info">
            <p>An unsaved draft from this browser was found.</p>
            <div className="flex gap-2"><Button type="button" size="xs" onClick={() => { try { dispatch({ type: "replace", state: JSON.parse(restore) }); } catch { /* ignore */ } setRestore(null); }}>Restore it</Button><Button type="button" size="xs" variant="outline" onClick={() => { try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ } setRestore(null); }}>Discard</Button></div>
          </Note>
        )}
        {!perms.canEdit && <Note tone="warn">You can look at this campaign but not change it. Ask someone with permission to edit campaigns.</Note>}
        {locked && <Note tone="info">This campaign has a launch in Meta, so its draft is read-only. Change names, budgets and ad copy with <strong>Edit allowed fields</strong> in the last step; roll the launch back to rebuild it from scratch.</Note>}

        <Stepper steps={steps} current={stepKey} onSelect={(k) => void go(k as WizardStepKey)} label="Campaign steps" variant="ugc" className="w-full" />
        {stepKey !== "account" && (stepKey !== "campaign" || !isMeta) && <div className="flex justify-end"><SaveChip save={save} onRetry={() => void persist()} /></div>}
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">{`Step ${stepIndex + 1} of ${steps.length}: ${steps[stepIndex]?.label}`}</h2>

        {stepErrors.length > 0 && (
          <Note tone="bad">
            <p className="font-semibold">{stepErrors.length} problem{stepErrors.length === 1 ? "" : "s"} on this step</p>
            <ul className="space-y-0.5">{stepErrors.slice(0, 6).map((e, i) => <li key={`${e.path}-${i}`}><button type="button" className="text-left underline" onClick={() => gotoPath(e.path)}>{e.message}</button></li>)}</ul>
          </Note>
        )}

        {stepKey === "account" && <StepAccount ctx={ctx} platformLocked={Boolean(state.campaignId) || state.ads.length > 0} saveStatus={<SaveChip save={save} onRetry={() => void persist()} />} />}
        {stepKey === "campaign" && isMeta && <StepCampaign ctx={ctx} saveStatus={<SaveChip save={save} onRetry={() => void persist()} />} />}
        {stepKey === "campaign" && !isMeta && <ValidateOnlyPlanner platform={state.platform as "google" | "linkedin" | "x"} ctx={ctx} />}
        {stepKey === "adsets" && <StepAdSets ctx={ctx} active={activeSet} onActive={setActiveSet} />}
        {stepKey === "ads" && <StepAds ctx={ctx} canUpload={perms.canUpload} activeKey={activeAd} onActive={setActiveAd} />}
        {stepKey === "review" && (
          <StepReview ctx={ctx} validation={validation} validating={validating} onValidate={() => void validate()} guard={guard} launch={launch} onLaunch={setLaunch} perms={perms} onSave={() => void persist()} saving={save.kind === "saving"} onGoto={gotoPath} onErrors={setExtraErrors} limitsHref={limitsHref} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-4">
          <Button type="button" variant="outline" disabled={!prev} onClick={() => prev && void go(prev.key as WizardStepKey)}><ArrowLeft className="size-4" /> Back</Button>
          <div className="flex items-center gap-2">
            {cannotNext && <span role="status" className="text-xs text-muted-foreground">{cannotNext}</span>}
            {isMeta && <Button type="button" variant="outline" disabled={!editable || save.kind === "saving" || !canAutosave(state)} onClick={() => void persist()}>{save.kind === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save draft</Button>}
            {!last && next && <Button type="button" disabled={Boolean(cannotNext)} onClick={() => void go(next.key as WizardStepKey)}>Next: {next.label} <ArrowRight className="size-4" /></Button>}
          </div>
        </div>
      </div>
    </ErrorsContext.Provider>
  );
}

function SaveChip({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  return (
    <div role="status" aria-live="polite" className="min-h-6 text-xs text-muted-foreground">
      {save.kind === "saving" && <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Saving…</span>}
      {save.kind === "saved" && <span>Draft saved {new Date(save.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
      {save.kind === "local" && <span className="inline-flex items-center gap-1"><CloudOff className="size-3" /> Give the campaign a name to save it</span>}
      {save.kind === "error" && <span className="inline-flex items-center gap-2 text-rose-700 dark:text-rose-300">Not saved: {save.message}<button type="button" className="underline" onClick={onRetry}>Retry</button></span>}
    </div>
  );
}
