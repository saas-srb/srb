"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { createMakerTypeAction, updateMakerTypeAction } from "@/app/(products)/contractflow-ai/(protected)/actions";
import type { FieldDef as MakerTypeField } from "@/lib/products/contractflow-ai/types";

interface MakerTypeFormProps {
  maker?: any;
}

export default function MakerTypeForm({ maker }: MakerTypeFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(maker?.name ?? "");
  const [slug, setSlug] = useState(maker?.slug ?? "");
  const [description, setDescription] = useState(maker?.description ?? "");
  const [icon, setIcon] = useState(maker?.icon ?? "📄");
  const [color, setColor] = useState(maker?.color ?? "#6366f1");
  const [fields, setFields] = useState<MakerTypeField[]>(
    maker?.fieldsSchema ?? [
      { key: "party_name", label: "Party Name", type: "text", required: true },
      { key: "effective_date", label: "Effective Date", type: "date", required: true },
    ]
  );

  const handleAddField = () => {
    setFields([
      ...fields,
      { key: `field_${Date.now()}`, label: "New Field", type: "text", required: false },
    ]);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, key: keyof MakerTypeField, value: any) => {
    const next = [...fields];
    next[index] = { ...next[index], [key]: value };
    setFields(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required.");
      return;
    }

    startTransition(async () => {
      const payload = {
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim(),
        icon: icon.trim() || "📄",
        color,
        fieldsSchema: fields,
      };

      let res;
      if (maker && maker.id) {
        res = await updateMakerTypeAction(maker.id, payload);
      } else {
        res = await createMakerTypeAction(payload);
      }

      if (res.ok) {
        router.push("/contractflow-ai/makers");
        router.refresh();
      } else {
        setError(res.error || "Failed to save maker type.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          {error}
        </div>
      )}

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Basic Information</CardTitle>
          <CardDescription className="text-xs">
            Define the name, description and icon for this document type.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Name *
              </label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!maker && !slug) {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                  }
                }}
                required
                placeholder="e.g. Non-Disclosure Agreement"
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Slug *
              </label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                placeholder="e.g. nda, offer-letter"
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief summary of when this document type is used..."
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Icon (Emoji)
              </label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="📄"
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Color Accent
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-border/60 bg-background p-1"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </GlassCard>

      {/* Dynamic Fields Schema Builder */}
      <GlassCard interactive={false}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-bold">Fields Schema</CardTitle>
            <CardDescription className="text-xs">
              Custom fields users fill when generating documents of this type.
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={handleAddField}
            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Plus className="size-3" />
            Add Field
          </button>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No fields configured yet. Click "Add Field" to add one.
            </p>
          ) : (
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-muted/20 p-3 text-xs"
                >
                  <div className="min-w-32 flex-1">
                    <label className="mb-1 block font-medium text-muted-foreground">Key</label>
                    <input
                      value={field.key}
                      onChange={(e) => handleFieldChange(idx, "key", e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div className="min-w-36 flex-1">
                    <label className="mb-1 block font-medium text-muted-foreground">Label</label>
                    <input
                      value={field.label}
                      onChange={(e) => handleFieldChange(idx, "label", e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block font-medium text-muted-foreground">Type</label>
                    <select
                      value={field.type}
                      onChange={(e) => handleFieldChange(idx, "type", e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="text">Text</option>
                      <option value="textarea">Textarea</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="select">Select</option>
                      <option value="boolean">Boolean</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1 pt-4">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => handleFieldChange(idx, "required", e.target.checked)}
                        className="rounded border-border"
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveField(idx)}
                      className="ml-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </GlassCard>

      {/* Form Action Controls */}
      <div className="flex justify-end gap-2">
        <Link href="/contractflow-ai/makers" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className={buttonVariants({ size: "sm" })}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : maker ? (
            "Save Changes"
          ) : (
            "Create Maker Type"
          )}
        </button>
      </div>
    </form>
  );
}
