"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field, SELECT, Sent } from "@/components/forms-public/fields";
import { useLeadSubmit } from "@/lib/useLeadSubmit";

interface Category {
  slug: string;
  label: string;
  acceptsResume: boolean;
  subServices: { slug: string; label: string }[];
}

export default function EnquiryForm({ categories }: { categories: Category[] }) {
  const { status, error, fieldErrors, submit, reset } = useLeadSubmit();
  const [slug, setSlug] = useState(categories[0]?.slug ?? "");
  const category = categories.find((c) => c.slug === slug) ?? categories[0];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = (k: string) => String(data.get(k) ?? "").trim();
    const resume = data.get("resume");
    await submit(category.slug, { name: text("name"), email: text("email"), phone: text("phone"), message: text("message") || undefined, subService: text("subService") || undefined, resume: resume instanceof File && resume.size > 0 ? resume : null, source: "hosted-enquiry-form" });
  }

  if (!category) return <p className="text-sm text-muted-foreground">Enquiries are not set up yet.</p>;
  if (status === "success") return <Sent message="Thank you. We have your enquiry." again={reset} />;
  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {categories.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor="f-category">About</Label>
          <select id="f-category" value={slug} onChange={(e) => setSlug(e.target.value)} className={SELECT}>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {category.subServices.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="f-service">Service</Label>
          <select key={category.slug} id="f-service" name="subService" className={SELECT} defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            {category.subServices.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
          {fieldErrors.subService && <p className="text-xs text-destructive">{fieldErrors.subService}</p>}
        </div>
      )}
      <Field name="name" label="Full name" error={fieldErrors.name} required />
      <Field name="email" label="Email" type="email" error={fieldErrors.email} required />
      <Field name="phone" label="Phone" type="tel" error={fieldErrors.phone} required />
      <Field name="message" label="Your message (optional)" multiline error={fieldErrors.message} />
      {category.acceptsResume && <Field name="resume" label="Attach a file (PDF or Word, optional)" type="file" accept=".pdf,.doc,.docx" error={fieldErrors.resume} />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={status === "submitting"} className="w-full">
        {status === "submitting" ? <Loader2 className="size-4 animate-spin" /> : "Send"}
      </Button>
    </form>
  );
}
