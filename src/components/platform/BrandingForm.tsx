"use client";

import { useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { brandInitials, type StoredBranding } from "@/lib/platform/branding/types";

export interface BrandingFormActions {
  save: (input: { namePrimary: string; nameAccent: string; logoUrl: string | null }) => Promise<{ ok: true } | { ok: false; errors: Record<string, string> }>;
  uploadLogo: (form: FormData) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
}

/**
 * Logo and wordmark with a live preview. Shared by Settings → Branding and the setup wizard.
 * `extra` renders between the fields and the save button (the theme picker); `beforeSave` runs
 * first and may veto the save by returning an error message; `previewVars` re-colours the preview.
 */
export default function BrandingForm({
  initial, companyName, actions, submitLabel, onSaved, extra, beforeSave, previewVars,
}: {
  initial: StoredBranding;
  companyName: string;
  actions: BrandingFormActions;
  submitLabel: string;
  onSaved?: () => void;
  extra?: ReactNode;
  beforeSave?: () => Promise<string | null>;
  previewVars?: CSSProperties;
}) {
  const [namePrimary, setNamePrimary] = useState(initial.namePrimary ?? companyName);
  const [nameAccent, setNameAccent] = useState(initial.nameAccent ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_260px]">
      <form
        id="branding-form"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          startSave(async () => {
            const veto = await beforeSave?.();
            if (veto) {
              setErrors({ form: veto });
              return;
            }
            const res = await actions.save({ namePrimary, nameAccent, logoUrl });
            if (res.ok) {
              setErrors({});
              setSaved(true);
              onSaved?.();
            } else setErrors(res.errors);
          });
        }}
      >
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Upload logo"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.set("logo", file);
                startUpload(async () => {
                  const res = await actions.uploadLogo(fd);
                  if (res.ok) {
                    setLogoUrl(res.url);
                    setErrors((er) => ({ ...er, logoUrl: "" }));
                  } else setErrors((er) => ({ ...er, logoUrl: res.error }));
                });
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} {logoUrl ? "Replace logo" : "Upload logo"}
            </Button>
            {logoUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                <Trash2 className="size-4" /> Remove
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Square PNG, JPG or WebP, under 1 MB.</span>
          </div>
          {errors.logoUrl && <p className="text-xs text-destructive">{errors.logoUrl}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="br-primary">Name</Label>
            <Input id="br-primary" value={namePrimary} onChange={(e) => setNamePrimary(e.target.value)} maxLength={40} />
            {errors.namePrimary && <p className="text-xs text-destructive">{errors.namePrimary}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="br-accent">Accent part (optional)</Label>
            <Input id="br-accent" value={nameAccent} onChange={(e) => setNameAccent(e.target.value)} maxLength={40} placeholder="Shown in your theme's accent colour" />
          </div>
        </div>

        {extra}

        {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      </form>

      {/* Live preview */}
      <div className="h-fit space-y-3 rounded-xl border bg-muted/30 p-4" style={previewVars} aria-hidden="true">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
        <div className="flex items-center gap-2 rounded-lg bg-background p-3 text-base font-bold text-foreground shadow-sm">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploaded logo preview
            <img src={logoUrl} alt="" className="size-7 rounded object-contain" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
              {brandInitials(namePrimary + " " + nameAccent)}
            </span>
          )}
          <span>
            {namePrimary}
            <span className="text-primary">{nameAccent}</span>
          </span>
        </div>
        <span className="inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Primary button</span>
      </div>

      {/* The save button sits at the far right of the whole card (under both columns), wired to the form by id. */}
      <div className="flex items-center justify-end gap-3 md:col-span-2">
        {saved && <span className="text-sm text-emerald-600" aria-live="polite">Saved — your theme now applies to the website and every product.</span>}
        <Button type="submit" form="branding-form" disabled={saving || uploading}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
        </Button>
      </div>
    </div>
  );
}
