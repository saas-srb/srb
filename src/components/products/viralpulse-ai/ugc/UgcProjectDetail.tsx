"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Captions, Clapperboard, Copy, Download, FileText, Loader2, Megaphone, Pencil, Play, RefreshCw, RotateCcw, Send, Trash2, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import { Chip, PhoneFrame, ProgressBar, UgcStatusChip } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import { mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import {
  attachUgcToPostAction, cancelUgcAction, deleteUgcAction, duplicateUgcAction, getUgcProjectAction, redoUgcSceneAction, restoreUgcVersionAction, resumeUgcAction, startCampaignFromUgcAction, ugcPostChoicesAction, ugcSrtAction, ugcTrailAction,
} from "@/app/(products)/viralpulse-ai/(protected)/ugc/actions";
import { getStyle } from "@/lib/products/viralpulse-ai/ugc/styles";
import type { UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";
import { formatSecs, formatUsd, isActiveStatus, jobMeta, nextPollDelay, POLL, pollDecision, progressOf, withDisclosure } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import type { ProjectView, SceneJobView, TrailEntry, UgcConnections } from "@/lib/products/viralpulse-ai/ugc/api";
import type { UgcSettings } from "@/lib/products/viralpulse-ai/ugc/store";
import { formatDateTime } from "@/lib/utils";

export interface DetailProps {
  initial: ProjectView;
  settings: UgcSettings;
  connections: UgcConnections;
  canGenerate: boolean;
  canApprove: boolean;
  canIntegrations: boolean;
  canPost: boolean;
  /** May create ads and campaigns ("Use in a campaign"). */
  canAds?: boolean;
}

const EDITABLE = ["draft", "scripted", "failed", "cancelled", "ready"];
const SOURCE: Record<string, string> = { ai: "Written by AI", edit: "Edited by hand", revision: "Revision" };

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RedoDialog({ project, job, sceneIndex, threshold, canApprove, open, onClose, onDone }: { project: ProjectView; job: SceneJobView | undefined; sceneIndex: number; threshold: number; canApprove: boolean; open: boolean; onClose: () => void; onDone: (p: ProjectView) => void }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const scene = project.plan?.scenes[sceneIndex];
  const est = job?.estimatedUsd ?? project.estimate?.perScene.find((s) => s.index === sceneIndex)?.usd ?? 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Redo scene ${sceneIndex + 1}`}</DialogTitle>
          <DialogDescription>Only this scene is generated again. The other scenes are kept and not charged a second time, and the final video is put together again afterwards.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5 text-xs font-medium" htmlFor="redo-note">
            Director&apos;s note (optional)
            <Textarea id="redo-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. warmer light, she smiles more at the start" />
          </label>
          <p className="text-[11px] text-muted-foreground">The note is added to this scene&apos;s prompt. To change the words that are spoken, edit the script instead.</p>
          <p className="rounded-xl bg-muted/50 p-3 text-xs">
            {`Cost: about ${formatUsd(est)} for ${scene?.durationSecs ?? 0} s. It counts toward today's limit${est > threshold && !canApprove ? `, and because it is above ${formatUsd(threshold)} a manager will be asked to approve it` : ""}.`}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await redoUgcSceneAction(project.id, sceneIndex, note, project.policy?.flagged.map((f) => f.code) ?? []);
                if (!r.ok) { toast.error(r.error); return; }
                onDone(r.project);
                if (r.outcome === "needs_manager") toast.info("A manager was asked to approve this redo.");
                else toast.success(`Scene ${sceneIndex + 1} is being redone.`);
                setNote("");
                onClose();
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Redo scene
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UseInPost({ project, open, onClose }: { project: ProjectView; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [posts, setPosts] = useState<{ id: string; title: string; platforms: string[]; status: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ postId: string; title: string; suffixes: { platform: string; action: string; captionSuffix: string }[] } | null>(null);

  const load = useCallback((query: string) => {
    start(async () => {
      const r = await ugcPostChoicesAction(query);
      if (r.ok) { setPosts(r.posts); setErr(null); } else setErr(r.error);
    });
  }, []);
  useEffect(() => { if (open && posts === null) load(""); }, [open, posts, load]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setDone(null); } }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Use in a post</DialogTitle>
          <DialogDescription>{done ? `Attached to “${done.title}”.` : "Attach this video to an existing post. You publish it from the post, like any other video."}</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Add the AI label line to the caption for each platform, and turn on the platform&apos;s own AI setting where it exists.</p>
            {done.suffixes.map((s) => (
              <div key={s.platform} className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs">
                <p className="font-semibold capitalize">{s.platform}</p>
                <div className="flex items-start justify-between gap-2"><code className="break-words">{s.captionSuffix}</code><Button type="button" variant="ghost" size="icon-xs" aria-label={`Copy the ${s.platform} caption line`} onClick={() => { void navigator.clipboard.writeText(withDisclosure("", s.captionSuffix)).then(() => toast.success("Copied")).catch(() => toast.error("Couldn't copy")); }}><Copy className="size-3" /></Button></div>
                <p className="text-muted-foreground">{s.action}</p>
              </div>
            ))}
            <DialogFooter><Button nativeButton={false} render={<Link href={`/viralpulse-ai/posts/${done.postId}`} />}>Open the post</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your posts" aria-label="Search posts" /><Button type="submit" variant="outline" disabled={pending}>Search</Button></form>
            {err && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{err}</p>}
            {posts === null && !err && <p className="text-xs text-muted-foreground">Loading posts…</p>}
            {posts && posts.length === 0 && <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">No posts found. <Link href="/viralpulse-ai/posts/new" className="font-semibold text-primary underline">Create a post</Link> first, then come back and attach this video.</p>}
            <ul className="space-y-1.5">
              {posts?.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-xl border border-border/40 p-2 text-xs">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.title}</span><span className="text-muted-foreground">{`${p.status} · ${p.platforms.join(", ") || "no platform"}`}</span></span>
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await attachUgcToPostAction(project.id, p.id); if (!r.ok) { toast.error(r.error); return; } setDone({ postId: p.id, title: r.attached.postTitle, suffixes: r.attached.suffixes }); toast.success("Video attached."); })}>Attach</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function UgcProjectDetail({ initial, settings, connections, canGenerate, canApprove, canIntegrations, canPost, canAds = false }: DetailProps) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [tab, setTab] = useState("scenes");
  const [redo, setRedo] = useState<number | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [trail, setTrail] = useState<{ items: TrailEntry[] | null; error: string | null }>({ items: null, error: null });
  const [pollStopped, setPollStopped] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [pending, start] = useTransition();
  const ref = useRef(project);
  useEffect(() => { ref.current = project; }, [project]);

  const style = useMemo(() => (getStyle(project.styleId) as UgcStyle | undefined) ?? null, [project.styleId]);
  const active = isActiveStatus(project.status);
  const plan = project.plan;
  const scenes = plan?.scenes ?? [];
  const prog = progressOf(project.jobs, scenes.length);
  const editable = EDITABLE.includes(project.status);
  const render = project.render;

  // Live progress: poll while the video is being made and the tab is visible; back off on errors; stop when finished.
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
      if (!d.poll) return; // hidden tabs restart from the visibility handler
      const r = await getUgcProjectAction(ref.current.id);
      if (stopped) return;
      if (r.ok) {
        errors = 0;
        const before = ref.current.status;
        setProject(r.project);
        if (isActiveStatus(before) && !isActiveStatus(r.project.status)) {
          if (r.project.status === "ready") toast.success("Your video is ready.");
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
    void ugcTrailAction(project.id).then((r) => setTrail(r.ok ? { items: r.items, error: null } : { items: null, error: r.error }));
  }, [tab, trail.items, project.id]);

  const act = <T extends { ok: boolean; project?: ProjectView }>(fn: () => Promise<T>) => async () => {
    const r = await fn();
    if (r.ok && r.project) setProject(r.project);
    return r as unknown as { ok: boolean; error?: string; id?: string };
  };

  async function downloadSrt() {
    const r = await ugcSrtAction(project.id);
    if (!r.ok) { toast.error(r.error); return; }
    download(`${project.title.replace(/[^\w .-]+/g, "").trim() || "video"}.srt`, new Blob([r.srt], { type: "text/plain;charset=utf-8" }));
  }

  const jobFor = (i: number) => project.jobs.find((j) => j.sceneIndex === i);
  const failedJobs = project.jobs.filter((j) => j.status === "failed");
  const allSucceeded = scenes.length > 0 && project.jobs.length === scenes.length && project.jobs.every((j) => j.status === "succeeded");
  const posterId = render?.thumbnailId;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-4">
        <GlassCard interactive={false}>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <UgcStatusChip status={project.status} pendingApproval={!!project.pendingApproval} />
              {style && <Chip>{style.label}</Chip>}
              <Chip>{`${project.options.language} · ${project.options.aspect}`}</Chip>
              {project.illustrative && <Chip tone="warn" title={project.disclosure.illustrativeNotice}>Illustrative</Chip>}
              <span className="ml-auto text-[11px] text-muted-foreground">{`Updated ${formatDateTime(new Date(project.updatedAt))}`}</span>
            </div>

            {(active || project.jobs.length > 0) && scenes.length > 0 && (
              <div className="space-y-1.5" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="font-semibold">{active ? (prog.done === scenes.length ? "Putting the video together" : `${prog.done} of ${scenes.length} scenes done`) : `${prog.done} of ${scenes.length} scenes rendered`}</span>
                  <span className="tabular-nums text-muted-foreground">{`${formatUsd(project.spendUsd)} spent so far`}</span>
                </div>
                <ProgressBar pct={active && prog.done === scenes.length ? 96 : prog.pct} tone={project.status === "failed" ? "bad" : project.status === "ready" ? "ok" : "info"} label="Video progress" />
                {active && <p className="text-[11px] text-muted-foreground">You can leave this page. Generation continues in the background and you&apos;ll get a notification when it finishes.</p>}
                {pollStopped && (
                  <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" /> Live updates paused because the server isn&apos;t answering. The video keeps generating.
                    <Button type="button" size="xs" variant="outline" onClick={() => { setPollStopped(false); setNonce((n) => n + 1); }}><RefreshCw className="size-3" /> Check again</Button>
                  </p>
                )}
              </div>
            )}

            {project.status === "failed" && (
              <div role="alert" className="space-y-1 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-900 dark:text-rose-200">
                <p className="font-semibold">This video didn&apos;t finish</p>
                <p>{project.error ?? (failedJobs.length ? `${failedJobs.length} scene${failedJobs.length > 1 ? "s" : ""} could not be rendered.` : "Something went wrong while generating.")}</p>
                {failedJobs.length > 0 && <p>Scenes that already rendered are kept and won&apos;t be charged again. Redo the failed scene{failedJobs.length > 1 ? "s" : ""} below, one at a time.</p>}
                {allSucceeded && canGenerate && <p>Every scene rendered, so only the final assembly needs another go.</p>}
              </div>
            )}
            {project.status === "cancelled" && <p className="rounded-xl bg-muted/50 p-3 text-xs">This video was cancelled. Scenes that finished before are kept. Continue editing to create a new version.</p>}
            {(project.status === "draft" || project.status === "scripted") && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                <span className="flex-1">{project.pendingApproval ? `Waiting for a manager to approve about ${formatUsd(project.pendingApproval.estimateUsd)}.` : project.status === "draft" ? "This video is still a draft." : "The script is ready for your review."}</span>
                {canGenerate && <Button size="sm" nativeButton={false} render={<Link href={`/viralpulse-ai/ugc/${project.id}/edit`} />}><Pencil className="size-3.5" /> {project.pendingApproval && canApprove ? "Review and approve" : "Continue editing"}</Button>}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {active && canGenerate && (
                <ActionButton action={act(() => cancelUgcAction(project.id))} confirm={{ title: "Cancel this video?", description: "Scenes still rendering are stopped. Scenes that already finished are kept, and you're only charged for what the provider has already rendered.", confirmLabel: "Cancel the video" }} success="Cancelled" variant="outline"><XCircle className="size-3.5" /> Cancel</ActionButton>
              )}
              {project.status === "failed" && allSucceeded && canGenerate && (
                <ActionButton action={act(() => resumeUgcAction(project.id))} success="Retrying the final assembly" variant="default"><Wrench className="size-3.5" /> Retry assembly</ActionButton>
              )}
              {canGenerate && editable && project.status !== "draft" && project.status !== "scripted" && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/viralpulse-ai/ugc/${project.id}/edit`} />}><Pencil className="size-3.5" /> Edit script</Button>
              )}
              {canGenerate && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await duplicateUgcAction(project.id); if (!r.ok) { toast.error(r.error); return; } toast.success("Copied into a new draft."); router.push(`/viralpulse-ai/ugc/${r.id}/edit`); })}>
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />} Duplicate
                </Button>
              )}
              {canGenerate && (
                <ActionButton action={act(() => deleteUgcAction(project.id))} confirm={{ title: "Delete this video?", description: "It moves out of your list. The media files already in the library stay there until you delete them from the library.", confirmLabel: "Delete" }} success="Deleted" variant="outline" redirectTo="/viralpulse-ai/ugc"><Trash2 className="size-3.5" /> Delete</ActionButton>
              )}
            </div>
            {active && canGenerate && <p className="text-[11px] text-muted-foreground">A video that is being generated can be cancelled, but not deleted.</p>}
          </CardContent>
        </GlassCard>

        <PanelTabs label="Video sections" active={tab} onSelect={setTab} tabs={[{ key: "scenes", label: "Scenes", count: scenes.length }, { key: "versions", label: "Script versions", count: project.versions.length }, { key: "activity", label: "Activity" }]} />

        {tab === "scenes" && (
          <GlassCard interactive={false}>
            <CardContent className="space-y-3">
              {scenes.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clapperboard className="size-5" /></div>
                  <p className="text-sm font-semibold">No scenes yet</p>
                  <p className="max-w-sm text-xs text-muted-foreground">Scenes appear here once the script is written. Each scene becomes its own clip, and you can redo any one of them.</p>
                </div>
              )}
              <ol className="space-y-3">
                {scenes.map((s) => {
                  const job = jobFor(s.index);
                  const mediaId = project.sceneMedia[String(s.index)] ?? job?.mediaId ?? null;
                  const m = jobMeta(job?.status ?? "none", !!job && job.status === "queued" && job.attempts > 0);
                  const sceneCost = job ? (job.costUsd > 0 ? job.costUsd : job.estimatedUsd) : (project.estimate?.perScene.find((x) => x.index === s.index)?.usd ?? 0);
                  const names = new Map(plan?.actors.map((a) => [a.id, a.label]));
                  return (
                    <li key={s.index} className="flex gap-3 rounded-2xl border border-border/40 bg-card/60 p-3">
                      <div className="w-20 shrink-0 sm:w-24">
                        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-muted">
                          {mediaId ? (
                            <video src={mediaSrc(mediaId)} controls playsInline preload="metadata" className="size-full object-cover" aria-label={`Preview of scene ${s.index + 1}`} />
                          ) : (
                            <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                              {m.busy ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5 opacity-50" />}
                              <span className="text-[10px]">{m.busy ? m.label : "No clip yet"}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold">{`Scene ${s.index + 1}`}</span>
                          <Chip tone={m.tone}>{m.busy && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}{m.label}</Chip>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{`${s.durationSecs} s · ${formatUsd(sceneCost)}`}</span>
                          {job && job.attempts > 1 && <span className="text-[11px] text-muted-foreground">{`attempt ${job.attempts} of ${job.maxAttempts}`}</span>}
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{s.setting}</p>
                        {s.dialogue.slice(0, 3).map((l, i) => <p key={i} className="line-clamp-2 text-xs"><strong>{names.get(l.speakerId) ?? l.speakerId}:</strong> {l.text}</p>)}
                        {job?.error && job.status !== "succeeded" && <p role="alert" className="rounded-lg bg-rose-500/10 p-2 text-xs text-rose-800 dark:text-rose-200">{job.error}</p>}
                        {canGenerate && (project.status === "ready" || project.status === "failed") && (
                          <Button type="button" size="xs" variant="outline" disabled={!connections.video} title={connections.video ? undefined : "Connect Google Gemini in Settings to redo scenes"} onClick={() => setRedo(s.index)}><RotateCcw className="size-3" /> Redo scene</Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {redo !== null && <RedoDialog project={project} job={jobFor(redo)} sceneIndex={redo} threshold={settings.approvalThresholdUsd} canApprove={canApprove} open onClose={() => setRedo(null)} onDone={setProject} />}
            </CardContent>
          </GlassCard>
        )}

        {tab === "versions" && (
          <GlassCard interactive={false}>
            <CardContent className="space-y-2">
              {project.versions.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No script versions yet.</p>}
              {[...project.versions].reverse().map((v) => (
                <div key={v.version} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 p-3 text-xs">
                  <Chip tone={v.version === project.planVersion ? "info" : "neutral"}>{`v${v.version}${v.version === project.planVersion ? " · current" : ""}`}</Chip>
                  <span className="font-medium">{SOURCE[v.source] ?? v.source}</span>
                  {v.note && <span className="min-w-0 flex-1 truncate text-muted-foreground" title={v.note}>{`“${v.note}”`}</span>}
                  <span className="ml-auto text-muted-foreground">{formatDateTime(new Date(v.at))}</span>
                  {canGenerate && editable && v.version !== project.planVersion && (
                    <ActionButton action={act(() => restoreUgcVersionAction(project.id, v.version))} confirm={{ title: `Restore version ${v.version}?`, description: "It becomes the current script and the video goes back to “script ready”, so it has to be approved again. Nothing is deleted: the other versions stay in this list.", confirmLabel: "Restore" }} success={`Version ${v.version} restored`} size="xs">Restore</ActionButton>
                  )}
                </div>
              ))}
            </CardContent>
          </GlassCard>
        )}

        {tab === "activity" && (
          <GlassCard interactive={false}>
            <CardContent>
              {trail.error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{trail.error}</p>}
              {!trail.items && !trail.error && <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />)}</div>}
              {trail.items && trail.items.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No activity recorded yet.</p>}
              <ul className="divide-y divide-border/40">
                {trail.items?.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-xs">
                    <span className="w-36 shrink-0 text-muted-foreground">{formatDateTime(new Date(e.at))}</span>
                    <span className="min-w-0 flex-1">{e.summary}</span>
                    <span className="text-muted-foreground">{e.by ?? "System"}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </GlassCard>
        )}
      </div>

      <aside className="space-y-4" aria-label="Final video">
        <GlassCard interactive={false}>
          <CardContent className="space-y-3">
            <h2 className="text-sm font-bold">Final video</h2>
            <PhoneFrame aspect={project.options.aspect}>
              {render?.mediaId ? (
                <video src={mediaSrc(render.mediaId)} poster={posterId ? mediaSrc(posterId) : undefined} controls playsInline preload="metadata" className="absolute inset-0 size-full bg-black object-contain" aria-label="Final video preview" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-4 text-center text-muted-foreground">
                  {active ? <Loader2 className="size-6 animate-spin" /> : <Clapperboard className="size-6 opacity-60" />}
                  <p className="text-xs">{active ? "Your video will appear here when every scene is ready." : render ? "Not joined into one video." : "No video yet."}</p>
                </div>
              )}
            </PhoneFrame>

            {render?.mediaId && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" nativeButton={false} render={<a href={`/api/viralpulse-ai/media/${render.mediaId}?download=1`} download />}><Download className="size-3.5" /> Video</Button>
                  <Button size="sm" variant="outline" onClick={() => void downloadSrt()}><FileText className="size-3.5" /> Captions (SRT)</Button>
                  {posterId && <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/viralpulse-ai/media/${posterId}?download=1`} download />}><Download className="size-3.5" /> Thumbnail</Button>}
                </div>
                <p className="text-[11px] text-muted-foreground">{`${formatSecs(render.durationSecs)} long · ${render.labelBurned ? "“AI generated” label on screen" : "no on-screen AI label"} · ${render.captionsBurned ? "captions burned in" : "captions not burned in"}`}</p>
                {canPost && <Button size="sm" className="w-full" onClick={() => setPostOpen(true)}><Send className="size-3.5" /> Use in a post</Button>}
                {canPost && <Button size="sm" variant="outline" className="w-full" nativeButton={false} render={<Link href={`/viralpulse-ai/posts/new?media=${render.mediaId}&source=ugc_studio`} />}><Send className="size-3.5" /> Create a new post with this video</Button>}
                {canAds && <Button size="sm" variant="outline" className="w-full" disabled={pending} onClick={() => start(async () => { const r = await startCampaignFromUgcAction(project.id); if (!r.ok) { toast.error(r.error); return; } router.push(r.href); })}><Megaphone className="size-3.5" /> Use in a campaign or ad</Button>}
                {!canPost && <p className="text-[11px] text-muted-foreground">Attaching to a post needs the post-editing permission.</p>}
              </div>
            )}

            {render && !render.mediaId && (
              <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold">Clips only</p>
                <p>The scenes rendered, but they couldn&apos;t be joined into one video because the server has no video assembler. Each scene is saved as its own clip in the media library, and you can download the captions here.</p>
                {canIntegrations ? <p className="rounded-lg bg-background/60 p-2 font-mono text-[11px]">Setup: install ffmpeg on the server and set FFMPEG_PATH to it, or add the ffmpeg-static package, then use “Retry assembly”.</p> : <p>Ask an admin to set up ffmpeg on the server.</p>}
                <Button size="xs" variant="outline" onClick={() => void downloadSrt()}><FileText className="size-3" /> Captions (SRT)</Button>
              </div>
            )}
            {!render && plan && (
              <Button size="sm" variant="outline" onClick={() => void downloadSrt()}><FileText className="size-3.5" /> Captions (SRT)</Button>
            )}

            <div className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <Captions className="mt-0.5 size-3.5 shrink-0" />
              <span>{project.options.burnCaptions ? "Captions are burned into the final video, and the SRT file is for platforms that take their own captions." : "Captions are not burned in. Upload the SRT file to the platform for captions."} Change this in the review step before generating.</span>
            </div>
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardContent className="space-y-1.5 text-xs">
            <h2 className="text-sm font-bold">Details</h2>
            {[
              ["Model", `${project.capabilities.label}`],
              ["Estimated", project.estimate ? formatUsd(project.estimate.usd) : "Not yet"],
              ["Spent", formatUsd(project.spendUsd)],
              ["Length", plan ? `${plan.scenes.reduce((a, s) => a + s.durationSecs, 0)} s · ${plan.scenes.length} scenes` : "No script"],
              ["Reference photos", String(project.references.length)],
              ["Approvals", project.approvals.length ? project.approvals.map((a) => `${formatUsd(a.estimateUsd)} (${a.scope})`).join(", ") : "None yet"],
            ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v}</span></div>)}
            {!connections.video && <p className="pt-1 text-amber-700 dark:text-amber-300">Google Gemini isn&apos;t connected, so scenes can&apos;t be generated or redone.</p>}
          </CardContent>
        </GlassCard>
      </aside>

      <UseInPost project={project} open={postOpen} onClose={() => setPostOpen(false)} />
    </div>
  );
}
