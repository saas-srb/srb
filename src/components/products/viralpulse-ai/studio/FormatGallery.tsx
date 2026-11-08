"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Chip } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import FormatIllustration from "@/components/products/viralpulse-ai/studio/FormatIllustration";
import { formatCards, ratioLabel, SOURCE_TAG_LABEL, type FormatCard, type SourceTag } from "@/lib/products/viralpulse-ai/images/wizard";
import { SPECS_VERIFIED_ON, specGroups, type ImageSpec } from "@/lib/products/viralpulse-ai/images/specs";
import type { TextPosition } from "@/lib/products/viralpulse-ai/images/types";
import { cn } from "@/lib/utils";

const TAG_TONE: Record<SourceTag, "ok" | "info" | "warn"> = { verified: "ok", partial: "info", recheck: "warn" };
const CARDS = formatCards();
const GROUPS = [...new Set(CARDS.flatMap((c) => c.platforms))];
const mb = (n: number | null) => (n ? `${Math.round(n / 1024 / 1024)} MB` : "not stated");

function Card({ c, selected, onOpen, onPick, textPosition }: { c: FormatCard; selected: boolean; onOpen: () => void; onPick: () => void; textPosition: TextPosition }) {
  return (
    <div className={cn("group flex flex-col gap-2 rounded-2xl border bg-card/70 p-3 transition-colors", selected ? "border-primary ring-1 ring-primary/40" : "border-border/50 hover:border-primary/40")}>
      <button type="button" onClick={onOpen} className="flex items-start gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40" aria-label={`${c.goal.label}: view details`}>
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/60 p-2">
          <FormatIllustration spec={c.lead} textPosition={textPosition} showText={c.goal.textLikely} className="max-h-20" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-tight font-semibold">{c.goal.label}</span>
          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{c.goal.description}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{c.ratio}</span><span className="tabular-nums">{`${c.lead.width}x${c.lead.height}`}</span></span>
        </span>
      </button>
      <div className="flex flex-wrap gap-1.5">
        {c.platforms.map((p) => <Chip key={p}>{p}</Chip>)}
        <Chip tone={TAG_TONE[c.tag]} title={`Sizes checked ${SPECS_VERIFIED_ON}`}>{SOURCE_TAG_LABEL[c.tag]}</Chip>
        {c.goal.slides && <Chip tone="info">{`${c.goal.slides.min}-${c.goal.slides.max} slides`}</Chip>}
      </div>
      <div className="mt-auto flex gap-2">
        <Button type="button" size="sm" variant={selected ? "default" : "outline"} className="flex-1" aria-pressed={selected} onClick={onPick}>{selected ? <><Check className="size-3.5" /> Selected</> : "Use this format"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onOpen} aria-label={`Details of ${c.goal.label}`}><Info className="size-3.5" /></Button>
      </div>
    </div>
  );
}

