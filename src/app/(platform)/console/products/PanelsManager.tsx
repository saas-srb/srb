"use client";

import { Fragment, useState, useTransition } from "react";
import { Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deletePanelAction, savePanelAction, seedPanelsAction, setPanelActiveAction } from "./actions";
import type { PanelRecord } from "@/lib/platform/panels/types";
import { cn } from "@/lib/utils";
import ProductLogo from "@/components/products/ProductLogo";

const ICONS = ["dashboard", "users", "projects", "cart", "training", "finance", "book", "search", "vault", "bot", "megaphone", "test", "chat", "grid", "website", "shield", "chart", "globe", "building", "card", "receipt", "gauge", "palette", "bank", "plug", "zap", "upload", "history", "lock", "bell", "key", "file", "platform", "help"];
const INPUT = "w-full rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const L = ({ children }: { children: React.ReactNode }) => <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;

const BLANK: PanelRecord = { key: "", aliases: [], name: "", shortName: "", description: "", headerTitle: "", headerDescription: "", icon: "grid", route: "", order: 200, core: false, active: true };

function productListingName(name: string): string {
  return name.replace(/^SelfRun\s+/i, "");
}

function Editor({ initial, mode, onClose }: { initial: PanelRecord; mode: "create" | "update"; onClose: () => void }) {
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof PanelRecord>(k: K, v: PanelRecord[K]) => setP((s) => ({ ...s, [k]: v }));
  return (
    <form
      className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await savePanelAction(mode, { ...p, route: p.route || `/${p.key}` });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? "Saved");
          onClose();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div><L>Key (URL segment)</L><input value={p.key} onChange={(e) => set("key", e.target.value.toLowerCase())} disabled={mode === "update"} className={INPUT} placeholder="e.g. hrms" required /></div>
        <div><L>Name (used everywhere)</L><input value={p.name} onChange={(e) => set("name", e.target.value)} className={INPUT} required maxLength={60} /></div>
        <div><L>Short name</L><input value={p.shortName} onChange={(e) => set("shortName", e.target.value)} className={INPUT} maxLength={30} /></div>
      </div>
      <div><L>Description (used everywhere)</L><input value={p.description} onChange={(e) => set("description", e.target.value)} className={INPUT} required maxLength={200} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><L>Header title (optional — blank uses the name)</L><input value={p.headerTitle} onChange={(e) => set("headerTitle", e.target.value)} className={INPUT} maxLength={60} /></div>
        <div><L>Header description (optional — blank uses the description)</L><input value={p.headerDescription} onChange={(e) => set("headerDescription", e.target.value)} className={INPUT} maxLength={200} /></div>
      </div>
      <div><L>Other names to replace (comma separated — old wording such as “TalentOS” is shown as this product's current name wherever it still appears in product screens)</L><input value={p.aliases.join(", ")} onChange={(e) => set("aliases", e.target.value.split(",").map((a) => a.trim()).filter(Boolean))} className={INPUT} placeholder="e.g. TalentOS, Human Resource Management System" /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><L>Route</L><input value={p.route} onChange={(e) => set("route", e.target.value)} placeholder={`/${p.key || "key"}`} className={INPUT} /></div>
        <div><L>Icon</L><select value={p.icon} onChange={(e) => set("icon", e.target.value as PanelRecord["icon"])} className={INPUT}>{ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
        <div><L>Order</L><input type="number" value={p.order} onChange={(e) => set("order", Number(e.target.value))} className={INPUT} /></div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="size-3.5 animate-spin" />} {mode === "create" ? "Add product" : "Save changes"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

export default function PanelsManager({ panels, disabledFor, canManage }: { panels: PanelRecord[]; disabledFor: Record<string, number>; canManage: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message ?? "Done");
      else toast.error(res.error ?? "Something went wrong");
    });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add product</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => seedPanelsAction(false))}>Add missing defaults</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => confirm("Restore every default product to its original name, description, order and on/off state? Custom products are kept.") && run(() => seedPanelsAction(true))}><RotateCcw className="size-3.5" /> Restore defaults</Button>
        </div>
      )}
      {editing === "new" && <Editor initial={BLANK} mode="create" onClose={() => setEditing(null)} />}

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
        <div className="hidden grid-cols-[1.4fr_2fr_auto_auto] gap-3 border-b border-border/50 bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase md:grid">
          <span>Product</span><span>Description</span><span>Companies off</span><span className="text-right">Status</span>
        </div>
        {panels.map((p) => (
          <Fragment key={p.key}>
            <div className={cn("grid items-center gap-3 border-b border-border/40 px-4 py-3 last:border-0 md:grid-cols-[1.4fr_2fr_auto_auto]", !p.active && "opacity-70")}>
              <div className="flex min-w-0 items-center gap-3">
                <ProductLogo productKey={p.key} size={32} title={productListingName(p.name)} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{productListingName(p.name)} {p.core && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Core</span>}</p>
                  <p className="truncate text-xs text-muted-foreground"><code>{p.route}</code> · order {p.order}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <p className="text-xs text-muted-foreground md:w-24 md:text-center">{disabledFor[p.key] ? `${disabledFor[p.key]} compan${disabledFor[p.key] === 1 ? "y" : "ies"}` : "—"}</p>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.active}
                  aria-label={`${productListingName(p.name)} active for every company`}
                  disabled={!canManage || pending || p.core}
                  onClick={() => run(() => setPanelActiveAction(p.key, !p.active))}
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", p.active ? "bg-primary" : "bg-muted-foreground/30")}
                >
                  <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", p.active && "translate-x-5")} />
                </button>
                {canManage && <button type="button" onClick={() => setEditing(editing === p.key ? null : p.key)} aria-label={`Edit ${productListingName(p.name)}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-4" /></button>}
                {canManage && !p.core && <button type="button" onClick={() => confirm(`Delete “${p.name}”? It disappears from every listing (its code stays; add it back any time).`) && run(() => deletePanelAction(p.key))} aria-label={`Delete ${p.name}`} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>}
              </div>
            </div>
            {editing === p.key && <div className="border-b border-border/40 p-3"><Editor initial={p} mode="update" onClose={() => setEditing(null)} /></div>}
          </Fragment>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">The switch turns a product on or off for <strong>every</strong> company. To switch a product off for one company only, open that company under Companies → Products.</p>
    </div>
  );
}
