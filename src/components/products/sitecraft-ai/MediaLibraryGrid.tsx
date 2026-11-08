"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2, Trash2, Copy, LayoutGrid, List, ImageOff, AlertTriangle, ExternalLink, UploadCloud, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { cn } from "@/lib/utils";
import { SearchInput, FilterChips } from "@/components/products/sitecraft-ai/ui/ListToolbar";
import EmptyState from "@/components/products/sitecraft-ai/ui/EmptyState";
import { Panel, PanelContent, PanelBody, PanelHeader, PanelTitle, PanelDescription, PanelFooter } from "@/components/products/sitecraft-ai/ui/SidePanel";
import { useCmsMediaUpload } from "@/lib/useCmsMediaUpload";
import { deleteCmsMediaAction, updateCmsMediaAction } from "@/app/(products)/sitecraft-ai/(protected)/media/actions";
import { timeAgo } from "@/lib/products/sitecraft-ai/site-areas";
import type { CmsMediaDoc } from "@/lib/products/sitecraft-ai/media";

type Filter = "all" | "no-alt" | "svg" | "raster";
const url = (id: string) => `/api/sitecraft-ai/media/${id}`;
const typeLabel = (ct: string) => (ct.split("/")[1] ?? ct).replace("svg+xml", "svg").replace("jpeg", "jpg").toUpperCase();
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * WordPress-style Media Library: drag-and-drop (multi-file) upload, search,
 * filters, grid/list views and an "Attachment details" product for editing a
 * file's title and alt text.
 */
