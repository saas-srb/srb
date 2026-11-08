"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Archive, CheckCircle2, ExternalLink, Loader2, Pause, Pencil, Play, RotateCcw, Rocket, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ActionButton from "@/components/products/viralpulse-ai/ActionButton";
import SourceBadge from "@/components/products/viralpulse-ai/shared/SourceBadge";
import {
  activateLaunchAction, approveLaunchAction, archiveLaunchAction, createLaunchAction, editLaunchAction, launchStatusAction, pauseLaunchAction, resumeLaunchAction, revokeApprovalAction, rollbackLaunchAction,
} from "@/app/(products)/viralpulse-ai/(protected)/campaigns/ads-actions";
import type { LaunchView } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import type { FieldError } from "@/lib/products/viralpulse-ai/ads-platforms/types";
import { adsManagerUrl, explainIssue, formatMinor, minorToInput, parseMajorToMinor, pollPlan, reviewLabel, reviewPending, type LaunchLike } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { Note } from "./ads-bits";
import { cn } from "@/lib/utils";

export interface LaunchPerms {
  canCreate: boolean;
  canApprove: boolean;
  canPublish: boolean;
  canEdit: boolean;
  userId: string;
}

type Outcome = { launch: LaunchView | null; errors: FieldError[]; message: string | null; reasons: string[]; done: boolean };
const failMsg = (o: Outcome) => [o.message ?? "That did not work.", ...o.reasons].join(" ");

