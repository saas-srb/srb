"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, Save, Trash2, Download, RefreshCw, Wand2, ImagePlus, X, FilePlus2, Megaphone, FolderInput, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { Field, MediaThumb, PlatformChip, formatBytes, mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import MediaPicker from "@/components/products/viralpulse-ai/MediaPicker";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { useMediaUpload } from "@/components/products/viralpulse-ai/useMediaUpload";
import { deleteMediaAction, generateLibraryImageAction, generateMediaPromptAction, mediaUsageAction, updateMediaMetaAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { bulkDeleteMediaAction, bulkFolderTagsAction, listAdsForPickerAction, attachMediaToAdAction, startPostFromMediaAction } from "@/app/(products)/viralpulse-ai/(protected)/image-studio/actions";
import { PLATFORMS, PLATFORM_META } from "@/lib/products/viralpulse-ai/constants";
import { specByKey } from "@/lib/products/viralpulse-ai/images/specs";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import { formatDateTime } from "@/lib/utils";

export interface LibraryItem extends MediaCard {
  description: string;
  tags: string[];
  platform: string | null;
  creativePrompt: string;
  script: string;
  caption: string;
  createdAt: string;
  versions: number;
  thumbnail: MediaCard | null;
  folder: string | null;
  fits: string[];
  studio: { specKey: string; badge: boolean; consentRecorded: boolean } | null;
  aiModel: string | null;
}

function UseInAd({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ads, setAds] = useState<{ id: string; name: string; platform: string }[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setOpen(true); listAdsForPickerAction().then((r) => setAds(r.ok ? r.ads : [])); }}><Megaphone className="size-3.5" /> Use in ad</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attach to an ad</DialogTitle><DialogDescription>Pick a draft image ad. The picture is added to it.</DialogDescription></DialogHeader>
          {ads === null ? <Loader2 className="size-4 animate-spin" /> : ads.length === 0 ? <p className="text-sm text-muted-foreground">No draft image ads yet. Create an ad in a campaign first.</p> : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {ads.map((a) => (
                <li key={a.id}><button type="button" disabled={pending} onClick={() => start(async () => { const r = await attachMediaToAdAction(mediaId, a.id); if (!r.ok) return void toast.error(r.error); toast.success("Attached."); router.push(r.href); })} className="flex w-full items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-left text-sm hover:border-primary/40"><span className="truncate">{a.name}</span><PlatformChip platform={a.platform} /></button></li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ item, canManage, canGenerate, canPost, canAds, onClose }: { item: LibraryItem; canManage: boolean; canGenerate: boolean; canPost: boolean; canAds: boolean; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: item.name, description: item.description, altText: item.altText, tags: item.tags.join(", "), platform: item.platform ?? "", folder: item.folder ?? "", creativePrompt: item.creativePrompt, script: item.script, caption: item.caption });
  const [thumb, setThumb] = useState<MediaCard | null>(item.thumbnail);
  const [usage, setUsage] = useState<{ ads: { _id: string; name: string; campaignId: string }[]; posts: { _id: string; title: string }[]; videos: { _id: string; name: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const [ai, startAi] = useTransition();
  const { uploadFile, progress } = useMediaUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const ctx = () => ({ name: f.name, kind: item.kind, description: f.description, caption: f.caption, creativePrompt: f.creativePrompt, platform: f.platform, altText: f.altText, tags: f.tags });

  useEffect(() => {
    let live = true;
    mediaUsageAction(item._id).then((r) => live && r.ok && setUsage(r.usage));
    return () => {
      live = false;
    };
  }, [item._id]);

  const inUse = usage ? usage.ads.length + usage.posts.length + usage.videos.length : 0;
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <div className="overflow-hidden rounded-xl border border-border/50 bg-muted">
        {item.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- private authenticated media
          <img src={mediaSrc(item._id, item.updatedAt)} alt={item.altText || item.name} className="max-h-80 w-full object-contain" />
        ) : (
          <video src={mediaSrc(item._id, item.updatedAt)} controls preload="metadata" poster={thumb ? mediaSrc(thumb._id) : undefined} className="max-h-80 w-full" />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{`${item.contentType} · ${formatBytes(item.size)}${item.width && item.height ? ` · ${item.width}×${item.height}` : ""}${item.durationSec ? ` · ${item.durationSec}s` : ""} · ${item.source === "ai" ? "AI generated" : "Uploaded"} ${formatDateTime(item.createdAt)}${item.versions ? ` · ${item.versions} earlier file version(s)` : ""}`}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" nativeButton={false} render={<a href={`${mediaSrc(item._id)}?download=1`} />}><Download className="size-3.5" /> Download</Button>
        {item.kind === "image" && canPost && <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await startPostFromMediaAction(item._id); if (!r.ok) return void toast.error(r.error); router.push(r.href); })}><FilePlus2 className="size-3.5" /> Use in post</Button>}
        {item.kind === "image" && canAds && <UseInAd mediaId={item._id} />}
        {canAds && <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/viralpulse-ai/campaigns/new?step=ads&media=${item._id}`} />}><Megaphone className="size-3.5" /> Use in a new campaign</Button>}
        {canManage && (
          <>
            <input ref={fileRef} type="file" hidden accept={item.kind === "video" ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp,image/gif"} onChange={async (e) => { const file = e.target.files?.[0]; if (file && (await uploadFile(file, { replaceId: item._id, accept: item.kind }))) { onClose(); router.refresh(); } }} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={progress !== null}>{progress !== null ? <><Loader2 className="size-3.5 animate-spin" />{`${progress}%`}</> : <><RefreshCw className="size-3.5" /> Replace file</>}</Button>
          </>
        )}
      </div>

      {(item.fits.length > 0 || item.studio || item.aiModel) && (
        <div className="space-y-1 rounded-xl border border-border/50 p-3 text-xs">
          {item.fits.length > 0 && <p><span className="font-semibold">Fits: </span>{item.fits.map((k) => specByKey(k)?.label ?? k).join(", ")}</p>}
          {item.aiModel && <p><span className="font-semibold">AI generated</span>{` with ${item.aiModel}.`}{item.studio ? (item.studio.badge ? " The picture shows an \"AI generated\" badge." : " No visible badge; the file's metadata marks it as AI generated.") : ""}{item.studio?.consentRecorded ? " Consent for reference photos was recorded." : ""}</p>}
        </div>
      )}

      <div className="grid gap-3">
        <AiField fieldKey="media.name" label="Name" id="md-name" value={f.name} disabled={!canManage} aiDisabled={!canGenerate} onChange={(v) => set("name", String(v))} getContext={ctx} />
        <AiField fieldKey="media.altText" label="Alt text" id="md-alt" value={f.altText} disabled={!canManage} aiDisabled={!canGenerate} onChange={(v) => set("altText", String(v))} getContext={ctx} placeholder="Describe it for screen readers" />
        <AiField fieldKey="media.description" label="Description" id="md-desc" as="textarea" rows={2} value={f.description} disabled={!canManage} aiDisabled={!canGenerate} onChange={(v) => set("description", String(v))} getContext={ctx} />
        <div className="grid grid-cols-2 gap-3">
          <AiField fieldKey="media.tags" label="Tags" id="md-tags" as="custom" value={f.tags.split(",").map((t) => t.trim()).filter(Boolean)} disabled={!canManage} aiDisabled={!canGenerate} onChange={(v) => set("tags", Array.isArray(v) ? v.join(", ") : String(v))} getContext={ctx}>
            <Input id="md-tags" value={f.tags} disabled={!canManage} onChange={(e) => set("tags", e.target.value)} placeholder="diwali, product" />
          </AiField>
          <Field label="Folder"><Input value={f.folder} disabled={!canManage} maxLength={60} onChange={(e) => set("folder", e.target.value)} placeholder="e.g. Diwali 2026" aria-label="Folder" /></Field>
          <Field label="Intended platform"><OptionSelect value={f.platform} disabled={!canManage} onChange={(v) => set("platform", v)} options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p].label }))} noneLabel="Any" aria-label="Platform" /></Field>
        </div>
        <AiField fieldKey="media.caption" label="Caption" id="md-cap" as="textarea" rows={2} value={f.caption} disabled={!canManage} aiDisabled={!canGenerate} onChange={(v) => set("caption", String(v))} getContext={ctx} />
        {item.kind === "video" && (
          <>
            <AiField fieldKey="media.script" label="Script" id="md-script" as="textarea" rows={5} value={f.script} disabled={!canManage} aiDisabled={!canGenerate} onChange={(v) => set("script", String(v))} getContext={ctx} />
            <Field label="Thumbnail">
              <div className="flex items-center gap-2">
                {thumb ? <MediaThumb media={thumb} className="size-16" /> : <span className="text-xs text-muted-foreground">None</span>}
                {canManage && <MediaPicker kind="image" multiple={false} canUpload onPick={(x) => setThumb(x[0] ?? null)} trigger={<Button type="button" size="xs" variant="outline"><ImagePlus className="size-3" /> Choose</Button>} />}
                {canManage && thumb && <Button type="button" size="icon-xs" variant="ghost" aria-label="Remove thumbnail" onClick={() => setThumb(null)}><X className="size-3" /></Button>}
              </div>
            </Field>
          </>
        )}
        <AiField fieldKey="media.creativePrompt" label="Creative prompt" id="md-prompt" as="textarea" rows={4} hint="Reusable AI image prompt for this creative." value={f.creativePrompt} disabled={!canManage} aiDisabled={!canGenerate} onChange={(v) => set("creativePrompt", String(v))} getContext={ctx} />
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => {
            const res = await updateMediaMetaAction(item._id, { ...f, thumbnailId: item.kind === "video" ? (thumb?._id ?? "") : undefined });
            if (!res.ok) return void toast.error(res.error);
            toast.success("Saved.");
            router.refresh();
          })}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save details</Button>
          {canGenerate && (
            <Button type="button" size="sm" variant="outline" disabled={ai} onClick={() => startAi(async () => {
              const res = await generateMediaPromptAction(item._id);
              if (!res.ok) return void toast.error(res.error);
              set("creativePrompt", res.prompt);
              toast.success("Creative prompt generated and saved.");
            })}>{ai ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />} Generate creative prompt</Button>
          )}
          {canGenerate && f.creativePrompt.trim() && (
            <Button type="button" size="sm" variant="outline" disabled={ai} onClick={() => startAi(async () => {
              const res = await generateLibraryImageAction({ prompt: f.creativePrompt, platform: f.platform, formatKey: "", name: `${f.name} — AI variant` });
              if (!res.ok) return void toast.error(res.error);
              toast.success("New AI image added to the library.");
              router.refresh();
            })}><Sparkles className="size-3.5" /> Generate image from prompt</Button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border/50 p-3 text-xs">
        <p className="mb-1 font-semibold">Used in</p>
        {usage === null ? <Loader2 className="size-3.5 animate-spin" /> : inUse === 0 ? <p className="text-muted-foreground">Not attached to anything.</p> : (
          <ul className="space-y-0.5">
            {usage.posts.map((x) => <li key={x._id}><Link className="text-primary hover:underline" href={`/viralpulse-ai/posts/${x._id}`}>{`Post: ${x.title}`}</Link></li>)}
            {usage.ads.map((x) => <li key={x._id}><Link className="text-primary hover:underline" href={`/viralpulse-ai/campaigns/${x.campaignId}/ads/${x._id}`}>{`Ad: ${x.name}`}</Link></li>)}
            {usage.videos.map((x) => <li key={x._id}>{`Thumbnail of video: ${x.name}`}</li>)}
          </ul>
        )}
      </div>
      {canManage && (
        <Button type="button" size="sm" variant="destructive" disabled={pending || inUse > 0} title={inUse > 0 ? "Detach it first" : undefined} onClick={() => { if (!confirm(`Delete “${item.name}” from the library?`)) return; start(async () => { const res = await deleteMediaAction(item._id); if (!res.ok) return void toast.error(res.error); toast.success("Deleted."); onClose(); router.refresh(); }); }}>
          <Trash2 className="size-3.5" /> Delete
        </Button>
      )}
    </div>
  );
}

export default function MediaLibrary({ items, canManage, canGenerate, canPost = false, canAds = false, openId }: { items: LibraryItem[]; canManage: boolean; canGenerate: boolean; canPost?: boolean; canAds?: boolean; openId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<LibraryItem | null>(() => items.find((i) => i._id === openId) ?? null);
  const { uploadFile, progress } = useMediaUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState(false);
  const [folder, setFolder] = useState("");
  const [tagText, setTagText] = useState("");
  const [bulk, startBulk] = useTransition();
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  async function onFiles(files: FileList | null) {
    let any = false;
    for (const f of Array.from(files ?? [])) if (await uploadFile(f)) any = true;
    if (fileRef.current) fileRef.current.value = "";
    if (any) router.refresh();
  }

  return (
    <div className="space-y-3">
      {(canManage || canGenerate) && (
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <input ref={fileRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" onChange={(e) => onFiles(e.target.files)} />
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={progress !== null}>{progress !== null ? <><Loader2 className="size-4 animate-spin" />{`Uploading ${progress}%`}</> : <><Upload className="size-4" /> Upload images / videos</>}</Button>
            </>
          )}
          {canManage && canGenerate && <Button variant="outline" nativeButton={false} render={<Link href="/viralpulse-ai/generate-image" />}><Sparkles className="size-4" /> Generate image</Button>}
          {canManage && items.length > 0 && <Button type="button" variant={picking ? "secondary" : "outline"} onClick={() => { setPicking((p) => !p); setSel([]); }}><CheckSquare className="size-4" /> {picking ? "Done selecting" : "Select"}</Button>}
        </div>
      )}
      {picking && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2 text-sm" role="region" aria-label="Bulk actions">
          <span className="font-semibold">{`${sel.length} selected`}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSel(items.map((i) => i._id))}>Select all on this page</Button>
          <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Move to folder (empty = keep)" className="h-8 w-44" aria-label="Folder to move to" maxLength={60} />
          <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Add tags, comma separated" className="h-8 w-48" aria-label="Tags to add" />
          <Button type="button" size="sm" variant="outline" disabled={sel.length === 0 || bulk || (!folder.trim() && !tagText.trim())} onClick={() => startBulk(async () => { const r = await bulkFolderTagsAction(sel, folder.trim() ? folder.trim() : tagText.trim() ? (undefined as unknown as string | null) : null, tagText.split(",").map((t) => t.trim()).filter(Boolean)); if (!r.ok) return void toast.error(r.error); toast.success(`${r.updated} updated.`); setSel([]); router.refresh(); })}><FolderInput className="size-3.5" /> Apply</Button>
          <Button type="button" size="sm" variant="destructive" disabled={sel.length === 0 || bulk} onClick={() => setConfirmDel(true)}><Trash2 className="size-3.5" /> Delete</Button>
        </div>
      )}
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent>
          <DialogHeader><DialogTitle>{`Delete ${sel.length} item${sel.length === 1 ? "" : "s"}?`}</DialogTitle><DialogDescription>They leave the library. Anything attached to a post or ad is kept and reported; detach it first.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDel(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={bulk} onClick={() => startBulk(async () => { const r = await bulkDeleteMediaAction(sel); setConfirmDel(false); if (!r.ok) return void toast.error(r.error); if (r.deleted) toast.success(`${r.deleted} deleted.`); if (r.refused.length) toast.error(`${r.refused.length} not deleted: ${r.refused[0].reason}`); setSel([]); router.refresh(); })}>{bulk ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">No media yet. Upload images and videos (up to 20 MB / 500 MB) or generate images with AI.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((m) => (
            <button key={m._id} type="button" aria-pressed={picking ? sel.includes(m._id) : undefined} onClick={() => (picking ? toggle(m._id) : setOpen(m))} className={`group relative rounded-xl border bg-card/70 p-1.5 text-left transition hover:border-primary/40 ${sel.includes(m._id) ? "border-primary ring-2 ring-primary/30" : "border-border/50"}`}>
              {picking && <span className={`absolute top-2.5 left-2.5 z-10 flex size-5 items-center justify-center rounded border text-[11px] font-bold ${sel.includes(m._id) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/90"}`} aria-hidden>{sel.includes(m._id) ? "✓" : ""}</span>}
              <MediaThumb media={m.thumbnail && m.kind === "video" ? { ...m, thumbnailId: m.thumbnail._id } : m} className="aspect-square w-full" />
              <p className="mt-1 truncate px-0.5 text-xs font-medium group-hover:text-primary">{m.name}</p>
              <div className="flex items-center gap-1 px-0.5 text-[10px] text-muted-foreground">
                {m.source === "ai" && <Sparkles className="size-3 text-violet-500" aria-label="AI generated" />}
                <span className="truncate">{`${m.width && m.height ? `${m.width}×${m.height} · ` : ""}${formatBytes(m.size)}`}</span>
                {m.platform && <PlatformChip platform={m.platform} className="ml-auto" />}
              </div>
            </button>
          ))}
        </div>
      )}
      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{open?.name ?? "Media"}</SheetTitle>
            <SheetDescription>{open?.kind === "video" ? "Video" : "Image"} in the media library</SheetDescription>
          </SheetHeader>
          {open && <Detail key={open._id} item={open} canManage={canManage} canGenerate={canGenerate} canPost={canPost} canAds={canAds} onClose={() => setOpen(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
