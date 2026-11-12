"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePreviousProjectAction, testPreviousProjectAction } from "./actions";
import type { PreviousProjectView } from "@/lib/platform/integrations";

/** Domains & hosting → Previous Vercel project (migration). Optional: with it, Domain sync releases each host from the old project before attaching it to the new one. */
export default function PreviousProjectForm({ view, canManage, movedAll = false }: { view: PreviousProjectView; canManage: boolean; movedAll?: boolean }) {
  const [token, setToken] = useState("");
  const [projectId, setProjectId] = useState(view.projectId);
  const [teamId, setTeamId] = useState(view.teamId);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function save(clear = false) {
    start(async () => {
      const res = await savePreviousProjectAction({ token, projectId, teamId, clear });
      if (res.ok) {
        toast.success(clear ? "Previous project removed." : "Saved.");
        setToken("");
        if (clear) {
          setProjectId("");
          setTeamId("");
        }
      } else setMsg({ ok: false, text: Object.values(res.errors)[0] ?? "Couldn't save." });
    });
  }
  function test() {
    start(async () => {
      const res = await testPreviousProjectAction();
      setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    });
  }

  return (
    <Card id="previous-project">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="size-4 text-primary" /> Previous Vercel project (migration)
        </CardTitle>
        <CardDescription>
          Optional. Only when you moved to a new Vercel account: save the OLD account&apos;s token and project id here, then press Sync all domains now in Domains &amp; SSL. Each address is released from the old project and attached to the new one.
          Remove it when the move is done.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prev-project">Old project id</Label>
          <Input id="prev-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="prj_…" disabled={!canManage} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prev-team">Old team id (optional)</Label>
          <Input id="prev-team" value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="team_…" disabled={!canManage} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="prev-token">Old account API token</Label>
          <Input id="prev-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={view.saved ? `Saved (…${view.tokenLast4}). Leave blank to keep it` : "Token with access to the old project"} disabled={!canManage} />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="button" onClick={() => save()} disabled={pending || !canManage}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={test} disabled={pending || !canManage || !view.saved}>
            Test connection
          </Button>
          {view.saved && (
            <Button type="button" variant="ghost" onClick={() => save(true)} disabled={pending || !canManage}>
              Remove
            </Button>
          )}
          {view.connected && (
            <p className={view.connected.ok ? "w-full text-sm text-emerald-600" : "w-full text-sm text-destructive"}>
              {view.connected.ok ? `Connected: ${view.connected.projectName ?? view.projectId}${view.connected.team ? ` (${view.connected.team})` : ""}` : "The last test could not connect"} · tested {new Date(view.connected.at).toLocaleString()}
            </p>
          )}
          {view.saved && movedAll && (
            <p className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
              Every address has been moved. You can remove the previous token now so no old credentials linger.{" "}
              <button type="button" className="font-semibold underline" disabled={pending || !canManage} onClick={() => save(true)}>Remove the previous token now</button>
            </p>
          )}
          {msg && <p className={msg.ok ? "w-full text-sm text-emerald-600" : "w-full text-sm text-destructive"} aria-live="polite">{msg.text}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