const STATE_TEXT: Record<LaunchView["state"], { label: string; tone: string }> = {
  creating: { label: "Creating in Meta", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  partial: { label: "Partly created", tone: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  ready: { label: "Created in Meta", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  rolled_back: { label: "Rolled back", tone: "bg-muted text-muted-foreground" },
  failed: { label: "Failed", tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};

export default function LaunchPanel({ campaignId, launch, onLaunch, perms, canLaunchNow, blockedReason, onErrors, onGoto }: { campaignId: string | null; launch: LaunchView | null; onLaunch: (l: LaunchView | null) => void; perms: LaunchPerms; canLaunchNow: boolean; blockedReason: string | null; onErrors: (e: FieldError[]) => void; onGoto: (path: string) => void }) {
  const [busy, setBusy] = useState<null | "create" | "resume">(null);
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [errCount, setErrCount] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  // Long operations: the call returns when Meta is done. If the page is closed first, "Resume" picks up from the objects already created.
  const apply = useCallback((o: Outcome, success: string) => {
    setGaveUp(false);
    if (o.launch) onLaunch(o.launch);
    onErrors(o.errors);
    setReasons(o.reasons);
    if (o.done) toast.success(success);
    else toast.error(failMsg(o));
    return o.done;
  }, [onLaunch, onErrors]);

  async function create(resume: boolean) {
    if (!campaignId && !launch) return;
    setBusy(resume ? "resume" : "create");
    const r = resume && launch ? await resumeLaunchAction(launch.id) : await createLaunchAction(campaignId!);
    setBusy(null);
    if (!r.ok) { toast.error(r.error); return; }
    apply(r.result, resume ? "Resumed. Everything is created in Meta, paused." : "Created in Meta, paused. Nothing spends yet.");
  }

  useEffect(() => {
    const on = () => setHidden(document.visibilityState === "hidden");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Keep the status fresh while something is in flight: creation, or ads in Meta's review. Stops when hidden, settled, or after repeated errors.
  const plan = pollPlan({ state: launch?.state ?? null, delivery: launch?.delivery ?? null, pendingReview: launch ? reviewPending(launch.review as LaunchLike["review"]) : false, hidden, errors: errCount, sinceActionMs: gaveUp ? Number.POSITIVE_INFINITY : 0 });
  useEffect(() => {
    if (!plan.poll || !campaignId) return;
    const startedAt = Date.now();
    const t = setInterval(async () => {
      if (Date.now() - startedAt > 30 * 60_000) { setGaveUp(true); return; }
      const r = await launchStatusAction(campaignId);
      if (r.ok) { setErrCount(0); if (r.launch) onLaunch(r.launch); } else setErrCount((n) => n + 1);
    }, plan.everyMs);
    return () => clearInterval(t);
  }, [plan.poll, plan.everyMs, campaignId, onLaunch]);

  if (!launch) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/50 p-4">
        <p className="text-sm font-semibold">Create on Meta (paused)</p>
        <p className="text-xs text-muted-foreground">This creates the campaign, ad sets, creatives and ads in your Meta ad account, all paused. Nothing is spent. Spending starts only after an approver approves the budget and someone switches it on.</p>
        {blockedReason && <Note tone="warn">{blockedReason}</Note>}
        {reasons.length > 0 && <Note tone="bad">{reasons.map((r) => <p key={r}>{r}</p>)}</Note>}
        <Button type="button" disabled={!perms.canCreate || !canLaunchNow || busy !== null} onClick={() => void create(false)}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Create on Meta (paused)
        </Button>
        {busy && <p role="status" className="text-xs text-muted-foreground">Creating in Meta. This can take a minute because images and videos are uploaded. If you leave, come back and choose Resume.</p>}
        {!perms.canCreate && <p className="text-[11px] text-muted-foreground">You need permission to create ads and edit campaigns.</p>}
      </div>
    );
  }

  const st = STATE_TEXT[launch.state];
  const objects = launch.objects;
  const totalSets = Object.keys(launch.adSetNames).length;
  const totalAds = Object.keys(launch.adNames).length;
  const done = (objects.campaign ? 1 : 0) + Object.keys(objects.adSets).length + Object.keys(objects.creatives).length + Object.keys(objects.ads).length;
  const expected = 1 + totalSets + totalAds * 2;
  const unfinished = launch.state === "partial" || launch.state === "creating" || launch.state === "failed";
  const ready = launch.state === "ready";
  const approvedOk = Boolean(launch.approval) && launch.approvalCovers;
  const creatorBlocked = Boolean(launch.guard?.needsSecondApprover) && launch.createdBy === perms.userId;
  const act = (fn: () => Promise<{ ok: true; result: Outcome } | { ok: false; error: string }>, success: string) => async () => {
    const r = await fn();
    if (!r.ok) return r;
    const ok = apply(r.result, success);
    return ok ? { ok: true as const } : { ok: false as const, error: failMsg(r.result) };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", st.tone)}>{st.label}</span>
        {ready && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{launch.delivery === "active" ? "Spending" : launch.delivery === "archived" ? "Archived" : "Paused"}</span>}
        <SourceBadge source={launch.lastSyncAt ? "synced" : "estimate"} at={launch.lastSyncAt} label={launch.lastSyncAt ? "Synced from Meta" : "Not synced from Meta yet"} />
        {launch.lastSyncAt && <span className="text-[11px] text-muted-foreground">Last sync {new Date(launch.lastSyncAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {(launch.state === "creating" || busy) && (
        <div role="status" className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.round((done / Math.max(expected, 1)) * 100))}%` }} /></div>
          <p className="text-xs text-muted-foreground">{done} of {expected} objects created in Meta{launch.pending ? ` (now: ${launch.pending.kind})` : ""}.</p>
        </div>
      )}

      {launch.lastError && unfinished && (
        <Note tone="bad">
          <p className="font-semibold">Meta stopped this launch</p>
          <p>{launch.lastError.message}</p>
          {launch.lastError.paths.length > 0 && <div className="flex flex-wrap gap-2">{launch.lastError.paths.map((p) => <button key={p} type="button" className="underline" onClick={() => onGoto(p)}>Go to {p.replace(/^meta\./, "").replace(/^ads\[[^\]]+\]\./, "")}</button>)}</div>}
        </Note>
      )}
      {launch.compensation && launch.compensation.failed.length > 0 && (
        <Note tone="warn">
          <p className="font-semibold">Some objects could not be removed from Meta</p>
          <ul className="list-disc pl-4">{launch.compensation.failed.map((f) => <li key={f.id}>{f.kind} {f.id}: {f.message}</li>)}</ul>
          <p>Remove them in Ads Manager, or try the rollback again.</p>
        </Note>
      )}
      {reasons.length > 0 && <Note tone="bad">{reasons.map((r) => <p key={r}>{r}</p>)}</Note>}

      {unfinished && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!perms.canCreate || busy !== null || launch.state === "creating" && Boolean(launch.pending)} onClick={() => void create(true)}>{busy === "resume" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Resume creating</Button>
          <ActionButton variant="outline" action={act(() => rollbackLaunchAction(launch.id), "Rolled back. The objects were removed from Meta.")} success="Rolled back" confirm={{ title: "Roll back this launch?", description: "Everything created in Meta so far is deleted. Your draft here is kept, so you can fix it and create again.", confirmLabel: "Roll back" }}><Undo2 className="size-3.5" /> Roll back</ActionButton>
        </div>
      )}
      {launch.state === "rolled_back" && <Note>This launch was rolled back and removed from Meta. Edit the draft and create it again.</Note>}

      {ready && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat k="Daily budget" v={formatMinor(launch.commitment.dailyMinor, launch.currency)} />
            <Stat k="Total it can spend" v={launch.commitment.totalMinor === null ? "No end date: not limited" : formatMinor(launch.commitment.totalMinor, launch.currency)} />
            <Stat k="Next 30 days" v={formatMinor(launch.commitment.monthlyMinor, launch.currency)} />
          </div>

          <div className="space-y-2 rounded-xl border border-border/50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold"><ShieldCheck className="size-3.5" aria-hidden /> Approval</p>
            {launch.approval ? (
              <p className="text-xs">Approved by <strong>{launch.approval.byEmail ?? launch.approval.by}</strong> on {new Date(launch.approval.at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}{launch.approval.note ? `: ${launch.approval.note}` : ""}. {launch.approvalCovers ? `It covers ${formatMinor(launch.approval.committedDailyMinor, launch.currency)} a day${launch.approval.committedTotalMinor !== null ? ` and ${formatMinor(launch.approval.committedTotalMinor, launch.currency)} in total` : ""}.` : "The budget changed since then, so it needs approving again."}</p>
            ) : <p className="text-xs text-muted-foreground">Not approved yet. A person with the approval permission must approve this budget before it can spend.</p>}
            {launch.guard && !launch.guard.ok && <Note tone="bad">{launch.guard.reasons.map((r) => <p key={r}>{r}</p>)}</Note>}
            {creatorBlocked && <Note tone="warn">This budget is above the approval threshold, so someone other than its creator must approve it.</Note>}
            {perms.canApprove && launch.delivery !== "archived" && (
              <div className="flex flex-wrap items-end gap-2">
                {!approvedOk && <Input aria-label="Approval note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-8 max-w-64" />}
                {!approvedOk && <ActionButton variant="default" action={act(() => approveLaunchAction(launch.id, note), "Approved")} success="Approved" confirm={{ title: "Approve this ad spend?", description: `You approve up to ${formatMinor(launch.commitment.dailyMinor, launch.currency)} a day${launch.commitment.totalMinor !== null ? ` and ${formatMinor(launch.commitment.totalMinor, launch.currency)} in total` : " with no end date"}. This is recorded under your name.`, confirmLabel: "Approve" }}><CheckCircle2 className="size-3.5" /> Approve</ActionButton>}
                {launch.approval && <ActionButton action={act(() => revokeApprovalAction(launch.id), "Approval withdrawn")} success="Approval withdrawn" confirm={{ title: "Withdraw the approval?", description: "If the ads are spending they are paused.", confirmLabel: "Withdraw" }}>Withdraw approval</ActionButton>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {launch.delivery !== "active" && launch.delivery !== "archived" && perms.canPublish && (
              <ActionButton variant="default" action={act(() => activateLaunchAction(launch.id), "Switched on in Meta")} success="Switched on in Meta" confirm={{ title: "Start spending?", description: `The ads go live in Meta and start spending up to ${formatMinor(launch.commitment.dailyMinor, launch.currency)} a day. Meta reviews each ad first.`, confirmLabel: launch.delivery === "paused" && launch.activatedAt ? "Resume" : "Activate" }}><Play className="size-3.5" /> {launch.activatedAt ? "Resume" : "Activate"}</ActionButton>
            )}
            {launch.delivery === "active" && perms.canPublish && <ActionButton action={act(() => pauseLaunchAction(launch.id), "Paused in Meta")} success="Paused in Meta" confirm={{ title: "Pause the ads?", description: "The campaign is paused in Meta. You can resume it later; resuming checks the approval and the spending limits again.", confirmLabel: "Pause" }}><Pause className="size-3.5" /> Pause</ActionButton>}
            {launch.delivery !== "archived" && perms.canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setEdit(true)}><Pencil className="size-3.5" /> Edit allowed fields</Button>}
            {launch.delivery !== "active" && launch.delivery !== "archived" && perms.canCreate && <ActionButton action={act(() => rollbackLaunchAction(launch.id), "Rolled back")} success="Rolled back" confirm={{ title: "Roll back this launch?", description: "Everything created in Meta is deleted. Your draft here is kept.", confirmLabel: "Roll back" }}><Undo2 className="size-3.5" /> Roll back</ActionButton>}
            {launch.delivery !== "archived" && perms.canPublish && <ActionButton action={act(() => archiveLaunchAction(launch.id), "Archived in Meta")} success="Archived in Meta" confirm={{ title: "Archive in Meta?", description: "The campaign is archived and can no longer run. Its history stays in Meta and here.", confirmLabel: "Archive" }}><Archive className="size-3.5" /> Archive</ActionButton>}
          </div>

          <Objects launch={launch} />
        </>
      )}

      <details className="rounded-xl border border-border/50 p-3 text-xs">
        <summary className="cursor-pointer font-semibold">Audit trail ({launch.events.length})</summary>
        <ol className="mt-2 space-y-1">{[...launch.events].reverse().map((e, i) => <li key={i} className="flex gap-2"><span className="shrink-0 text-muted-foreground tabular-nums">{new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><span className="font-medium">{e.type.replaceAll("_", " ")}</span><span className="text-muted-foreground">{e.note}</span></li>)}</ol>
      </details>
      {edit && <EditDialog launch={launch} onClose={() => setEdit(false)} onDone={(o) => { if (apply(o, "Changes sent to Meta")) setEdit(false); }} />}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl border border-border/50 p-3"><p className="text-[11px] text-muted-foreground">{k}</p><p className="text-sm font-semibold tabular-nums">{v}</p></div>;
}

function Objects({ launch }: { launch: LaunchView }) {
  const o = launch.objects;
  const row = (level: "campaign" | "adset" | "ad", label: string, ext: string, status: string | null, issues: string[]) => (
    <tr key={`${level}-${ext}`} className="border-b border-border/40 align-top last:border-0">
      <td className="py-2 pr-3"><span className="block font-medium">{label}</span><span className="text-[11px] text-muted-foreground">{level === "campaign" ? "Campaign" : level === "adset" ? "Ad set" : "Ad"} · {ext}</span></td>
      <td className="py-2 pr-3">
        <span className="font-medium">{reviewLabel(status)}</span>
        {issues.map((i) => { const x = explainIssue(i); return <p key={i} className="text-[11px] text-rose-700 dark:text-rose-300">{x.title}{x.detail ? `: ${x.detail}` : ""}</p>; })}
        {issues.length > 0 && <p className="text-[11px] text-muted-foreground">Edit the ad to fix this, then Meta reviews it again.</p>}
      </td>
      <td className="py-2 text-right"><a href={adsManagerUrl(launch.actId, level, ext)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Ads Manager <ExternalLink className="size-3" /></a></td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead><tr className="border-b border-border/60 text-left text-muted-foreground"><th className="py-2 pr-3 font-medium">Object</th><th className="py-2 pr-3 font-medium">Status in Meta</th><th className="py-2" /></tr></thead>
        <tbody>
          {o.campaign && row("campaign", launch.draft.campaignName, o.campaign, launch.externalStatus?.campaign ?? null, [])}
          {Object.entries(o.adSets).map(([key, ext]) => row("adset", launch.adSetNames[key] ?? key, ext, launch.review[ext]?.effectiveStatus ?? null, launch.review[ext]?.issues ?? []))}
          {Object.entries(o.ads).map(([id, ext]) => row("ad", launch.adNames[id] ?? id, ext, launch.review[ext]?.effectiveStatus ?? null, launch.review[ext]?.issues ?? []))}
        </tbody>
      </table>
      {!launch.lastSyncAt && <p className="mt-2 text-[11px] text-muted-foreground">Review status appears after the first sync from Meta. Until then the status shows as not synced.</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">Open the campaign in <Link className="underline" href="/viralpulse-ai/campaigns">Campaigns</Link> to see all launches.</p>
    </div>
  );
}

function EditDialog({ launch, onClose, onDone }: { launch: LaunchView; onClose: () => void; onDone: (o: Outcome) => void }) {
  const d = launch.draft;
  const [name, setName] = useState(d.campaignName);
  const [cap, setCap] = useState(minorToInput(d.spendCapMinor, launch.currency));
  const [cbo, setCbo] = useState(minorToInput(d.campaignBudgetMinor, launch.currency));
  const [sets, setSets] = useState(d.adSets.map((s) => ({ ...s, budget: minorToInput(s.budgetMinor, launch.currency) })));
  const [ads, setAds] = useState(d.ads.map((a) => ({ ...a })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    const edit: Parameters<typeof editLaunchAction>[1] = {};
    const money = (t: string) => (t.trim() === "" ? null : parseMajorToMinor(t, launch.currency));
    const c: NonNullable<typeof edit.campaign> = {};
    if (name.trim() !== d.campaignName) c.name = name.trim();
    const capMinor = money(cap);
    if (cap.trim() !== "" && capMinor === null) { setErr("The spend cap is not a valid amount."); return; }
    if (capMinor !== d.spendCapMinor) c.spendCapMinor = capMinor;
    if (d.campaignBudgetMinor !== null) { const b = money(cbo); if (b === null) { setErr("The campaign budget is not a valid amount."); return; } if (b !== d.campaignBudgetMinor) c.budgetMinor = b; }
    if (Object.keys(c).length) edit.campaign = c;
    const setEdits: NonNullable<typeof edit.adSets> = {};
    for (const s of sets) {
      const o = d.adSets.find((x) => x.key === s.key)!;
      const p: NonNullable<typeof edit.adSets>[string] = {};
      if (s.name.trim() !== o.name) p.name = s.name.trim();
      if (o.budgetMinor !== null) { const b = money(s.budget); if (b === null) { setErr(`The budget of "${s.name}" is not a valid amount.`); return; } if (b !== o.budgetMinor) p.budgetMinor = b; }
      if (Object.keys(p).length) setEdits[s.key] = p;
    }
    if (Object.keys(setEdits).length) edit.adSets = setEdits;
    const adEdits: NonNullable<typeof edit.ads> = {};
    for (const a of ads) {
      const o = d.ads.find((x) => x.id === a.id)!;
      const p: NonNullable<typeof edit.ads>[string] = {};
      if (a.name.trim() !== o.name) p.name = a.name.trim();
      const copy: NonNullable<typeof p.copy> = {};
      if (a.headline !== o.headline) copy.headline = a.headline;
      if (a.primaryText !== o.primaryText) copy.primaryText = a.primaryText;
      if (a.description !== o.description) copy.description = a.description;
      if (a.link !== o.link) copy.link = a.link;
      if (a.urlTags !== o.urlTags) copy.urlTags = a.urlTags;
      if (Object.keys(copy).length) p.copy = copy;
      if (Object.keys(p).length) adEdits[a.id] = p;
    }
    if (Object.keys(adEdits).length) edit.ads = adEdits;
    if (!edit.campaign && !edit.adSets && !edit.ads) { onClose(); return; }
    setBusy(true);
    const r = await editLaunchAction(launch.id, edit);
    setBusy(false);
    if (!r.ok) setErr(r.error);
    else if (!r.result.done) setErr(failMsg(r.result));
    else onDone(r.result);
  }
  const lab = "block text-xs font-medium";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit a launch in Meta</DialogTitle>
          <DialogDescription>Only what Meta allows after creation: names, budgets, spend cap and ad copy. Changing ad copy creates a new creative and Meta reviews the ad again. Raising the budget while ads are spending is refused: pause, edit, get it approved again, then resume.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><label className={lab} htmlFor="e-name">Campaign name</label><Input id="e-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {d.campaignBudgetMinor !== null && <div className="space-y-1.5"><label className={lab} htmlFor="e-cbo">Campaign budget ({launch.currency})</label><Input id="e-cbo" inputMode="decimal" value={cbo} onChange={(e) => setCbo(e.target.value)} /></div>}
            <div className="space-y-1.5"><label className={lab} htmlFor="e-cap">Spend cap ({launch.currency}, empty for none)</label><Input id="e-cap" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
          </div>
          {sets.map((s, i) => (
            <div key={s.key} className="grid gap-3 rounded-xl border border-border/50 p-3 sm:grid-cols-2">
              <div className="space-y-1.5"><label className={lab} htmlFor={`e-s-${i}`}>Ad set name</label><Input id={`e-s-${i}`} value={s.name} onChange={(e) => setSets((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></div>
              {s.budgetMinor !== null && <div className="space-y-1.5"><label className={lab} htmlFor={`e-sb-${i}`}>Budget ({launch.currency})</label><Input id={`e-sb-${i}`} inputMode="decimal" value={s.budget} onChange={(e) => setSets((x) => x.map((y, j) => (j === i ? { ...y, budget: e.target.value } : y)))} /></div>}
            </div>
          ))}
          {ads.map((a, i) => (
            <div key={a.id} className="space-y-2 rounded-xl border border-border/50 p-3">
              <div className="space-y-1.5"><label className={lab} htmlFor={`e-a-${i}`}>Ad name</label><Input id={`e-a-${i}`} value={a.name} onChange={(e) => setAds((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></div>
              <div className="space-y-1.5"><label className={lab} htmlFor={`e-at-${i}`}>Primary text</label><Textarea id={`e-at-${i}`} rows={3} value={a.primaryText} onChange={(e) => setAds((x) => x.map((y, j) => (j === i ? { ...y, primaryText: e.target.value } : y)))} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><label className={lab} htmlFor={`e-ah-${i}`}>Headline</label><Input id={`e-ah-${i}`} value={a.headline} onChange={(e) => setAds((x) => x.map((y, j) => (j === i ? { ...y, headline: e.target.value } : y)))} /></div>
                <div className="space-y-1.5"><label className={lab} htmlFor={`e-ad-${i}`}>Description</label><Input id={`e-ad-${i}`} value={a.description} onChange={(e) => setAds((x) => x.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} /></div>
                <div className="space-y-1.5"><label className={lab} htmlFor={`e-al-${i}`}>Website address</label><Input id={`e-al-${i}`} type="url" value={a.link} onChange={(e) => setAds((x) => x.map((y, j) => (j === i ? { ...y, link: e.target.value } : y)))} /></div>
                <div className="space-y-1.5"><label className={lab} htmlFor={`e-au-${i}`}>URL parameters</label><Input id={`e-au-${i}`} value={a.urlTags} onChange={(e) => setAds((x) => x.map((y, j) => (j === i ? { ...y, urlTags: e.target.value } : y)))} /></div>
              </div>
            </div>
          ))}
          {err && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{err}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="size-4 animate-spin" />} Send changes to Meta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
