"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutTemplate, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { SECTION_REGISTRY } from "@/lib/products/sitecraft-ai/section-registry";
import { HEADER_VARIANTS, FOOTER_VARIANTS, SECTION_VARIANTS, WIDTH_VARIANTS, DENSITY_VARIANTS, IMAGE_VARIANTS, CARD_VARIANTS, MENU_VARIANTS, type VariantOption, type ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";
import { saveThemeComponentsAction } from "@/app/(products)/sitecraft-ai/(protected)/theme/actions";

function VariantSelect({ id, label, options, value, onChange, disabled }: { id: string; label: string; options: VariantOption[]; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const current = options.find((o) => o.key === value) ?? options[0];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={current.key} onValueChange={(v) => v && onChange(v)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{(v: string) => options.find((o) => o.key === v)?.label ?? v}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{current.description}</p>
    </div>
  );
}

/**
 * Picks which header, footer and section component variants this theme uses.
 * Saved straight to the theme (no draft) — if the theme is active, the change
 * is live on save; otherwise it only affects the theme's preview.
 */
export default function ThemeComponentsEditor({
  themeKey,
  initial,
  isActive,
  canEdit,
}: {
  themeKey: string;
  initial: Required<ThemeComponentSelections>;
  isActive: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  const save = () => {
    startTransition(async () => {
      const res = await saveThemeComponentsAction(themeKey, value);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(isActive ? "Saved — live on the site now" : "Saved");
      router.refresh();
    });
  };

  return (
    <GlassCard className="space-y-5 p-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LayoutTemplate className="size-4" /> Layout &amp; components
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isActive
            ? "This theme is active — saving changes the live site immediately."
            : "Only affects this theme. Use Preview to check it before activating."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <VariantSelect id="variant-header" label="Header" options={HEADER_VARIANTS} value={value.header} onChange={(v) => setValue((s) => ({ ...s, header: v }))} disabled={!canEdit} />
        <VariantSelect id="variant-footer" label="Footer" options={FOOTER_VARIANTS} value={value.footer} onChange={(v) => setValue((s) => ({ ...s, footer: v }))} disabled={!canEdit} />
        <VariantSelect id="variant-menu" label="Header dropdown" options={MENU_VARIANTS} value={value.menu} onChange={(v) => setValue((s) => ({ ...s, menu: v }))} disabled={!canEdit} />
        <VariantSelect id="variant-cards" label="Card style" options={CARD_VARIANTS} value={value.cards} onChange={(v) => setValue((s) => ({ ...s, cards: v }))} disabled={!canEdit} />
        <VariantSelect id="variant-images" label="Photo treatment" options={IMAGE_VARIANTS} value={value.images} onChange={(v) => setValue((s) => ({ ...s, images: v }))} disabled={!canEdit} />
        <VariantSelect id="variant-width" label="Page width" options={WIDTH_VARIANTS} value={value.width} onChange={(v) => setValue((s) => ({ ...s, width: v }))} disabled={!canEdit} />
        <VariantSelect id="variant-density" label="Section spacing" options={DENSITY_VARIANTS} value={value.density} onChange={(v) => setValue((s) => ({ ...s, density: v }))} disabled={!canEdit} />
        {Object.entries(SECTION_VARIANTS).map(([type, options]) => (
          <VariantSelect
            key={type}
            id={`variant-section-${type}`}
            label={`${SECTION_REGISTRY[type]?.label ?? type} sections`}
            options={options}
            value={value.sections[type] ?? "default"}
            onChange={(v) => setValue((s) => ({ ...s, sections: { ...s.sections, [type]: v } }))}
            disabled={!canEdit}
          />
        ))}
      </div>

      {canEdit && (
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save components
        </Button>
      )}
    </GlassCard>
  );
}
