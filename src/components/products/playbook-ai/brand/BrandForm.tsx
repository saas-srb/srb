"use client";

/* eslint-disable @next/next/no-img-element -- these are small private data-URI previews, not remote images next/image could optimise */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FONT_PAIRS, LETTERHEAD_SCOPES, LOGO_POSITIONS, BRAND_LIMITS, type BrandLine, type BrandSettings, type BrandSignatory } from "@/lib/products/playbook-ai/brand/types";
import { MARGIN_LIMITS } from "@/lib/products/playbook-ai/doc/page";
import { previewBrandAction, saveBrandAction, uploadBrandImageAction } from "@/app/(products)/playbook-ai/(protected)/brand/actions";

const COMPANY_KEYS: { key: string; label: string }[] = [
  { key: "company.name", label: "Company name" }, { key: "company.legal_name", label: "Legal name" }, { key: "company.address", label: "Address" },
  { key: "company.city", label: "City" }, { key: "company.state", label: "State" }, { key: "company.email", label: "Email" }, { key: "company.phone", label: "Phone" },
  { key: "company.website", label: "Website" }, { key: "company.cin", label: "CIN" }, { key: "company.gstin", label: "GSTIN" }, { key: "company.pan", label: "PAN" }, { key: "company.tan", label: "TAN" },
];

const field = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const card = "rounded-2xl border border-border/50 bg-card p-5";

type PreviewState = "final" | "draft" | "unreviewed";

function LinesEditor({ title, hint, lines, onChange, values }: { title: string; hint: string; lines: BrandLine[]; onChange: (l: BrandLine[]) => void; values: Record<string, string> }) {
  const set = (i: number, patch: Partial<BrandLine>) => onChange(lines.map((l, x) => (x === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      <div><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{hint}</p></div>
      {lines.map((l, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select aria-label={`${title} line ${i + 1} value`} className={`${field} w-44`} value={l.key ?? ""} onChange={(e) => set(i, { key: e.target.value || null })}>
            <option value="">Fixed text only</option>
            {COMPANY_KEYS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <Input aria-label={`${title} line ${i + 1} text`} className="w-52" placeholder={l.key ? "Text before the value, e.g. CIN: " : "Text"} value={l.text} maxLength={BRAND_LIMITS.maxLineText} onChange={(e) => set(i, { text: e.target.value })} />
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={l.bold} onChange={(e) => set(i, { bold: e.target.checked })} />Bold</label>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{l.key ? (values[l.key] ? `= ${values[l.key]}` : "empty in your company profile: this line is left out") : ""}</span>
          <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => onChange(lines.filter((_, x) => x !== i))}><Trash2 className="size-4" /></Button>
        </div>
      ))}
      {lines.length < BRAND_LIMITS.maxLines && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, { key: "company.name", text: "", bold: false }])}><Plus className="mr-1 size-4" />Add a line</Button>
      )}
    </div>
  );
}

