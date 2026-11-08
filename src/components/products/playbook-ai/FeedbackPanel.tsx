"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { resolveFeedbackAction, submitFeedbackAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export interface FeedbackRow {
  id: string;
  kind: "feedback" | "change_request";
  message: string;
  userName: string;
  version: string | null;
  status: "open" | "resolved";
  resolutionNote: string | null;
  createdAt: string;
  mine: boolean;
}

/** Feedback / change requests. Anyone who can read the SOP can submit; editors see everyone's and can resolve. Not an approval step — it never blocks publishing. */
export default function FeedbackPanel({ sopId, rows, canResolve }: { sopId: string; rows: FeedbackRow[]; canResolve: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState("feedback");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await submitFeedbackAction(sopId, { kind, message });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Thanks — the SOP owner has been notified.");
      setMessage("");
      router.refresh();
    });
  }

  function resolve(id: string) {
    startTransition(async () => {
      const res = await resolveFeedbackAction(sopId, id, note[id] ?? "");
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/20 p-4">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <OptionSelect value={kind} onChange={setKind} options={[{ value: "feedback", label: "Feedback" }, { value: "change_request", label: "Change request" }]} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-msg">{kind === "change_request" ? "What should change?" : "Your feedback"}</Label>
            <Textarea id="fb-msg" rows={3} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} placeholder="Be specific — mention the step or section." />
          </div>
        </div>
        <Button type="button" size="sm" onClick={submit} disabled={pending || message.trim().length < 5}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquarePlus className="size-3.5" data-icon="inline-start" />}
          Send
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{canResolve ? "No feedback yet." : "You haven't sent any feedback on this SOP."}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-border/50 p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge className={r.kind === "change_request" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-blue-500/15 text-blue-600 dark:text-blue-400"}>
                  {r.kind === "change_request" ? "Change request" : "Feedback"}
                </Badge>
                <span className="font-medium text-foreground">{r.mine ? "You" : r.userName}</span>
                <span>{formatDateTime(r.createdAt)}</span>
                {r.version && <span>on v{r.version}</span>}
                <Badge className={r.status === "open" ? "bg-muted text-muted-foreground" : "bg-green-500/15 text-green-600 dark:text-green-400"}>{r.status === "open" ? "Open" : "Resolved"}</Badge>
              </div>
              <p className="whitespace-pre-wrap">{r.message}</p>
              {r.status === "resolved" && r.resolutionNote && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-600" />{r.resolutionNote}</p>
              )}
              {canResolve && r.status === "open" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={note[r.id] ?? ""}
                    onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Resolution note (optional)"
                    maxLength={500}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => resolve(r.id)} disabled={pending}>Mark resolved</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
