"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { updateIssueAction, bulkIssueStatusAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { ISSUE_STATUSES, ISSUE_STATUS_LABEL } from "@/lib/products/rankmax-ai/checks";

const STATUS_OPTS = ISSUE_STATUSES.map((s) => ({ value: s, label: ISSUE_STATUS_LABEL[s] }));

/** Status / assignee / notes editor on the issue detail page. */
export function IssueEditor({ id, status, assigneeId, notes, users, canEdit }: { id: string; status: string; assigneeId: string; notes: string; users: { value: string; label: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState({ status, assigneeId, notes });
  const [pending, startTransition] = useTransition();
  const dirty = v.status !== status || v.assigneeId !== assigneeId || v.notes !== notes;
  return (
    <fieldset disabled={!canEdit || pending} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Status</Label><OptionSelect value={v.status} onChange={(s) => setV((x) => ({ ...x, status: s }))} options={STATUS_OPTS} aria-label="Status" /></div>
        <div className="space-y-1.5"><Label>Assigned to</Label><OptionSelect value={v.assigneeId} onChange={(s) => setV((x) => ({ ...x, assigneeId: s }))} options={users} noneLabel="Unassigned" aria-label="Assignee" /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="issue-notes">Notes / recommendation updates</Label><Textarea id="issue-notes" rows={3} value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} /></div>
      {canEdit && (
        <Button
          type="button"
          disabled={!dirty}
          onClick={() =>
            startTransition(async () => {
              const res = await updateIssueAction(id, { status: v.status, assigneeId: v.assigneeId || null, notes: v.notes });
              if (!res.ok) toast.error(res.error);
              else {
                toast.success("Issue updated");
                router.refresh();
              }
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      )}
    </fieldset>
  );
}

/** Applies a status to every issue on the current page of results. */
export function BulkIssueBar({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Set the {ids.length} issue(s) shown to</span>
      <div className="w-36"><OptionSelect value={status} onChange={setStatus} options={STATUS_OPTS} placeholder="Status…" aria-label="Bulk status" /></div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!status || pending}
        onClick={() =>
          startTransition(async () => {
            const res = await bulkIssueStatusAction(ids, status);
            if (!res.ok) toast.error(res.error);
            else {
              toast.success(`${res.updated} issue(s) updated`);
              setStatus("");
              router.refresh();
            }
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Apply"}
      </Button>
    </div>
  );
}
