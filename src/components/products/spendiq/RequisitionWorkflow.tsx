"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Send, Trash2, Loader2, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/lib/utils";
import { getRequisitionStatusMeta } from "@/lib/products/spendiq/constants";
import type { SerializedRequisition } from "@/lib/products/spendiq/requisitions";
import {
  submitRequisitionAction,
  decideRequisitionAction,
  deleteRequisitionAction,
  uploadRequisitionAttachmentAction,
  removeRequisitionAttachmentAction,
} from "@/app/(products)/spendiq/(protected)/(staff)/requisitions/actions";

export default function RequisitionWorkflow({
  requisition,
  isOwner,
  canApprove,
  canDecideCurrent,
  backPath,
}: {
  requisition: SerializedRequisition;
  isOwner: boolean;
  canApprove: boolean;
  canDecideCurrent: boolean;
  backPath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const r = requisition;

  const isDraft = r.status === "draft";
  const isPending = ["submitted", "manager_approval", "procurement_review"].includes(r.status);
  const canEdit = isDraft && isOwner;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(okMsg);
      setNote("");
      router.refresh();
    });
  }

  function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadRequisitionAttachmentAction(r._id, fd);
      if (!res.ok) {
        toast.error(res.error ?? "Upload failed.");
        return;
      }
      toast.success("File attached");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {(isDraft || isPending) && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {isDraft && isOwner && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={pending} onClick={() => run(() => submitRequisitionAction(r._id), "Submitted for approval")}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" data-icon="inline-start" />}
                  Submit for approval
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button type="button" size="sm" variant="outline">
                        <Trash2 className="size-3.5 text-destructive" data-icon="inline-start" />
                        Delete draft
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {r.prCode}?</AlertDialogTitle>
                      <AlertDialogDescription>This draft requisition will be removed.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await deleteRequisitionAction(r._id);
                            if (!res.ok) {
                              toast.error(res.error ?? "Could not delete.");
                              return;
                            }
                            toast.success("Requisition deleted");
                            router.push(backPath);
                          })
                        }
                      >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {isPending && canApprove && canDecideCurrent && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  You are the {getRequisitionStatusMeta(r.status).label} approver for this requisition.
                </p>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional note (required when rejecting)" />
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={pending} onClick={() => run(() => decideRequisitionAction(r._id, true, note), "Approved")}>
                    <Check className="size-3.5" data-icon="inline-start" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !note.trim()}
                    onClick={() => run(() => decideRequisitionAction(r._id, false, note), "Rejected")}
                  >
                    <X className="size-3.5 text-destructive" data-icon="inline-start" />
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {isPending && canApprove && !canDecideCurrent && (
              <p className="text-sm text-muted-foreground">
                Waiting on the {getRequisitionStatusMeta(r.status).label} approver.
              </p>
            )}
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Approval Timeline</CardTitle></CardHeader>
        <CardContent>
          {r.approvals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not yet submitted for approval.</p>
          ) : (
            <ol className="space-y-3">
              {r.approvals.map((a) => (
                <li key={a.level} className="flex items-start gap-3">
                  <span
                    className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      a.decision === "approved"
                        ? "bg-green-500/15 text-green-600 dark:text-green-400"
                        : a.decision === "rejected"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {a.level}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {a.label}
                      <span className="ml-2 text-xs font-normal capitalize text-muted-foreground">{a.decision}</span>
                    </p>
                    {a.approverEmail && (
                      <p className="text-xs text-muted-foreground">
                        {a.approverEmail}
                        {a.decidedAt ? ` · ${formatDateTime(a.decidedAt)}` : ""}
                      </p>
                    )}
                    {a.note && <p className="text-xs text-muted-foreground">“{a.note}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {r.rejectionReason && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Rejected: {r.rejectionReason}
            </p>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle className="flex items-center gap-2"><Paperclip className="size-4" /> Attachments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {r.attachments.length === 0 && <p className="text-sm text-muted-foreground">No files attached.</p>}
          <ul className="space-y-1.5">
            {r.attachments.map((a) => (
              <li key={a.storageKey} className="flex items-center gap-2 text-sm">
                <a href={`/api/spendiq/attachments/${a.storageKey}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {a.filename}
                </a>
                <span className="text-xs text-muted-foreground">{Math.round(a.size / 1024)} KB</span>
                {canEdit && (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await removeRequisitionAttachmentAction(r._id, a.storageKey);
                        router.refresh();
                      })
                    }
                  >
                    remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" className="text-xs" onChange={onUpload} />
              <Upload className="size-3.5 text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        <a href={backPath} className="text-primary hover:underline">← Back to requisitions</a>
      </p>
    </div>
  );
}
