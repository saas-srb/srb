"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import type { ContactFormField, BrochureTheme } from "@/lib/products/viralpulse-ai/brochure/types";
import { toast } from "sonner";

interface BrochureContactFormProps {
  brochureId: string;
  brochureTitle: string;
  fields: ContactFormField[];
  theme: BrochureTheme;
  isEditorPreview?: boolean;
}

export default function BrochureContactForm({
  brochureId,
  brochureTitle,
  fields,
  theme,
  isEditorPreview = false,
}: BrochureContactFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isEditorPreview) {
      toast.info("This is an editor preview. Leads are submitted on the live published brochure.");
      return;
    }

    // Validate required fields
    for (const f of fields) {
      if (f.required && !formData[f.key]?.trim()) {
        toast.error(`Please fill in ${f.label}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/viralpulse-ai/brochure/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brochureId,
          brochureTitle,
          fields: formData,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to submit inquiry.");
      }

      setSubmitted(true);
      toast.success("Inquiry sent successfully!");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-8 text-center text-emerald-950 dark:text-emerald-100">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <h4 className="mt-4 text-base font-bold">Thank You for Your Inquiry</h4>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Your details have been received. Our team will review your requirements and reach out promptly.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSubmitted(false);
            setFormData({});
          }}
          className="mt-5"
        >
          Send Another Message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => {
          const isTextarea = field.type === "textarea";
          return (
            <div key={field.key} className={isTextarea ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
              <Label htmlFor={`field-${field.key}`} className="text-xs font-medium">
                {field.label} {field.required && <span className="text-rose-500">*</span>}
              </Label>
              {isTextarea ? (
                <Textarea
                  id={`field-${field.key}`}
                  rows={3}
                  value={formData[field.key] || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  required={field.required}
                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                  className="resize-none text-xs"
                />
              ) : (
                <Input
                  id={`field-${field.key}`}
                  type={field.type === "phone" ? "tel" : field.type}
                  value={formData[field.key] || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  required={field.required}
                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                  className="text-xs"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          disabled={submitting}
          style={{
            backgroundColor: theme.primaryColor,
            color: "#ffffff",
          }}
          className="w-full gap-2 text-xs font-semibold hover:opacity-90"
        >
          {submitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="size-3.5" />
              Submit Inquiry
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
