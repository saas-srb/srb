"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Download, ExternalLink, Eye, FileText, Loader2, Mail, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { eventName } from "@/lib/notify/center/event-names";
import { PDF_BY_KEY, type PdfType } from "@/lib/pdf/catalog";
import type { PdfActivityEntry, PdfStat } from "@/lib/pdf/activity";
import { loadPdfActivityAction } from "@/app/(products)/commandos/(protected)/settings/documents/actions";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
const STATUS: Record<PdfType["status"], { label: string; tone: string }> = {
  active: { label: "In use", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  browser: { label: "Printed from the page", tone: "bg-primary/15 text-primary" },
  unused: { label: "Not used yet", tone: "bg-muted text-muted-foreground" },
};
const ROLE: Record<string, string> = { staff: "Team member", client: "Client", student: "Student", candidate: "Candidate", employee: "Employee", platform: "SelfRun staff" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Never");
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default function PdfLibrary({ types, stats, products, disabled }: { types: PdfType[]; stats: Record<string, PdfStat>; products: Record<string, string>; disabled: string[] }) {
  const [tab, setTab] = useState<"documents" | "activity">("documents");
  const [q, setQ] = useState("");
  const [product, setProduct] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | PdfType["status"]>("all");
  const [preview, setPreview] = useState<{ type: PdfType; variant: string } | null>(null);
  const productName = (k: string) => (k === "account" ? "SelfRun billing" : (products[k] ?? k));
  const productKeys = useMemo(() => [...new Set(types.map((t) => t.product))].sort((a, b) => productName(a).localeCompare(productName(b))), [types, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = useMemo(() => [...new Set(types.map((t) => t.category))], [types]);
  const shown = types.filter((t) => (product === "all" || t.product === product) && (category === "all" || t.category === category) && (status === "all" || t.status === status) && (!q.trim() || `${t.name} ${t.description} ${t.contains.join(" ")} ${t.variants?.map((v) => v.label).join(" ") ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const total30 = Object.values(stats).reduce((n, s) => n + s.last30, 0);
  const documentCount = types.reduce((n, t) => n + (t.variants?.length ?? 1), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Kinds of PDF" value={types.length} hint={`${documentCount} documents counting each report and variant`} />
        <Stat label="Made in the last 30 days" value={total30} hint="Opened or downloaded by your team, clients and staff" />
        <Stat label="In use" value={types.filter((t) => t.status === "active").length} hint={`${types.filter((t) => t.status !== "active").length} are printed from a page or not used yet`} />
      </div>
      <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/40 p-1 text-sm font-medium" role="tablist">
        {([["documents", "Documents"], ["activity", "Activity"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>

      {tab === "documents" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" className="pl-9" aria-label="Search documents" /></div>
            <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectClass} aria-label="Product"><option value="all">All products</option>{productKeys.map((k) => <option key={k} value={k}>{productName(k)}</option>)}</select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass} aria-label="Category"><option value="all">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectClass} aria-label="Status"><option value="all">Any status</option>{(Object.keys(STATUS) as PdfType["status"][]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
          </div>
          {shown.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No documents match.</p>}
          <ul className="space-y-3">
            {shown.map((t) => <DocumentCard key={t.key} t={t} off={disabled.includes(t.key)} stat={stats[t.key]} productName={productName(t.product)} onPreview={(variant) => setPreview({ type: t, variant })} />)}
          </ul>
        </>
      ) : (
        <Activity types={types} productName={productName} />
      )}

      <Sheet open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {preview && <PreviewPane key={preview.type.key} type={preview.type} initial={preview.variant} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm">{children}</dd></div>;
}

function DocumentCard({ t, stat, productName, off, onPreview }: { t: PdfType; stat: PdfStat | undefined; productName: string; off: boolean; onPreview: (variant: string) => void }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[t.status];
  return (
    <li data-pdf={t.key} className="rounded-2xl border border-border/60 bg-card/70">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold"><FileText className="size-4 text-primary" /> {t.name}<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${off ? "bg-destructive/15 text-destructive" : s.tone}`}>{off ? "Turned off by SelfRun" : s.label}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{productName}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{t.category}</span></p>
          <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
          {t.variants && <p className="mt-2 flex flex-wrap gap-1.5">{t.variants.map((v) => <span key={v.key} className="rounded-full border px-2 py-0.5 text-xs">{v.label}{stat?.byVariant[v.key] ? ` · ${stat.byVariant[v.key]}` : ""}</span>)}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            {t.status === "active" ? <>Last made: <span className="text-foreground">{stat?.lastAt ? `${when(stat.lastAt)} (${ago(stat.lastAt)})` : "Never in your workspace"}</span> · Last 30 days: <span className="text-foreground">{stat?.last30 ?? 0}</span> · Total: <span className="text-foreground">{stat?.total ?? 0}</span></> : t.note}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {t.status === "active" && !off ? <Button type="button" size="sm" onClick={() => onPreview(t.variants?.[0]?.key ?? "")}><Eye className="size-3.5" /> Preview</Button> : <Button type="button" size="sm" variant="outline" disabled><Eye className="size-3.5" /> No preview</Button>}
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Hide details" : "Details"}</Button>
        </div>
      </div>
      {open && (
        <dl className="grid gap-4 border-t bg-muted/20 p-4 sm:grid-cols-2">
          <Fact label="What is on it"><ul className="list-disc pl-4">{t.contains.map((c) => <li key={c}>{c}</li>)}</ul></Fact>
          <Fact label="When it is made">{t.generated}</Fact>
          <Fact label="Where it is used">
            {t.usedIn.length === 0 ? "Nowhere yet." : <ul className="space-y-0.5">{t.usedIn.map((u) => <li key={u.label}>{u.href ? <Link href={u.href} className="inline-flex items-center gap-1 text-primary hover:underline">{u.label}<ExternalLink className="size-3" /></Link> : u.label}</li>)}</ul>}
          </Fact>
          <Fact label="Who can open it">{t.access}</Fact>
          <Fact label="How it reaches people">{t.delivery}</Fact>
          <Fact label="Letterhead">{t.letterhead === "company" ? "Your company's name, logo, address and theme colours." : "SelfRun's own billing details (SelfRun issues these)."}</Fact>
          <Fact label="Emails and notifications about it">
            {t.events.length === 0 ? "None. People open it without being told." : <ul className="space-y-0.5">{t.events.map((e) => <li key={e} className="flex items-center gap-1.5">{e.startsWith("billing_") || e.startsWith("auth_") ? <Mail className="size-3.5 text-muted-foreground" /> : <Bell className="size-3.5 text-muted-foreground" />}{eventName(e)}</li>)}</ul>}
            {t.events.length > 0 && <Link href="/commandos/settings/notifications" className="mt-1 inline-block text-xs text-primary hover:underline">Change these in the Notification center</Link>}
          </Fact>
          <Fact label="Formats">PDF{t.alsoAs?.length ? `, also ${t.alsoAs.join(" and ")}` : ""}</Fact>
          <Fact label="File name"><code className="text-xs">{t.fileName}</code></Fact>
          <Fact label="Made by (for developers)"><code className="break-all text-xs">{t.route}</code></Fact>
        </dl>
      )}
    </li>
  );
}

function PreviewPane({ type, initial }: { type: PdfType; initial: string }) {
  const [variant, setVariant] = useState(initial);
  const [loading, setLoading] = useState(true);
  const src = `/api/pdf-library/preview/${type.key}${variant ? `?variant=${encodeURIComponent(variant)}` : ""}`;
  useEffect(() => setLoading(true), [src]);
  return (
    <>
      <SheetHeader className="border-b p-5 pr-12">
        <SheetTitle className="text-lg">{type.name}</SheetTitle>
        <SheetDescription>A sample in your letterhead with made-up figures. Real documents look the same.</SheetDescription>
        {type.variants && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Variant">
            {type.variants.map((v) => <button key={v.key} type="button" role="tab" aria-selected={variant === v.key} onClick={() => setVariant(v.key)} className={`rounded-full border px-3 py-1 text-xs ${variant === v.key ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}>{v.label}</button>)}
          </div>
        )}
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

function Activity({ types, productName }: { types: PdfType[]; productName: (k: string) => string }) {
  const [type, setType] = useState("");
  const [rows, setRows] = useState<PdfActivityEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async (before?: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await loadPdfActivityAction({ type: type || undefined, before });
      setRows((r) => (before ? [...r, ...res.entries] : res.entries));
      setNext(res.next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [type]);
  useEffect(() => void load(), [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass} aria-label="Document"><option value="">All documents</option>{types.filter((t) => t.status === "active").map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select>
        <p className="text-xs text-muted-foreground">Each time a PDF is opened or downloaded in your workspace. Kept for 180 days.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">Could not load the activity.</p>}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/70">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Document</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Opened by</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const t = PDF_BY_KEY.get(r.type);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{when(r.at)}</td>
                  <td className="px-3 py-2"><span className="block font-medium">{t?.name ?? r.type}{r.variant ? ` · ${t?.variants?.find((v) => v.key === r.variant)?.label ?? r.variant}` : ""}</span><span className="text-xs text-muted-foreground">{t ? productName(t.product) : ""}</span></td>
                  <td className="px-3 py-2 font-mono text-xs">{r.ref || "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.by || "—"}<span className="block text-muted-foreground">{ROLE[r.role] ?? r.role}</span></td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No PDF has been made yet. They appear here as your team and clients open them.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">{loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}{next && !loading && <Button type="button" variant="outline" onClick={() => void load(next)}>Load more</Button>}</div>
    </div>
  );
}
