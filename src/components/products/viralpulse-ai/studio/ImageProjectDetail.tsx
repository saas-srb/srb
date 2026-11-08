"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Columns2, Copy, Download, ImageIcon, Loader2, Megaphone, Pencil, RefreshCw, Send, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { Field, mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import { Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import { Chip, ProgressBar } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import { briefContext } from "@/components/products/viralpulse-ai/studio/ImageBriefStep";
import type { StudioConfig } from "@/components/products/viralpulse-ai/studio/config";
import { approveAction, attachMediaToAdAction, chooseAction, deleteProjectAction, duplicateProjectAction, editVariantAction, finishAction, generateAction, getProjectAction, listAdsForPickerAction, projectTrailAction, rejectAction, startPostFromMediaAction } from "@/app/(products)/viralpulse-ai/(protected)/image-studio/actions";
import { goalById, safeBox, specByKey } from "@/lib/products/viralpulse-ai/images/specs";
import { isActive, nextPollDelay, POLL, pollDecision, progressPct, statusMeta } from "@/lib/products/viralpulse-ai/images/state";
import { capBar, formatUsd } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import { policyOf } from "@/lib/products/viralpulse-ai/images/wizard";
import { variantUrl } from "@/lib/products/viralpulse-ai/images/view";
import type { ProjectView, Variant } from "@/lib/products/viralpulse-ai/images/types";
import { cn, formatDateTime } from "@/lib/utils";

interface TrailEntry { id: string; at: string; by: string | null; action: string; summary: string }

function SafePreview({ src, specKey }: { src: string; specKey: string }) {
  const spec = specByKey(specKey);
  if (!spec) return null;
  const b = safeBox(spec);
  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-lg border border-border/60 bg-muted" style={{ aspectRatio: `${spec.width} / ${spec.height}`, maxHeight: "24rem" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- private authenticated route */}
      <img src={src} alt="Chosen picture cropped to this size" className="size-full object-cover" />
      <div className="pointer-events-none absolute border-2 border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" style={{ left: `${(b.left / spec.width) * 100}%`, top: `${(b.top / spec.height) * 100}%`, width: `${(b.width / spec.width) * 100}%`, height: `${(b.height / spec.height) * 100}%` }} />
    </div>
  );
}

