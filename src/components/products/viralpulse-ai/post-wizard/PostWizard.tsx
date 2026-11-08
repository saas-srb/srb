"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, CloudOff, Loader2, Save, Send, CalendarClock } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Stepper from "@/components/products/viralpulse-ai/shared/Stepper";
import ErrorState from "@/components/products/viralpulse-ai/shared/ErrorState";
import { saveWizardAction, submitPostAction } from "@/app/(products)/viralpulse-ai/(protected)/posts/wizard-actions";
import {
  STEP_KEYS, WIZARD_STEPS, emptyWizard, firstIncompleteStep, resumeStep, sanitizeWizardState, stepIndex, validateStep, wizardReducer,
  type StepKey, type ValidationCtx, type WizardState,
} from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import type { WizardInit } from "@/lib/products/viralpulse-ai/post-wizard/server";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import type { FieldKey } from "@/lib/products/viralpulse-ai/ai-field/registry";
import StepGoal from "./StepGoal";
import StepBrief from "./StepBrief";
import StepContent from "./StepContent";
import StepMedia from "./StepMedia";
import StepOptions from "./StepOptions";
import StepSchedule from "./StepSchedule";
import StepReview from "./StepReview";
import PublishTracker from "./PublishTracker";
import { Callout, aiContext, type StepProps } from "./shared";

const DRAFT_KEY = "posts-wizard-draft";
type SaveState = "idle" | "saving" | "saved" | "local" | "error";

