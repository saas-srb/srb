"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { fileLeaveAction, previewLeaveDaysAction } from "@/app/(products)/talentos/(protected)/(staff)/leave/actions";
import { todayDateString } from "@/lib/products/talentos/time";

interface Props {
  employees: { _id: string; name: string; employeeCode: string }[];
  leaveTypes: { code: string; label: string }[];
  /** Fixed employee (profile tab context) — hides the picker. */
  fixedEmployeeId?: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
}

export default function FileLeaveSheet({ employees, leaveTypes, fixedEmployeeId, triggerLabel = "File Leave", triggerVariant = "default" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [days, setDays] = useState<number | null>(null);
  const today = todayDateString();

  const [form, setForm] = useState({
    employeeId: fixedEmployeeId ?? "",
    leaveTypeCode: leaveTypes[0]?.code ?? "",
    startDate: today,
    endDate: today,
    halfDayStart: false,
    halfDayEnd: false,
    reason: "",
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewLeaveDaysAction({
      startDate: form.startDate,
      endDate: form.endDate,
      halfDayStart: form.halfDayStart,
      halfDayEnd: form.halfDayEnd,
    }).then((r) => {
      if (!cancelled) setDays(r.days);
    });
    return () => {
      cancelled = true;
    };
  }, [open, form.startDate, form.endDate, form.halfDayStart, form.halfDayEnd]);

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await fileLeaveAction(form);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Leave request filed");
      setOpen(false);
      setForm((f) => ({ ...f, reason: "" }));
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <>
      <Button type="button" size="sm" variant={triggerVariant} onClick={() => setOpen(true)}>
        <CalendarPlus className="size-3.5" data-icon="inline-start" />
        {triggerLabel}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>File Leave Request</SheetTitle>
            <SheetDescription>Filed on the employee&apos;s behalf. Routed for approval.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!fixedEmployeeId && (
              <div className="space-y-1.5">
                <Label>Employee *</Label>
                <Select value={form.employeeId || undefined} onValueChange={(v) => v && setForm((f) => ({ ...f, employeeId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select an employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e._id} value={e._id}>{e.name} · {e.employeeCode}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err("employeeId")}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Leave type *</Label>
              <Select value={form.leaveTypeCode || undefined} onValueChange={(v) => v && setForm((f) => ({ ...f, leaveTypeCode: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((t) => (
                    <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("leaveTypeCode")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start date *</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))}
                  aria-invalid={!!errors.startDate || undefined}
                />
                {err("startDate")}
              </div>
              <div className="space-y-1.5">
                <Label>End date *</Label>
                <Input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} aria-invalid={!!errors.endDate || undefined} />
                {err("endDate")}
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.halfDayStart} onCheckedChange={(v) => setForm((f) => ({ ...f, halfDayStart: v === true }))} />
                Half day on start date
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.halfDayEnd}
                  disabled={form.startDate === form.endDate}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, halfDayEnd: v === true }))}
                />
                Half day on end date
              </label>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              Working days requested: <span className="font-semibold text-foreground">{days ?? "…"}</span>
              <span className="text-muted-foreground"> (weekends &amp; holidays excluded)</span>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} />
              {err("reason")}
            </div>
            <Button type="button" onClick={submit} disabled={pending || !days} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Submit Request"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