export default function MediaLibraryGrid({ initialItems, canUpload, canDelete }: { initialItems: CmsMediaDoc[]; canUpload: boolean; canDelete: boolean }) {
  const confirm = useConfirm();
  const params = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(params.get("filter") === "no-alt" ? "no-alt" : "all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<CmsMediaDoc | null>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const { uploadFile, progress } = useCmsMediaUpload();
  const fileInput = useRef<HTMLInputElement>(null);

  const uploadAll = async (files: File[]) => {
    if (!files.length) return;
    setQueue({ done: 0, total: files.length });
    let ok = 0;
    for (const [i, file] of files.entries()) {
      const media = await uploadFile(file);
      if (media) {
        ok++;
        setItems((prev) => [media, ...prev]);
      }
      setQueue({ done: i + 1, total: files.length });
    }
    setQueue(null);
    if (ok) toast.success(ok === 1 ? "Uploaded" : `${ok} files uploaded`);
  };

  const remove = async (item: CmsMediaDoc) => {
    if (!(await confirm({ title: `Delete “${item.name}”?`, description: "Pages that still use this image will show it as broken.", confirmLabel: "Delete file", destructive: true }))) return;
    setItems((prev) => prev.filter((m) => m._id !== item._id));
    setSelected(null);
    const res = await deleteCmsMediaAction(item._id, item.name);
    if (!res.ok) toast.error(res.error);
  };

  const copyUrl = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}${url(id)}`);
    toast.success("URL copied");
  };

  const counts = {
    all: items.length,
    "no-alt": items.filter((m) => !m.altText?.trim()).length,
    svg: items.filter((m) => m.contentType === "image/svg+xml").length,
    raster: items.filter((m) => m.contentType !== "image/svg+xml").length,
  };
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((m) => (filter === "all" ? true : filter === "no-alt" ? !m.altText?.trim() : filter === "svg" ? m.contentType === "image/svg+xml" : m.contentType !== "image/svg+xml"))
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.altText?.toLowerCase().includes(q));
  }, [items, filter, query]);

  const busy = queue !== null;

  return (
    <div
      className="relative space-y-4"
      onDragOver={(e) => {
        if (!canUpload || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragging(false);
        void uploadAll([...e.dataTransfer.files]);
      }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All media", count: counts.all },
            { value: "no-alt", label: "Missing alt text", count: counts["no-alt"] },
            { value: "raster", label: "Photos", count: counts.raster },
            ...(counts.svg ? [{ value: "svg" as const, label: "SVG", count: counts.svg }] : []),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search by name or alt text…" />
          <PanelTabs label="View" active={view} onSelect={(k) => setView(k as typeof view)} tabs={[{ key: "grid", label: <span className="sr-only">Grid view</span>, icon: <LayoutGrid className="size-4" /> }, { key: "list", label: <span className="sr-only">List view</span>, icon: <List className="size-4" /> }]} />
          {canUpload && (
            <>
              <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(e) => { void uploadAll([...(e.target.files ?? [])]); e.target.value = ""; }} />
              <Button size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {busy ? `Uploading ${queue!.done + 1}/${queue!.total}${progress !== null ? ` · ${progress}%` : ""}` : "Add new media"}
              </Button>
            </>
          )}
        </div>
      </div>

      {canUpload && (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40 hover:bg-primary/[0.03]"
          )}
        >
          <UploadCloud className={cn("size-7", dragging ? "text-primary" : "text-muted-foreground")} />
          <span className="text-sm font-medium text-foreground">{dragging ? "Drop to upload" : "Drop files to upload, or click to choose"}</span>
          <span className="text-xs text-muted-foreground">JPG, PNG, WebP, GIF or SVG · up to 20 MB each · several at once</span>
        </button>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={ImageOff}
          title={items.length === 0 ? "No media uploaded yet" : "No media matches"}
          description={items.length === 0 ? "Upload images to use them in pages, posts and the site identity." : "Try another search or filter."}
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((m) => (
            <button key={m._id} type="button" onClick={() => setSelected(m)} className="group relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted/40 text-left transition-all hover:border-primary hover:ring-2 hover:ring-primary/30" aria-label={`${m.name} details`}>
              <Image src={url(m._id)} alt={m.altText || m.name} fill unoptimized className="object-cover transition-transform duration-300 group-hover:scale-105" />
              {!m.altText?.trim() && (
                <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white" title="Missing alt text">
                  <AlertTriangle className="size-3" /> Alt
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">{m.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <GlassCard interactive={false} className="gap-0 overflow-hidden p-0 py-0">
          <div className="hidden grid-cols-[56px_minmax(0,1fr)_90px_90px_110px_80px] gap-4 border-b border-border/60 bg-muted/30 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase md:grid">
            <span />
            <span>File</span>
            <span>Type</span>
            <span>Size</span>
            <span>Uploaded</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-border/50">
            {visible.map((m) => (
              <li key={m._id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5 hover:bg-primary/[0.03] md:grid-cols-[56px_minmax(0,1fr)_90px_90px_110px_80px]">
                <button type="button" onClick={() => setSelected(m)} className="relative size-14 overflow-hidden rounded-lg border border-border/60" aria-label={`${m.name} details`}>
                  <Image src={url(m._id)} alt={m.altText || m.name} fill unoptimized className="object-cover" />
                </button>
                <button type="button" onClick={() => setSelected(m)} className="min-w-0 text-left">
                  <span className="block truncate text-sm font-medium text-foreground hover:text-primary">{m.name}</span>
                  <span className={cn("block truncate text-xs", m.altText?.trim() ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")}>{m.altText?.trim() || "Missing alt text"}</span>
                </button>
                <span className="hidden text-xs text-muted-foreground md:block">{typeLabel(m.contentType)}</span>
                <span className="hidden text-xs text-muted-foreground md:block">{sizeLabel(m.size)}</span>
                <span className="hidden text-xs text-muted-foreground md:block" suppressHydrationWarning>{timeAgo(m.createdAt)}</span>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon-xs" onClick={() => copyUrl(m._id)} aria-label="Copy URL"><Copy className="size-3.5" /></Button>
                  {canDelete && <Button variant="ghost" size="icon-xs" onClick={() => remove(m)} aria-label="Delete"><Trash2 className="size-3.5 text-destructive" /></Button>}
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
      <p className="text-xs text-muted-foreground">Showing {visible.length} of {items.length} files</p>

      {selected && (
        <AttachmentDetails
          key={selected._id}
          item={selected}
          canEdit={canUpload}
          canDelete={canDelete}
          onClose={() => setSelected(null)}
          onCopy={() => copyUrl(selected._id)}
          onDelete={() => remove(selected)}
          onSaved={(patch) => {
            setItems((prev) => prev.map((m) => (m._id === selected._id ? { ...m, ...patch } : m)));
            setSelected((s) => (s ? { ...s, ...patch } : s));
          }}
        />
      )}
    </div>
  );
}

function AttachmentDetails({
  item, canEdit, canDelete, onClose, onCopy, onDelete, onSaved,
}: {
  item: CmsMediaDoc;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onSaved: (patch: { name: string; altText: string }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [altText, setAltText] = useState(item.altText ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = name !== item.name || altText !== (item.altText ?? "");

  const save = () =>
    startTransition(async () => {
      const res = await updateCmsMediaAction(item._id, { name: name.trim() || item.name, altText: altText.trim() });
      if (!res.ok) { toast.error(res.error); return; }
      onSaved({ name: name.trim() || item.name, altText: altText.trim() });
      toast.success("Attachment details saved");
    });

  return (
    <Panel open onOpenChange={(o) => !o && onClose()}>
      <PanelContent size="xl">
        <PanelHeader>
          <PanelTitle>Attachment details</PanelTitle>
          <PanelDescription className="truncate">{item.name}</PanelDescription>
        </PanelHeader>
        <PanelBody className="space-y-5">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-[conic-gradient(var(--muted)_25%,transparent_0_50%,var(--muted)_0_75%,transparent_0)] bg-[length:16px_16px]">
            <Image src={url(item._id)} alt={item.altText || item.name} fill unoptimized className="object-contain" />
          </div>
          <dl className="grid grid-cols-3 gap-3 rounded-xl border border-border/60 p-3 text-xs">
            <div><dt className="text-muted-foreground">Type</dt><dd className="font-medium text-foreground">{typeLabel(item.contentType)}</dd></div>
            <div><dt className="text-muted-foreground">Size</dt><dd className="font-medium text-foreground">{sizeLabel(item.size)}</dd></div>
            <div><dt className="text-muted-foreground">Uploaded</dt><dd className="font-medium text-foreground" suppressHydrationWarning>{new Date(item.createdAt).toLocaleDateString()}</dd></div>
          </dl>
          <div className="space-y-1.5">
            <Label htmlFor="media-alt">Alt text</Label>
            <Textarea id="media-alt" value={altText} onChange={(e) => setAltText(e.target.value)} rows={3} disabled={!canEdit} placeholder="Describe the image for screen readers and search engines" />
            <p className="text-[11px] text-muted-foreground">Describe what the image shows. Leave empty only for purely decorative images.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="media-name">Title</Label>
            <Input id="media-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="media-url">File URL</Label>
            <div className="flex gap-2">
              <Input id="media-url" readOnly value={url(item._id)} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" size="sm" onClick={onCopy}><Copy className="size-3.5" /> Copy</Button>
            </div>
            <a href={url(item._id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <ExternalLink className="size-3" /> Open original
            </a>
          </div>
        </PanelBody>
        <PanelFooter className="justify-between">
          <div>
            {canDelete && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" /> Delete permanently
              </Button>
            )}
          </div>
          {canEdit && (
            <Button size="sm" onClick={save} disabled={pending || !dirty}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
            </Button>
          )}
        </PanelFooter>
      </PanelContent>
    </Panel>
  );
}
