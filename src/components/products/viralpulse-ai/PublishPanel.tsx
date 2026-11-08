"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, ExternalLink, CheckCircle2, AlertTriangle, Clock, RotateCcw, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import InputDialogButton from "@/components/products/viralpulse-ai/InputDialogButton";
import { publishPostAction, markPostPublishedAction, resetVariantPublishAction, savePostMetricsAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";

export interface PublishRow {
  platform: PostPlatform;
  state: "pending" | "published" | "failed";
  method: "api" | "manual" | null;
  url: string | null;
  error: string | null;
  at: string | null;
  connected: boolean;
  metrics: Record<string, number> | null;
}

const METRICS: { key: string; label: string }[] = [
  { key: "impressions", label: "Impressions" },
  { key: "reach", label: "Reach" },
  { key: "engagements", label: "Engagements" },
  { key: "likes", label: "Likes / reactions" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares / reposts" },
  { key: "saves", label: "Saves" },
  { key: "clicks", label: "Link clicks" },
  { key: "videoViews", label: "Video views" },
  { key: "conversions", label: "Conversions" },
];

function MetricsButton({ postId, row }: { postId: string; row: PublishRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(METRICS.map((m) => [m.key, String(row.metrics?.[m.key] ?? "")])));
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" size="xs" variant="outline" onClick={() => setOpen(true)}><BarChart3 className="size-3" /> {row.metrics ? "Update performance" : "Record performance"}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`${PLATFORM_META[row.platform].label} performance`}</DialogTitle>
            <DialogDescription>Copy the current totals from the platform&apos;s post insights.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {METRICS.map((m) => (
              <label key={m.key} className="space-y-1 text-xs font-medium">
                {m.label}
                <Input type="number" min={0} value={vals[m.key]} onChange={(e) => setVals((v) => ({ ...v, [m.key]: e.target.value }))} />
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" disabled={pending} onClick={() => start(async () => {
              const res = await savePostMetricsAction(postId, row.platform, vals);
              if (!res.ok) return void toast.error(res.error);
              toast.success("Performance saved.");
              setOpen(false);
              router.refresh();
            })}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PublishPanel({ postId, rows, canPublish, canMetrics, locked }: { postId: string; rows: PublishRow[]; canPublish: boolean; canMetrics: boolean; locked: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);

  function publish(platforms: PostPlatform[]) {
    setWhich(platforms.join(","));
    start(async () => {
      const res = await publishPostAction(postId, platforms);
      if (!res.ok) toast.error(res.error);
      else {
        for (const r of res.results) {
          if (r.ok) toast.success(`${PLATFORM_META[r.platform].label}: published`);
          else toast.error(r.error ?? `${PLATFORM_META[r.platform].label}: failed`);
        }
      }
      router.refresh();
    });
  }

  const ready = rows.filter((r) => r.state !== "published" && r.connected);
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border/50">
        {rows.map((r) => (
          <li key={r.platform} className="flex flex-wrap items-center gap-2 py-2.5">
            <PlatformChip platform={r.platform} full />
            <span className="flex items-center gap-1 text-xs">
              {r.state === "published" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : r.state === "failed" ? <AlertTriangle className="size-3.5 text-rose-600" /> : <Clock className="size-3.5 text-muted-foreground" />}
              {r.state === "published" ? `Published${r.method === "manual" ? " (manually)" : " via API"}` : r.state === "failed" ? "Failed" : r.connected ? "Not published · account connected" : "Not published · no connected account"}
            </span>
            {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">View post <ExternalLink className="size-3" /></a>}
            <div className="ml-auto flex flex-wrap gap-1.5">
              {canPublish && !locked && r.state !== "published" && r.connected && (
                <Button type="button" size="xs" onClick={() => publish([r.platform])} disabled={busy}>
                  {busy && which === r.platform ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} Publish now
                </Button>
              )}
              {canPublish && !locked && r.state !== "published" && (
                <InputDialogButton size="xs" title={`Mark ${PLATFORM_META[r.platform].label} as published`} description="Use this when you posted it yourself in the platform's app. Paste the live post's URL so it can be found later." inputLabel="Post URL (optional)" inputType="url" placeholder="https://…" submitLabel="Mark published" success="Marked published" action={markPostPublishedAction.bind(null, postId, r.platform)}>
                  <CheckCircle2 className="size-3" /> Mark as published
                </InputDialogButton>
              )}
              {canPublish && r.state !== "pending" && (
                <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => start(async () => { const res = await resetVariantPublishAction(postId, r.platform); if (!res.ok) toast.error(res.error); router.refresh(); })} aria-label={`Reset ${PLATFORM_META[r.platform].label} publish status`}>
                  <RotateCcw className="size-3" />
                </Button>
              )}
              {canMetrics && r.state === "published" && <MetricsButton postId={postId} row={r} />}
            </div>
            {r.error && <p className="w-full text-[11px] text-rose-600 dark:text-rose-400">{r.error}</p>}
            {r.metrics && <p className="w-full text-[11px] text-muted-foreground">{`${(r.metrics.impressions ?? 0).toLocaleString("en-IN")} impressions · ${(r.metrics.reach ?? 0).toLocaleString("en-IN")} reach · ${(r.metrics.engagements ?? 0).toLocaleString("en-IN")} engagements · ${(r.metrics.clicks ?? 0).toLocaleString("en-IN")} clicks`}</p>}
          </li>
        ))}
      </ul>
      {canPublish && !locked && ready.length > 1 && (
        <Button type="button" size="sm" onClick={() => publish(ready.map((r) => r.platform))} disabled={busy}>
          {busy && which === ready.map((r) => r.platform).join(",") ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {`Publish to all ${ready.length} connected platforms`}
        </Button>
      )}
    </div>
  );
}
