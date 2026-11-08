"use client";

import { useEffect, useState, type Dispatch, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { countChars, normalizeHashtags, objectiveLabel, type WizardAction, type WizardState } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import type { WizardInit } from "@/lib/products/viralpulse-ai/post-wizard/server";
import type { FieldKey } from "@/lib/products/viralpulse-ai/ai-field/registry";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import { cn } from "@/lib/utils";

export interface StepProps {
  init: WizardInit;
  s: WizardState;
  dispatch: Dispatch<WizardAction>;
  /** Errors of this step (only shown once the person tried to go on, or per field once touched). */
  errors: Record<string, string>;
  showErrors: boolean;
  /** The post can't be edited (published, archived, or no permission). */
  locked: boolean;
  /** Makes AiField props for a field: context from the whole wizard state, AI disabled when the person or workspace can't use it. */
  ai: (fieldKey: FieldKey, extra?: Record<string, unknown>) => { fieldKey: FieldKey; getContext: () => Record<string, unknown>; aiDisabled: boolean; aiDisabledReason: string };
  /** Every file the wizard knows about, by id. */
  cards: Record<string, MediaCard>;
  setCards: (items: MediaCard[]) => void;
  /** Makes sure the post exists on the server (needed by the AI draft, thumbnails of saved posts, the plan). */
  ensureSaved: () => Promise<string | null>;
}

export function aiContext(init: WizardInit, s: WizardState, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    topic: s.topic, objective: s.objective ? objectiveLabel(s.objective) : "", serviceProduct: s.serviceProduct, audience: s.audience, tone: s.tone, language: s.language,
    keyMessage: s.keyMessage, offerText: s.offerText, cta: s.cta, notes: s.notes, link: s.link, platforms: s.platforms, contentType: s.platforms.some((p) => s.contentTypes[p] === "reel" || s.contentTypes[p] === "video" || s.contentTypes[p] === "short") ? "video" : "image",
    campaign: init.campaigns.find((c) => c._id === s.campaignId)?.name ?? "", offerId: s.offerId, clientId: s.clientId, ...extra,
  };
}

export function FieldError({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return <p id={id} role="alert" className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{children}</p>;
}

export function Callout({ tone = "info", children, className }: { tone?: "info" | "warn" | "bad" | "ok"; children: ReactNode; className?: string }) {
  const m = {
    info: ["border-sky-500/30 bg-sky-500/5 text-sky-900 dark:text-sky-200", <Info key="i" className="size-3.5 shrink-0" aria-hidden />],
    warn: ["border-amber-500/40 bg-amber-500/8 text-amber-900 dark:text-amber-200", <AlertTriangle key="w" className="size-3.5 shrink-0" aria-hidden />],
    bad: ["border-rose-500/40 bg-rose-500/8 text-rose-800 dark:text-rose-200", <AlertTriangle key="b" className="size-3.5 shrink-0" aria-hidden />],
    ok: ["border-emerald-500/30 bg-emerald-500/8 text-emerald-900 dark:text-emerald-200", <CheckCircle2 key="o" className="size-3.5 shrink-0" aria-hidden />],
  }[tone];
  return <div role={tone === "bad" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs", m[0] as string, className)}>{m[1]}<div className="min-w-0 space-y-0.5">{children}</div></div>;
}

/** Live counter against a platform's limit, counted the way that platform counts (X weights links and emoji). */
export function PlatformCounter({ platform, text, limit, thread = false }: { platform: PostPlatform; text: string; limit: number; thread?: boolean }) {
  const n = countChars(platform, text);
  const over = n > limit && !thread;
  const near = !over && n > limit * 0.9;
  return (
    <span className={cn("text-[11px] tabular-nums", over ? "font-semibold text-rose-600 dark:text-rose-400" : near ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground")} aria-live="polite">
      {thread ? `${n} characters` : `${n} / ${limit}`}
      <span className="sr-only">{over ? ` over the ${PLATFORM_META[platform].label} limit` : ""}</span>
    </span>
  );
}

/** Hashtags as one line of text; committed (normalised, de-duplicated) when the field loses focus, and updated when the AI fills it. */
export function HashtagInput({ id, value, onChange, disabled, placeholder }: { id: string; value: string[]; onChange: (v: string[]) => void; disabled?: boolean; placeholder?: string }) {
  const joined = value.join(" ");
  const [raw, setRaw] = useState(joined);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors an external change (the AI or undo) into the draft text
    if (!focus) setRaw(joined);
  }, [joined, focus]);
  const commit = () => {
    const tags = normalizeHashtags(raw.split(/[\s,]+/));
    setRaw(tags.join(" "));
    onChange(tags);
  };
  return <Input id={id} value={raw} disabled={disabled} placeholder={placeholder ?? "#summer #offer"} onFocus={() => setFocus(true)} onChange={(e) => setRaw(e.target.value)} onBlur={() => { setFocus(false); commit(); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />;
}

export const sectionTitle = "text-sm font-semibold text-foreground";

/** On/off switch (button with role="switch"), keyboard and screen-reader friendly. */
export function Switch({ checked, onCheckedChange, disabled, "aria-label": label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; "aria-label": string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onCheckedChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:opacity-50", checked ? "border-primary bg-primary" : "border-border bg-muted")}>
      <span className={cn("block size-3.5 rounded-full bg-background shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
    </button>
  );
}
