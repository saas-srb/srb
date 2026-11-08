"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnProfileAction } from "@/app/(products)/cohort-ai/(protected)/me/profile/actions";
import type { SerializedStudent } from "@/lib/products/cohort-ai/students";

type FormState = Record<string, string>;

export default function MyProfileForm({ student }: { student: SerializedStudent }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({
    fullName: student.fullName,
    email: student.email ?? "",
    mobile: student.mobile ?? "",
    address: student.address ?? "",
    college: student.education.college ?? "",
    university: student.education.university ?? "",
    branch: student.education.branch ?? "",
    semester: student.education.semester ?? "",
    graduationYear: student.education.graduationYear != null ? String(student.education.graduationYear) : "",
    guardianName: student.guardian.name ?? "",
    guardianPhone: student.guardian.phone ?? "",
    guardianRelation: student.guardian.relation ?? "",
    resumeUrl: student.links.resumeUrl ?? "",
    linkedin: student.links.linkedin ?? "",
    github: student.links.github ?? "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await updateOwnProfileAction(form);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-4 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
            {err("fullName")}
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            {err("email")}
          </div>
          <div className="space-y-1.5">
            <Label>Mobile</Label>
            <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
            {err("mobile")}
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
        </div>

        <div className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Education</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>College</Label><Input value={form.college} onChange={(e) => set("college", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>University</Label><Input value={form.university} onChange={(e) => set("university", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Branch</Label><Input value={form.branch} onChange={(e) => set("branch", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Semester</Label><Input value={form.semester} onChange={(e) => set("semester", e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Graduation year</Label>
            <Input type="number" value={form.graduationYear} onChange={(e) => set("graduationYear", e.target.value)} />
            {err("graduationYear")}
          </div>
        </div>

        <div className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Guardian</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Relation</Label><Input value={form.guardianRelation} onChange={(e) => set("guardianRelation", e.target.value)} /></div>
        </div>

        <div className="border-t border-border/60 pt-3 text-sm font-semibold text-foreground">Links</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Resume URL</Label><Input value={form.resumeUrl} onChange={(e) => set("resumeUrl", e.target.value)} />{err("resumeUrl")}</div>
          <div className="space-y-1.5"><Label>LinkedIn</Label><Input value={form.linkedin} onChange={(e) => set("linkedin", e.target.value)} />{err("linkedin")}</div>
          <div className="space-y-1.5"><Label>GitHub</Label><Input value={form.github} onChange={(e) => set("github", e.target.value)} />{err("github")}</div>
        </div>

        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Save profile"}
        </Button>
      </CardContent>
    </GlassCard>
  );
}
