"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { CustomScript, ScriptPlacement, TrackingSettings, VerificationMeta } from "@/lib/products/sitecraft-ai/tracking-shared";
import { saveTrackingAction } from "@/app/(products)/sitecraft-ai/(protected)/settings/actions";

/** An unlimited list of single values (IDs, tokens): add as many as you need. */
function StringList({ label, help, values, placeholder, onChange }: { label: string; help: string; values: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{help}</p>
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label={`${label} ${i + 1}`} value={v} placeholder={placeholder} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(values.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}><Plus className="size-3.5" /> Add</Button>
    </div>
  );
}

const PLACEMENTS: { key: ScriptPlacement; label: string }[] = [
  { key: "head", label: "Early (header)" },
  { key: "body-start", label: "Start of page" },
  { key: "body-end", label: "End of page (after everything else)" },
];

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** CMS → Settings: the company's own analytics, scripts and search-engine verification — as many of each as it needs. */
export default function TrackingEditor({ initial }: { initial: TrackingSettings }) {
  const [t, setT] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof TrackingSettings>(k: K, v: TrackingSettings[K]) => setT((s) => ({ ...s, [k]: v }));
  const setScript = (id: string, patch: Partial<CustomScript>) => set("scripts", t.scripts.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setMeta = (i: number, patch: Partial<VerificationMeta>) => set("verificationMeta", t.verificationMeta.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const save = () =>
    startTransition(async () => {
      const res = await saveTrackingAction(t);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setT(res.saved);
      toast.success("Saved — live on your website");
    });

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-5 p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Analytics &amp; tracking</h2>
          <p className="mt-1 text-xs text-muted-foreground">Added to your public website only (never inside the workspace). Add as many IDs of each kind as you like; empty rows are dropped when you save.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <StringList label="Google Analytics 4 IDs" help="Measurement IDs from Analytics → Admin → Data streams." placeholder="G-XXXXXXXXXX" values={t.ga4Ids} onChange={(v) => set("ga4Ids", v)} />
          <StringList label="Google Tag Manager containers" help="Container IDs (GTM-…)." placeholder="GTM-XXXXXXX" values={t.gtmIds} onChange={(v) => set("gtmIds", v)} />
          <StringList label="Microsoft Clarity projects" help="Project IDs from Clarity → Settings." placeholder="abc123xyz9" values={t.clarityIds} onChange={(v) => set("clarityIds", v)} />
          <StringList label="Meta (Facebook) Pixels" help="Pixel IDs from Events Manager." placeholder="1234567890123456" values={t.metaPixelIds} onChange={(v) => set("metaPixelIds", v)} />
        </div>
        <div className="space-y-1.5 sm:max-w-md">
          <Label htmlFor="trk-tawk">Tawk.to live chat — widget ID</Label>
          <Input id="trk-tawk" value={t.tawkId} placeholder="propertyId/widgetId" onChange={(e) => set("tawkId", e.target.value.trim())} />
          <p className="text-xs text-muted-foreground">From your Tawk.to embed code (the part after embed.tawk.to/). Turns on the Live chat buttons. For any other chat tool, add its code as a custom script below.</p>
        </div>
      </GlassCard>

      <GlassCard className="space-y-5 p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Custom scripts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Any number of tracking, chat, ad or marketing snippets. Paste each one exactly as the provider gives it, <code>&lt;script&gt;</code> tags included
            (<code>&lt;noscript&gt;</code> pixels, <code>&lt;img&gt;</code> beacons and other markup work too). Each runs on every page of your public website, so add only code you trust.
          </p>
        </div>
        {t.scripts.map((s) => (
          <div key={s.id} className="space-y-2 rounded-xl border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Script name" className="min-w-0 flex-1" value={s.name} placeholder="Name — e.g. Hotjar, LinkedIn Insight Tag" onChange={(e) => setScript(s.id, { name: e.target.value })} />
              <select aria-label={`Placement for ${s.name || "script"}`} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" value={s.placement} onChange={(e) => setScript(s.id, { placement: e.target.value as ScriptPlacement })}>
                {PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={s.enabled} onChange={(e) => setScript(s.id, { enabled: e.target.checked })} /> On
              </label>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${s.name || "script"}`} onClick={() => set("scripts", t.scripts.filter((x) => x.id !== s.id))}><Trash2 className="size-3.5" /></Button>
            </div>
            <Textarea aria-label={`Code for ${s.name || "script"}`} rows={5} className="font-mono text-xs" value={s.code} placeholder="<script>…</script>" onChange={(e) => setScript(s.id, { code: e.target.value })} />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set("scripts", [...t.scripts, { id: newId(), name: "", placement: "head", enabled: true, code: "" }])}><Plus className="size-3.5" /> Add script</Button>
      </GlassCard>

      <GlassCard className="space-y-5 p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Search Console &amp; site verification</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Add your domain to Google Search Console, Bing Webmaster Tools or any other service, and verify it whichever way they offer — add as many of each as you need:
            the <strong>HTML tag</strong> (tokens below), an <strong>HTML / text file</strong> served from your site root, any other <strong>meta tag</strong>, or a
            <strong> DNS TXT record</strong> (added at your domain&apos;s DNS provider — nothing to enter here). To pull Search Console data into the SEO product, set the property in
            {" "}<Link href="/rankmax-ai/settings" className="text-primary hover:underline">SEO → Settings → Integrations</Link>.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <StringList label="Google — HTML tag tokens" help="One per Search Console property. A whole pasted <meta> tag is fine." placeholder="Token" values={t.googleSiteVerification} onChange={(v) => set("googleSiteVerification", v)} />
          <StringList label="Bing — msvalidate.01 tokens" help="From Bing Webmaster Tools." placeholder="Token" values={t.bingVerification} onChange={(v) => set("bingVerification", v)} />
        </div>

        <div className="space-y-2">
          <Label>Verification &amp; root files</Label>
          <p className="text-xs text-muted-foreground">Any file name with an .html, .xml, .txt, .json, .js or .csv extension — served at <code>/&lt;name&gt;</code> (for example <code>google1a2b3c.html</code>, <code>BingSiteAuth.xml</code>, <code>ads.txt</code>). Paste its contents exactly.</p>
          {t.verificationFiles.map((f, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border/60 p-3">
              <div className="flex gap-2">
                <Input aria-label={`File ${i + 1} name`} value={f.name} placeholder="google1a2b3c4d5e6f.html" onChange={(e) => set("verificationFiles", t.verificationFiles.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() } : x)))} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove file ${i + 1}`} onClick={() => set("verificationFiles", t.verificationFiles.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
              </div>
              <Textarea aria-label={`File ${i + 1} contents`} rows={2} className="font-mono text-xs" value={f.content} placeholder="google-site-verification: google1a2b3c4d5e6f.html" onChange={(e) => set("verificationFiles", t.verificationFiles.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set("verificationFiles", [...t.verificationFiles, { name: "", content: "" }])}><Plus className="size-3.5" /> Add file</Button>
        </div>

        <div className="space-y-2">
          <Label>Other verification meta tags</Label>
          <p className="text-xs text-muted-foreground">Pinterest, Facebook domain verification, Yandex, Naver … — <code>name</code>, <code>property</code> or <code>http-equiv</code> tags.</p>
          {t.verificationMeta.map((m, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <select aria-label={`Meta tag ${i + 1} attribute`} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm" value={m.attr} onChange={(e) => setMeta(i, { attr: e.target.value as VerificationMeta["attr"] })}>
                <option value="name">name</option>
                <option value="property">property</option>
                <option value="http-equiv">http-equiv</option>
              </select>
              <Input aria-label={`Meta tag ${i + 1} name`} className="w-56" value={m.name} placeholder="facebook-domain-verification" onChange={(e) => setMeta(i, { name: e.target.value.trim() })} />
              <Input aria-label={`Meta tag ${i + 1} content`} className="min-w-0 flex-1" value={m.content} placeholder="content" onChange={(e) => setMeta(i, { content: e.target.value })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove meta tag ${i + 1}`} onClick={() => set("verificationMeta", t.verificationMeta.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set("verificationMeta", [...t.verificationMeta, { attr: "name", name: "", content: "" }])}><Plus className="size-3.5" /> Add meta tag</Button>
        </div>
      </GlassCard>

      <Button onClick={save} disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save tracking &amp; verification
      </Button>
    </div>
  );
}
