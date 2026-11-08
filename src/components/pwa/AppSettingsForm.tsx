"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Loader2, RotateCcw, Save } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { brandInitials } from "@/lib/platform/branding/types";
import { DEFAULT_APP_SETTINGS, MAX_SHORTCUTS, type AppSettings, type ColorChoice } from "@/lib/pwa/settings";

interface Props {
  initial: AppSettings;
  company: { name: string; logoUrl: string | null; appUrl: string };
  theme: { primary: string; primaryForeground: string; background: string; backgroundDark: string };
  panels: { key: string; name: string; shortName: string }[];
  actions: {
    save: (s: AppSettings) => Promise<{ ok: true; settings: AppSettings } | { ok: false; error: string }>;
    reset: () => Promise<{ ok: true }>;
    uploadIcon: (f: FormData) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  };
}

const readableOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 150 ? "#111111" : "#ffffff";
};

function ColorField({ label, hint, value, themeValue, onChange }: { label: string; hint: string; value: ColorChoice; themeValue: string; onChange: (v: ColorChoice) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={value.mode === "theme"} onChange={() => onChange({ ...value, mode: "theme" })} className="accent-[var(--primary)]" /> Automatic (your theme)<span className="inline-block size-4 rounded border border-border" style={{ background: themeValue }} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={value.mode === "custom"} onChange={() => onChange({ ...value, mode: "custom" })} className="accent-[var(--primary)]" /> Custom</label>
        {value.mode === "custom" ? <input type="color" aria-label={`${label} colour`} value={value.value} onChange={(e) => onChange({ mode: "custom", value: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent" /> : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function AppSettingsForm({ initial, company, theme, panels, actions }: Props) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<AppSettings>) => setS((x) => ({ ...x, ...patch }));

  // ---- what the app will look like (mirrors lib/pwa/identity.ts and icon.tsx)
  const name = s.name || company.name;
  const shortName = s.shortName || company.name.slice(0, 12);
  const themeColor = s.themeColor.mode === "custom" ? s.themeColor.value : theme.primary;
  const splashBg = s.backgroundColor.mode === "custom" ? s.backgroundColor.value : theme.background;
  const iconUrl = s.icon.source === "custom" ? s.icon.customUrl : s.icon.source === "logo" ? company.logoUrl : null;
  const iconBg = s.icon.background.mode === "white" ? "#ffffff" : s.icon.background.mode === "custom" ? s.icon.background.value : iconUrl ? "#ffffff" : theme.primary;
  const initials = brandInitials(company.name) || "•";
  const Icon = ({ size, round = 22 }: { size: number; round?: number }) =>
    iconUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "contain", borderRadius: round }} />
    ) : (
      <div style={{ width: size, height: size, background: iconBg, color: iconBg === theme.primary ? theme.primaryForeground : readableOn(iconBg), borderRadius: Math.round(size * 0.22), fontSize: size * 0.4, fontWeight: 800 }} className="flex items-center justify-center">{initials}</div>
    );

  const shortcutOptions = [...panels.map((p) => ({ key: p.key, label: p.shortName || p.name })), { key: "notifications", label: "Notifications" }];
  const toggleShortcut = (key: string) =>
    set({ shortcuts: s.shortcuts.includes(key) ? s.shortcuts.filter((k) => k !== key) : s.shortcuts.length >= MAX_SHORTCUTS ? s.shortcuts : [...s.shortcuts, key] });

  const save = () =>
    startSave(async () => {
      setMsg(null);
      const r = await actions.save(s);
      if (r.ok) {
        setS(r.settings);
        setMsg({ kind: "ok", text: "Saved. New installs use this right away; phones that already installed the app pick up changes the next time they refresh it (iPhone and iPad: remove and add the app again to refresh the icon)." });
      } else setMsg({ kind: "error", text: r.error });
    });

  const reset = () =>
    startSave(async () => {
      await actions.reset();
      setS(DEFAULT_APP_SETTINGS);
      setMsg({ kind: "ok", text: "Back to automatic: the app follows your branding and theme." });
    });

  const upload = (file: File) =>
    startUpload(async () => {
      const fd = new FormData();
      fd.set("icon", file);
      const r = await actions.uploadIcon(fd);
      if (r.ok) set({ icon: { ...s.icon, source: "custom", customUrl: r.url } });
      else setMsg({ kind: "error", text: r.error });
    });

  const select = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {/* identity */}
        <GlassCard containerClassName="h-auto" className="space-y-4 p-5">
          <h2 className="text-base font-semibold">Name</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="app-name">App name</Label>
              <Input id="app-name" maxLength={45} value={s.name} placeholder={company.name} onChange={(e) => set({ name: e.target.value })} />
              <p className="text-xs text-muted-foreground">Shown in the install dialog and app switcher. Empty = automatic.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="app-short">Name under the icon <span className="text-xs text-muted-foreground">({(s.shortName || shortName).length}/12)</span></Label>
              <Input id="app-short" maxLength={12} value={s.shortName} placeholder={company.name.slice(0, 12)} onChange={(e) => set({ shortName: e.target.value })} />
              <p className="text-xs text-muted-foreground">Phones cut this at about 12 characters.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="app-desc">Description</Label>
            <Textarea id="app-desc" rows={2} maxLength={200} value={s.description} placeholder={`${company.name}: your team's workspace and products.`} onChange={(e) => set({ description: e.target.value })} />
          </div>
        </GlassCard>

        {/* icon */}
        <GlassCard containerClassName="h-auto" className="space-y-4 p-5">
          <h2 className="text-base font-semibold">Icon</h2>
          <div className="flex flex-wrap gap-4">
            {([
              ["logo", "My logo", "The logo from Branding (initials if you have none)."],
              ["custom", "Upload an app icon", "A square PNG, JPG or WebP under 1 MB."],
              ["initials", "Company initials", `“${initials}” on your colours.`],
            ] as const).map(([key, label, hint]) => (
              <label key={key} className={`flex min-w-44 flex-1 cursor-pointer items-start gap-2.5 rounded-xl border p-3 ${s.icon.source === key ? "border-primary bg-primary/5" : "border-border"}`}>
                <input type="radio" checked={s.icon.source === key} onChange={() => set({ icon: { ...s.icon, source: key === "custom" && !s.icon.customUrl ? "logo" : key } })} className="mt-1 accent-[var(--primary)]" disabled={key === "custom" && !s.icon.customUrl} />
                <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <ImageUp className="size-4" data-icon="inline-start" />} Upload app icon</Button>
            {s.icon.customUrl ? <span className="text-xs text-muted-foreground">An uploaded icon is ready; choose it above.</span> : null}
          </div>
          <div className="space-y-2">
            <Label>Icon background (phones that crop icons into a circle or rounded square)</Label>
            <div className="flex flex-wrap items-center gap-3">
              {(["theme", "white", "custom"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm"><input type="radio" checked={s.icon.background.mode === m} onChange={() => set({ icon: { ...s.icon, background: m === "white" ? { mode: "white", value: "#ffffff" } : { mode: m, value: s.icon.background.value } } })} className="accent-[var(--primary)]" /> {m === "theme" ? "Automatic" : m === "white" ? "White" : "Custom"}</label>
              ))}
              {s.icon.background.mode === "custom" ? <input type="color" aria-label="Icon background colour" value={s.icon.background.value} onChange={(e) => set({ icon: { ...s.icon, background: { mode: "custom", value: e.target.value } } })} className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent" /> : null}
            </div>
          </div>
        </GlassCard>

        {/* colours */}
        <GlassCard containerClassName="h-auto" className="space-y-5 p-5">
          <h2 className="text-base font-semibold">Colours</h2>
          <ColorField label="Status bar and title bar" hint="The strip at the top of the phone or the app window. Automatic follows your theme, and switches with dark mode." value={s.themeColor} themeValue={theme.primary} onChange={(v) => set({ themeColor: v })} />
          <ColorField label="Splash screen" hint="The background while the app opens." value={s.backgroundColor} themeValue={theme.background} onChange={(v) => set({ backgroundColor: v })} />
        </GlassCard>

        {/* behaviour */}
        <GlassCard containerClassName="h-auto" className="space-y-5 p-5">
          <h2 className="text-base font-semibold">Where it opens</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="app-start">Opens on</Label>
              <select id="app-start" className={select} value={s.startPage} onChange={(e) => set({ startPage: e.target.value })}>
                {panels.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="app-display">Window</Label>
              <select id="app-display" className={select} value={s.display} onChange={(e) => set({ display: e.target.value as AppSettings["display"] })}>
                <option value="standalone">Full app (no browser bar)</option>
                <option value="minimal-ui">With back and reload buttons</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="app-orient">Orientation</Label>
              <select id="app-orient" className={select} value={s.orientation} onChange={(e) => set({ orientation: e.target.value as AppSettings["orientation"] })}>
                <option value="any">Any (follows the device)</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="app-status">iPhone status bar</Label>
              <select id="app-status" className={select} value={s.statusBar} onChange={(e) => set({ statusBar: e.target.value as AppSettings["statusBar"] })}>
                <option value="default">Default</option>
                <option value="black-translucent">Translucent (content under the bar)</option>
                <option value="black">Black</option>
              </select>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Shortcuts <span className="text-xs font-normal text-muted-foreground">(touch and hold the icon; up to {MAX_SHORTCUTS})</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {shortcutOptions.map((o) => (
                <label key={o.key} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm">
                  <Checkbox checked={s.shortcuts.includes(o.key)} disabled={!s.shortcuts.includes(o.key) && s.shortcuts.length >= MAX_SHORTCUTS} onCheckedChange={() => toggleShortcut(o.key)} />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={s.installPrompt} onCheckedChange={(v) => set({ installPrompt: v === true })} className="mt-0.5" />
            <span><span className="block text-sm">Show the “Install the app” banner</span><span className="block text-xs text-muted-foreground">A small dismissible banner on product pages in browsers that can install the app. The install card in Notification settings always stays.</span></span>
          </label>
        </GlassCard>

        {/* desktop */}
        <GlassCard containerClassName="h-auto" className="space-y-4 p-5">
          <h2 className="text-base font-semibold">Desktop apps</h2>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={s.desktop.closeToTray} onCheckedChange={(v) => set({ desktop: { ...s.desktop, closeToTray: v === true } })} className="mt-0.5" />
            <span><span className="block text-sm">Keep running in the tray when the window is closed</span><span className="block text-xs text-muted-foreground">So notifications keep arriving. This is the starting choice for each person; they can change it in the tray menu.</span></span>
          </label>
          <label className="flex items-start gap-2.5">
            <Checkbox checked={s.desktop.launchAtLogin} onCheckedChange={(v) => set({ desktop: { ...s.desktop, launchAtLogin: v === true } })} className="mt-0.5" />
            <span><span className="block text-sm">Start the app when people sign in to their computer</span><span className="block text-xs text-muted-foreground">Also a starting choice for each person.</span></span>
          </label>
        </GlassCard>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Save className="size-4" data-icon="inline-start" />} Save mobile app</Button>
          <Button type="button" variant="ghost" onClick={reset} disabled={saving}><RotateCcw className="size-4" data-icon="inline-start" /> Reset to automatic</Button>
        </div>
        {msg ? <p role="status" className={`text-sm ${msg.kind === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>{msg.text}</p> : null}
      </div>

      {/* live preview */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <GlassCard containerClassName="h-auto" className="space-y-4 p-5">
          <h2 className="text-base font-semibold">Preview</h2>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Home screen</p>
            <div className="flex items-end gap-5 rounded-2xl bg-gradient-to-b from-slate-200 to-slate-300 p-5 dark:from-slate-700 dark:to-slate-800">
              <div className="flex w-16 flex-col items-center gap-1.5">
                <div className="overflow-hidden rounded-[22%] shadow-md" style={{ background: iconBg }}><Icon size={56} round={0} /></div>
                <span className="w-full truncate text-center text-[11px] font-medium text-slate-800 dark:text-slate-100">{shortName}</span>
              </div>
              <div className="flex w-16 flex-col items-center gap-1.5">
                <div className="flex size-14 items-center justify-center overflow-hidden rounded-full shadow-md" style={{ background: iconBg }}><div style={{ transform: "scale(.78)" }}><Icon size={56} round={0} /></div></div>
                <span className="text-[10px] text-slate-600 dark:text-slate-300">circle crop</span>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Opening screen</p>
            <div className="mx-auto w-44 overflow-hidden rounded-2xl border border-border shadow-sm">
              <div className="h-5" style={{ background: themeColor }} />
              <div className="flex h-56 flex-col items-center justify-center gap-3" style={{ background: splashBg }}>
                <div className="overflow-hidden rounded-[22%] shadow" style={{ background: iconBg }}><Icon size={64} round={0} /></div>
                <span className="px-3 text-center text-sm font-semibold" style={{ color: readableOn(splashBg) }}>{name}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{name}</p>
            <p className="mt-0.5">{s.description || `${company.name}: your team's workspace and products.`}</p>
            <p className="mt-1.5">{company.appUrl}</p>
          </div>
        </GlassCard>
      </aside>
    </div>
  );
}
