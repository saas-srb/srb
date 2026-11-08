"use client";

import { useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CERTIFICATE_TYPES } from "@/lib/products/cohort-ai/constants";
import { issueCertificateAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/certificates/actions";

export default function CertificateIssueForm({
  students,
  programs,
  batches,
  defaultStudentId = "",
  defaultProgramId = "",
  trigger,
}: {
  students: { _id: string; fullName: string; studentCode: string }[];
  programs: { _id: string; name: string }[];
  batches: { _id: string; name: string; programId: string }[];
  defaultStudentId?: string;
  defaultProgramId?: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState<string>("industrial_training");
  const [studentId, setStudentId] = useState(defaultStudentId);
  const [programId, setProgramId] = useState(defaultProgramId);
  const [batchId, setBatchId] = useState("");
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [issuedOn, setIssuedOn] = useState(today);

  const programBatches = useMemo(() => batches.filter((b) => !programId || b.programId === programId), [batches, programId]);
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function reset() {
    setType("industrial_training");
    setStudentId(defaultStudentId);
    setProgramId(defaultProgramId);
    setBatchId("");
    setTitle("");
    setGrade("");
    setIssuedOn(today);
    setErrors({});
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await issueCertificateAction({ type, studentId, programId, batchId, title, grade, issuedOn });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Certificate issued");
      setOpen(false);
      if (result.id) router.push(`/cohort-ai/certificates/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(n) => { if (n) reset(); setOpen(n); }}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Issue Certificate</SheetTitle>
          <SheetDescription>Generates a unique number and a QR verification link.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Certificate type *</Label>
            <Select value={type} onValueChange={(v) => setType(v ?? "industrial_training")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CERTIFICATE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {err("type")}
          </div>
          <div className="space-y-1.5">
            <Label>Student *</Label>
            <Select value={studentId} onValueChange={(v) => setStudentId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => <SelectItem key={s._id} value={s._id}>{s.fullName} ({s.studentCode})</SelectItem>)}
              </SelectContent>
            </Select>
            {err("studentId")}
          </div>
          <div className="space-y-1.5">
            <Label>Program *</Label>
            <Select value={programId} onValueChange={(v) => { setProgramId(v ?? ""); setBatchId(""); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a program" /></SelectTrigger>
              <SelectContent>
                {programs.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {err("programId")}
          </div>
          <div className="space-y-1.5">
            <Label>Batch</Label>
            <Select value={batchId || "none"} onValueChange={(v) => setBatchId(v === "none" ? "" : v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not batch-specific</SelectItem>
                {programBatches.map((b) => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Grade / remark</Label>
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="A+, Distinction…" />
            </div>
            <div className="space-y-1.5">
              <Label>Issue date</Label>
              <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
              {err("issuedOn")}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Detail line</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Project: E-commerce platform" />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Issue certificate"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
