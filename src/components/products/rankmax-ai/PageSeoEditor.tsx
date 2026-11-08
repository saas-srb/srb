"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { savePageSeoAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { cn } from "@/lib/utils";

export interface EditorValues {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  focusKeyword: string;
  secondaryKeywords: string;
  notes: string;
}

/** What the page's own code currently outputs (from the last crawl) — shown as placeholders so overrides are deliberate. */
export interface LiveValues {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
}

function Counter({ value, min, max }: { value: string; min: number; max: number }) {
  const n = value.length;
  const cls = n === 0 ? "text-muted-foreground" : n > max || n < min ? "text-amber-600" : "text-emerald-600";
  return <span className={cn("text-[11px] tabular-nums", cls)}>{n} / {min}–{max}</span>;
}

function Field({ id, label, children, hint, right }: { id: string; label: string; children: React.ReactNode; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {right}
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function PageSeoEditor({
  pageId,
  path,
  siteUrl,
  initial,
  live,
  limits,
  canEdit,
}: {
  pageId: string;
  path: string;
  siteUrl: string;
  initial: EditorValues;
  live: LiveValues;
  limits: { titleMin: number; titleMax: number; descriptionMin: number; descriptionMax: number };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<EditorValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof EditorValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const effTitle = v.title || live.title;
  const effDesc = v.description || live.description;
  const effOgTitle = v.ogTitle || v.title || live.ogTitle || effTitle;
  const effOgDesc = v.ogDescription || v.description || live.ogDescription || effDesc;
  const effOgImage = v.ogImage || live.ogImage;
  const displayUrl = `${siteUrl.replace(/^https?:\/\//, "")}${path === "/" ? "" : path.split("/").join(" › ")}`;

  function save(values: EditorValues) {
    setError(null);
    startTransition(async () => {
      const res = await savePageSeoAction(pageId, { ...values });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Saved — the live page updates on its next request");
      router.refresh();
    });
  }

  const overrideKeys: (keyof EditorValues)[] = ["title", "description", "canonical", "robots", "keywords", "ogTitle", "ogDescription", "ogImage", "twitterTitle", "twitterDescription", "twitterImage"];
  const hasOverride = overrideKeys.some((k) => initial[k]);

  return (
    <form
      className="grid gap-4 xl:grid-cols-[1fr_380px]"
      onSubmit={(e) => {
        e.preventDefault();
        save(v);
      }}
    >
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4 space-y-3">
          <p className="text-sm font-bold">Search appearance</p>
          <Field id="seo-title" label="SEO title" right={<Counter value={effTitle} min={limits.titleMin} max={limits.titleMax} />} hint="Leave empty to keep the title defined in the page's code (shown greyed).">
            <Input id="seo-title" value={v.title} onChange={set("title")} placeholder={live.title} maxLength={120} />
          </Field>
          <Field id="seo-desc" label="Meta description" right={<Counter value={effDesc} min={limits.descriptionMin} max={limits.descriptionMax} />}>
            <Textarea id="seo-desc" rows={3} value={v.description} onChange={set("description")} placeholder={live.description} maxLength={320} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="seo-canonical" label="Canonical URL" hint="Absolute URL or site path.">
              <Input id="seo-canonical" value={v.canonical} onChange={set("canonical")} placeholder={live.canonical || path} />
            </Field>
            <Field id="seo-robots" label="Robots directives" hint={live.robots ? `Code: ${live.robots}` : "Code: index, follow"}>
              <OptionSelect
                id="seo-robots"
                value={v.robots}
                onChange={(x) => setV((s) => ({ ...s, robots: x }))}
                noneLabel="Use page default"
                options={[
                  { value: "index,follow", label: "index, follow" },
                  { value: "noindex,follow", label: "noindex, follow" },
                  { value: "index,nofollow", label: "index, nofollow" },
                  { value: "noindex,nofollow", label: "noindex, nofollow" },
                ]}
              />
            </Field>
          </div>
          <Field id="seo-kw" label="Meta keywords" hint="Comma-separated. Ignored by Google; kept for other engines and internal reference.">
            <Input id="seo-kw" value={v.keywords} onChange={set("keywords")} />
          </Field>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/90 p-4 space-y-3">
          <p className="text-sm font-bold">Focus keywords</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="seo-focus" label="Focus keyword" hint="Checked by every audit: title, H1, description and URL.">
              <Input id="seo-focus" value={v.focusKeyword} onChange={set("focusKeyword")} maxLength={120} />
            </Field>
            <Field id="seo-secondary" label="Secondary keywords" hint="Comma-separated; used by Content SEO coverage.">
              <Input id="seo-secondary" value={v.secondaryKeywords} onChange={set("secondaryKeywords")} />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/90 p-4 space-y-3">
          <p className="text-sm font-bold">Open Graph & Twitter</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="og-title" label="OG title"><Input id="og-title" value={v.ogTitle} onChange={set("ogTitle")} placeholder={live.ogTitle || effTitle} maxLength={120} /></Field>
            <Field id="og-image" label="OG image URL"><Input id="og-image" value={v.ogImage} onChange={set("ogImage")} placeholder={live.ogImage} /></Field>
          </div>
          <Field id="og-desc" label="OG description"><Textarea id="og-desc" rows={2} value={v.ogDescription} onChange={set("ogDescription")} placeholder={live.ogDescription || effDesc} maxLength={320} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="tw-title" label="Twitter title"><Input id="tw-title" value={v.twitterTitle} onChange={set("twitterTitle")} placeholder={live.twitterTitle || effOgTitle} maxLength={120} /></Field>
            <Field id="tw-image" label="Twitter image URL"><Input id="tw-image" value={v.twitterImage} onChange={set("twitterImage")} placeholder={live.twitterImage || effOgImage} /></Field>
          </div>
          <Field id="tw-desc" label="Twitter description"><Textarea id="tw-desc" rows={2} value={v.twitterDescription} onChange={set("twitterDescription")} placeholder={live.twitterDescription || effOgDesc} maxLength={320} /></Field>
        </div>

        <Field id="seo-notes" label="Internal notes"><Textarea id="seo-notes" rows={2} value={v.notes} onChange={set("notes")} /></Field>

        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit">{pending ? <Loader2 className="size-4 animate-spin" /> : "Save & publish"}</Button>
            {hasOverride && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const cleared = { ...v, ...Object.fromEntries(overrideKeys.map((k) => [k, ""])) } as EditorValues;
                  setV(cleared);
                  save(cleared);
                }}
              >
                <RotateCcw className="size-3.5" data-icon="inline-start" />
                Revert to code defaults
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">You can view but not change live metadata (needs “Manage on-page SEO”).</p>
        )}
      </fieldset>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Google result preview</p>
          <div className="rounded-xl bg-white p-3 text-left dark:bg-zinc-900">
            <p className="truncate text-xs text-[#202124] dark:text-zinc-300">{displayUrl}</p>
            <p className="mt-0.5 line-clamp-1 text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{effTitle.length > 62 ? `${effTitle.slice(0, 60)}…` : effTitle || "(no title)"}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-[#4d5156] dark:text-zinc-400">{effDesc.length > 160 ? `${effDesc.slice(0, 157)}…` : effDesc || "Google will generate a snippet from the page text."}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/90 p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Social share preview</p>
          <div className="overflow-hidden rounded-xl border border-border/60">
            {effOgImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={effOgImage.startsWith("/") ? `${siteUrl}${effOgImage}` : effOgImage} alt="" className="aspect-[1.91/1] w-full bg-muted object-cover" />
            ) : (
              <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted text-xs text-muted-foreground">No og:image</div>
            )}
            <div className="space-y-0.5 p-3">
              <p className="text-[11px] text-muted-foreground uppercase">{siteUrl.replace(/^https?:\/\//, "")}</p>
              <p className="line-clamp-2 text-sm font-semibold">{effOgTitle}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{effOgDesc}</p>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
