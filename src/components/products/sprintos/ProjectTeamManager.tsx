"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PROJECT_MEMBER_ROLES, getMemberRoleLabel } from "@/lib/products/sprintos/constants";
import { formatCurrency } from "@/lib/utils";
import { saveMemberAction, removeMemberAction } from "@/app/(products)/sprintos/(protected)/projects/member-actions";

interface MemberRow {
  _id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  role: string;
  allocationPercent: number;
  billableRate: number | null;
  costRate: number | null;
  active: boolean;
}

const NONE = "__none__";

export default function ProjectTeamManager({
  projectId,
  currency,
  members,
  employees,
  canManage,
  managerEmployeeId,
}: {
  projectId: string;
  currency: string;
  members: MemberRow[];
  employees: { _id: string; name: string; employeeCode: string }[];
  canManage: boolean;
  managerEmployeeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const assignedIds = new Set(members.map((m) => m.employeeId));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;
  const totalAllocation = members.filter((m) => m.active).reduce((s, m) => s + m.allocationPercent, 0);

  function openCreate() {
    setEditing(null);
    setForm({ role: "developer", allocationPercent: "50", active: "true" });
    setErrors({});
    setSheetOpen(true);
  }
  function openEdit(m: MemberRow) {
    setEditing(m);
    setForm({
      employeeId: m.employeeId,
      role: m.role,
      allocationPercent: String(m.allocationPercent),
      billableRate: m.billableRate != null ? String(m.billableRate) : "",
      costRate: m.costRate != null ? String(m.costRate) : "",
      active: m.active ? "true" : "false",
    });
    setErrors({});
    setSheetOpen(true);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveMemberAction(projectId, form, editing?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Team updated");
      setSheetOpen(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeMemberAction(projectId, id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not remove member.");
        return;
      }
      toast.success("Member removed");
      router.refresh();
    });
  }

  const selectableEmployees = editing
    ? employees
    : employees.filter((e) => !assignedIds.has(e._id));

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>
          Team ({members.filter((m) => m.active).length}) ·{" "}
          <span className={totalAllocation > 100 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
            {totalAllocation}% allocated
          </span>
        </CardTitle>
        {canManage && (
          <Button type="button" size="sm" onClick={openCreate} disabled={selectableEmployees.length === 0 && !editing}>
            <Plus className="size-3.5" data-icon="inline-start" />
            Add Member
          </Button>
        )}
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Allocation</TableHead>
              <TableHead>Billable Rate</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground">
                  No team members yet.
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m._id}>
                <TableCell>
                  <span className="font-medium">{m.employeeName}</span>
                  {managerEmployeeId === m.employeeId && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">PM</span>
                  )}
                  <div className="font-mono text-xs text-muted-foreground">{m.employeeCode}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{getMemberRoleLabel(m.role)}</TableCell>
                <TableCell className="tabular-nums">{m.allocationPercent}%</TableCell>
                <TableCell className="text-muted-foreground">
                  {m.billableRate != null ? formatCurrency(m.billableRate, currency) : "—"}
                </TableCell>
                <TableCell>
                  <span className={m.active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                    {m.active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(m)} aria-label={`Edit ${m.employeeName}`}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${m.employeeName}`} disabled={pending}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {m.employeeName}?</AlertDialogTitle>
                            <AlertDialogDescription>They will be taken off this project&apos;s team allocation.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(m._id)}>Remove</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{editing ? "Edit Team Member" : "Add Team Member"}</SheetTitle>
            <SheetDescription>Assign an TalentOS employee to this project.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select
                value={form.employeeId || NONE}
                onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v === NONE ? "" : (v ?? "") }))}
                disabled={Boolean(editing)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Select an employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Select an employee</SelectItem>
                  {selectableEmployees.map((e) => (
                    <SelectItem key={e._id} value={e._id}>{e.name} · {e.employeeCode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("employeeId")}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role || "developer"} onValueChange={(v) => setForm((f) => ({ ...f, role: v ?? "developer" }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_MEMBER_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Allocation ({form.allocationPercent || 0}%)</Label>
              <Input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.allocationPercent || "0"}
                onChange={(e) => setForm((f) => ({ ...f, allocationPercent: e.target.value }))}
              />
              {err("allocationPercent")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Billable rate / hr ({currency})</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.billableRate ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, billableRate: e.target.value }))}
                />
                {err("billableRate")}
              </div>
              <div className="space-y-1.5">
                <Label>Cost rate / hr ({currency})</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.costRate ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, costRate: e.target.value }))}
                />
                {err("costRate")}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.active || "true"} onValueChange={(v) => setForm((f) => ({ ...f, active: v ?? "true" }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={submit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </GlassCard>
  );
}
