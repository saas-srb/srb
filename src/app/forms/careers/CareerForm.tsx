"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field, SELECT, Sent } from "@/components/forms-public/fields";
import { useCareerApplySubmit } from "@/lib/useCareerApplySubmit";

export default function CareerForm({ positions, initial }: { positions: { slug: string; title: string }[]; initial: string }) {
  const { status, error, fieldErrors, submit, reset } = useCareerApplySubmit();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const resume = data.get("resume");
    const text = (k: string) => String(data.get(k) ?? "").trim();
    const positionSlug = text("positionSlug") || undefined;
    await submit({ name: text("name"), email: text("email"), phone: text("phone"), coverNote: text("coverNote") || undefined, positionSlug, resume: resume as File, source: "hosted-careers-form" });
  }

  if (status === "success") return <Sent message="Thank you. We have your application." again={reset} />;
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="f-position">Role</Label>
        <select id="f-position" name="positionSlug" defaultValue={initial} className={SELECT}>
          <option value="">General application</option>
          {positions.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
            </option>
          ))}
        </select>
        {fieldErrors.positionSlug && <p className="text-xs text-destructive">{fieldErrors.positionSlug}</p>}
      </div>
      <Field name="name" label="Full name" error={fieldErrors.name} required />
      <Field name="email" label="Email" type="email" error={fieldErrors.email} required />
      <Field name="phone" label="Phone" type="tel" error={fieldErrors.phone} required />
      <Field name="resume" label="Resume (PDF or Word)" type="file" accept=".pdf,.doc,.docx" error={fieldErrors.resume} required />
      <Field name="coverNote" label="Anything we should know (optional)" multiline error={fieldErrors.coverNote} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={status === "submitting"} className="w-full">
        {status === "submitting" ? <Loader2 className="size-4 animate-spin" /> : "Send application"}
      </Button>
    </form>
  );
}
