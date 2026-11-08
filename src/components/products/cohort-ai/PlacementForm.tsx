"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PLACEMENT_TYPES } from "@/lib/products/cohort-ai/constants";
import { savePlacementAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/placements/actions";
import type { SerializedPlacementRecord } from "@/lib/products/cohort-ai/placements";

type FormState = Record<string, string>;

function fromRecord(r: SerializedPlacementRecord | undefined): FormState {
  if (!r) return { type: "campus", placedOn: new Date().toISOString().slice(0, 10) };
  return {
    studentId: r.studentId,
    programId: r.programId ?? "",
    company: r.company,
    role: r.role,
    packageLpa: r.packageLpa != null ? String(r.packageLpa) : "",
    location: r.location ?? "",
    type: r.type,
    placedOn: r.placedOn,
    offerLetterUrl: r.offerLetterUrl ?? "",
    notes: r.notes ?? "",
  };
}

export default function PlacementForm({
  record,
  students,
  programs,
  trigger,
}: {
  record?: SerializedPlacementRecord;
  students: { _id: string; fullName: string; studentCode: string }[];
  programs: { _id: string; name: string }[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromRecord(record));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await savePlacementAction(form, record?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(record ? "Placement updated" : "Placement recorded");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(n) => { if (n) { setForm(fromRecord(record)); setErrors({}); } setOpen(n); }}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{record ? "Edit Placement" : "Record Placement"}</SheetTitle>
          <SheetDescription>Company, role, package and offer details.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Student *</Label>
            <Select value={form.studentId ?? ""} onValueChange={(v) => set("studentId", v ?? "")} disabled={Boolean(record)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s._id} value={s._id}>{s.fullName} ({s.studentCode})</SelectItem>)}
              </SelectContent>
            </Select>
            {err("studentId")}
          </div>
          <div className="space-y-1.5">
            <Label>Program</Label>
            <Select value={form.programId || "none"} onValueChange={(v) => set("programId", v === "none" ? "" : v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not specified</SelectItem>
                {programs.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Company *</Label>
              <Input value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} />
              {err("company")}
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Input value={form.role ?? ""} onChange={(e) => set("role", e.target.value)} />
              {err("role")}
            </div>
            <div className="space-y-1.5">
              <Label>Package (LPA)</Label>
              <Input type="number" min={0} step="0.1" value={form.packageLpa ?? ""} onChange={(e) => set("packageLpa", e.target.value)} />
              {err("packageLpa")}
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type || "campus"} onValueChange={(v) => set("type", v ?? "campus")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLACEMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Placed on</Label>
              <Input type="date" value={form.placedOn ?? ""} onChange={(e) => set("placedOn", e.target.value)} />
              {err("placedOn")}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Offer letter URL</Label>
            <Input value={form.offerLetterUrl ?? ""} onChange={(e) => set("offerLetterUrl", e.target.value)} />
            {err("offerLetterUrl")}
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : record ? "Save changes" : "Record placement"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
