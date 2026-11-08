"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Loader2, Plus, RotateCcw, Save, Sparkles, Trash2, Wand2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { Chip, ProgressBar } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import { Field } from "@/components/products/viralpulse-ai/SmmsBits";
import { capabilitiesFor } from "@/lib/products/viralpulse-ai/ugc/pricing";
import { addScene, allowedDurationList, checkScript, explainFinding, MAX_SCENES, moveScene, removeScene, sceneSpeech, totalSecs, updateScene } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import { ILLUSTRATIVE_NOTICE } from "@/lib/products/viralpulse-ai/ugc/policy";
import type { ProjectView } from "@/lib/products/viralpulse-ai/ugc/api";
import type { UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";
import type { ScenePlan, UgcScene } from "@/lib/products/viralpulse-ai/ugc/types";
import { cn } from "@/lib/utils";

const STAGES = ["Reading your brief", "Writing the hook and scenes", "Checking facts, numbers and policy", "Almost there"];

function GeneratingCard({ elapsed }: { elapsed: number }) {
  const stage = Math.min(STAGES.length - 1, Math.floor(elapsed / 6));
  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="size-4 animate-spin text-primary" /> {STAGES[stage]}…</div>
      <ProgressBar pct={Math.min(92, 8 + elapsed * 2.5)} label="Writing the script" />
      <p className="text-xs text-muted-foreground">{`This usually takes 10 to 40 seconds (${elapsed}s so far). You can keep this page open; nothing is charged for video yet.`}</p>
    </div>
  );
}

