"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Loader2, Rocket, RotateCcw, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { ThemeTokens, ThemeColorTokens } from "@/lib/products/sitecraft-ai/theme";
import { saveDraftThemeAction, publishThemeAction, restoreThemeVersionAction } from "@/app/(products)/sitecraft-ai/(protected)/theme/actions";

const COLOR_FIELDS: { key: keyof ThemeColorTokens; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "foreground", label: "Foreground" },
  { key: "card", label: "Card" },
  { key: "cardForeground", label: "Card text" },
  { key: "muted", label: "Muted" },
  { key: "mutedForeground", label: "Muted text" },
  { key: "border", label: "Border" },
  { key: "destructive", label: "Destructive" },
  { key: "ring", label: "Focus ring" },
];

function ColorInput({ mode, label, value, onChange }: { mode: string; label: string; value: string; onChange: (v: string) => void }) {
  // The mode is part of the id: the same label appears once for light and once for dark mode.
  const id = `theme-color-${mode}-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} (color picker)`} value={value} onChange={(e) => onChange(e.target.value)} className="size-8 shrink-0 cursor-pointer rounded-md border border-border/60 bg-transparent p-0.5" />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-28 font-mono text-xs" />
      </div>
    </div>
  );
}

export default function ThemeEditor({
  themeKey,
  draftTokens,
  publishedTokens,
  canEdit,
  canPublish,
  history,
}: {
  themeKey: string;
  draftTokens: ThemeTokens;
  publishedTokens: ThemeTokens;
  canEdit: boolean;
  canPublish: boolean;
  /** Newest first. */
  history: { version: number; publishedAt: string; note: string; isLive: boolean }[];
}) {
  const router = useRouter();
  const [tokens, setTokens] = useState<ThemeTokens>(draftTokens);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(tokens) !== JSON.stringify(publishedTokens);

  const setColor = (mode: "colors" | "colorsDark", key: keyof ThemeColorTokens, value: string) =>
    setTokens((t) => ({ ...t, [mode]: { ...t[mode], [key]: value } }));

  const saveDraft = () => {
    startTransition(async () => {
      const res = await saveDraftThemeAction(themeKey, tokens);
      if (!res.ok) toast.error(res.error);
      else toast.success("Draft saved");
    });
  };

  const publish = () => {
    startTransition(async () => {
      const saveRes = await saveDraftThemeAction(themeKey, tokens);
      if (!saveRes.ok) { toast.error(saveRes.error); return; }
      const res = await publishThemeAction(themeKey);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Theme published");
      router.refresh();
    });
  };

  const restore = (version: number) => {
    startTransition(async () => {
      const res = await restoreThemeVersionAction(themeKey, version);
      if (!res.ok) { toast.error(res.error); return; }
      setTokens(res.tokens);
      toast.success(`Version ${version} loaded into the draft — publish to make it live`);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button variant="outline" size="sm" onClick={saveDraft} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save draft
          </Button>
        )}
        {canPublish && (
          <Button size="sm" onClick={publish} disabled={pending || !dirty}>
            <Rocket className="size-3.5" /> Publish
          </Button>
        )}
      </div>

      <GlassCard className="space-y-4 p-5">
        <p className="text-sm font-semibold text-foreground">Live preview</p>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4" style={{ background: tokens.colors.background, color: tokens.colors.foreground, borderColor: tokens.colors.border }}>
          <button type="button" className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: tokens.colors.primary, color: tokens.colors.primaryForeground }}>
            Primary button
          </button>
          <span className="rounded-full px-3 py-1.5 text-sm font-medium" style={{ background: tokens.colors.secondary, color: tokens.colors.secondaryForeground }}>
            Secondary badge
          </span>
          <span className="rounded-lg px-3 py-1.5 text-sm" style={{ background: tokens.colors.muted, color: tokens.colors.mutedForeground }}>
            Muted text
          </span>
        </div>
      </GlassCard>

      <GlassCard className="space-y-3 p-5">
        <p className="text-sm font-semibold text-foreground">Light mode</p>
        {COLOR_FIELDS.map((f) => (
          <ColorInput key={f.key} mode="light" label={f.label} value={tokens.colors[f.key]} onChange={(v) => setColor("colors", f.key, v)} />
        ))}
      </GlassCard>

      <GlassCard className="space-y-3 p-5">
        <p className="text-sm font-semibold text-foreground">Dark mode</p>
        {COLOR_FIELDS.map((f) => (
          <ColorInput key={f.key} mode="dark" label={f.label} value={tokens.colorsDark[f.key]} onChange={(v) => setColor("colorsDark", f.key, v)} />
        ))}
      </GlassCard>

      <GlassCard className="space-y-3 p-5">
        <p className="text-sm font-semibold text-foreground">Shape</p>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="theme-radius" className="text-sm">
            Corner radius
          </Label>
          <Input id="theme-radius" className="w-28" value={tokens.radius} onChange={(e) => setTokens((t) => ({ ...t, radius: e.target.value }))} />
        </div>
      </GlassCard>

      <GlassCard className="space-y-3 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="size-4" /> Version history
        </p>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No published versions recorded yet — each publish from now on is kept here (last 20).</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {history.map((h) => (
              <li key={h.version} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Version {h.version}
                    {h.isLive && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Live</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.note} · {new Date(h.publishedAt).toLocaleString()}
                  </p>
                </div>
                {canEdit && !h.isLive && (
                  <Button variant="outline" size="sm" onClick={() => restore(h.version)} disabled={pending}>
                    <RotateCcw className="size-3.5" /> Load into draft
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
