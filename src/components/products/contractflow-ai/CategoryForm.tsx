"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { createCategoryAction, updateCategoryAction } from "@/app/(products)/contractflow-ai/(protected)/actions";

interface CategoryFormProps {
  category?: any;
}

export default function CategoryForm({ category }: CategoryFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "🏷️");
  const [color, setColor] = useState(category?.color ?? "#10b981");

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
        icon: icon.trim() || "🏷️",
        color,
      };

      let res;
      if (category && category.id) {
        res = await updateCategoryAction(category.id, payload);
      } else {
        res = await createCategoryAction(payload);
      }

      if (res.ok) {
        router.push("/contractflow-ai/categories");
        router.refresh();
      } else {
        setError(res.error || "Failed to save category.");
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
          <CardTitle className="text-sm font-bold">Category Information</CardTitle>
          <CardDescription className="text-xs">
            Define the name, description, color tag and icon for this category.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Category Name *
              </label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!category && !slug) {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                  }
                }}
                required
                placeholder="e.g. Corporate Governance"
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
                placeholder="e.g. corporate-governance"
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
              placeholder="Summary of policies or documents belonging to this category..."
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
                placeholder="🏷️"
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Color Tag
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

      <div className="flex justify-end gap-2">
        <Link href="/contractflow-ai/categories" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className={buttonVariants({ size: "sm" })}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : category ? (
            "Save Category"
          ) : (
            "Create Category"
          )}
        </button>
      </div>
    </form>
  );
}