export default function BrandForm({ initial, thumbs: initialThumbs, companyValues, updatedAt }: { initial: BrandSettings; thumbs: Record<string, string>; companyValues: Record<string, string>; updatedAt: string | null }) {
  const router = useRouter();
  const [b, setB] = useState<BrandSettings>(initial);
  const [thumbs, setThumbs] = useState<Record<string, string>>(initialThumbs);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, startSave] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [state, setState] = useState<PreviewState>("final");
  const [preview, setPreview] = useState<{ url: string; pages: number; warnings: string[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const seq = useRef(0);
  const urlRef = useRef<string | null>(null);

  // Live preview: the real renderer draws the sample document a moment after the last change.
  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setDrawing(true);
      const r = await previewBrandAction(b, state).catch(() => ({ ok: false as const, error: "The preview could not be drawn." }));
      if (mine !== seq.current) return;
      setDrawing(false);
      if (!r.ok) { setPreviewError(r.error); return; }
      setPreviewError(null);
      const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPreview({ url, pages: r.pages, warnings: r.warnings });
    }, 700);
    return () => clearTimeout(timer);
  }, [b, state]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const upload = async (kind: "logo" | "signature" | "stamp", file: File | undefined, apply: (assetId: string) => void) => {
    if (!file) return;
    setUploading(kind);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    const r = await uploadBrandImageAction(fd).catch(() => ({ ok: false as const, error: "The upload failed." }));
    setUploading(null);
    if (!r.ok) { toast.error(r.error); return; }
    setThumbs((t) => ({ ...t, [r.assetId]: r.dataUri }));
    apply(r.assetId);
  };

  const setMargin = (k: "top" | "right" | "bottom" | "left", v: string) => setB((s) => ({ ...s, page: { ...s.page, margins: { ...s.page.margins, [k]: Number(v) } } }));
  const setSig = (id: string, patch: Partial<BrandSignatory>) => setB((s) => ({ ...s, signatories: s.signatories.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const save = () => {
    setErrors([]);
    startSave(async () => {
      const r = await saveBrandAction(b);
      if (!r.ok) { setErrors(r.errors ?? [r.error]); return; }
      toast.success("Brand saved");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <div className="space-y-4">
        <section className={card}>
          <h2 className="font-semibold">Colours and fonts</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {(["primary", "secondary"] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`c-${k}`}>{k === "primary" ? "Main colour (headings, rules)" : "Second colour (accents)"}</Label>
                <div className="flex items-center gap-2">
                  <input aria-label={`${k} colour picker`} type="color" className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1" value={b.colors[k]} onChange={(e) => setB((s) => ({ ...s, colors: { ...s.colors, [k]: e.target.value.toUpperCase() } }))} />
                  <Input id={`c-${k}`} value={b.colors[k]} maxLength={7} onChange={(e) => setB((s) => ({ ...s, colors: { ...s.colors, [k]: e.target.value } }))} />
                </div>
              </div>
            ))}
          </div>
          <fieldset className="mt-4 space-y-2">
            <legend className="text-sm font-medium">Fonts</legend>
            {FONT_PAIRS.map((p) => (
              <label key={p.id} className="flex items-start gap-2 text-sm">
                <input type="radio" name="fontPair" className="mt-1 size-4 accent-[var(--primary)]" checked={b.fontPair === p.id} onChange={() => setB((s) => ({ ...s, fontPair: p.id }))} />
                <span><span className="font-medium">{p.label}</span><span className="block text-xs text-muted-foreground">{p.description}</span></span>
              </label>
            ))}
            <p className="text-[11px] text-muted-foreground">Only fonts bundled with the app are offered, so exports look the same everywhere.</p>
          </fieldset>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Logo and letterhead</h2>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
              {b.logo.assetId && thumbs[b.logo.assetId] ? <img src={thumbs[b.logo.assetId]} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
            </div>
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted">
                {uploading === "logo" ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}Upload logo
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => upload("logo", e.target.files?.[0], (id) => setB((s) => ({ ...s, logo: { ...s.logo, assetId: id } })))} />
              </label>
              {b.logo.assetId && <Button type="button" variant="ghost" size="sm" onClick={() => setB((s) => ({ ...s, logo: { ...s.logo, assetId: null } }))}>Remove logo</Button>}
              <p className="text-[11px] text-muted-foreground">PNG, JPG, WebP or GIF up to 2 MB. It is converted to PNG and kept private.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="lp">Logo position</Label>
              <select id="lp" className={field} value={b.logo.position} onChange={(e) => setB((s) => ({ ...s, logo: { ...s.logo, position: e.target.value as BrandSettings["logo"]["position"] } }))}>
                {LOGO_POSITIONS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label htmlFor="lw">Logo width (mm)</Label>
              <Input id="lw" type="number" min={BRAND_LIMITS.logoWidthMm.min} max={BRAND_LIMITS.logoWidthMm.max} value={b.logo.widthMm} onChange={(e) => setB((s) => ({ ...s, logo: { ...s.logo, widthMm: Number(e.target.value) } }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="ls">Letterhead printed on</Label>
              <select id="ls" className={field} value={b.letterhead} onChange={(e) => setB((s) => ({ ...s, letterhead: e.target.value as BrandSettings["letterhead"] }))}>
                {LETTERHEAD_SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select></div>
          </div>
          <div className="mt-5"><LinesEditor title="Header lines" hint="Printed under the logo. Values come from your company profile; a line with no value is left out." lines={b.headerLines} values={companyValues} onChange={(l) => setB((s) => ({ ...s, headerLines: l }))} /></div>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Footer</h2>
          <div className="mt-3 space-y-4">
            <LinesEditor title="Footer lines" hint="Printed above the page number." lines={b.footerLines} values={companyValues} onChange={(l) => setB((s) => ({ ...s, footerLines: l }))} />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={b.footer.showDocNumber} onChange={(e) => setB((s) => ({ ...s, footer: { ...s.footer, showDocNumber: e.target.checked } }))} />Document number</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={b.footer.showPageNumbers} onChange={(e) => setB((s) => ({ ...s, footer: { ...s.footer, showPageNumbers: e.target.checked } }))} />Page numbers</label>
              <label className="flex items-center gap-1.5">Align
                <select aria-label="Footer alignment" className={`${field} w-28`} value={b.footer.align} onChange={(e) => setB((s) => ({ ...s, footer: { ...s.footer, align: e.target.value as BrandSettings["footer"]["align"] } }))}>
                  <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
                </select></label>
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Page margins (A4)</h2>
          <p className="text-xs text-muted-foreground">Between {MARGIN_LIMITS.minMm} and {MARGIN_LIMITS.maxMm} mm. The header and footer areas must fit inside the top and bottom margins.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(["top", "right", "bottom", "left"] as const).map((k) => (
              <div key={k} className="space-y-1.5"><Label htmlFor={`m-${k}`}>{k[0].toUpperCase() + k.slice(1)} (mm)</Label>
                <Input id={`m-${k}`} type="number" min={MARGIN_LIMITS.minMm} max={MARGIN_LIMITS.maxMm} value={b.page.margins[k]} onChange={(e) => setMargin(k, e.target.value)} /></div>
            ))}
            <div className="space-y-1.5"><Label htmlFor="hz">Header area (mm)</Label><Input id="hz" type="number" min={0} max={40} value={b.page.headerHeightMm} onChange={(e) => setB((s) => ({ ...s, page: { ...s.page, headerHeightMm: Number(e.target.value) } }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="fz">Footer area (mm)</Label><Input id="fz" type="number" min={0} max={40} value={b.page.footerHeightMm} onChange={(e) => setB((s) => ({ ...s, page: { ...s.page, footerHeightMm: Number(e.target.value) } }))} /></div>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Watermark words</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="wd">Drafts</Label><Input id="wd" value={b.watermarks.draft} maxLength={BRAND_LIMITS.maxWatermark} onChange={(e) => setB((s) => ({ ...s, watermarks: { ...s.watermarks, draft: e.target.value } }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="wu">Documents not yet reviewed</Label><Input id="wu" value={b.watermarks.unreviewed} maxLength={BRAND_LIMITS.maxWatermark} onChange={(e) => setB((s) => ({ ...s, watermarks: { ...s.watermarks, unreviewed: e.target.value } }))} /></div>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Signatures and stamps</h2>
          <p className="text-xs text-muted-foreground">Images of authorised signatories and the company stamp, kept private. They are used only by the signing step in ContractFlow, never printed on a document here.</p>
          <div className="mt-3 space-y-3">
            {b.signatories.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 p-3">
                <select aria-label="Kind" className={`${field} w-28`} value={s.kind} onChange={(e) => setSig(s.id, { kind: e.target.value as "signature" | "stamp", assetId: null })}><option value="signature">Signature</option><option value="stamp">Stamp</option></select>
                <Input aria-label="Label" className="w-40" placeholder="Label, e.g. Director" value={s.label} maxLength={BRAND_LIMITS.maxLabel} onChange={(e) => setSig(s.id, { label: e.target.value })} />
                {s.kind === "signature" && <Input aria-label="Name" className="w-40" placeholder="Name" value={s.name} onChange={(e) => setSig(s.id, { name: e.target.value })} />}
                {s.kind === "signature" && <Input aria-label="Designation" className="w-40" placeholder="Designation" value={s.designation} onChange={(e) => setSig(s.id, { designation: e.target.value })} />}
                <div className="flex h-10 w-24 items-center justify-center rounded border border-dashed border-border bg-muted/30">
                  {s.assetId && thumbs[s.assetId] ? <img src={thumbs[s.assetId]} alt={s.label} className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted-foreground">No image</span>}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs hover:bg-muted">
                  {uploading === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}Upload
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => { setUploading(s.id); upload(s.kind, e.target.files?.[0], (id) => setSig(s.id, { assetId: id })).finally(() => setUploading(null)); }} />
                </label>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setB((x) => ({ ...x, signatories: x.signatories.filter((y) => y.id !== s.id) }))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            {b.signatories.length < BRAND_LIMITS.maxSignatures && (
              <Button type="button" variant="outline" size="sm" onClick={() => setB((x) => ({ ...x, signatories: [...x.signatories, { id: crypto.randomUUID(), kind: "signature", label: "", name: "", designation: "", assetId: null }] }))}><Plus className="mr-1 size-4" />Add a slot</Button>
            )}
          </div>
        </section>

        {errors.length > 0 && (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">The brand was not saved:</p>
            <ul className="mt-1 list-disc pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}Save brand</Button>
          <span className="text-xs text-muted-foreground">{updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString("en-IN")}` : "Not saved yet: documents use the neutral default look."}</span>
        </div>
      </div>

      <aside className="space-y-2 xl:sticky xl:top-2 xl:self-start">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Preview</h2>
          <select aria-label="Preview state" className={`${field} w-48`} value={state} onChange={(e) => setState(e.target.value as PreviewState)}>
            <option value="final">Final (no watermark)</option><option value="draft">Draft watermark</option><option value="unreviewed">Unreviewed watermark</option>
          </select>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-muted/30">
          {preview ? <iframe title="Brand preview" src={`${preview.url}#toolbar=0&navpanes=0`} className="h-[42rem] w-full" /> : <div className="flex h-[42rem] items-center justify-center text-sm text-muted-foreground">Drawing the preview...</div>}
          {drawing && <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs"><Loader2 className="size-3 animate-spin" />Updating</div>}
        </div>
        {previewError && <p className="text-xs text-destructive">{previewError}</p>}
        {preview?.warnings.map((w) => <p key={w} className="text-xs text-amber-600 dark:text-amber-400">{w}</p>)}
        <p className="text-[11px] text-muted-foreground">Drawn by the same engine that makes your PDFs, from your unsaved settings and your company profile. The Word version follows the same settings.</p>
      </aside>
    </div>
  );
}
