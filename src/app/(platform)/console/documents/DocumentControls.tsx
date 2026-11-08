"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileText, Loader2, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { FeatureControls } from "@/lib/platform/feature-controls";
import type { PdfType } from "@/lib/pdf/catalog";
import type { PlatformPdfStat } from "@/lib/notify/center/platform";
import { setPdfEnabledAction, setPdfLibraryEnabledAction } from "./actions";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never");

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
      <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function DocumentControls({ types, stats, controls, products, canEdit }: { types: PdfType[]; stats: Record<string, PlatformPdfStat>; controls: FeatureControls; products: Record<string, string>; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [product, setProduct] = useState("all");
  const [category, setCategory] = useState("all");
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [section, setSection] = useState(controls.pdfLibrary);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ type: PdfType; variant: string } | null>(null);
  const [, start] = useTransition();
  const productName = (k: string) => (k === "account" ? "SelfRun billing" : (products[k] ?? k));
  const isOff = (t: PdfType) => off[t.key] ?? controls.pdfs[t.key] === false;
  const productKeys = useMemo(() => [...new Set(types.map((t) => t.product))].sort((a, b) => productName(a).localeCompare(productName(b))), [types, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = useMemo(() => [...new Set(types.map((t) => t.category))], [types]);
  const shown = types.filter((t) => (product === "all" || t.product === product) && (category === "all" || t.category === category) && (!q.trim() || `${t.name} ${t.description}`.toLowerCase().includes(q.trim().toLowerCase())));
  const total30 = Object.values(stats).reduce((n, s) => n + s.last30, 0);

  const toggle = (t: PdfType, enabled: boolean) => {
    if (!enabled && !confirm(`Turn off "${t.name}" for EVERY company? People who open it will be told it is turned off.`)) return;
    setBusy(t.key);
    setMessage(null);
    setOff((m) => ({ ...m, [t.key]: !enabled }));
    start(async () => {
      const res = await setPdfEnabledAction(t.key, enabled).catch((x: unknown) => ({ ok: false as const, error: x instanceof Error ? x.message : "Could not save." }));
      setBusy(null);
      if (res.ok) router.refresh();
      else {
        setOff((m) => ({ ...m, [t.key]: !enabled }));
        setMessage({ ok: false, text: `${t.name}: ${res.error}` });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4"><p className="text-sm text-muted-foreground">Kinds of PDF</p><p className="mt-1 text-2xl font-bold tabular-nums">{types.length}</p></div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4"><p className="text-sm text-muted-foreground">Made in the last 30 days (all companies)</p><p className="mt-1 text-2xl font-bold tabular-nums">{total30}</p></div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4"><p className="text-sm text-muted-foreground">Switched off</p><p className="mt-1 text-2xl font-bold tabular-nums">{types.filter(isOff).length}</p></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 text-sm">
        <div>
          <p className="font-medium">Show Documents &amp; PDFs to companies</p>
          <p className="text-xs text-muted-foreground">Their Settings → Documents &amp; PDFs page. Turning it off only hides the page; the PDFs themselves keep working.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{section ? "Shown" : "Hidden"}</span>
          <Switch on={section} disabled={!canEdit} label="Show Documents & PDFs to companies" onChange={(v) => { setSection(v); start(async () => { const res = await setPdfLibraryEnabledAction(v).catch(() => ({ ok: false as const, error: "Could not save." })); if (res.ok) router.refresh(); else { setSection(!v); setMessage({ ok: false, text: res.error }); } }); }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" className="pl-9" aria-label="Search documents" /></div>
        <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectClass} aria-label="Product"><option value="all">All products</option>{productKeys.map((k) => <option key={k} value={k}>{productName(k)}</option>)}</select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass} aria-label="Category"><option value="all">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      {message && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{message.text}</p>}

      <ul className="space-y-3">
        {shown.map((t) => {
          const s = stats[t.key];
          const active = t.status === "active";
          return (
            <li key={t.key} data-pdf={t.key} className={`rounded-2xl border border-border/60 bg-card/70 p-4 ${isOff(t) ? "opacity-80" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold"><FileText className="size-4 text-primary" /> {t.name}<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{productName(t.product)}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{t.category}</span>{isOff(t) && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">Switched off</span>}{!active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{t.status === "browser" ? "Printed from the page" : "Not used yet"}</span>}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{active ? <>Last 30 days: <span className="text-foreground">{s?.last30 ?? 0}</span> · Total kept: <span className="text-foreground">{s?.total ?? 0}</span> · Companies using it: <span className="text-foreground">{s?.companies ?? 0}</span> · Last made: <span className="text-foreground">{when(s?.lastAt ?? null)}</span></> : t.note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Made by <code className="break-all">{t.route}</code></p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {active && <Button type="button" size="sm" variant="outline" onClick={() => setPreview({ type: t, variant: t.variants?.[0]?.key ?? "" })}><Eye className="size-3.5" /> Preview</Button>}
                  {active ? (
                    <label className="flex items-center gap-1.5 text-xs">
                      {busy === t.key && <Loader2 className="size-3.5 animate-spin" />}
                      <Switch on={!isOff(t)} disabled={!canEdit || busy === t.key} label={`${isOff(t) ? "Turn on" : "Turn off"} ${t.name}`} onChange={(v) => toggle(t, v)} />
                      <span className="w-12 text-muted-foreground">{isOff(t) ? "Off" : "On"}</span>
                    </label>
                  ) : <span className="text-xs text-muted-foreground">No switch</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Sheet open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {preview && <Preview key={preview.type.key} type={preview.type} initial={preview.variant} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Preview({ type, initial }: { type: PdfType; initial: string }) {
  const [variant, setVariant] = useState(initial);
  const [loading, setLoading] = useState(true);
  const src = `/api/platform/pdfs/${type.key}/preview${variant ? `?variant=${encodeURIComponent(variant)}` : ""}`;
  return (
    <>
      <SheetHeader className="border-b p-5 pr-12">
        <SheetTitle className="text-lg">{type.name}</SheetTitle>
        <SheetDescription>A sample in your own letterhead with made-up figures.</SheetDescription>
        {type.variants && <div className="mt-2 flex flex-wrap gap-1.5" role="tablist">{type.variants.map((v) => <button key={v.key} type="button" role="tab" aria-selected={variant === v.key} onClick={() => { setLoading(true); setVariant(v.key); }} className={`rounded-full border px-3 py-1 text-xs ${variant === v.key ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>{v.label}</button>)}</div>}
      </SheetHeader>
      <div className="relative min-h-0 flex-1 bg-muted/40">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" /> Making the sample…</div>}
        <iframe key={src} title={`${type.name} sample`} src={src} onLoad={() => setLoading(false)} className="h-full w-full bg-white" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t p-3">
        <a href={`${src}${src.includes("?") ? "&" : "?"}download=1`}><Button type="button" variant="outline" size="sm"><Download className="size-3.5" /> Download sample</Button></a>
        <a href={src} target="_blank" rel="noreferrer"><Button type="button" size="sm"><Printer className="size-3.5" /> Open in a new tab</Button></a>
      </div>
    </>
  );
}
