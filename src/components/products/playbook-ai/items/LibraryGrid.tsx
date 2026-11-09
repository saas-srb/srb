"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ITEM_KIND_INFO, type ItemKind, type LibraryEntryInfo } from "@/lib/products/playbook-ai/items-types";
import { downloadLibraryAction, libraryDetailsAction, previewLibraryAction, useLibraryItemAction, type LibraryDetails } from "@/app/(products)/playbook-ai/(protected)/items-actions";
import { FIELD, PdfPreviewDialog } from "@/components/products/playbook-ai/items/shared";
import { cn } from "@/lib/utils";

/** The library screen for the three kinds: category chips, search, cards with Preview, Details and Use. */
export default function LibraryGrid({ kind, entries, canUse }: { kind: ItemKind; entries: LibraryEntryInfo[]; canUse: boolean }) {
  const router = useRouter();
  const info = ITEM_KIND_INFO[kind];
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [preview, setPreview] = useState<LibraryEntryInfo | null>(null);
  const [details, setDetails] = useState<LibraryEntryInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const cats = useMemo(() => [...new Set(entries.map((e) => e.category))].sort(), [entries]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((e) => (!cat || e.category === cat) && words.every((w) => `${e.title} ${e.summary} ${e.category}`.toLowerCase().includes(w)));
  }, [entries, q, cat]);

  function use(e: LibraryEntryInfo) {
    if (kind === "document") { router.push(`/playbook-ai/documents/new?type=${encodeURIComponent(e.id)}`); return; }
    setBusy(e.id);
    start(async () => {
      const r = await useLibraryItemAction(e.id);
      setBusy(null);
      if (!r.ok) { toast.error(r.message); return; }
      toast.success(`Added to ${info.mine}. You can edit everything.`);
      router.push(`/playbook-ai/documents/${r.documentId}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/40 bg-card/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input className={cn(FIELD, "pl-8")} placeholder={`Search the ${info.library}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </div>
          <span className="text-xs text-muted-foreground">{shown.length} of {entries.length}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {["", ...cats].map((c) => (
            <button key={c || "all"} type="button" onClick={() => setCat(c)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", cat === c ? "border-primary/30 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted/60")}>{c || "All"}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-card/60 p-8 text-center text-sm text-muted-foreground">Nothing in the library matches that search.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <article key={e.id} className="flex flex-col rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{e.category}</p>
                {e.legal && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">Needs review</span>}
              </div>
              <h3 className="mt-1 font-bold leading-snug">{e.title}</h3>
              <p className="mt-1 flex-1 text-sm text-muted-foreground">{e.summary}</p>
              {e.tags && e.tags.length > 0 && <ul className="mt-2 flex flex-wrap gap-1">{e.tags.map((t) => <li key={t} className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">{t}</li>)}</ul>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setPreview(e)}>Preview</Button>
                <Button size="sm" variant="outline" onClick={() => setDetails(e)}>Details</Button>
                {canUse && <Button size="sm" disabled={busy === e.id} onClick={() => use(e)}>{busy === e.id ? "Adding…" : "Use"}</Button>}
              </div>
            </article>
          ))}
        </div>
      )}

      {preview && (
        <PdfPreviewDialog open title={preview.title} note="Template preview: your letterhead and company details, blanks highlighted" onClose={() => setPreview(null)} load={() => previewLibraryAction(preview.id)}
          footer={<><DownloadButton id={preview.id} format="pdf" /><DownloadButton id={preview.id} format="docx" />{canUse && <Button size="sm" onClick={() => { const e = preview; setPreview(null); use(e); }}>Use</Button>}</>} />
      )}
      <DetailsDialog entry={details} kind={kind} canUse={canUse} onClose={() => setDetails(null)} onUse={(e) => { setDetails(null); use(e); }} />
    </div>
  );
}

function DownloadButton({ id, format }: { id: string; format: "pdf" | "docx" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => {
      setBusy(true);
      void downloadLibraryAction(id, format).then((r) => {
        setBusy(false);
        if (!r.ok) { toast.error(r.message); return; }
        const bin = atob(r.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
        const a = document.createElement("a");
        a.href = url; a.download = r.filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }}>{busy ? "Preparing…" : format === "pdf" ? "Download PDF" : "Download Word"}</Button>
  );
}

function DetailsDialog({ entry, kind, canUse, onClose, onUse }: { entry: LibraryEntryInfo | null; kind: ItemKind; canUse: boolean; onClose: () => void; onUse: (e: LibraryEntryInfo) => void }) {
  const [d, setD] = useState<LibraryDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setD(null); setError(null);
    void libraryDetailsAction(entry.id).then((r) => { if (cancelled) return; if (r.ok) setD(r.data); else setError(r.message); });
    return () => { cancelled = true; };
  }, [entry]);
  return (
    <Dialog open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>{entry?.title}</DialogTitle><DialogDescription>{d?.kindLabel ?? entry?.category}</DialogDescription></DialogHeader>
        {!d && !error && <p className="text-sm text-muted-foreground" role="status">Loading…</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {d && (
          <div className="space-y-3 text-sm">
            <p>{d.purpose}</p>
            {d.legal.review && <p role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">AI draft. Needs review by a qualified advocate before use. Nothing here is legal advice.</p>}
            {d.legal.statute && <p role="note" className="rounded-md border border-blue-500/40 bg-blue-500/10 p-2 text-xs">Verify against current law and your registered details before use. Statutory figures must come from your own records.</p>}
            <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
              {d.party && <><dt className="text-muted-foreground">Party</dt><dd className="col-span-2 capitalize">{d.party}</dd></>}
              {d.signature && <><dt className="text-muted-foreground">Signature</dt><dd className="col-span-2">{d.signature}</dd></>}
              {d.stamp.rule !== "none" && <><dt className="text-muted-foreground">Stamp duty</dt><dd className="col-span-2">{d.stamp.rule === "likely" ? "Usually needed" : "May be needed"}{d.stamp.category ? ` (${d.stamp.category.replace(/_/g, " ")})` : ""}. Duty depends on the state and the rates are reference data that may not be confirmed for your state; check before relying on them.</dd></>}
              <dt className="text-muted-foreground">Length</dt><dd className="col-span-2">About {d.pages} page{d.pages === 1 ? "" : "s"} (A4)</dd>
            </dl>
            {d.inputs.length > 0 && <section><h3 className="mb-1 font-semibold">You will be asked for</h3><ul className="flex flex-wrap gap-1">{d.inputs.map((i, k) => <li key={k} className="rounded-full border px-2 py-0.5 text-xs">{i.label}{i.required ? "" : " (optional)"}</li>)}</ul></section>}
            <section>
              <h3 className="mb-1 font-semibold">Sections</h3>
              <ul className="space-y-0.5">{d.sections.map((s, k) => <li key={k} className="flex items-center justify-between gap-2"><span>{s.title}</span>{kind === "document" && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.ai ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-muted text-muted-foreground"}`}>{s.ai ? "AI can write" : "Fixed wording"}</span>}</li>)}</ul>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {canUse && entry && <Button onClick={() => onUse(entry)}>Use</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
