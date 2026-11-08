"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssignmentStateBadge } from "@/components/products/playbook-ai/SopBadges";
import { remindPendingAction, unassignSopAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import { formatIsoDate } from "@/lib/products/playbook-ai/constants";
import { formatDateTime } from "@/lib/utils";

export interface AssignmentRow {
  userId: string;
  userName: string;
  departmentName: string;
  source: string;
  dueDate: string | null;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
  state: "acknowledged" | "overdue" | "pending";
  checklist: string;
}

/** Who has been assigned, who has viewed / acknowledged, who is overdue — plus remind and unassign for managers. */
export default function AssignmentsPanel({ sopId, rows, canManage }: { sopId: string; rows: AssignmentRow[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const open = rows.filter((r) => r.state !== "acknowledged").length;

  function remind() {
    startTransition(async () => {
      const res = await remindPendingAction(sopId);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.reminded ? `Reminded ${res.reminded} ${res.reminded === 1 ? "person" : "people"}` : "Everyone pending was already reminded in the last 24h.");
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      const res = await unassignSopAction(sopId, userId);
      if (!res.ok) toast.error(res.error);
      else toast.success("Assignment removed");
      router.refresh();
    });
  }

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nobody is assigned to this SOP yet.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {rows.length - open} of {rows.length} acknowledged · {open} outstanding
        </span>
        {canManage && open > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={remind} disabled={pending}>
            <BellRing className="size-3.5" data-icon="inline-start" />
            Remind pending
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Assigned via</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Viewed</TableHead>
              <TableHead>Checklist</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="font-medium">{r.userName}</TableCell>
                <TableCell className="text-muted-foreground">{r.departmentName}</TableCell>
                <TableCell className="text-muted-foreground">{r.source}</TableCell>
                <TableCell>{formatIsoDate(r.dueDate)}</TableCell>
                <TableCell className="text-muted-foreground">{r.viewedAt ? formatDateTime(r.viewedAt) : "Not yet"}</TableCell>
                <TableCell className="text-muted-foreground">{r.checklist}</TableCell>
                <TableCell>
                  <AssignmentStateBadge state={r.state} />
                  {r.acknowledgedAt && <span className="block text-[11px] text-muted-foreground">v{r.acknowledgedVersion} · {formatDateTime(r.acknowledgedAt)}</span>}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(r.userId)} disabled={pending} aria-label={`Remove ${r.userName}`}>
                      <UserMinus className="size-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
