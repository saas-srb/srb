"use client";

import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import ConfirmDelete from "@/components/products/playbook-ai/ConfirmDelete";
import { deleteCategoryAction, saveCategoryAction } from "@/app/(products)/playbook-ai/(protected)/actions";

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  description: string;
  active: boolean;
  count: number;
}

export default function CategoriesManager({ rows, canManage }: { rows: CategoryRow[]; canManage: boolean }) {
  return (
    <div className="space-y-4">
      {canManage && (
        <EditDialog
          trigger={<Button type="button" size="sm"><Plus className="size-3.5" data-icon="inline-start" />Add category</Button>}
          title="Add a category"
          fields={[{ key: "name", label: "Name", type: "text", maxLength: 80 }, { key: "color", label: "Colour", type: "color" }, { key: "description", label: "Description", type: "textarea" }]}
          initial={{ name: "", color: "#3b82f6", description: "" }}
          onSubmit={(v) => saveCategoryAction({ name: String(v.name), color: String(v.color), description: String(v.description) })}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((c) => (
          <div key={c.id} className="lms-surface flex gap-3 rounded-2xl border border-border/40 bg-background/95 p-4 dark:bg-card/85">
            <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: c.color }} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                <Link href={`/playbook-ai/library?category=${c.id}`} className="truncate hover:text-primary hover:underline">{c.name}</Link>
                {!c.active && <Badge className="bg-muted text-muted-foreground">Inactive</Badge>}
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{c.description || "No description."}</p>
              <p className="mt-1 text-xs font-medium text-primary">{c.count} SOP{c.count === 1 ? "" : "s"}</p>
            </div>
            {canManage && (
              <span className="flex shrink-0 items-start gap-0.5">
                <EditDialog
                  trigger={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${c.name}`}><Pencil /></Button>}
                  title={`Edit ${c.name}`}
                  fields={[{ key: "name", label: "Name", type: "text", maxLength: 80 }, { key: "color", label: "Colour", type: "color" }, { key: "description", label: "Description", type: "textarea" }, { key: "active", label: "Active", type: "checkbox" }]}
                  initial={{ name: c.name, color: c.color, description: c.description, active: c.active }}
                  onSubmit={(v) => saveCategoryAction({ id: c.id, name: String(v.name), color: String(v.color), description: String(v.description), active: !!v.active })}
                />
                <ConfirmDelete label={`Delete ${c.name}`} what={`the ${c.name} category`} action={() => deleteCategoryAction(c.id)} />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
