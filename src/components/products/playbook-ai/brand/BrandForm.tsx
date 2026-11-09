"use client";

/* eslint-disable @next/next/no-img-element -- these are small private data-URI previews, not remote images next/image could optimise */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import WizardFrame, { type FrameStep } from "@/components/products/viralpulse-ai/shared/WizardFrame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND_PRESETS, STATUTORY_IDS, applyPreset } from "@/lib/products/playbook-ai/brand/presets";
import { DEFAULT_BRAND, PAGE_FORMATS, FONT_PAIRS, LOGO_POSITIONS, BRAND_LIMITS, type BrandLine, type BrandSettings, type BrandSignatory } from "@/lib/products/playbook-ai/brand/types";
import { IDENTITY_TOGGLES } from "@/lib/products/playbook-ai/brand/identity";
import { MARGIN_LIMITS } from "@/lib/products/playbook-ai/doc/page";
import { BRAND_PREVIEW_ITEMS, DEFAULT_PREVIEW_ITEM } from "@/lib/products/playbook-ai/brand/preview-items";
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
      <div><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{hint} Text you type is printed exactly as written, so check it before saving; browsers sometimes fill these boxes automatically.</p></div>
      {lines.map((l, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select aria-label={`${title} line ${i + 1} value`} className={`${field} w-44`} value={l.key ?? ""} onChange={(e) => set(i, { key: e.target.value || null })}>
            <option value="">Fixed text only</option>
            {COMPANY_KEYS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
          <Input autoComplete="off" aria-label={`${title} line ${i + 1} text`} className="w-52" placeholder={l.key ? "Text before the value, e.g. CIN: " : "Your own text"} value={l.text} maxLength={BRAND_LIMITS.maxLineText} onChange={(e) => set(i, { text: e.target.value })} />
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
  const resetToDefault = () => setB((s) => ({ ...applyPreset(s, DEFAULT_BRAND.preset), page: DEFAULT_BRAND.page, watermarks: DEFAULT_BRAND.watermarks, logo: { ...s.logo, widthMm: DEFAULT_BRAND.logo.widthMm } }));
  const hasId = (key: string) => b.footerLines.some((l) => l.key === key);
  const toggleId = (key: string, label: string, on: boolean) => setB((s) => ({ ...s, footerLines: on ? (s.footerLines.length < BRAND_LIMITS.maxLines ? [...s.footerLines, { key, text: `${label}: `, bold: false }] : s.footerLines) : s.footerLines.filter((l) => l.key !== key) }));
  const [thumbs, setThumbs] = useState<Record<string, string>>(initialThumbs);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, startSave] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [state, setState] = useState<PreviewState>("final");
  const [itemId, setItemId] = useState<string>(DEFAULT_PREVIEW_ITEM);
  const [preview, setPreview] = useState<{ url: string; pages: number; warnings: string[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [step, setStep] = useState(1);
  const [reached, setReached] = useState(1);
  const seq = useRef(0);
  const urlRef = useRef<string | null>(null);

  // Live preview: the real renderer draws the chosen library document a moment after the last change.
  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setDrawing(true);
      const r = await previewBrandAction(b, state, itemId).catch(() => ({ ok: false as const, error: "The preview could not be drawn." }));
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
  }, [b, state, itemId]);
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

  const BRAND_STEPS: FrameStep[] = [{ key: "identity", n: 1, label: "Identity" }, { key: "colours", n: 2, label: "Colours and fonts" }, { key: "letterhead", n: 3, label: "Header, footer and letterhead" }, { key: "preview", n: 4, label: "Preview and save" }];
  const TITLES = ["Identity", "Colours and fonts", "Header, footer and letterhead", "Preview and save"];

  return (
    <WizardFrame
      steps={BRAND_STEPS}
      step={step}
      reached={reached}
      busy={saving}
      onGoTo={(n) => { if (n <= reached) setStep(n); }}
      navLabel="Brand steps"
      title={TITLES[step - 1]}
      subtitle={updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString("en-IN")}` : "Not saved yet: documents use the neutral default look."}
      backDisabled={step === 1}
      onBack={() => setStep((n) => Math.max(1, n - 1))}
      actions={step < 4 ? <Button type="button" onClick={() => { setStep((n) => n + 1); setReached((r) => Math.max(r, step + 1)); }}>Next</Button> : <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}Save brand</Button>}
    >
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <div className="space-y-4">
        {step === 1 && (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-semibold">Letterhead style</h2><p className="text-xs text-muted-foreground">Pick a ready-made style. Your company name, address and registration numbers are filled in from your company profile; anything you have not saved there is simply left out. Everything below can still be changed.</p></div>
            <Button type="button" variant="outline" size="sm" onClick={resetToDefault}>Reset to default</Button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Letterhead style">
            {BRAND_PRESETS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={b.preset === p.id} onClick={() => setB((s) => applyPreset(s, p.id))} className={`rounded-xl border p-3 text-left transition-colors ${b.preset === p.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/60 hover:bg-muted/50"}`}>
                <span className="mb-1.5 flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ backgroundColor: p.patch.colors.primary }} /><span className="size-3 rounded-full" style={{ backgroundColor: p.patch.colors.secondary }} /><span className="text-sm font-semibold">{p.label}</span>{b.preset === p.id && <span className="ml-auto text-[10px] font-semibold text-primary">Selected</span>}</span>
                <span className="block text-xs text-muted-foreground">{p.description}</span>
              </button>
            ))}
          </div>
        </section>
        )}
        {step === 1 && (
        <section className={card}>
          <h2 className="font-semibold">Logo</h2>
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="lp">Logo position</Label>
              <select id="lp" className={field} value={b.logo.position} onChange={(e) => setB((s) => ({ ...s, logo: { ...s.logo, position: e.target.value as BrandSettings["logo"]["position"] } }))}>
                {LOGO_POSITIONS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label htmlFor="lw">Logo width (mm)</Label>
              <Input id="lw" type="number" min={BRAND_LIMITS.logoWidthMm.min} max={BRAND_LIMITS.logoWidthMm.max} value={b.logo.widthMm} onChange={(e) => setB((s) => ({ ...s, logo: { ...s.logo, widthMm: Number(e.target.value) } }))} /></div>
          </div>
        </section>
        )}
        {step === 1 && (
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
        )}
        {step === 2 && (
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
        )}
        {step === 3 && (
        <section className={card}>
          <h2 className="font-semibold">Company details on the first page</h2>
          <fieldset className="mt-3 space-y-2 rounded-lg border border-border/60 p-3">
            <legend className="px-1 text-sm font-medium">Block above the title on page 1</legend>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={b.identity.show} onChange={(e) => setB((s) => ({ ...s, identity: { ...s.identity, show: e.target.checked } }))} />Show a company details block above the title on page 1</label>
            <p className="text-[11px] text-muted-foreground">Printed once in the document, in the PDF, the Word file and the editor. Documents have no running header; the footer (page numbers) stays on every page. A detail your company profile does not have is left out. The block follows the logo position (left, centre or right).</p>
            {b.identity.show && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-5 sm:grid-cols-4">
                {IDENTITY_TOGGLES.map((t) => (
                  <label key={t.key} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={b.identity[t.key]} onChange={(e) => setB((s) => ({ ...s, identity: { ...s.identity, [t.key]: e.target.checked } }))} />{t.label}</label>
                ))}
              </div>
            )}
          </fieldset>
        </section>
        )}
        {step === 3 && (
        <section className={card}>
          <h2 className="font-semibold">Footer</h2>
          <div className="mt-3 space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-semibold">Registration numbers in the footer</legend>
              <div className="flex flex-wrap gap-4 text-sm">{STATUTORY_IDS.map((x) => <label key={x.key} className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={hasId(x.key)} onChange={(e) => toggleId(x.key, x.label, e.target.checked)} />{x.label}{companyValues[x.key] ? "" : " (not in your profile: left out)"}</label>)}</div>
            </fieldset>
            <LinesEditor title="Footer lines" hint="Printed above the page number." lines={b.footerLines} values={companyValues} onChange={(l) => setB((s) => ({ ...s, footerLines: l }))} />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={b.footer.showDocNumber} onChange={(e) => setB((s) => ({ ...s, footer: { ...s.footer, showDocNumber: e.target.checked } }))} />Document number</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={b.footer.showPageNumbers} onChange={(e) => setB((s) => ({ ...s, footer: { ...s.footer, showPageNumbers: e.target.checked } }))} />Page numbers</label>
              <label className="flex items-center gap-1.5">Format
                <select aria-label="Page number format" className={`${field} w-32`} value={b.footer.pageFormat} onChange={(e) => setB((s) => ({ ...s, footer: { ...s.footer, pageFormat: e.target.value as BrandSettings["footer"]["pageFormat"] } }))}>{PAGE_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={b.footer.confidential} onChange={(e) => setB((s) => ({ ...s, footer: { ...s.footer, confidential: e.target.checked } }))} />&ldquo;Confidential&rdquo; line</label>
              <label className="flex items-center gap-1.5">Align
                <select aria-label="Footer alignment" className={`${field} w-28`} value={b.footer.align} onChange={(e) => setB((s) => ({ ...s, footer: { ...s.footer, align: e.target.value as BrandSettings["footer"]["align"] } }))}>
                  <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
                </select></label>
            </div>
          </div>
        </section>
        )}
        {step === 3 && (
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
        )}
        {step === 3 && (
        <section className={card}>
          <h2 className="font-semibold">Watermark words</h2>
          <p className="text-xs text-muted-foreground">Printed diagonally on drafts and on documents not yet reviewed. Leave them as they are unless your company uses other words; text you type is used exactly as written.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="wd">Drafts</Label><Input id="wd" autoComplete="off" value={b.watermarks.draft} maxLength={BRAND_LIMITS.maxWatermark} onChange={(e) => setB((s) => ({ ...s, watermarks: { ...s.watermarks, draft: e.target.value } }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="wu">Documents not yet reviewed</Label><Input id="wu" autoComplete="off" value={b.watermarks.unreviewed} maxLength={BRAND_LIMITS.maxWatermark} onChange={(e) => setB((s) => ({ ...s, watermarks: { ...s.watermarks, unreviewed: e.target.value } }))} /></div>
          </div>
        </section>
        )}
        {step === 4 && (
        <section className={card}>
          <h2 className="font-semibold">Check and save</h2>
          <p className="mt-1 text-sm text-muted-foreground">The preview on the right is drawn by the same engine that makes your PDFs. Save to use this look on every document, SOP and KPI sheet.</p>
          <p className="mt-2 text-xs text-muted-foreground">The company name, address and registration numbers come from your company profile and are not edited here.</p>
        </section>
        )}
        {errors.length > 0 && (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">The brand was not saved:</p>
            <ul className="mt-1 list-disc pl-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
      </div>

      <aside className="space-y-2 xl:sticky xl:top-2 xl:self-start">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Preview</h2>
          <select aria-label="Preview state" className={`${field} w-48`} value={state} onChange={(e) => setState(e.target.value as PreviewState)}>
            <option value="final">No watermark</option><option value="draft">Watermark: {b.watermarks.draft}</option><option value="unreviewed">Watermark: {b.watermarks.unreviewed}</option>
          </select>
        </div>
        <label className="block text-xs text-muted-foreground">Preview with
          <select aria-label="Document to preview with" className={`${field} mt-1`} value={itemId} onChange={(e) => setItemId(e.target.value)}>{BRAND_PREVIEW_ITEMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        <div className="relative overflow-hidden rounded-xl border border-border/50 bg-muted/30">
          {preview ? <iframe title="Brand preview" src={`${preview.url}#toolbar=0&navpanes=0`} className="h-[42rem] w-full" /> : <div className="flex h-[42rem] items-center justify-center text-sm text-muted-foreground">Drawing the preview...</div>}
          {drawing && <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs"><Loader2 className="size-3 animate-spin" />Updating</div>}
        </div>
        {previewError && <p className="text-xs text-destructive">{previewError}</p>}
        {preview?.warnings.map((w) => <p key={w} className="text-xs text-amber-600 dark:text-amber-400">{w}</p>)}
        <p className="text-[11px] text-muted-foreground">A real library document drawn by the same engine that makes your PDFs, with your unsaved settings, your company profile, today&apos;s date and a number from your numbering settings. Anything not filled in yet shows as a highlighted blank. Use the PDF viewer&apos;s page controls to see every page.</p>
      </aside>
    </div>
    </WizardFrame>
  );
}