function Drawer({ card, selected, textPosition, onClose, onPick }: { card: FormatCard | null; selected: boolean; textPosition: TextPosition; onClose: () => void; onPick: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const spec: ImageSpec | null = card ? (card.specs.find((s) => s.key === key) ?? card.lead) : null;
  return (
    <Sheet open={!!card} onOpenChange={(o) => { if (!o) { onClose(); setKey(null); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {card && spec && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">{card.goal.label}<Chip tone={TAG_TONE[card.tag]}>{SOURCE_TAG_LABEL[card.tag]}</Chip></SheetTitle>
              <SheetDescription>{card.goal.description}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              {card.specs.length > 1 && (
                <div role="group" aria-label="Size" className="flex flex-wrap gap-1.5">
                  {card.specs.map((s) => <button key={s.key} type="button" aria-pressed={s.key === spec.key} onClick={() => setKey(s.key)} className={cn("rounded-full border px-3 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/40", s.key === spec.key ? "border-primary bg-primary text-primary-foreground" : "border-border/60 hover:bg-muted")}>{`${s.group}: ${s.label}`}</button>)}
                </div>
              )}
              <div className="mx-auto max-w-xs rounded-2xl border border-border/40 bg-background/60 p-3">
                <FormatIllustration spec={spec} textPosition={textPosition} showText={card.goal.textLikely} className="max-h-72" />
                <p className="mt-2 text-center text-[11px] text-muted-foreground">Layout guide, not a sample picture. Hatched edges are covered by the platform&apos;s own buttons; keep text inside the dashed box.</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><dt className="font-semibold">Size</dt><dd className="text-muted-foreground tabular-nums">{`${spec.width} x ${spec.height} px (${ratioLabel(spec.width, spec.height)})`}</dd></div>
                <div><dt className="font-semibold">File</dt><dd className="text-muted-foreground">{`${spec.formats.map((f) => f.toUpperCase()).join(" or ")}, up to ${mb(spec.maxBytes)}`}</dd></div>
                <div><dt className="font-semibold">Safe area</dt><dd className="text-muted-foreground tabular-nums">{`top ${Math.round(spec.safe.top * 100)}%, bottom ${Math.round(spec.safe.bottom * 100)}%, left ${Math.round(spec.safe.left * 100)}%, right ${Math.round(spec.safe.right * 100)}%`}</dd></div>
                <div><dt className="font-semibold">Used for</dt><dd className="text-muted-foreground">{card.platforms.join(", ")}</dd></div>
                {spec.note && <div className="col-span-2"><dt className="font-semibold">Placement note</dt><dd className="text-muted-foreground">{spec.note}</dd></div>}
              </dl>
              <section className="space-y-1 rounded-xl border border-border/40 bg-muted/30 p-3 text-xs">
                <p className="font-semibold">{`Source: ${spec.source.confidence === "official" ? "verified on the platform's own page" : spec.source.confidence === "partial" ? "partly verified" : "re-check before a paid campaign"}`}</p>
                {spec.source.note && <p className="text-muted-foreground">{spec.source.note}</p>}
                <p className="text-muted-foreground">{`Checked ${spec.source.verifiedOn}.`}</p>
                <a href={spec.source.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-primary underline">Open the platform page <ExternalLink className="size-3" /></a>
              </section>
              <Button type="button" className="w-full" onClick={() => { onPick(); onClose(); }}>{selected ? "Keep this format" : "Use this format"}</Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Output sizes: the goal's sizes are ticked; any other size can be added (up to 8). */
export function SizePicker({ value, onChange, error }: { value: string[]; onChange: (keys: string[]) => void; error?: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Output sizes</legend>
      <p className="text-xs text-muted-foreground">{`Each ticked size is cut from your chosen picture, with text and logo kept inside its safe area. Sizes checked ${SPECS_VERIFIED_ON}; hover a size for its source.`}</p>
      {error && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {specGroups().map((g) => (
          <div key={g.group} className="rounded-xl border border-border/50 bg-background/50 p-2">
            <p className="text-xs font-semibold">{g.group}</p>
            {g.specs.map((s) => (
              <label key={s.key} className="flex items-center gap-2 py-0.5 text-xs">
                <input type="checkbox" checked={value.includes(s.key)} onChange={(e) => onChange(e.target.checked ? [...value, s.key].slice(0, 8) : value.filter((k) => k !== s.key))} />
                <span className="flex-1">{s.label}</span>
                <span className="text-muted-foreground tabular-nums" title={`Source: ${s.source.url} (${s.source.confidence}, checked ${s.source.verifiedOn})`}>{`${s.width}x${s.height}`}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export default function FormatGallery({ goalId, onPick, textPosition, error }: { goalId: string; onPick: (goalId: string) => void; textPosition: TextPosition; error?: string }) {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [open, setOpen] = useState<FormatCard | null>(null);
  const shown = useMemo(() => CARDS.filter((c) => (!platform || c.platforms.includes(platform)) && (!q.trim() || `${c.goal.label} ${c.goal.description} ${c.platforms.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()))), [q, platform]);
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="grid gap-2 rounded-2xl border border-border/40 bg-background/50 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search formats" aria-label="Search formats" className="pl-8" />
        </div>
        <div role="group" aria-label="Platform" className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Platform</span>
          {["", ...GROUPS].map((p) => (
            <button key={p || "all"} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)} className={cn("rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40", platform === p ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-background hover:bg-muted")}>{p || "All"}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">{`${shown.length} of ${CARDS.length} formats`}</p>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-semibold">No format matches</p>
          <Button type="button" variant="outline" size="sm" onClick={() => { setQ(""); setPlatform(""); }}>Clear filters</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => <Card key={c.goal.id} c={c} selected={goalId === c.goal.id} textPosition={textPosition} onOpen={() => setOpen(c)} onPick={() => onPick(c.goal.id)} />)}
        </div>
      )}
      <Drawer card={open} selected={!!open && open.goal.id === goalId} textPosition={textPosition} onClose={() => setOpen(null)} onPick={() => open && onPick(open.goal.id)} />
    </div>
  );
}

