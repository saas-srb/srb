"use client";

import { useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SUPPORTED_CURRENCIES } from "@/lib/products/cohort-ai/constants";
import { savePaymentPlanAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/payments/actions";
import type { SerializedPaymentPlan } from "@/lib/products/cohort-ai/payments";

export default function PaymentPlanForm({
  plan,
  students,
  programs,
  batches,
  defaultCurrency,
  trigger,
}: {
  plan?: SerializedPaymentPlan;
  students: { _id: string; fullName: string; studentCode: string }[];
  programs: { _id: string; name: string; fees: number | null; currency: string }[];
  batches: { _id: string; name: string; programId: string }[];
  defaultCurrency: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [studentId, setStudentId] = useState(plan?.studentId ?? "");
  const [programId, setProgramId] = useState(plan?.programId ?? "");
  const [batchId, setBatchId] = useState(plan?.batchId ?? "");
  const [totalFees, setTotalFees] = useState(plan ? String(plan.totalFees) : "");
  const [discount, setDiscount] = useState(plan ? String(plan.discount) : "0");
  const [currency, setCurrency] = useState(plan?.currency ?? defaultCurrency);
  const [notes, setNotes] = useState(plan?.notes ?? "");

  const programBatches = useMemo(() => batches.filter((b) => !programId || b.programId === programId), [batches, programId]);
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function pickProgram(v: string) {
    setProgramId(v);
    setBatchId("");
    const p = programs.find((x) => x._id === v);
    if (p && !plan) {
      if (p.fees != null) setTotalFees(String(p.fees));
      setCurrency(p.currency || defaultCurrency);
    }
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await savePaymentPlanAction({ studentId, programId, batchId, totalFees, discount, currency, notes }, plan?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(plan ? "Plan updated" : "Payment plan created");
      setOpen(false);
      if (result.id && !plan) router.push(`/cohort-ai/payments/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{plan ? "Edit Fee Plan" : "New Fee Plan"}</SheetTitle>
          <SheetDescription>Set the total fees; record payments against it afterwards.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Student *</Label>
            <Select value={studentId} onValueChange={(v) => setStudentId(v ?? "")} disabled={Boolean(plan)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s._id} value={s._id}>{s.fullName} ({s.studentCode})</SelectItem>)}
              </SelectContent>
            </Select>
            {err("studentId")}
          </div>
          <div className="space-y-1.5">
            <Label>Program *</Label>
            <Select value={programId} onValueChange={(v) => pickProgram(v ?? "")} disabled={Boolean(plan)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a program" /></SelectTrigger>
              <SelectContent>
                {programs.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {err("programId")}
          </div>
          <div className="space-y-1.5">
            <Label>Batch</Label>
            <Select value={batchId || "none"} onValueChange={(v) => setBatchId(v === "none" ? "" : v ?? "")} disabled={Boolean(plan)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not batch-specific</SelectItem>
                {programBatches.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Total fees *</Label>
              <Input type="number" min={0} value={totalFees} onChange={(e) => setTotalFees(e.target.value)} />
              {err("totalFees")}
            </div>
            <div className="space-y-1.5">
              <Label>Discount</Label>
              <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} />
              {err("discount")}
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v ?? defaultCurrency)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : plan ? "Save changes" : "Create plan"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