export default function PostWizard({ init }: { init: WizardInit }) {
  const router = useRouter();
  const locked = Boolean(init.lockedReason);
  const [cards, setCardsState] = useState<Record<string, MediaCard>>(() => Object.fromEntries(init.media.map((m) => [m._id, m])));
  const ctx: ValidationCtx = useMemo(() => ({
    accounts: init.accounts,
    media: Object.fromEntries(Object.values(cards).map((m) => [m._id, { kind: m.kind }])),
    captionLimits: Object.fromEntries(Object.entries(init.caps).map(([k, v]) => [k, v.captionLimit])),
    now: new Date(),
  }), [init.accounts, init.caps, cards]);
  const [s, dispatch] = useReducer(wizardReducer, init.state, (st) => (st.postId ? { ...st, step: resumeStep(st, { ...ctx, now: new Date(init.nowIso) }) } : st));
  const [showErrors, setShowErrors] = useState(false);
  const [save, setSave] = useState<SaveState>(init.state.postId ? "saved" : "idle");
  const [saveMsg, setSaveMsg] = useState("");
  const [busy, setBusy] = useState<null | "next" | "submit">(null);
  const [restore, setRestore] = useState<string | null>(null);
  const [done, setDone] = useState<null | { mode: "now" | "schedule" | "draft"; postId: string; note: string }>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sref = useRef(s);
  const lastSaved = useRef(init.state.postId ? JSON.stringify(strip(init.state)) : "");
  const chain = useRef<Promise<string | null>>(Promise.resolve(null));
  const mounted = useRef(false);

  useEffect(() => { sref.current = s; });

  const setCards = useCallback((items: MediaCard[]) => setCardsState((c) => ({ ...c, ...Object.fromEntries(items.map((m) => [m._id, m])) })), []);

  // An unsaved new draft kept on this device (before the brief is complete enough to save to the account).
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (init.state.postId || init.state.mediaIds.length) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = sanitizeWizardState(JSON.parse(raw), init.settings.timezone);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
        if (d.topic || d.platforms.length) setRestore(raw);
      }
    } catch { /* storage unavailable: server autosave only */ }
  }, [init.state.postId, init.state.mediaIds.length, init.settings.timezone]);

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [s.step]);

  const canSaveNow = useCallback((st: WizardState) => !locked && Object.keys(validateStep(st, "goal", { ...ctx, now: new Date() }).errors).length === 0 && Object.keys(validateStep(st, "brief", ctx).errors).length === 0, [ctx, locked]);

  /** Writes the current state to the post, one save at a time. Returns the post id, or null when the brief isn't complete enough yet. */
  const persist = useCallback((checkpoint: boolean): Promise<string | null> => {
    const run = async (): Promise<string | null> => {
      const st = sref.current;
      if (locked) return st.postId;
      if (!canSaveNow(st)) {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify(strip(st))); } catch { /* ignore */ }
        setSave("local");
        setSaveMsg("");
        return st.postId;
      }
      const snap = JSON.stringify(strip(st));
      if (st.postId && snap === lastSaved.current && !checkpoint) return st.postId;
      setSave("saving");
      const res = await saveWizardAction(st, checkpoint);
      if (!res.ok) {
        setSave("error");
        setSaveMsg(res.error);
        return st.postId;
      }
      lastSaved.current = JSON.stringify(strip({ ...sref.current, postId: res.saved.id }));
      if (!st.postId) {
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
        dispatch({ type: "set", patch: { postId: res.saved.id } });
        sref.current = { ...sref.current, postId: res.saved.id };
        window.history.replaceState(null, "", `/viralpulse-ai/posts/${res.saved.id}/edit`);
      }
      setSave("saved");
      setSaveMsg("");
      return res.saved.id;
    };
    chain.current = chain.current.then(run, run);
    return chain.current;
  }, [canSaveNow, locked]);

  const ensureSaved = useCallback(() => persist(false), [persist]);

  // Autosave 1.5 s after the last change.
  const snapshot = useMemo(() => JSON.stringify(strip(s)), [s]);
  useEffect(() => {
    if (!mounted.current || locked || done) return;
    if (snapshot === lastSaved.current) return;
    const t = setTimeout(() => void persist(false), 1500);
    return () => clearTimeout(t);
  }, [snapshot, persist, locked, done]);

  const aiOn = useMemo(() => init.can.generate && !locked, [init.can.generate, locked]);
  const ai: StepProps["ai"] = useCallback((fieldKey: FieldKey, extra: Record<string, unknown> = {}) => ({
    fieldKey,
    getContext: () => aiContext(init, sref.current, extra),
    aiDisabled: !aiOn,
    aiDisabledReason: locked ? "This post can't be edited." : init.aiReady ? "You don't have permission to use AI here." : "OpenAI isn't connected for this workspace (Settings > Integrations).",
  }), [init, aiOn, locked]);

  const step = s.step;
  const idx = stepIndex(step);
  const validation = validateStep(s, step, ctx);
  const errors = validation.errors;
  const blockedStep = firstIncompleteStep(s, ctx, "schedule");
  const props: StepProps = { init, s, dispatch, errors, showErrors, locked, ai, cards, setCards, ensureSaved };

  const go = (k: StepKey) => { setShowErrors(false); dispatch({ type: "step", step: k }); };

  async function next() {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      toast.error("Fix the highlighted fields to go on.");
      return;
    }
    setBusy("next");
    await persist(idx >= 1);
    setBusy(null);
    go(STEP_KEYS[Math.min(idx + 1, STEP_KEYS.length - 1)]);
  }

  async function submit() {
    setSubmitError(null);
    if (blockedStep) return void go(blockedStep);
    if (!s.confirmed) {
      setShowErrors(true);
      return;
    }
    setBusy("submit");
    const id = await persist(true);
    if (!id) {
      setBusy(null);
      return void setSubmitError("The post could not be saved. Check the earlier steps.");
    }
    const mode = s.schedule.mode;
    if (mode === "draft") {
      setBusy(null);
      setDone({ mode, postId: id, note: "Saved as a draft. Nothing was sent." });
      return;
    }
    const res = await submitPostAction(mode === "now" ? { postId: id, mode: "now", platforms: s.platforms } : { postId: id, mode: "schedule", local: s.schedule.local, timezone: s.schedule.timezone, approve: s.schedule.approve });
    setBusy(null);
    if (!res.ok) return void setSubmitError(res.error);
    if (res.mode === "now") {
      const failed = (res.results ?? []).filter((r) => !r.ok);
      setDone({ mode, postId: id, note: failed.length ? `${failed.length} platform${failed.length === 1 ? " was" : "s were"} not started: ${failed.map((f) => f.error).join(" ")}` : "Handed to the publisher. Progress is shown below." });
    } else setDone({ mode, postId: id, note: res.scheduled ? `Scheduled for ${res.scheduled.display}. ${res.scheduled.approved ? "It is approved and publishes by itself." : "It publishes after someone with Publish approves it."}` : "Scheduled." });
    toast.success(mode === "now" ? "Sent to the publisher." : "Scheduled.");
  }

  if (done) {
    return (
      <GlassCard interactive={false}>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-none">{done.mode === "now" ? "Publishing" : done.mode === "schedule" ? "Scheduled" : "Draft saved"}</h2>
              <p className="text-xs text-muted-foreground">{done.note}</p>
            </div>
          </div>
          {done.mode !== "draft" && <PublishTracker postId={done.postId} platforms={s.platforms} canPublish={init.can.publish} />}
          <div className="flex flex-wrap gap-2">
            <Link href={`/viralpulse-ai/posts/${done.postId}`} className={buttonVariants({ size: "sm" })}>Open the post</Link>
            <Link href="/viralpulse-ai/posts" className={buttonVariants({ size: "sm", variant: "outline" })}>All posts</Link>
            <Link href="/viralpulse-ai/posts/new" className={buttonVariants({ size: "sm", variant: "outline" })}>Create another</Link>
          </div>
        </CardContent>
      </GlassCard>
    );
  }

  const body = (() => {
    switch (step) {
      case "goal": return <StepGoal {...props} />;
      case "brief": return <StepBrief {...props} />;
      case "content": return <StepContent {...props} />;
      case "media": return <StepMedia {...props} />;
      case "options": return <StepOptions {...props} />;
      case "schedule": return <StepSchedule {...props} />;
      case "review": return <StepReview {...props} onGoTo={go} blockedStep={blockedStep} />;
    }
  })();

  const last = idx === STEP_KEYS.length - 1;
  const submitLabel = s.schedule.mode === "now" ? "Publish now" : s.schedule.mode === "schedule" ? (init.can.publish && s.schedule.approve ? "Schedule and approve" : "Schedule for approval") : "Save draft";
  const SubmitIcon = s.schedule.mode === "now" ? Send : s.schedule.mode === "schedule" ? CalendarClock : Save;

  return (
    <div className="space-y-4">
      {init.lockedReason && <Callout tone="warn">{init.lockedReason} You can look at it, but not change it.</Callout>}
      {restore && (
        <Callout tone="info">
          <p>You have an unsaved draft on this device.</p>
          <div className="mt-1 flex gap-3">
            <button type="button" className="font-semibold underline" onClick={() => { dispatch({ type: "set", patch: sanitizeWizardState(JSON.parse(restore), init.settings.timezone) }); setRestore(null); }}>Restore it</button>
            <button type="button" className="font-semibold underline" onClick={() => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setRestore(null); }}>Discard it</button>
          </div>
        </Callout>
      )}
      <Stepper steps={WIZARD_STEPS.map((x) => ({ key: x.key, label: x.label, hint: x.hint }))} current={step} onSelect={(k) => go(k as StepKey)} label="Post steps" variant="ugc" className="w-full" />
      <GlassCard interactive={false}>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {save === "saving" ? <><Loader2 className="size-3 animate-spin" /> Saving…</> : save === "saved" ? <><CheckCircle2 className="size-3 text-emerald-600" /> Saved</> : save === "local" ? <><CloudOff className="size-3" /> Kept on this device until the goal and topic are filled in</> : save === "error" ? <span className="text-rose-600 dark:text-rose-400">{`Not saved: ${saveMsg}`}</span> : null}
            </p>
          </div>
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-none">{`Step ${idx + 1} of ${STEP_KEYS.length}: ${WIZARD_STEPS[idx].label}`}</h2>
            <p className="text-xs text-muted-foreground">{WIZARD_STEPS[idx].hint}</p>
          </div>
          {init.accounts.length === 0 && step !== "goal" && <ErrorState title="No social account is connected">Connect an account in Settings &gt; Connected accounts to publish.</ErrorState>}
          {body}
          {validation.warnings.length > 0 && step !== "review" && (
            <ul className="space-y-1">{validation.warnings.map((w) => <li key={w}><Callout tone="warn">{w}</Callout></li>)}</ul>
          )}
          {submitError && <Callout tone="bad">{submitError}</Callout>}
        </CardContent>
      </GlassCard>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/50 bg-background/95 px-3 py-2 backdrop-blur">
        <Button type="button" variant="outline" onClick={() => (idx === 0 ? router.push("/viralpulse-ai/posts") : go(STEP_KEYS[idx - 1]))} disabled={busy !== null}>
          <ArrowLeft className="size-4" /> {idx === 0 ? "Cancel" : "Back"}
        </Button>
        {locked ? (
          !last && <Button type="button" onClick={() => go(STEP_KEYS[idx + 1])}>Next <ArrowRight className="size-4" /></Button>
        ) : last ? (
          <Button type="button" onClick={() => void submit()} disabled={busy !== null}>
            {busy === "submit" ? <Loader2 className="size-4 animate-spin" /> : <SubmitIcon className="size-4" />} {submitLabel}
          </Button>
        ) : (
          <Button type="button" onClick={() => void next()} disabled={busy !== null}>
            {busy === "next" ? <Loader2 className="size-4 animate-spin" /> : null} Next <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** What autosave compares: everything except the final confirmation (the last step reached is saved too). */
function strip(st: WizardState) {
  const rest: Partial<WizardState> = { ...st };
  delete rest.confirmed;
  return rest;
}

export { emptyWizard };
