"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY_KEYS, CATEGORY_LABELS, type CategoryKey } from "@/lib/products/playbook-ai/catalogue/types";
import { createTemplateAction } from "@/app/(products)/playbook-ai/(protected)/my-templates/actions";

/** Starts a template from scratch: a name and a category. The editor opens on a minimal valid template. */
export default function NewTemplateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategoryKey>("op");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 bg-card p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createTemplateAction(name, category);
          if (!r.ok) { setError(r.error.message); return; }
          router.push(`/playbook-ai/my-templates/${r.id}`);
        });
      }}
    >
      <label className="space-y-1"><span className="block text-xs text-muted-foreground">New template name</span><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="w-64" placeholder="Site visit note" /></label>
      <label className="space-y-1"><span className="block text-xs text-muted-foreground">Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)} className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm">{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}</select></label>
      <Button type="submit" disabled={pending || !name.trim()}>{pending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Plus className="mr-1.5 size-4" />}Create from scratch</Button>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