function Meter({ words, maxWords, secs, duration, level }: { words: number; maxWords: number; secs: number; duration: number; level: "ok" | "tight" | "over" }) {
  const pct = maxWords > 0 ? Math.min(100, (words / maxWords) * 100) : 0;
  return (
    <div className="space-y-1" aria-label="Speaking time">
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
        <span className={cn("font-semibold", level === "over" ? "text-rose-600 dark:text-rose-400" : level === "tight" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
          {level === "over" ? "Too long to speak in this scene" : level === "tight" ? "Tight fit" : "Fits the scene"}
        </span>
        <span className="tabular-nums text-muted-foreground">{`${words}/${maxWords} words · ~${secs}s of ${duration}s`}</span>
      </div>
      <ProgressBar pct={pct} tone={level === "over" ? "bad" : level === "tight" ? "warn" : "ok"} label="Words against what fits in this scene" />
    </div>
  );
}

function SceneCard({ plan, scene, count, errors, disabled, caps, onChange, onMove, onRemove, onRewrite, rewriting }: {
  plan: ScenePlan; scene: UgcScene; count: number; errors: string[]; disabled: boolean; caps: ReturnType<typeof capabilitiesFor>;
  onChange: (patch: Partial<UgcScene>) => void; onMove: (to: number) => void; onRemove: () => void; onRewrite: (note: string) => void; rewriting: boolean;
}) {
  const sp = sceneSpeech(scene, plan.language);
  const [rw, setRw] = useState(false);
  const [note, setNote] = useState("");
  const names = new Map(plan.actors.map((a) => [a.id, a.label]));
  const i = scene.index;
  const setLine = (li: number, patch: Partial<UgcScene["dialogue"][number]>) => onChange({ dialogue: scene.dialogue.map((l, k) => (k === li ? { ...l, ...patch } : l)) });
  return (
    <div className={cn("space-y-3 rounded-2xl border bg-card/60 p-3 sm:p-4", errors.length ? "border-rose-500/50" : "border-border/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
        <div className="w-24"><OptionSelect value={String(scene.durationSecs)} onChange={(v) => onChange({ durationSecs: Number(v) })} options={allowedDurationList(caps).map((d) => ({ value: String(d), label: `${d} s` }))} disabled={disabled} aria-label={`Length of scene ${i + 1}`} /></div>
        <div className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || i === 0} onClick={() => onMove(i - 1)} aria-label={`Move scene ${i + 1} up`}><ArrowUp className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || i === count - 1} onClick={() => onMove(i + 1)} aria-label={`Move scene ${i + 1} down`}><ArrowDown className="size-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled || count <= 1} onClick={onRemove} aria-label={`Remove scene ${i + 1}`}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What happens on screen" htmlFor={`vp-${i}`} className="sm:col-span-2"><Textarea id={`vp-${i}`} rows={3} value={scene.visualPrompt} disabled={disabled} onChange={(e) => onChange({ visualPrompt: e.target.value })} /></Field>
        <Field label="Setting" htmlFor={`st-${i}`}><Input id={`st-${i}`} value={scene.setting} disabled={disabled} onChange={(e) => onChange({ setting: e.target.value })} /></Field>
        <Field label="Camera" htmlFor={`cm-${i}`}><Input id={`cm-${i}`} value={scene.cameraNotes} disabled={disabled} onChange={(e) => onChange({ cameraNotes: e.target.value })} /></Field>
        <Field label="On-screen text (optional)" htmlFor={`os-${i}`} className="sm:col-span-2"><Input id={`os-${i}`} value={scene.onScreenText ?? ""} maxLength={120} disabled={disabled} onChange={(e) => onChange({ onScreenText: e.target.value })} /></Field>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">Who is in this scene</p>
        <div className="flex flex-wrap gap-2">
          {plan.actors.map((a) => {
            const on = scene.actorIds.includes(a.id);
            return (
              <button key={a.id} type="button" disabled={disabled} aria-pressed={on} onClick={() => onChange({ actorIds: on ? scene.actorIds.filter((x) => x !== a.id) : [...scene.actorIds, a.id], dialogue: on ? scene.dialogue.filter((l) => l.speakerId !== a.id) : scene.dialogue })}
                className={cn("rounded-full border px-3 py-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/40", on ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground")}>
                {on && <Check className="mr-1 inline size-3" />}{a.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium">Dialogue</p>
        {scene.dialogue.length === 0 && <p className="text-xs text-muted-foreground">No one speaks in this scene.</p>}
        {scene.dialogue.map((l, li) => (
          <div key={li} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="sm:w-40"><OptionSelect value={l.speakerId} onChange={(v) => setLine(li, { speakerId: v })} options={scene.actorIds.map((id) => ({ value: id, label: names.get(id) ?? id }))} disabled={disabled} aria-label={`Speaker of line ${li + 1} in scene ${i + 1}`} /></div>
            <Textarea rows={2} value={l.text} disabled={disabled} onChange={(e) => setLine(li, { text: e.target.value })} aria-label={`Line ${li + 1} in scene ${i + 1}`} className="flex-1" />
            <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} onClick={() => onChange({ dialogue: scene.dialogue.filter((_, k) => k !== li) })} aria-label={`Remove line ${li + 1}`}><XCircle className="size-3.5" /></Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="xs" disabled={disabled || scene.actorIds.length === 0} onClick={() => onChange({ dialogue: [...scene.dialogue, { speakerId: scene.actorIds[0] ?? "", text: "", language: plan.language }] })}><Plus className="size-3" /> Add a line</Button>
          <Button type="button" variant="outline" size="xs" disabled={disabled || rewriting} onClick={() => setRw((x) => !x)}><Wand2 className="size-3" /> Rewrite with AI</Button>
        </div>
        {rw && (
          <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2 sm:flex-row">
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="How? e.g. shorter and funnier (optional)" aria-label="Rewrite instruction" />
            <Button type="button" size="sm" disabled={rewriting} onClick={() => { onRewrite(note); setRw(false); setNote(""); }}>{rewriting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Rewrite</Button>
          </div>
        )}
        {rw && <p className="text-[11px] text-muted-foreground">The AI rewrites the script as a new version asked to change only this scene&apos;s lines. Your earlier version stays in the history.</p>}
      </div>

      <Meter words={sp.words} maxWords={sp.maxWords} secs={sp.secs} duration={scene.durationSecs} level={sp.level} />
      {errors.length > 0 && (
        <ul role="alert" className="space-y-0.5 rounded-xl bg-rose-500/10 p-2 text-xs text-rose-800 dark:text-rose-200">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
    </div>
  );
}

export default function UgcScriptStep({
  project, style, scriptsConnected, canManageIntegrations, canEdit, busy, rewritingScene, elapsed, serverError, onGenerate, onSave, onDirty, onBackToCast,
}: {
  project: ProjectView;
  style: UgcStyle | null;
  scriptsConnected: boolean;
  canManageIntegrations: boolean;
  canEdit: boolean;
  busy: "generate" | "save" | null;
  rewritingScene: number | null;
  elapsed: number;
  serverError: string | null;
  onGenerate: (instruction?: string, scene?: number) => Promise<void>;
  onSave: (plan: ScenePlan) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
  onBackToCast: () => void;
}) {
  const [plan, setPlan] = useState<ScenePlan | null>(project.plan);
  const [instruction, setInstruction] = useState("");
  const dirty = useMemo(() => !!plan && JSON.stringify(plan) !== JSON.stringify(project.plan), [plan, project.plan]);
  // A saved or newly written version replaces the local copy (derived-state reset during render, not in an effect).
  const planKey = `${project.planVersion}:${project.updatedAt}`;
  const [seenKey, setSeenKey] = useState(planKey);
  if (seenKey !== planKey) {
    setSeenKey(planKey);
    setPlan(project.plan);
  }
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  const caps = capabilitiesFor(project.options.provider);
  const check = useMemo(() => (plan ? checkScript(plan, style, project.options.provider, project.providedFacts) : null), [plan, style, project.options.provider, project.providedFacts]);
  const generating = busy === "generate";
  const stale = project.status === "draft" && !!project.plan;
  const disabledAll = !canEdit || busy !== null;
  const noKey = !scriptsConnected;
  const total = plan ? totalSecs(plan) : 0;
  const range = style?.durationRange;

  return (
    <div className="space-y-5">
      {!plan && !generating && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-10 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" /></div>
          <p className="text-sm font-semibold">Write the script</p>
          <p className="max-w-md text-xs text-muted-foreground">The AI writes the hook, the scenes and the dialogue from your brief, in your style and cast, using only the facts you gave. You can edit every word afterwards.</p>
          <Button type="button" disabled={disabledAll || noKey} onClick={() => onGenerate()}><Sparkles className="size-4" /> Generate script</Button>
        </div>
      )}
      {noKey && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          OpenAI isn&apos;t connected, so scripts can&apos;t be written or rewritten. {canManageIntegrations ? <><Link href="/viralpulse-ai/settings?tab=integrations" className="font-semibold underline">Connect it in Settings → Integrations</Link>.</> : "Ask an admin to connect it in Settings → Integrations."} You can still edit a script that already exists.
        </p>
      )}
      {generating && <GeneratingCard elapsed={elapsed} />}
      {serverError && !generating && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1"><p className="font-semibold">That didn&apos;t work</p><p>{serverError}</p></div>
        </div>
      )}
      {stale && !generating && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" /> Your brief, style or cast changed after this script was written. Write a new version so it matches before you continue.
        </p>
      )}

      {plan && check && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="info">{`Version ${project.planVersion}`}</Chip>
            <Chip tone={range && (total < range[0] - 1 || total > range[1] + 1) ? "bad" : "neutral"}>{`${plan.scenes.length} scenes · ${total} s${range ? ` (this style allows ${range[0]}-${range[1]} s)` : ""}`}</Chip>
            {project.illustrative && <Chip tone="warn" title={ILLUSTRATIVE_NOTICE}>Illustrative notice added</Chip>}
            <button type="button" onClick={onBackToCast} className="text-xs font-medium text-primary underline-offset-2 hover:underline">Change the cast</button>
          </div>

          <div className="rounded-2xl border border-border/40 bg-background/50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Ask the AI for a new version" htmlFor="ugc-instr" className="flex-1" hint="Replaces nothing: the current version stays in the history.">
                <Input id="ugc-instr" value={instruction} maxLength={400} placeholder="e.g. make the hook funnier, keep it under 30 seconds" disabled={disabledAll || noKey} onChange={(e) => setInstruction(e.target.value)} />
              </Field>
              <Button type="button" variant="outline" disabled={disabledAll || noKey || dirty} onClick={() => onGenerate(instruction.trim() || undefined)} title={dirty ? "Save or discard your edits first" : undefined}>
                {generating ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} {instruction.trim() ? "Revise script" : "Write again"}
              </Button>
            </div>
          </div>

          <ul className="flex flex-wrap gap-2" aria-label="Cast">
            {plan.actors.map((a) => <li key={a.id} className="rounded-full bg-muted/60 px-3 py-1 text-xs"><strong>{a.label}</strong>{` · ${a.ageRange} · ${a.wardrobe}`}</li>)}
          </ul>

          {check.general.length > 0 && (
            <ul role="alert" className="space-y-0.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-200">{check.general.map((e) => <li key={e}>{e}</li>)}</ul>
          )}

          <div className="space-y-3">
            {plan.scenes.map((s) => (
              <SceneCard
                key={s.index}
                plan={plan}
                scene={s}
                count={plan.scenes.length}
                errors={check.byScene[s.index] ?? []}
                disabled={disabledAll}
                caps={caps}
                rewriting={generating && rewritingScene === s.index}
                onChange={(patch) => setPlan((p) => (p ? updateScene(p, s.index, patch) : p))}
                onMove={(to) => setPlan((p) => (p ? moveScene(p, s.index, to) : p))}
                onRemove={() => setPlan((p) => (p ? removeScene(p, s.index) : p))}
                onRewrite={(note) => onGenerate(`Rewrite ONLY the dialogue of scene ${s.index + 1}${note ? ` (${note})` : ""}. Keep every other scene, the cast and the structure exactly as they are, word for word.`, s.index)}
              />
            ))}
          </div>
          <Button type="button" variant="outline" disabled={disabledAll || plan.scenes.length >= MAX_SCENES} onClick={() => setPlan((p) => (p ? addScene(p, caps) : p))}>
            <Plus className="size-4" /> {plan.scenes.length >= MAX_SCENES ? `At most ${MAX_SCENES} scenes` : "Add a scene"}
          </Button>

          <section aria-label="Content check" className="space-y-2 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
            <h3 className="text-sm font-bold">Content check</h3>
            {check.policy.blocked.length === 0 && check.policy.flagged.length === 0 && <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"><Check className="size-3.5" /> Nothing in the brief or script needs attention.</p>}
            {check.policy.blocked.map((f) => {
              const e = explainFinding(f);
              return (
                <div key={f.code} role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs">
                  <p className="font-semibold text-rose-800 dark:text-rose-200">Blocked: {e.title}</p>
                  <p className="mt-0.5 text-rose-900/80 dark:text-rose-200/80">How to fix: {e.fix}</p>
                </div>
              );
            })}
            {check.policy.flagged.map((f) => {
              const e = explainFinding(f);
              return (
                <div key={f.code} className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">Check: {e.title}</p>
                  <p className="mt-0.5 text-amber-900/80 dark:text-amber-200/80">{e.fix} You&apos;ll confirm this on the last step.</p>
                </div>
              );
            })}
            {check.policy.blocked.length > 0 && <p className="text-[11px] text-muted-foreground">Blocked points must be fixed (in the brief on step 1, or in the script above) before a video can be generated. The server checks again before any money is spent.</p>}
          </section>

          <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-background/95 p-3 shadow-lg backdrop-blur">
            <span className="text-xs text-muted-foreground" aria-live="polite">{dirty ? "You have unsaved edits." : "All edits saved."}</span>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={!dirty || busy !== null} onClick={() => setPlan(project.plan)}>Discard</Button>
              <Button type="button" size="sm" disabled={!dirty || busy !== null || !canEdit} onClick={() => plan && onSave(plan)}>
                {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save edits
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
