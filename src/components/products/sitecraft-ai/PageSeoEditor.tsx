"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { PAGE_FRAMES, type PageSeo, type PageJsonLd, type PageFrame } from "@/lib/products/sitecraft-ai/page-seo";
import { saveSeoAction } from "@/app/(products)/sitecraft-ai/(protected)/pages/[id]/actions";

const TEXT_FIELDS: { key: Exclude<keyof PageSeo, "keywords" | "robots">; label: string; multiline?: boolean; help?: string }[] = [
  { key: "title", label: "SEO title" },
  { key: "description", label: "Meta description", multiline: true },
  { key: "canonical", label: "Canonical URL / path", help: "Leave empty for no canonical tag." },
  { key: "image", label: "Social share image URL", help: "Leave empty for no Open Graph / Twitter tags." },
  { key: "imageAlt", label: "Share image alt text", help: "Empty = the SEO title." },
  { key: "socialTitle", label: "Social title", help: "Empty = the SEO title." },
  { key: "socialDescription", label: "Social description", multiline: true, help: "Empty = the meta description." },
];

/**
 * The page's SEO + structured data + frame, edited next to its sections. Saves to
 * the draft; the page builder's Publish publishes it together with the sections.
 * The SEO product's per-page overrides (/seo) still apply on top.
 */
export default function PageSeoEditor({
  pageId,
  initialSeo,
  initialJsonLd,
  initialFrame,
  canEdit,
}: {
  pageId: string;
  initialSeo: PageSeo | null;
  initialJsonLd: PageJsonLd[];
  initialFrame: PageFrame;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [seo, setSeo] = useState<PageSeo>(initialSeo ?? { title: "", description: "" });
  const [keywords, setKeywords] = useState((initialSeo?.keywords ?? []).join("\n"));
  const [jsonLd, setJsonLd] = useState(JSON.stringify(initialJsonLd, null, 2));
  const [frame, setFrame] = useState<PageFrame>(initialFrame);
  const [pending, startTransition] = useTransition();
  const initialKeywords = (initialSeo?.keywords ?? []).join("\n");
  const initialJsonLdText = JSON.stringify(initialJsonLd, null, 2);
  const edited =
    JSON.stringify(seo) !== JSON.stringify(initialSeo ?? { title: "", description: "" }) || keywords !== initialKeywords || jsonLd !== initialJsonLdText || frame !== initialFrame;
  const discard = () => {
    setSeo(initialSeo ?? { title: "", description: "" });
    setKeywords(initialKeywords);
    setJsonLd(initialJsonLdText);
    setFrame(initialFrame);
  };

  const save = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonLd || "[]");
    } catch {
      toast.error("Structured data isn't valid JSON.");
      return;
    }
    startTransition(async () => {
      const res = await saveSeoAction(pageId, {
        seo: { ...seo, keywords: keywords.split("\n").map((k) => k.trim()).filter(Boolean) },
        jsonLd: parsed,
        frame,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("SEO saved to the draft — publish the page to make it live");
      router.refresh();
    });
  };

  return (
    <div id="seo" className="scroll-mt-4 pb-6">
      <GlassCard className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">SEO &amp; structured data</h2>
          <p className="text-xs text-muted-foreground">Saved to the draft; published with the page. Overrides set in the SEO product still take priority.</p>
        </div>
        {TEXT_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`seo-${f.key}`}>{f.label}</Label>
            {f.multiline ? (
              <Textarea id={`seo-${f.key}`} rows={2} value={seo[f.key] ?? ""} disabled={!canEdit} onChange={(e) => setSeo((s) => ({ ...s, [f.key]: e.target.value }))} />
            ) : (
              <Input id={`seo-${f.key}`} value={seo[f.key] ?? ""} disabled={!canEdit} onChange={(e) => setSeo((s) => ({ ...s, [f.key]: e.target.value }))} />
            )}
            {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="seo-keywords">Keywords (one per line)</Label>
          <Textarea id="seo-keywords" rows={3} value={keywords} disabled={!canEdit} onChange={(e) => setKeywords(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={seo.robots ? seo.robots.index : true} disabled={!canEdit} onCheckedChange={(v) => setSeo((s) => ({ ...s, robots: { index: v === true, follow: s.robots?.follow ?? true } }))} />
            Allow search engines to index
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={seo.robots ? seo.robots.follow : true} disabled={!canEdit} onCheckedChange={(v) => setSeo((s) => ({ ...s, robots: { index: s.robots?.index ?? true, follow: v === true } }))} />
            Follow links
          </label>
          <label className="flex items-center gap-2 text-sm">
            Page frame
            <select className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={frame} disabled={!canEdit} onChange={(e) => setFrame(e.target.value as PageFrame)}>
              {PAGE_FRAMES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seo-jsonld">Structured data (JSON-LD array)</Label>
          <Textarea id="seo-jsonld" rows={10} className="font-mono text-xs" value={jsonLd} disabled={!canEdit} onChange={(e) => setJsonLd(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Entries like {"{ \"$generate\": \"job-posting\", … }"} are filled from the live record when the page renders.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={pending || !edited}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save SEO
            </Button>
            {edited && (
              <Button variant="outline" onClick={discard} disabled={pending}>
                <Undo2 className="size-3.5" /> Discard edits
              </Button>
            )}
            {edited && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved SEO edits</span>}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
