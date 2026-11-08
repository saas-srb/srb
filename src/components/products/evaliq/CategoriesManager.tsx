"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteCategoryAction, saveCategoryAction } from "@/app/(products)/evaliq/(protected)/actions";

export default function CategoriesManager({ kind, rows }: { kind: "test" | "question"; rows: { id: string; name: string; description: string; usage: number }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [pending, start] = useTransition();

  function save(id: string | null) {
    start(async () => {
      const res = await saveCategoryAction(kind, id, draft);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(id ? "Category saved" : "Category added");
        setEditing(null);
        setDraft({ name: "", description: "" });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/50 p-3">
        <Input value={editing === null ? draft.name : ""} disabled={editing !== null} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="New category name" className="w-56" aria-label="Category name" />
        <Input value={editing === null ? draft.description : ""} disabled={editing !== null} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description (optional)" className="min-w-56 flex-1" aria-label="Category description" />
        <Button type="button" onClick={() => save(null)} disabled={pending || editing !== null || !draft.name.trim()}>
          {pending && editing === null ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
        </Button>
      </div>
      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No categories yet.</p>}
      <ul className="divide-y divide-border/40">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
            {editing === r.id ? (
              <>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="w-56" aria-label="Category name" />
                <Input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className="min-w-56 flex-1" aria-label="Category description" />
                <Button type="button" size="icon-sm" onClick={() => save(r.id)} disabled={pending} aria-label="Save">
                  <Check className="size-3.5" />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => { setEditing(null); setDraft({ name: "", description: "" }); }} aria-label="Cancel">
                  <X className="size-3.5" />
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.name}</p>
                  {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{`${r.usage} ${kind === "test" ? "test" : "question"}${r.usage === 1 ? "" : "s"}`}</span>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => { setEditing(r.id); setDraft({ name: r.name, description: r.description }); }}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${r.name}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteCategoryAction(r.id);
                      if (!res.ok) toast.error(res.error);
                      else {
                        toast.success("Category deleted");
                        router.refresh();
                      }
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
