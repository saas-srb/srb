"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import BrandingForm from "@/components/platform/BrandingForm";
import ThemePicker, { type PickerTheme } from "@/components/platform/ThemePicker";
import { themeCssVars } from "@/lib/products/sitecraft-ai/theme-shared";
import type { StoredBranding } from "@/lib/platform/branding/types";
import { applyThemeAction, saveBrandingAction, uploadLogoAction } from "@/app/(products)/commandos/(protected)/settings/branding/actions";

/**
 * Logo, name and THEME in one form. The chosen theme is applied to the public
 * website and every product when you save (no separate brand colour).
 * Shared by the setup wizard and Settings → Branding.
 */
export default function BrandingThemeForm({
  initial, companyName, themes, activeKey, appliedKey: savedKey, submitLabel, onSaved,
}: {
  initial: StoredBranding;
  companyName: string;
  themes: PickerTheme[];
  activeKey: string;
  appliedKey: string;
  submitLabel: string;
  onSaved?: () => void;
}) {
  const [themeKey, setThemeKey] = useState(themes.some((t) => t.key === activeKey) ? activeKey : (themes[0]?.key ?? ""));
  const [appliedKey, setAppliedKey] = useState(savedKey);
  const selected = useMemo(() => themes.find((t) => t.key === themeKey), [themes, themeKey]);

  return (
    <BrandingForm
      initial={initial}
      companyName={companyName}
      actions={{ save: saveBrandingAction, uploadLogo: uploadLogoAction }}
      submitLabel={submitLabel}
      onSaved={onSaved}
      previewVars={selected ? themeCssVars(selected.tokens) : undefined}
      beforeSave={async () => {
        // Only touch the live theme when the pick actually changed.
        if (!themeKey || themeKey === appliedKey) return null;
        const res = await applyThemeAction(themeKey);
        if (res.ok) setAppliedKey(themeKey);
        return res.ok ? null : res.error;
      }}
      extra={
        themes.length > 0 ? (
          <div className="space-y-2">
            <Label>Theme</Label>
            <p className="text-xs text-muted-foreground">Colours, fonts and layout for your website and every product. You can change it any time.</p>
            <ThemePicker themes={themes} value={themeKey} onChange={setThemeKey} />
          </div>
        ) : null
      }
    />
  );
}
