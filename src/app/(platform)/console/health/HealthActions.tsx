"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { fileCopyTickAction, importFromEnvironmentAction } from "./actions";
import type { FileCopyView } from "@/lib/storage/blob-to-gridfs";

/** Two controls: import settings from this deployment's environment into the database, and watch/restart the copy of old Blob files into the database. */
export default function HealthActions({ initial, canManage }: { initial: FileCopyView; canManage: boolean }) {
  const [copy, setCopy] = useState(initial);
  const [pending, start] = useTransition();
  const ticking = useRef(false);
  const running = copy.state === "running";

  const tick = useCallback(async (restart = false) => {
    if (ticking.current) return;
    ticking.current = true;
    try {
      setCopy(await fileCopyTickAction(restart));
    } catch {
      /* the next tick retries */
    } finally {
      ticking.current = false;
    }
  }, []);
  useEffect(() => {
    if (!running || !canManage) return;
    void tick();
    const id = setInterval(() => void tick(), 3_000);
    return () => clearInterval(id);
  }, [running, canManage, tick]);

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Settings and files in the database</CardTitle>
        <CardDescription>Everything a deployment's environment provides is copied into the database (never overwriting), and files that still live in a Vercel Blob store are copied into the database too, so a new deployment needs nothing else.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!canManage || pending}
            onClick={() =>
              start(async () => {
                const r = await importFromEnvironmentAction();
                if (r.ok) toast.success(r.adopted.length ? `Adopted ${r.adopted.length} setting(s) from the environment.` : "Nothing new to adopt.");
                else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Import from environment"}
          </Button>
          <Button variant="outline" disabled={!canManage || running || copy.state === "no-blob"} onClick={() => void tick(true)}>
            Check Blob for files again
          </Button>
        </div>
        <p className="text-muted-foreground">
          Files: {copy.state === "no-blob" ? "no Blob token saved, everything is in the database." : copy.state === "idle" ? "not checked yet." : `${copy.inDatabase}/${copy.listed} of the files found in Blob are in the database${running ? " (copying…)" : copy.remaining ? `, ${copy.remaining} remaining` : ", all copied"}${copy.failed ? `, ${copy.failed} failed` : ""}.`}
          {copy.error ? <span className="block text-destructive">{copy.error}</span> : null}
        </p>
      </CardContent>
    </GlassCard>
  );
}
