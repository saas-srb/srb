"use client";

import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { useState, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { Plus, ChevronUp, ChevronDown, Trash2, Pencil, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Panel, PanelContent, PanelBody, PanelHeader, PanelTitle, PanelDescription, PanelFooter } from "@/components/products/sitecraft-ai/ui/SidePanel";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CMS_ICON_KEYS } from "@/lib/products/sitecraft-ai/icon-map";
import { moveOrderKey } from "@/lib/products/sitecraft-ai/order";
import type { CmsNavItemDoc } from "@/lib/products/sitecraft-ai/nav";
import { createNavItemAction, updateNavItemAction, reorderNavItemAction, deleteNavItemAction } from "@/app/(products)/sitecraft-ai/(protected)/navigation/actions";

type Draft = {
  label: string;
  href: string;
  description: string;
  iconKey: string;
  group: string;
  featuredTitle: string;
  featuredDescription: string;
  featuredImage: string;
  featuredHref: string;
};
const emptyDraft: Draft = { label: "", href: "", description: "", iconKey: "Sparkles", group: "", featuredTitle: "", featuredDescription: "", featuredImage: "", featuredHref: "" };

export default function NavigationManager({ initialItems, canEdit }: { initialItems: CmsNavItemDoc[]; canEdit: boolean }) {
  const confirm = useConfirm();
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ parentId: string | null; item: CmsNavItemDoc | null } | null>(null);

  const tops = useMemo(() => items.filter((i) => !i.parentId).sort((a, b) => a.orderKey - b.orderKey), [items]);
  const childrenOf = (id: string) => items.filter((i) => i.parentId === id).sort((a, b) => a.orderKey - b.orderKey);

  function move(list: CmsNavItemDoc[], item: CmsNavItemDoc, dir: "up" | "down") {
    const index = list.findIndex((i) => i._id === item._id);
    const orderKey = moveOrderKey(list, index, dir);
    if (orderKey == null) return;
    setItems((prev) => prev.map((i) => (i._id === item._id ? { ...i, orderKey } : i)));
    startTransition(async () => {
      const res = await reorderNavItemAction(item._id, orderKey);
      if (!res.ok) toast.error(res.error);
    });
  }

  async function remove(item: CmsNavItemDoc) {
    const hasChildren = items.some((i) => i.parentId === item._id);
    if (!(await confirm({ title: `Delete “${item.label}”?`, description: hasChildren ? "This menu and every item inside it are removed from the website header." : "It's removed from the website header straight away.", confirmLabel: "Delete", destructive: true }))) return;
    setItems((prev) => prev.filter((i) => i._id !== item._id && i.parentId !== item._id));
    startTransition(async () => {
      const res = await deleteNavItemAction(item._id, item.label);
      if (!res.ok) toast.error(res.error);
    });
  }

  function onSaved(doc: CmsNavItemDoc, isNew: boolean) {
    setItems((prev) => (isNew ? [...prev, doc] : prev.map((i) => (i._id === doc._id ? doc : i))));
    setDialog(null);
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button variant="outline" size="sm" onClick={() => setDialog({ parentId: null, item: null })}>
          <Plus className="size-3.5" /> Add menu column
        </Button>
      )}
      <div className="space-y-3">
        {tops.map((top, i) => (
          <GlassCard key={top._id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-foreground">{top.label}</span>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(tops, top, "up")} disabled={i === 0}>
                    <ChevronUp className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(tops, top, "down")} disabled={i === tops.length - 1}>
                    <ChevronDown className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => setDialog({ parentId: null, item: top })}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(top)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
            <div className="mt-3 space-y-1.5 border-l border-border/60 pl-4">
              {childrenOf(top._id).map((child, j, arr) => (
                <div key={child._id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ChevronRight className="size-3" /> {child.label}
                  </span>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(arr, child, "up")} disabled={j === 0}>
                        <ChevronUp className="size-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(arr, child, "down")} disabled={j === arr.length - 1}>
                        <ChevronDown className="size-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => setDialog({ parentId: top._id, item: child })}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(child)}>
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => setDialog({ parentId: top._id, item: null })}>
                  <Plus className="size-3.5" /> Add item
                </Button>
              )}
            </div>
          </GlassCard>
        ))}
        {tops.length === 0 && <GlassCard className="p-8 text-center text-sm text-muted-foreground">No CMS navigation configured — the default menu is live.</GlassCard>}
      </div>

      {dialog && <NavItemDialog parentId={dialog.parentId} item={dialog.item} onClose={() => setDialog(null)} onSaved={onSaved} />}
    </div>
  );
}

