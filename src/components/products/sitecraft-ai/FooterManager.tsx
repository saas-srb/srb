"use client";

import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { useState, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { Plus, ChevronUp, ChevronDown, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel, PanelContent, PanelBody, PanelHeader, PanelTitle, PanelFooter } from "@/components/products/sitecraft-ai/ui/SidePanel";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { moveOrderKey } from "@/lib/products/sitecraft-ai/order";
import type { CmsFooterColumnDoc, CmsFooterLinkDoc } from "@/lib/products/sitecraft-ai/footer";
import {
  createFooterColumnAction, deleteFooterColumnAction,
  createFooterLinkAction, updateFooterLinkAction, deleteFooterLinkAction,
} from "@/app/(products)/sitecraft-ai/(protected)/footer/actions";

export default function FooterManager({
  initialColumns,
  initialLinks,
  canEdit,
}: {
  initialColumns: CmsFooterColumnDoc[];
  initialLinks: CmsFooterLinkDoc[];
  canEdit: boolean;
}) {
  const confirm = useConfirm();
  const [columns, setColumns] = useState(initialColumns);
  const [links, setLinks] = useState(initialLinks);
  const [, startTransition] = useTransition();
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [linkDialog, setLinkDialog] = useState<{ columnId: string; link: CmsFooterLinkDoc | null } | null>(null);

  const sortedColumns = useMemo(() => [...columns].sort((a, b) => a.orderKey - b.orderKey), [columns]);
  const linksOf = (id: string) => links.filter((l) => l.columnId === id).sort((a, b) => a.orderKey - b.orderKey);

  const addColumn = () => {
    if (!newColumnTitle.trim()) return;
    startTransition(async () => {
      const res = await createFooterColumnAction({ title: newColumnTitle.trim() });
      if (!res.ok) { toast.error(res.error); return; }
      setColumns((c) => [...c, { _id: res.id, title: newColumnTitle.trim(), orderKey: Date.now(), viewAllHref: null, viewAllLabel: null, createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null }]);
      setNewColumnTitle("");
    });
  };

  const removeColumn = async (col: CmsFooterColumnDoc) => {
    if (!(await confirm({ title: `Delete the “${col.title}” column?`, description: "The column and all its links are removed from the website footer.", confirmLabel: "Delete column", destructive: true }))) return;
    setColumns((c) => c.filter((x) => x._id !== col._id));
    setLinks((l) => l.filter((x) => x.columnId !== col._id));
    startTransition(async () => {
      const res = await deleteFooterColumnAction(col._id, col.title);
      if (!res.ok) toast.error(res.error);
    });
  };

  const moveLink = (columnId: string, link: CmsFooterLinkDoc, dir: "up" | "down") => {
    const list = linksOf(columnId);
    const index = list.findIndex((l) => l._id === link._id);
    const orderKey = moveOrderKey(list, index, dir);
    if (orderKey == null) return;
    setLinks((prev) => prev.map((l) => (l._id === link._id ? { ...l, orderKey } : l)));
    startTransition(async () => {
      const res = await updateFooterLinkAction(link._id, { orderKey });
      if (!res.ok) toast.error(res.error);
    });
  };

  const removeLink = async (link: CmsFooterLinkDoc) => {
    if (!(await confirm({ title: `Delete the “${link.label}” link?`, description: "It's removed from the website footer straight away.", confirmLabel: "Delete link", destructive: true }))) return;
    setLinks((prev) => prev.filter((l) => l._id !== link._id));
    startTransition(async () => {
      const res = await deleteFooterLinkAction(link._id);
      if (!res.ok) toast.error(res.error);
    });
  };

  const onLinkSaved = (link: CmsFooterLinkDoc, isNew: boolean) => {
    setLinks((prev) => (isNew ? [...prev, link] : prev.map((l) => (l._id === link._id ? link : l))));
    setLinkDialog(null);
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex items-center gap-2">
          <Input placeholder="New column title" value={newColumnTitle} onChange={(e) => setNewColumnTitle(e.target.value)} className="max-w-xs" />
          <Button variant="outline" size="sm" onClick={addColumn} disabled={!newColumnTitle.trim()}>
            <Plus className="size-3.5" /> Add column
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {sortedColumns.map((col) => (
          <GlassCard key={col._id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-foreground">{col.title}</span>
              {canEdit && (
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeColumn(col)}>
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              )}
            </div>
            <div className="mt-3 space-y-1.5 border-l border-border/60 pl-4">
              {linksOf(col._id).map((link, j, arr) => (
                <div key={link._id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={link.emphasized ? "font-semibold text-primary" : "text-muted-foreground"}>{link.label}</span>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => moveLink(col._id, link, "up")} disabled={j === 0}>
                        <ChevronUp className="size-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => moveLink(col._id, link, "down")} disabled={j === arr.length - 1}>
                        <ChevronDown className="size-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => setLinkDialog({ columnId: col._id, link })}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeLink(link)}>
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => setLinkDialog({ columnId: col._id, link: null })}>
                  <Plus className="size-3.5" /> Add link
                </Button>
              )}
            </div>
          </GlassCard>
        ))}
        {sortedColumns.length === 0 && <GlassCard className="p-8 text-center text-sm text-muted-foreground">No CMS footer configured — the default footer is live.</GlassCard>}
      </div>

      {linkDialog && <FooterLinkDialog columnId={linkDialog.columnId} link={linkDialog.link} onClose={() => setLinkDialog(null)} onSaved={onLinkSaved} />}
    </div>
  );
}

function FooterLinkDialog({
  columnId,
  link,
  onClose,
  onSaved,
}: {
  columnId: string;
  link: CmsFooterLinkDoc | null;
  onClose: () => void;
  onSaved: (link: CmsFooterLinkDoc, isNew: boolean) => void;
}) {
  const [label, setLabel] = useState(link?.label ?? "");
  const [href, setHref] = useState(link?.href ?? "");
  const [emphasized, setEmphasized] = useState(link?.emphasized ?? false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      if (link) {
        const res = await updateFooterLinkAction(link._id, { label, href, emphasized });
        if (!res.ok) { toast.error(res.error); return; }
        onSaved({ ...link, label, href, emphasized }, false);
      } else {
        const res = await createFooterLinkAction({ columnId, label, href, emphasized });
        if (!res.ok) { toast.error(res.error); return; }
        onSaved({ _id: res.id, columnId, label, href, emphasized, orderKey: Date.now(), createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null }, true);
      }
    });
  };

  return (
    <Panel open onOpenChange={(o) => !o && onClose()}>
      <PanelContent>
        <PanelHeader>
          <PanelTitle>{link ? "Edit link" : "Add link"}</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <div className="space-y-1.5">
            <Label htmlFor="footer-link-label">Label</Label>
            <Input id="footer-link-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="footer-link-href">Link</Label>
            <Input id="footer-link-href" value={href} onChange={(e) => setHref(e.target.value)} placeholder="/services" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="footer-link-emphasized">Emphasized (highlighted style)</Label>
            <Checkbox id="footer-link-emphasized" checked={emphasized} onCheckedChange={(v) => setEmphasized(v === true)} />
          </div>
        </PanelBody>
        <PanelFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !label.trim() || !href.trim()}>
            Save
          </Button>
        </PanelFooter>
      </PanelContent>
    </Panel>
  );
}
