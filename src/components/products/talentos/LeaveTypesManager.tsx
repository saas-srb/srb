"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { saveLeaveTypeAction, deleteLeaveTypeAction } from "@/app/(products)/talentos/(protected)/(staff)/settings/actions";

interface LeaveTypeRow {
  _id: string;
  code: string;
  label: string;
  paid: boolean;
  defaultAnnualQuota: number;
  allowNegativeBalance: boolean;
  active: boolean;
}

export default function LeaveTypesManager({ types }: { types: LeaveTypeRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveTypeRow | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    code: "",
    label: "",
    paid: true,
    defaultAnnualQuota: "0",
    allowNegativeBalance: false,
    active: true,
  });

  function openCreate() {
    setEditing(null);
    setForm({ code: "", label: "", paid: true, defaultAnnualQuota: "0", allowNegativeBalance: false, active: true });
    setErrors({});
    setOpen(true);
  }
  function openEdit(t: LeaveTypeRow) {
    setEditing(t);
    setForm({
      code: t.code,
      label: t.label,
      paid: t.paid,
      defaultAnnualQuota: String(t.defaultAnnualQuota),
      allowNegativeBalance: t.allowNegativeBalance,
      active: t.active,
    });
    setErrors({});
    setOpen(true);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveLeaveTypeAction(form, editing?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Leave type saved");
      setOpen(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteLeaveTypeAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete.");
        return;
      }
      toast.success("Leave type removed");
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Leave Types</CardTitle>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="size-3.5" data-icon="inline-start" />
          New Type
        </Button>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Annual Quota</TableHead>
              <TableHead>Negative</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((t) => (
              <TableRow key={t._id}>
                <TableCell className="font-medium">{t.label}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{t.code}</TableCell>
                <TableCell>{t.paid ? "Yes" : "No"}</TableCell>
                <TableCell>{t.defaultAnnualQuota}</TableCell>
                <TableCell>{t.allowNegativeBalance ? "Allowed" : "—"}</TableCell>
                <TableCell>
                  <Badge className={t.active ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}>
                    {t.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(t)} aria-label={`Edit ${t.label}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${t.label}`} disabled={pending}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {t.label}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Blocked if pending or approved requests use this type. Otherwise it is deactivated and kept for history.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(t._id)}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{editing ? "Edit" : "New"} Leave Type</SheetTitle>
            <SheetDescription>Configuration used for balances and requests.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              {err("label")}
            </div>
            <div className="space-y-1.5">
              <Label>Code *</Label>
              <Input
                value={form.code}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toLowerCase() }))}
                placeholder="casual"
              />
              {err("code")}
              {editing && <p className="text-xs text-muted-foreground">Code cannot be changed after creation.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Default annual quota</Label>
              <Input inputMode="decimal" value={form.defaultAnnualQuota} onChange={(e) => setForm((f) => ({ ...f, defaultAnnualQuota: e.target.value }))} />
              {err("defaultAnnualQuota")}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.paid} onCheckedChange={(v) => setForm((f) => ({ ...f, paid: v === true }))} />
              Paid leave
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.allowNegativeBalance} onCheckedChange={(v) => setForm((f) => ({ ...f, allowNegativeBalance: v === true }))} />
              Allow negative balance (no quota check)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v === true }))} />
              Active
            </label>
            <Button type="button" onClick={submit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </GlassCard>
  );
}