function NavItemDialog({
  parentId,
  item,
  onClose,
  onSaved,
}: {
  parentId: string | null;
  item: CmsNavItemDoc | null;
  onClose: () => void;
  onSaved: (doc: CmsNavItemDoc, isNew: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    item
      ? { label: item.label, href: item.href, description: item.description ?? "", iconKey: item.iconKey, group: item.group ?? "", featuredTitle: item.featuredTitle ?? "", featuredDescription: item.featuredDescription ?? "", featuredImage: item.featuredImage ?? "", featuredHref: item.featuredHref ?? "" }
      : emptyDraft
  );
  const [pending, startTransition] = useTransition();
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = () => {
    startTransition(async () => {
      if (item) {
        const res = await updateNavItemAction(item._id, {
          label: draft.label,
          href: draft.href,
          description: draft.description || null,
          iconKey: draft.iconKey,
          group: parentId === null ? null : draft.group.trim() || null,
          featuredTitle: parentId === null ? draft.featuredTitle || null : null,
          featuredDescription: parentId === null ? draft.featuredDescription || null : null,
          featuredImage: parentId === null ? draft.featuredImage || null : null,
          featuredHref: parentId === null ? draft.featuredHref || null : null,
        });
        if (!res.ok) { toast.error(res.error); return; }
        onSaved({ ...item, label: draft.label, href: draft.href, description: draft.description || null, iconKey: draft.iconKey, group: parentId === null ? null : draft.group.trim() || null, featuredTitle: draft.featuredTitle || null, featuredDescription: draft.featuredDescription || null, featuredImage: draft.featuredImage || null, featuredHref: draft.featuredHref || null }, false);
      } else {
        const res = await createNavItemAction({ parentId, label: draft.label, href: draft.href, description: draft.description, iconKey: draft.iconKey, group: draft.group, featuredTitle: draft.featuredTitle, featuredDescription: draft.featuredDescription, featuredImage: draft.featuredImage, featuredHref: draft.featuredHref });
        if (!res.ok) { toast.error(res.error); return; }
        onSaved(
          {
            _id: res.id,
            parentId,
            label: draft.label,
            href: draft.href,
            description: draft.description || null,
            iconKey: draft.iconKey,
            group: parentId === null ? null : draft.group.trim() || null,
            featuredTitle: draft.featuredTitle || null,
            featuredDescription: draft.featuredDescription || null,
            featuredImage: draft.featuredImage || null,
            featuredHref: draft.featuredHref || null,
            orderKey: Date.now(),
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: null,
            updatedBy: null,
          },
          true
        );
      }
    });
  };

  return (
    <Panel open onOpenChange={(o) => !o && onClose()}>
      <PanelContent size="lg">
        <PanelHeader>
          <PanelTitle>{item ? "Edit" : parentId ? "Add item" : "Add menu column"}</PanelTitle>
          <PanelDescription>{parentId ? "Appears under its parent column." : "A top-level header menu item."}</PanelDescription>
        </PanelHeader>
        <PanelBody>
          <div className="space-y-1.5">
            <Label htmlFor="nav-label">Label</Label>
            <Input id="nav-label" value={draft.label} onChange={(e) => set("label", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nav-href">Link</Label>
            <Input id="nav-href" value={draft.href} onChange={(e) => set("href", e.target.value)} placeholder="/about" />
          </div>
          {parentId !== null && (
            <div className="space-y-1.5">
              <Label htmlFor="nav-description">Description (mega-menu row)</Label>
              <Textarea id="nav-description" value={draft.description} onChange={(e) => set("description", e.target.value)} rows={2} />
            </div>
          )}
          {parentId !== null && (
            <div className="space-y-1.5">
              <Label htmlFor="nav-group">Group heading (optional — a menu whose items have groups is shown in columns under these headings)</Label>
              <Input id="nav-group" value={draft.group} onChange={(e) => set("group", e.target.value)} placeholder="HR & Talent" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="nav-icon">Icon</Label>
            <Select value={draft.iconKey} onValueChange={(v) => set("iconKey", (v as string) ?? "Sparkles")}>
              <SelectTrigger id="nav-icon" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {CMS_ICON_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {parentId === null && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="nav-featured-title">Featured card title (desktop mega-menu, optional)</Label>
                <Input id="nav-featured-title" value={draft.featuredTitle} onChange={(e) => set("featuredTitle", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nav-featured-description">Featured card description</Label>
                <Textarea id="nav-featured-description" value={draft.featuredDescription} onChange={(e) => set("featuredDescription", e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nav-featured-image">Featured card image URL</Label>
                <Input id="nav-featured-image" type="url" value={draft.featuredImage} onChange={(e) => set("featuredImage", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nav-featured-href">Featured card link (optional — defaults to the menu link)</Label>
                <Input id="nav-featured-href" value={draft.featuredHref} onChange={(e) => set("featuredHref", e.target.value)} placeholder="/services/our-saas-product" />
              </div>
            </>
          )}
        </PanelBody>
        <PanelFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !draft.label.trim() || !draft.href.trim()}>
            Save
          </Button>
        </PanelFooter>
      </PanelContent>
    </Panel>
  );
}
