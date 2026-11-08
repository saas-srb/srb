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
import { STUDENT_STATUSES } from "@/lib/products/cohort-ai/constants";
import { saveStudentAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/students/actions";
import type { SerializedStudent } from "@/lib/products/cohort-ai/students";

type FormState = Record<string, string>;

function fromStudent(s: SerializedStudent | undefined): FormState {
  if (!s) return { status: "active" };
  return {
    fullName: s.fullName,
    email: s.email ?? "",
    mobile: s.mobile ?? "",
    address: s.address ?? "",
    college: s.education.college ?? "",
    university: s.education.university ?? "",
    branch: s.education.branch ?? "",
    semester: s.education.semester ?? "",
    graduationYear: s.education.graduationYear != null ? String(s.education.graduationYear) : "",
    guardianName: s.guardian.name ?? "",
    guardianPhone: s.guardian.phone ?? "",
    guardianRelation: s.guardian.relation ?? "",
    resumeUrl: s.links.resumeUrl ?? "",
    linkedin: s.links.linkedin ?? "",
    github: s.links.github ?? "",
    photoUrl: s.links.photoUrl ?? "",
    status: s.status,
    notes: s.notes ?? "",
  };
}

export default function StudentForm({
  student,
  trigger,
  onSaved,
}: {
  student?: SerializedStudent;
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => fromStudent(student));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(fromStudent(student));
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveStudentAction(form, student?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(student ? "Student updated" : "Student created");
      setOpen(false);
      if (result.id && onSaved) onSaved(result.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{student ? "Edit Student" : "New Student"}</SheetTitle>
          <SheetDescription>Profile, education, guardian and links.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input value={form.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)} />
              {err("fullName")}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || "active"} onValueChange={(v) => set("status", v ?? "active")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STUDENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              {err("email")}
            </div>
            <div className="space-y-1.5">
              <Label>Mobile</Label>
              <Input value={form.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} />
              {err("mobile")}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
          </div>

          <div className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Education</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>College</Label>
              <Input value={form.college ?? ""} onChange={(e) => set("college", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>University</Label>
              <Input value={form.university ?? ""} onChange={(e) => set("university", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Input value={form.branch ?? ""} onChange={(e) => set("branch", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <Input value={form.semester ?? ""} onChange={(e) => set("semester", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Graduation year</Label>
              <Input type="number" value={form.graduationYear ?? ""} onChange={(e) => set("graduationYear", e.target.value)} />
              {err("graduationYear")}
            </div>
          </div>

          <div className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Guardian</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.guardianName ?? ""} onChange={(e) => set("guardianName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.guardianPhone ?? ""} onChange={(e) => set("guardianPhone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Relation</Label>
              <Input value={form.guardianRelation ?? ""} onChange={(e) => set("guardianRelation", e.target.value)} />
            </div>
          </div>

          <div className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Links</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Resume URL</Label>
              <Input value={form.resumeUrl ?? ""} onChange={(e) => set("resumeUrl", e.target.value)} />
              {err("resumeUrl")}
            </div>
            <div className="space-y-1.5">
              <Label>Photo URL</Label>
              <Input value={form.photoUrl ?? ""} onChange={(e) => set("photoUrl", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>LinkedIn</Label>
              <Input value={form.linkedin ?? ""} onChange={(e) => set("linkedin", e.target.value)} />
              {err("linkedin")}
            </div>
            <div className="space-y-1.5">
              <Label>GitHub</Label>
              <Input value={form.github ?? ""} onChange={(e) => set("github", e.target.value)} />
              {err("github")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>

          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : student ? "Save changes" : "Create student"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