function EditDialog({ project, variant, config, open, onClose, onDone }: { project: ProjectView; variant: Variant | null; config: StudioConfig; open: boolean; onClose: () => void; onDone: (p: ProjectView) => void }) {
  const [text, setText] = useState("");
  const [flags, setFlags] = useState<{ code: string; message: string }[] | null>(null);
  const [ack, setAck] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const per = project.variants.length ? project.totalCostUsd / Math.max(project.variants.length, 1) : 0;
  const run = (acknowledge: string[]) => start(async () => {
    if (!variant) return;
    const r = await editVariantAction(project.id, variant.id, text, acknowledge);
    if (!r.ok) return void toast.error(r.error);
    if (r.outcome === "needs_ack") { setFlags(r.flags); setAck([]); return; }
    onDone(r.project);
    if (r.outcome === "needs_manager") toast.info(`A manager was asked to approve about $${r.estimateUsd.toFixed(2)}.`);
    else toast.success("Editing the picture in the background.");
    setText(""); setFlags(null); onClose();
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Edit this picture</DialogTitle><DialogDescription>The original stays. Your change is made on a copy, so you can always go back.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {variant && (
            // eslint-disable-next-line @next/next/no-img-element -- private authenticated route
            <img src={variantUrl(project.id, variant.id)} alt="Picture being edited" className="mx-auto max-h-48 rounded-lg border border-border/50 object-contain" />
          )}
          <AiField fieldKey="image.instruction" label="What should change?" id="img-edit" value={text} maxLength={500} onChange={(x) => setText(String(x))} getContext={() => ({ ...briefContext(project.brief, config)(), prompt: project.brief.subject })} placeholder="Make the background warmer" hint="Change one thing at a time. To change text, edit the project's brief: the app prints text itself." />
          {flags && (
            <Notice tone="warn"><div className="space-y-2"><p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="size-4" /> Check before editing</p>{flags.map((f) => <label key={f.code} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={ack.includes(f.code)} onChange={(e) => setAck((a) => (e.target.checked ? [...a, f.code] : a.filter((x) => x !== f.code)))} /> {f.message}</label>)}</div></Notice>
          )}
          <p className="rounded-xl bg-muted/50 p-3 text-xs">{`Cost: about ${formatUsd(per)} for one more picture. It counts toward today's limit${per > config.settings.approvalThresholdUsd && !config.canApprove ? ", and a manager will be asked to approve it" : ""}.`}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={pending || text.trim().length < 4 || (!!flags && ack.length < flags.length)} onClick={() => run(flags ? ack : [])}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Apply change</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UseInAd({ mediaId, open, onClose }: { mediaId: string; open: boolean; onClose: () => void }) {
  const [ads, setAds] = useState<{ id: string; name: string; campaignId: string; platform: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!open || ads) return;
    void listAdsForPickerAction().then((r) => { if (r.ok) setAds(r.ads); else setErr(r.error); });
  }, [open, ads]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Use in a campaign or ad</DialogTitle><DialogDescription>Add this picture to a draft image ad, or start a new campaign with it.</DialogDescription></DialogHeader>
        {err && <p role="alert" className="text-xs text-rose-600">{err}</p>}
        {!ads && !err && <p className="text-xs text-muted-foreground">Loading ads…</p>}
        {ads && ads.length === 0 && <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">You have no draft image ads yet.</p>}
        <ul className="space-y-1.5">
          {ads?.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-xl border border-border/40 p-2 text-xs">
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.name}</span><span className="text-muted-foreground">{a.platform}</span></span>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await attachMediaToAdAction(mediaId, a.id); if (!r.ok) return void toast.error(r.error); toast.success("Added to the ad."); window.location.href = r.href; })}>Add</Button>
            </li>
          ))}
        </ul>
        <DialogFooter><Button nativeButton={false} variant="outline" render={<Link href={`/viralpulse-ai/campaigns/new?step=ads&media=${mediaId}`} />}><Megaphone className="size-4" /> Start a new campaign</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ImageProjectDetail({ initial, config, canGenerate }: { initial: ProjectView; config: StudioConfig; canGenerate: boolean }) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [tab, setTab] = useState("pictures");
  const [compare, setCompare] = useState<string[]>([]);
  const [editing, setEditing] = useState<Variant | null>(null);
  const [adFor, setAdFor] = useState<string | null>(null);
  const [trail, setTrail] = useState<{ items: TrailEntry[] | null; error: string | null }>({ items: null, error: null });
  const [pollStopped, setPollStopped] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [canApprove, setCanApprove] = useState(config.canApprove);
  const [pending, start] = useTransition();
  const [fin, setFin] = useState({ name: initial.brief.name, tags: "", folder: "", format: "jpeg", specKeys: initial.brief.specKeys, badge: initial.brief.badge ?? policyOf(initial.brief).suggestAiBadge, applyLogo: !!initial.brief.applyLogo && !!config.logo });
  const [previewSpec, setPreviewSpec] = useState(initial.brief.specKeys[0] ?? "");
  const ref = useRef(project);
  useEffect(() => { ref.current = project; }, [project]);

  const goal = goalById(project.brief.goalId);
  const meta = statusMeta(project.status);
  const active = isActive(project.status);
  const chosen = project.chosenIds;
  const pct = progressPct(project.progress);
  const missing = Math.max(0, project.progress.total - project.progress.done);
  const bar = capBar(config.spentTodayUsd, 0, config.settings.dailySpendCapUsd);
  const labelOf = (v: Variant, i: number) => (goal?.slides ? `Slide ${(v.slide ?? 0) + 1}` : `Option ${i + 1}`) + (v.parentId ? " (edited)" : "");

  // Live progress: poll while pictures are being drawn and the tab is visible; back off on errors; stop when finished.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let errors = 0;
    let stopped = false;
    const schedule = (ms: number) => { clearTimeout(timer); timer = setTimeout(tick, ms); };
    async function tick() {
      if (stopped) return;
      const d = pollDecision({ status: ref.current.status, hidden: document.hidden, consecutiveErrors: errors });
      setPollStopped(d.reason === "errors");
      if (!d.poll) return;
      const r = await getProjectAction(ref.current.id);
      if (stopped) return;
      if (r.ok) {
        errors = 0;
        const before = ref.current.status;
        setProject(r.project);
        setCanApprove(r.canApprove);
        if (isActive(before) && !isActive(r.project.status)) {
          if (r.project.status === "ready") toast.success("Your pictures are ready.");
          else if (r.project.status === "failed") toast.error("Generation failed. See what went wrong below.");
          router.refresh();
          return;
        }
      } else errors += 1;
      schedule(nextPollDelay(errors));
    }
    const onVis = () => { if (!document.hidden && !stopped) schedule(300); };
    document.addEventListener("visibilitychange", onVis);
    schedule(POLL.baseMs);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [active, nonce, router]);

  useEffect(() => {
    if (tab !== "activity" || trail.items) return;
    void projectTrailAction(project.id).then((r) => setTrail(r.ok ? { items: r.items, error: null } : { items: null, error: r.error }));
  }, [tab, trail.items, project.id]);

  const refresh = useCallback(async () => { const r = await getProjectAction(ref.current.id); if (r.ok) setProject(r.project); }, []);
  const act = <T extends { ok: boolean; project?: ProjectView }>(fn: () => Promise<T>) => async () => {
    const r = await fn();
    if (r.ok && r.project) setProject(r.project);
    return r as unknown as { ok: boolean; error?: string; id?: string };
  };

  async function choose(id: string) {
    const next = goal?.slides ? (chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]) : [id];
    const r = await chooseAction(project.id, next);
    if (r.ok) setProject(r.project); else toast.error(r.error);
  }

  function generateMore() {
    start(async () => {
      const r = await generateAction(project.id);
      if (!r.ok) return void toast.error(r.error);
      if (r.outcome === "needs_ack") return void toast.error("This brief has points to check. Open the brief and approve it from the Review step.");
      setProject(r.project);
      if (r.outcome === "needs_manager") toast.info(`A manager was asked to approve about $${r.estimateUsd.toFixed(2)}.`);
      else toast.success("Drawing more pictures in the background.");
    });
  }

  const editHref = `/viralpulse-ai/image-studio?tab=create&project=${project.id}`;
  const exportsBySpec = useMemo(() => project.exports.map((e) => ({ ...e, spec: specByKey(e.specKey) })), [project.exports]);
  const allowEdit = canGenerate && !active;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-4">
        <GlassCard interactive={false}>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={meta.tone}>{meta.busy && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}{meta.label}</Chip>
              {goal && <Chip>{goal.label}</Chip>}
              <Chip>{`${project.brief.provider === "gemini" ? "Gemini" : "OpenAI"} · ${project.brief.language}`}</Chip>
              <span className="ml-auto text-[11px] text-muted-foreground">{`Updated ${formatDateTime(new Date(project.updatedAt))}`}</span>
            </div>

            {(active || project.progress.total > 0) && project.status !== "draft" && project.status !== "briefed" && (
              <div className="space-y-1.5" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="font-semibold">{active ? `${project.progress.done} of ${project.progress.total} picture${project.progress.total === 1 ? "" : "s"} drawn` : `${project.progress.done} of ${project.progress.total} picture${project.progress.total === 1 ? "" : "s"} drawn`}</span>
                  <span className="tabular-nums text-muted-foreground">{`${formatUsd(project.totalCostUsd)} spent so far`}</span>
                </div>
                <ProgressBar pct={pct} tone={project.status === "failed" ? "bad" : project.status === "ready" || project.status === "finished" ? "ok" : "info"} label="Picture progress" />
                {active && <p className="text-[11px] text-muted-foreground">You can leave this page. Drawing continues in the background and the project stays in Projects.</p>}
                {pollStopped && (
                  <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" /> Live updates paused because the server isn&apos;t answering. Drawing carries on.
                    <Button type="button" size="xs" variant="outline" onClick={() => { setPollStopped(false); setNonce((n) => n + 1); }}><RefreshCw className="size-3" /> Check again</Button></p>
                )}
              </div>
            )}

            {project.status === "failed" && (
              <div role="alert" className="space-y-1 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-200">
                <p className="font-semibold">The pictures didn&apos;t finish</p>
                <p>{project.error ?? "Something went wrong while generating."}</p>
                <p>Nothing is charged for a failed request. Change the brief or try again.</p>
              </div>
            )}
            {project.status === "ready" && project.error && <Notice tone="warn">{project.error}</Notice>}

            {project.status === "awaiting_approval" && project.pendingApproval && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <span className="flex-1">{`Waiting for a manager: about ${formatUsd(project.pendingApproval.estimateUsd)} is over the ${formatUsd(config.settings.approvalThresholdUsd)} approval limit. Requested ${formatDateTime(new Date(project.pendingApproval.at))}.`}</span>
                {canApprove && (
                  <>
                    <ActionButton action={async () => { const r = await approveAction(project.id); if (r.ok && r.outcome !== "needs_ack" && "project" in r) setProject(r.project); else if (r.ok) toast.error("This brief has points to check."); await refresh(); return { ok: r.ok, error: r.ok ? undefined : r.error }; }} success="Approved. Drawing started." variant="default">Approve and run</ActionButton>
                    <ActionButton action={async () => { const r = await rejectAction(project.id); await refresh(); return { ok: r.ok, error: r.ok ? undefined : r.error }; }} success="Declined" variant="outline">Decline</ActionButton>
                  </>
                )}
              </div>
            )}
            {(project.status === "draft" || project.status === "briefed") && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                <span className="flex-1">{project.status === "draft" ? "This is a draft. Finish the brief to generate." : "The brief is ready. Review the cost and approve to generate."}</span>
                {canGenerate && <Button size="sm" nativeButton={false} render={<Link href={editHref} />}><Pencil className="size-3.5" /> Continue editing</Button>}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {allowEdit && project.status !== "draft" && project.status !== "briefed" && project.status !== "awaiting_approval" && (
                <Button size="sm" disabled={pending} onClick={generateMore}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {project.variants.length ? "Make more options" : "Try again"}</Button>
              )}
              {canGenerate && !active && <Button size="sm" variant="outline" nativeButton={false} render={<Link href={editHref} />}><Pencil className="size-3.5" /> Edit brief</Button>}
              {canGenerate && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await duplicateProjectAction(project.id); if (!r.ok) return void toast.error(r.error); toast.success("Copied into a new draft."); router.push(`/viralpulse-ai/image-studio?tab=create&project=${r.id}`); })}><Copy className="size-3.5" /> Duplicate</Button>
              )}
              {canGenerate && (
                <ActionButton action={act(() => deleteProjectAction(project.id))} confirm={{ title: "Delete this project?", description: "It leaves your list. Pictures already saved to the Media Library stay there until you delete them from the library.", confirmLabel: "Delete" }} success="Deleted" variant="outline" redirectTo="/viralpulse-ai/image-studio?tab=projects"><Trash2 className="size-3.5" /> Delete</ActionButton>
              )}
            </div>
            {active && <p className="text-[11px] text-muted-foreground">A project that is being drawn can&apos;t be edited or deleted until it finishes.</p>}
          </CardContent>
        </GlassCard>

        <PanelTabs label="Project sections" active={tab} onSelect={setTab} tabs={[{ key: "pictures", label: "Pictures", count: project.variants.length }, { key: "export", label: "Save and use", count: project.exports.length || undefined }, { key: "history", label: "Version history" }, { key: "activity", label: "Activity" }]} />

        {tab === "pictures" && (
          <GlassCard interactive={false}>
            <CardContent className="space-y-3">
              {project.variants.length === 0 && !active && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ImageIcon className="size-5" /></div>
                  <p className="text-sm font-semibold">No pictures yet</p>
                  <p className="max-w-sm text-xs text-muted-foreground">Nothing is drawn or charged until you approve the brief on the Review step.</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{goal?.slides ? "Choose the picture for every slide." : "Choose one to finish. Tick Compare on two to view them side by side."}</p>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {project.variants.map((v, i) => {
                  const picked = chosen.includes(v.id);
                  return (
                    <li key={v.id} className={cn("rounded-xl border p-1.5", picked ? "border-primary ring-2 ring-primary/30" : "border-border/60")}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- private authenticated route */}
                      <img src={variantUrl(project.id, v.id)} alt={`${labelOf(v, i)}${v.instruction ? `, edited: ${v.instruction}` : ""}`} className="aspect-square w-full rounded-lg bg-muted object-cover" loading="lazy" />
                      <div className="mt-1.5 flex items-center justify-between gap-1 px-0.5 text-xs"><span className="truncate font-medium">{labelOf(v, i)}</span><span className="text-muted-foreground tabular-nums">{formatUsd(v.costUsd)}</span></div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Button type="button" size="xs" variant={picked ? "default" : "outline"} disabled={!allowEdit} onClick={() => choose(v.id)}>{picked ? <><Check className="size-3" /> Chosen</> : "Choose"}</Button>
                        <Button type="button" size="xs" variant="ghost" aria-pressed={compare.includes(v.id)} onClick={() => setCompare((c) => (c.includes(v.id) ? c.filter((x) => x !== v.id) : [...c, v.id].slice(-2)))}><Columns2 className="size-3" /> Compare</Button>
                        {allowEdit && <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(v)}><Wand2 className="size-3" /> Edit</Button>}
                        <a href={variantUrl(project.id, v.id)} download className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted" aria-label={`Download ${labelOf(v, i)}`}><Download className="size-3" /></a>
                      </div>
                    </li>
                  );
                })}
                {active && Array.from({ length: missing }, (_, i) => (
                  <li key={`s${i}`} className="animate-pulse rounded-xl border border-dashed border-border/60 p-1.5" aria-hidden>
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                    <p className="mt-1.5 px-0.5 text-xs text-muted-foreground">{i === 0 ? "Drawing…" : "Waiting…"}</p>
                  </li>
                ))}
              </ul>
              {compare.length === 2 && (
                <div className="space-y-2" aria-label="Compare options">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">Side by side</p><Button size="xs" variant="outline" onClick={() => setCompare([])}><X className="size-3" /> Close</Button></div>
                  <div className="grid gap-3 sm:grid-cols-2">{compare.map((id) => (
                    // eslint-disable-next-line @next/next/no-img-element -- private authenticated route
                    <img key={id} src={variantUrl(project.id, id)} alt="Compared option" className="w-full rounded-xl border border-border/60 bg-muted object-contain" />
                  ))}</div>
                </div>
              )}
            </CardContent>
          </GlassCard>
        )}

        {tab === "export" && (
          <GlassCard interactive={false}>
            <CardContent className="space-y-4">
              {!chosen.length ? <Notice tone="warn">Choose a picture on the Pictures tab first.</Notice> : (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
                  <div className="space-y-3">
                    <AiField fieldKey="image.name" label="Name" id="img-fname" value={fin.name} maxLength={160} onChange={(x) => setFin((f) => ({ ...f, name: String(x) }))} getContext={() => ({ prompt: project.brief.subject, platform: project.brief.specKeys.map((k) => specByKey(k)?.group).filter(Boolean).join(", ") })} />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Folder"><Input value={fin.folder} maxLength={60} onChange={(e) => setFin((f) => ({ ...f, folder: e.target.value }))} placeholder="optional" aria-label="Folder" /></Field>
                      <Field label="Tags"><Input value={fin.tags} onChange={(e) => setFin((f) => ({ ...f, tags: e.target.value }))} placeholder="diwali, offer" aria-label="Tags" /></Field>
                    </div>
                    <fieldset className="space-y-1">
                      <legend className="text-xs font-medium">Sizes to save</legend>
                      {project.brief.specKeys.map((k) => { const s = specByKey(k); if (!s) return null; return (
                        <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fin.specKeys.includes(k)} onChange={(e) => setFin((f) => ({ ...f, specKeys: e.target.checked ? [...f.specKeys, k] : f.specKeys.filter((x) => x !== k) }))} /><span>{`${s.group}: ${s.label}`}</span><span className="text-xs text-muted-foreground">{`${s.width}x${s.height}`}</span></label>
                      ); })}
                    </fieldset>
                    <div className="space-y-2 rounded-xl border border-border/50 p-3 text-sm">
                      <p className="font-semibold">AI disclosure</p>
                      <p className="text-xs text-muted-foreground">Every file&apos;s metadata says it is AI generated. Add a visible badge too when it could pass as a real photo of people.</p>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={fin.badge} onChange={(e) => setFin((f) => ({ ...f, badge: e.target.checked }))} /> Show an &ldquo;AI generated&rdquo; badge</label>
                      {config.logo && <label className="flex items-center gap-2"><input type="checkbox" checked={fin.applyLogo} onChange={(e) => setFin((f) => ({ ...f, applyLogo: e.target.checked }))} /> Place the brand logo</label>}
                      <label className="flex items-center gap-2">File type <OptionSelect value={fin.format} onChange={(v) => setFin((f) => ({ ...f, format: v }))} options={[{ value: "jpeg", label: "JPEG (smaller)" }, { value: "png", label: "PNG" }]} aria-label="File type" /></label>
                    </div>
                    <Button type="button" disabled={pending || !canGenerate || fin.specKeys.length === 0 || active} onClick={() => start(async () => {
                      const r = await finishAction(project.id, { name: fin.name || goal?.label, tags: fin.tags.split(",").map((t) => t.trim()).filter(Boolean), folder: fin.folder, badge: fin.badge, applyLogo: fin.applyLogo, specKeys: fin.specKeys, format: fin.format });
                      if (!r.ok) return void toast.error(r.error);
                      setProject(r.project);
                      r.warnings.forEach((w) => toast.warning(w));
                      toast.success(`Saved ${r.exports.length} image${r.exports.length === 1 ? "" : "s"} to the Media Library.`);
                    })}>{pending ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : <><Check className="size-4" /> Save to library</>}</Button>
                  </div>
                  <div className="space-y-2">
                    <Field label="Safe-zone preview"><OptionSelect value={previewSpec} onChange={setPreviewSpec} options={project.brief.specKeys.map((k) => ({ value: k, label: specByKey(k)?.label ?? k }))} aria-label="Preview size" /></Field>
                    <SafePreview src={variantUrl(project.id, chosen[0])} specKey={previewSpec || project.brief.specKeys[0]} />
                    <p className="text-[11px] text-muted-foreground">{`Dashed box: text and logos stay inside. ${specByKey(previewSpec)?.note ?? ""}`}</p>
                  </div>
                </div>
              )}

              {exportsBySpec.length > 0 && (
                <section aria-label="Saved exports" className="space-y-2">
                  <h3 className="text-sm font-bold">Saved to the library</h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {exportsBySpec.map((e) => (
                      <li key={e.mediaId} className="flex items-center gap-3 rounded-xl border border-border/40 p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private authenticated route */}
                        <img src={mediaSrc(e.mediaId)} alt="" className="size-14 rounded-lg bg-muted object-cover" loading="lazy" />
                        <div className="min-w-0 flex-1 text-xs"><p className="truncate font-semibold">{e.spec ? `${e.spec.group}: ${e.spec.label}` : e.specKey}</p><p className="text-muted-foreground">{e.spec ? `${e.spec.width}x${e.spec.height}` : ""}{e.badge ? " · AI badge" : ""}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <a href={mediaSrc(e.mediaId)} download className="inline-flex h-6 items-center gap-1 rounded-md border border-border/60 px-2 hover:bg-muted"><Download className="size-3" /> Download</a>
                            {config.canPost && <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await startPostFromMediaAction(e.mediaId); if (!r.ok) return void toast.error(r.error); window.location.href = r.href; })}><Send className="size-3" /> Use in post</Button>}
                            {config.canAds && <Button type="button" size="xs" variant="outline" onClick={() => setAdFor(e.mediaId)}><Megaphone className="size-3" /> Use in ad</Button>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/viralpulse-ai/library" />}><ImageIcon className="size-3.5" /> Open the Media Library</Button>
                </section>
              )}
            </CardContent>
          </GlassCard>
        )}

        {tab === "history" && (
          <GlassCard interactive={false}>
            <CardContent className="space-y-2">
              {project.variants.length === 0 ? <p className="text-sm text-muted-foreground">No versions yet.</p> : (
                <ol className="space-y-2">
                  {project.variants.map((v, i) => {
                    const parent = project.variants.findIndex((x) => x.id === v.parentId);
                    return (
                      <li key={v.id} className="flex items-center gap-3 rounded-xl border border-border/40 p-2 text-xs">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private authenticated route */}
                        <img src={variantUrl(project.id, v.id)} alt="" className="size-12 rounded-lg bg-muted object-cover" loading="lazy" />
                        <div className="min-w-0 flex-1"><p className="font-semibold">{labelOf(v, i)}</p><p className="text-muted-foreground">{v.parentId ? `Edited from ${parent >= 0 ? `option ${parent + 1}` : "an earlier picture"}: “${v.instruction ?? ""}”` : "Drawn from the brief"} · {v.model}</p></div>
                        <div className="text-right text-muted-foreground"><p className="tabular-nums">{formatUsd(v.costUsd)}</p><p>{formatDateTime(new Date(v.createdAt))}</p></div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </GlassCard>
        )}

        {tab === "activity" && (
          <GlassCard interactive={false}>
            <CardContent>
              {trail.error && <p role="alert" className="text-xs text-rose-600">{trail.error}</p>}
              {!trail.items && !trail.error && <p className="text-xs text-muted-foreground">Loading activity…</p>}
              {trail.items && trail.items.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
              <ul className="space-y-2">{trail.items?.map((t) => <li key={t.id} className="rounded-xl border border-border/40 p-2 text-xs"><p className="font-medium">{t.summary}</p><p className="text-muted-foreground">{`${t.by ?? "System"} · ${formatDateTime(new Date(t.at))}`}</p></li>)}</ul>
            </CardContent>
          </GlassCard>
        )}
      </div>

      <aside className="space-y-4" aria-label="Project summary">
        <GlassCard interactive={false}>
          <CardContent className="space-y-2 text-xs">
            <h3 className="text-sm font-bold">Brief</h3>
            <dl className="space-y-1.5">
              {([["Name", project.brief.name || "(none)"], ["Shows", project.brief.subject || project.brief.product || "(not set)"], ["Style", project.brief.style], ["Text", project.brief.overlayText.filter(Boolean).join(" / ")], ["Sizes", project.brief.specKeys.map((k) => specByKey(k)?.label).filter(Boolean).join(", ")], ["Model", `${project.brief.provider === "gemini" ? config.models.gemini : config.models.openai}${project.brief.provider === "openai" ? `, ${project.brief.quality}` : ""}`]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="break-words text-muted-foreground">{v}</dd></div>)}
            </dl>
            {project.brief.consent?.attested && <p className="rounded-lg bg-emerald-500/10 p-2 text-emerald-900 dark:text-emerald-200">{`Consent for reference photos confirmed by ${project.brief.consent.by ?? "a team member"}${project.brief.consent.at ? ` on ${formatDateTime(new Date(project.brief.consent.at))}` : ""}.`}</p>}
          </CardContent>
        </GlassCard>
        <GlassCard interactive={false}>
          <CardContent className="space-y-2 text-xs">
            <h3 className="text-sm font-bold">Cost</h3>
            <p className="text-2xl font-bold tabular-nums">{formatUsd(project.totalCostUsd)}</p>
            <p className="text-muted-foreground">Spent on this project so far.</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(bar.spentPct)}% of today's limit used`}><div className="h-full bg-primary" style={{ width: `${bar.spentPct}%` }} /></div>
            <p className="text-muted-foreground">{`Workspace today: ${formatUsd(config.spentTodayUsd)} of ${formatUsd(config.settings.dailySpendCapUsd)}.`}</p>
          </CardContent>
        </GlassCard>
      </aside>

      <EditDialog project={project} variant={editing} config={config} open={!!editing} onClose={() => setEditing(null)} onDone={setProject} />
      {adFor && <UseInAd mediaId={adFor} open onClose={() => setAdFor(null)} />}
    </div>
  );
}
