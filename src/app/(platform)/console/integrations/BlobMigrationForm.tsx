"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { HardDriveDownload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { discardBlobMigrationAction, startBlobMigrationAction, switchBlobStoreAction, tickBlobMigrationAction } from "./actions";
import type { BlobMigrationView } from "@/lib/storage/blob-migrate-run";

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/** File storage → Migrate from another Blob store. Copies every file with the same name; never deletes from the old store. */
export default function BlobMigrationForm({ initial, canManage }: { initial: BlobMigrationView; canManage: boolean }) {
  const [v, setV] = useState(initial);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [keep, setKeep] = useState(false);
  const [pending, start] = useTransition();
  const ticking = useRef(false);
  const running = v.status === "running";

  const tick = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    try {
      setV(await tickBlobMigrationAction());
    } catch {
      /* the next tick retries from the saved cursor */
    } finally {
      ticking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    void tick();
    const id = setInterval(() => void tick(), 3_000);
    return () => clearInterval(id);
  }, [running, tick]);

  function begin() {
    start(async () => {
      const res = await startBlobMigrationAction({ sourceToken: source, targetToken: target, dryRun, keepSourceToken: keep });
      if (res.ok) {
        setV(res.view);
        setSource("");
        setTarget("");
      } else toast.error(res.error);
    });
  }
  function doSwitch() {
    start(async () => {
      const res = await switchBlobStoreAction();
      if (res.ok) {
        setV(res.view);
        toast.success("The app now uses the new store.");
      } else toast.error(res.error);
    });
  }
  function discard() {
    start(async () => setV(await discardBlobMigrationAction()));
  }

  const c = v.counts;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDriveDownload className="size-4 text-primary" /> Migrate from another Blob store
        </CardTitle>
        <CardDescription>
          Only needed if the old Vercel Blob store is going away. Copies every file with the same name (so no database change), skips files already copied, checks each size, and never deletes anything from the old store. Run it as a dry run first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!running && v.status !== "done" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="blob-old">Old store token</Label>
              <Input id="blob-old" type="password" autoComplete="off" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Blank = the token saved above" disabled={!canManage} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="blob-new">New store read-write token</Label>
              <Input id="blob-new" type="password" autoComplete="off" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="BLOB_READ_WRITE_TOKEN of the new store" disabled={!canManage} />
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run (count only, copy nothing)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep the old token saved after the run</label>
              <Button type="button" onClick={begin} disabled={pending || !canManage}>{pending ? <Loader2 className="size-4 animate-spin" /> : dryRun ? "Start dry run" : "Start copying"}</Button>
            </div>
          </div>
        )}

        {v.status !== "none" && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              {running ? "Copying…" : v.status === "done" ? (v.dryRun ? "Dry run finished" : v.counts.failed ? "Finished with failures" : "Finished: everything copied and checked") : "Stopped"}
              {v.switched ? " · switched to the new store" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {c.listed} files seen · {v.dryRun ? `${c.wouldCopy} would be copied` : `${c.copied} copied`} · {c.skipped} already there · {c.failed} failed · {mb(c.bytes)}
            </p>
            {v.error && <p className="text-xs text-destructive">{v.error}</p>}
            {v.failures.length > 0 && (
              <details className="rounded-lg border p-2 text-xs">
                <summary className="cursor-pointer">Failed files ({v.failures.length}{c.failed > v.failures.length ? ` of ${c.failed}` : ""})</summary>
                <ul className="mt-1 max-h-48 space-y-1 overflow-auto">
                  {v.failures.map((f) => <li key={f.pathname}><span className="break-all font-mono">{f.pathname}</span> · {f.error}</li>)}
                </ul>
              </details>
            )}
            {!running && (
              <div className="flex flex-wrap gap-2 pt-2">
                {v.canSwitch && <Button type="button" onClick={doSwitch} disabled={pending || !canManage}>Switch to new store</Button>}
                <Button type="button" variant="outline" onClick={discard} disabled={pending || !canManage}>{v.status === "done" ? "Done, clear this" : "Clear and start again"}</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
