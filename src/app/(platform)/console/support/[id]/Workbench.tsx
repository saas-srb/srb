"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, Copy, Loader2, Send, Sparkles, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeAction, replyAction, updateRequestAction } from "../actions";
import type { RequestView } from "@/lib/support/requests";
import type { AiAnalysis, SupportConfig } from "@/lib/support/types";

const INPUT = "w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const L = ({ children }: { children: React.ReactNode }) => <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;

/** Staff controls for one request: workflow fields, AI triage suggestions (always reviewed by a person), and the reply box. */
export default function Workbench({ request, config, me, canManage }: { request: RequestView; config: SupportConfig; me: { id: string; email: string }; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(request.ai);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const isBug = config.types.find((t) => t.key === request.type)?.kind === "bug";

  function patch(p: Parameters<typeof updateRequestAction>[1], ok = "Updated") {
    start(async () => {
      const res = await updateRequestAction(request._id, p);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(ok);
      router.refresh();
    });
  }

  function analyze() {
    start(async () => {
      const res = await analyzeAction(request._id);
      if (!res.ok) { toast.error(res.error); return; }
      setAnalysis(res.analysis);
      router.refresh();
    });
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await replyAction(request._id, body, internal);
      if (!res.ok) { toast.error(res.error); return; }
      setBody("");
      toast.success(internal ? "Note added" : "Reply sent");
      router.refresh();
    });
  }

  const sel = (label: string, value: string | null, options: { key: string; label: string; active?: boolean }[], onChange: (v: string) => void, allowNone = false) => (
    <div>
      <L>{label}</L>
      <select value={value ?? ""} disabled={!canManage || pending} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        {allowNone && <option value="">—</option>}
        {options.filter((o) => o.active !== false || o.key === value).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 bg-card p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Workflow</p>
        <div className="space-y-3">
          {sel("Status", request.status, config.statuses, (v) => patch({ status: v }))}
          {sel("Priority", request.priority, config.priorities, (v) => patch({ priority: v }))}
          {isBug && sel("Severity", request.severity, config.severities, (v) => patch({ severity: v || null }), true)}
          {sel("Category", request.category, config.categories, (v) => patch({ category: v || null }), true)}
          {sel("Team", request.team, config.teams, (v) => patch({ team: v || null }), true)}
          <div>
            <L>Assignee</L>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{request.assignee?.email ?? "Unassigned"}</span>
              {canManage && (request.assignee?.id === me.id ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => patch({ assignee: null }, "Unassigned")}><UserX className="size-3.5" /> Unassign</Button>
              ) : (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => patch({ assignee: me }, "Assigned to you")}><UserCheck className="size-3.5" /> Take it</Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Sparkles className="size-4 text-primary" /> AI assist</p>
          {canManage && <Button size="sm" variant="outline" disabled={pending} onClick={analyze}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {analysis ? "Re-analyze" : "Analyze"}</Button>}
        </div>
        {!analysis ? (
          <p className="text-xs text-muted-foreground">Summarize this request, suggest a category, priority and team, find similar requests and draft a reply. You review everything before it is used.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-foreground/90">{analysis.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.category && <button type="button" disabled={!canManage || pending} onClick={() => patch({ category: analysis.category }, "Category applied")} className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] hover:border-primary/40 hover:text-primary">Category: {config.categories.find((c) => c.key === analysis.category)?.label ?? analysis.category} · apply</button>}
              {analysis.priority && <button type="button" disabled={!canManage || pending} onClick={() => patch({ priority: analysis.priority! }, "Priority applied")} className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] hover:border-primary/40 hover:text-primary">Priority: {config.priorities.find((c) => c.key === analysis.priority)?.label ?? analysis.priority} · apply</button>}
              {analysis.team && <button type="button" disabled={!canManage || pending} onClick={() => patch({ team: analysis.team }, "Team applied")} className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] hover:border-primary/40 hover:text-primary">Team: {config.teams.find((c) => c.key === analysis.team)?.label ?? analysis.team} · apply</button>}
            </div>
            {analysis.duplicateOf.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Possible duplicates / similar</p>
                <ul className="mt-1 space-y-0.5">{analysis.duplicateOf.map((d) => <li key={d.id}><Link href={`/console/resolveiq/${d.id}`} className="text-xs text-primary hover:underline">#{d.number} {d.title}</Link></li>)}</ul>
              </div>
            )}
            {analysis.articles.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Relevant help articles</p>
                <ul className="mt-1 space-y-0.5">{analysis.articles.map((a) => <li key={a.slug} className="flex items-center gap-1 text-xs text-foreground/80"><BookOpen className="size-3" /> {a.title}</li>)}</ul>
              </div>
            )}
            {analysis.suggestedReply && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Suggested reply</p>
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-muted/50 p-2.5 text-xs text-foreground/90">{analysis.suggestedReply}</p>
                {canManage && <button type="button" onClick={() => { setBody(analysis.suggestedReply); setInternal(false); }} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Copy className="size-3" /> Use as my reply</button>}
              </div>
            )}
            {analysis.note && <p className="text-[11px] text-muted-foreground">{analysis.note}</p>}
          </div>
        )}
      </div>

      {canManage && (
        <form onSubmit={send} className="space-y-2 rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-sm font-semibold text-foreground">{internal ? "Internal note" : "Reply to company"}</p>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} placeholder={internal ? "Only support staff can see this." : "The company sees this reply."} className={INPUT} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note (hidden from the company)</label>
            <Button type="submit" size="sm" disabled={pending || !body.trim()}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} {internal ? "Add note" : "Send reply"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
