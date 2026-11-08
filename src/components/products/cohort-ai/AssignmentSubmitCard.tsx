"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SubmissionStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import { submitAssignmentAction } from "@/app/(products)/cohort-ai/(protected)/me/assignments/actions";
import type { StudentAssignmentView } from "@/lib/products/cohort-ai/assignments";
import { formatDate } from "@/lib/utils";

export default function AssignmentSubmitCard({ item }: { item: StudentAssignmentView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(item.submission?.submissionUrl ?? "");
  const [note, setNote] = useState(item.submission?.note ?? "");
  const [expanded, setExpanded] = useState(false);

  const sub = item.submission;
  const locked = sub?.status === "reviewed";
  const today = new Date().toISOString().slice(0, 10);
  const overdue = item.dueDate && item.dueDate < today && (!sub || sub.status === "pending");

  function submit() {
    startTransition(async () => {
      const result = await submitAssignmentAction(item._id, { submissionUrl: url, note });
      if (!result.ok) {
        toast.error(result.error ?? "Could not submit.");
        return;
      }
      toast.success("Submitted");
      setExpanded(false);
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{item.title}</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.batchName} · {item.programName}
            {item.dueDate ? <span className={overdue ? "text-destructive" : ""}> · due {formatDate(item.dueDate)}</span> : null}
          </p>
        </div>
        <SubmissionStatusBadge status={sub?.status ?? "pending"} />
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {item.description && <p className="whitespace-pre-wrap text-muted-foreground">{item.description}</p>}
        {item.attachmentUrl && (
          <a href={item.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Brief <ExternalLink className="size-3" />
          </a>
        )}

        {sub && sub.status !== "pending" && (
          <div className="rounded-lg bg-muted/40 p-2 text-xs">
            {sub.submissionUrl && (
              <a href={sub.submissionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Your submission <ExternalLink className="size-3" />
              </a>
            )}
            {sub.marks != null && <p className="mt-1 font-semibold">Marks: {sub.marks}/{item.maxMarks}</p>}
            {sub.feedback && <p className="mt-1 text-muted-foreground">Feedback: {sub.feedback}</p>}
          </div>
        )}

        {!locked && (
          expanded ? (
            <div className="space-y-2 rounded-lg border border-border/60 p-2">
              <div className="space-y-1">
                <Label className="text-xs">Submission link *</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/…" className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={submit}>
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : sub && sub.status !== "pending" ? "Resubmit" : "Submit"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
              {sub && sub.status !== "pending" ? "Update submission" : "Submit work"}
            </Button>
          )
        )}
      </CardContent>
    </GlassCard>
  );
}
