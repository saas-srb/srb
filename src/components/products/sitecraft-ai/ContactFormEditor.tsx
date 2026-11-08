"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { CmsFormFieldConfig } from "@/lib/products/sitecraft-ai/forms";
import { saveContactFormFieldsAction } from "@/app/(products)/sitecraft-ai/(protected)/forms/actions";

export default function ContactFormEditor({ initialFields, canEdit }: { initialFields: CmsFormFieldConfig[]; canEdit: boolean }) {
  const [fields, setFields] = useState(initialFields);
  const [pending, startTransition] = useTransition();

  const update = (name: string, patch: Partial<CmsFormFieldConfig>) => setFields((prev) => prev.map((f) => (f.name === name ? { ...f, ...patch } : f)));

  const save = () => {
    startTransition(async () => {
      const res = await saveContactFormFieldsAction(fields);
      if (!res.ok) toast.error(res.error);
      else toast.success("Saved");
    });
  };

  return (
    <div className="space-y-4">
      {[...fields].sort((a, b) => a.orderKey - b.orderKey).map((f) => (
        <GlassCard key={f.name} className="space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.name}</p>
          <div className="space-y-1.5">
            <Label htmlFor={`form-${f.name}-label`}>Label</Label>
            <Input id={`form-${f.name}-label`} value={f.label} onChange={(e) => update(f.name, { label: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`form-${f.name}-placeholder`}>Placeholder</Label>
            <Input id={`form-${f.name}-placeholder`} value={f.placeholder} onChange={(e) => update(f.name, { placeholder: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`form-${f.name}-help`}>Help text (optional)</Label>
            <Input id={`form-${f.name}-help`} value={f.helpText} onChange={(e) => update(f.name, { helpText: e.target.value })} disabled={!canEdit} />
          </div>
          {f.name === "message" && (
            <div className="flex items-center justify-between">
              <Label htmlFor={`form-${f.name}-required`}>Required</Label>
              <Checkbox id={`form-${f.name}-required`} checked={f.required} onCheckedChange={(v) => update(f.name, { required: v === true })} disabled={!canEdit} />
            </div>
          )}
        </GlassCard>
      ))}
      {canEdit && (
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
        </Button>
      )}
    </div>
  );
}
