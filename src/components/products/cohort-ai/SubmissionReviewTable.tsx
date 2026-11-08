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
import { SubmissionStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import { reviewSubmissionAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/assignments/actions";
import type { SubmissionRow } from "@/lib/products/cohort-ai/assignments";

export default function SubmissionReviewTable({
  assignmentId,
  maxMarks,
  rows,
  canReview,
}: {
  assignmentId: string;
  maxMarks: number;
  rows: SubmissionRow[];
  canReview: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");

  function beginReview(r: SubmissionRow) {
    setOpenId(r.studentId);
    setMarks(r.marks != null ? String(r.marks) : "");
    setFeedback(r.feedback ?? "");
  }

  function submit(approved: boolean) {
    if (!openId) return;
    startTransition(async () => {
      const result = await reviewSubmissionAction(assignmentId, openId, { marks, feedback, approved });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save review.");
        return;
      }
      toast.success(approved ? "Submission reviewed" : "Sent back for rework");
      setOpenId(null);
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Submissions ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No students enrolled in this batch.</p>}
        {rows.map((r) => (
          <div key={r.studentId} className="rounded-lg border border-border/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium">{r.fullName}</span>
                {r.studentCode && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.studentCode}</span>}
              </div>
              <div className="flex items-center gap-2">
                <SubmissionStatusBadge status={r.status} />
                {r.marks != null && <span className="text-xs font-semibold tabular-nums">{r.marks}/{maxMarks}</span>}
              </div>
            </div>
            {r.submissionUrl && (
              <a href={r.submissionUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                View submission <ExternalLink className="size-3" />
              </a>
            )}
            {r.note && <p className="mt-1 text-xs text-muted-foreground">Note: {r.note}</p>}
            {r.feedback && <p className="mt-1 text-xs text-muted-foreground">Feedback: {r.feedback}</p>}

            {canReview && r.status !== "pending" && (
              openId === r.studentId ? (
                <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-2">
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} max={maxMarks} value={marks} onChange={(e) => setMarks(e.target.value)} placeholder="Marks" className="h-8 w-24" />
                    <span className="text-xs text-muted-foreground">/ {maxMarks}</span>
                  </div>
                  <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Feedback" />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={pending} onClick={() => submit(true)}>
                      {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Approve"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => submit(false)}>Rework</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setOpenId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => beginReview(r)}>Review</Button>
              )
            )}
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );
}
