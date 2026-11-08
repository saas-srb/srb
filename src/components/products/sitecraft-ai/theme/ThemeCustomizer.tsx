"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronRight, Code2, Download, ExternalLink, Loader2, Monitor, Moon, Palette, PanelLeftClose, PanelLeftOpen,
  PanelTop, RefreshCw, Rocket, RotateCcw, Save, Smartphone, Square, Sun, Tablet, Type, LayoutTemplate, X, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { ColorRow, FontPicker, RangeRow, OptionCards, GroupLabel } from "@/components/products/sitecraft-ai/theme/customizer-controls";
import { PREVIEW_MSG, type CustomizerPayload } from "@/components/products/sitecraft-ai/theme/ThemePreviewBridge";
import {
  DEFAULT_BRAND, DEFAULT_TYPOGRAPHY, CUSTOM_CSS_LIMIT, fontOption, fontStack, themeCssBlock,
  type ThemeColorTokens, type ThemeTokens,
} from "@/lib/products/sitecraft-ai/theme-shared";
import { THEME_PRESETS } from "@/lib/products/sitecraft-ai/theme-presets";
import { HEADER_VARIANTS, FOOTER_VARIANTS, SECTION_VARIANTS, WIDTH_VARIANTS, DENSITY_VARIANTS, IMAGE_VARIANTS, CARD_VARIANTS, MENU_VARIANTS, normalizeSelections, type ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";
import { installThemePresetAction, publishThemeDraftAction, saveThemeDraftAction } from "@/app/(products)/sitecraft-ai/(protected)/theme/actions";

type Sel = Required<ThemeComponentSelections>;
type PanelKey = "colors" | "typography" | "shape" | "layout" | "sections" | "css";
type Device = "desktop" | "tablet" | "mobile";
type Mode = "light" | "dark";

const DEVICE_WIDTH: Record<Device, string> = { desktop: "100%", tablet: "820px", mobile: "390px" };
const SECTION_LABELS: Record<string, string> = {
  "page-hero": "Page hero",
  "home-hero": "Homepage hero",
  "listing-hero": "Listing page hero",
  "faq-accordion": "FAQ",
  "detail-cta": "Call to action",
  "listing-grid": "Service / listing grids",
  "home-why-choose-us": "Why choose us",
  "home-how-we-work": "Process steps",
};

const COLOR_GROUPS: { label: string; fields: { key: keyof ThemeColorTokens; label: string; hint?: string }[] }[] = [
  { label: "Brand", fields: [
    { key: "primary", label: "Primary", hint: "Buttons, links, highlights" },
    { key: "primaryForeground", label: "Text on primary" },
    { key: "ring", label: "Focus ring" },
  ] },
  { label: "Surfaces", fields: [
    { key: "background", label: "Background" },
    { key: "foreground", label: "Text" },
    { key: "card", label: "Cards" },
    { key: "cardForeground", label: "Card text" },
    { key: "popover", label: "Menus & popovers" },
    { key: "popoverForeground", label: "Menu text" },
  ] },
  { label: "Supporting", fields: [
    { key: "secondary", label: "Secondary", hint: "Badges, soft buttons" },
    { key: "secondaryForeground", label: "Text on secondary" },
    { key: "accent", label: "Accent", hint: "Hover and selected states" },
    { key: "accentForeground", label: "Text on accent" },
    { key: "muted", label: "Muted", hint: "Alternate section backgrounds" },
    { key: "mutedForeground", label: "Muted text" },
  ] },
  { label: "Lines & status", fields: [
    { key: "border", label: "Borders" },
    { key: "input", label: "Form fields" },
    { key: "destructive", label: "Error" },
  ] },
];

const RADIUS_STOPS = [
  { label: "Sharp", value: 0 }, { label: "Subtle", value: 0.375 }, { label: "Rounded", value: 0.625 }, { label: "Soft", value: 1 }, { label: "Pill", value: 1.5 },
];

/** Fills typography/brand so every control has a value; compiles to the same CSS as the unfilled tokens. */
function withDefaults(t: ThemeTokens): ThemeTokens {
  return { ...t, typography: t.typography ?? DEFAULT_TYPOGRAPHY, brand: t.brand ?? DEFAULT_BRAND };
}

function previewSrc(theme: string, path: string, sel: Sel) {
  return `/api/sitecraft-ai/theme-preview?theme=${encodeURIComponent(theme)}&path=${encodeURIComponent(path)}&c=${encodeURIComponent(JSON.stringify(sel))}`;
}

export interface CustomizerPage {
  path: string;
  title: string;
}

export default function ThemeCustomizer({
  themeKey,
  name,
  description,
  installed,
  isActive,
  hasUnpublishedDraft,
  initialTokens,
  initialComponents,
  pages,
  initialPath,
  canEdit,
  canPublish,
}: {
  themeKey: string;
  name: string;
  description: string;
  installed: boolean;
  isActive: boolean;
  hasUnpublishedDraft: boolean;
  initialTokens: ThemeTokens;
  initialComponents: ThemeComponentSelections;
  pages: CustomizerPage[];
  initialPath: string;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [baseline, setBaseline] = useState(() => ({ tokens: withDefaults(initialTokens), components: normalizeSelections(initialComponents) }));
  const [tokens, setTokens] = useState<ThemeTokens>(baseline.tokens);
  const [components, setComponents] = useState<Sel>(baseline.components);
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const [mode, setMode] = useState<Mode>("light");
  const [device, setDevice] = useState<Device>("desktop");
  const [collapsed, setCollapsed] = useState(false);
  const [frameSrc, setFrameSrc] = useState(() => previewSrc(themeKey, initialPath, baseline.components));
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const loadFallback = useRef<number | undefined>(undefined);

  const dirty = JSON.stringify({ tokens, components }) !== JSON.stringify(baseline);
  const readOnly = !canEdit;

  // Latest values for the message handler without re-subscribing.
  const live = useRef({ tokens, mode });
  useEffect(() => {
    live.current = { tokens, mode };
  }, [tokens, mode]);

  const post = useCallback((msg: CustomizerPayload) => {
    frameRef.current?.contentWindow?.postMessage({ source: PREVIEW_MSG.fromCustomizer, ...msg }, location.origin);
  }, []);
  const pushAll = useCallback(() => {
    post({ type: "css", css: themeCssBlock(live.current.tokens) });
    post({ type: "mode", mode: live.current.mode });
  }, [post]);

  // The previewed site reports each page it shows; answer with the current (unsaved) edits.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { source?: string; type?: string; path?: string };
      if (data?.source !== PREVIEW_MSG.fromSite || data.type !== "ready") return;
      window.clearTimeout(loadFallback.current);
      setReady(true);
      if (data.path) setCurrentPath(data.path);
      pushAll();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushAll]);

  // Instant preview: every token edit is compiled here and swapped into the frame — no reload.
  useEffect(() => {
    if (ready) post({ type: "css", css: themeCssBlock(tokens) });
  }, [tokens, ready, post]);
  useEffect(() => {
    if (ready) post({ type: "mode", mode });
  }, [mode, ready, post]);

  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Leaving the page ends the preview for this browser (the close button does it explicitly).
  useEffect(() => {
    const onHide = () => navigator.sendBeacon("/api/sitecraft-ai/theme-preview/exit");
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const reloadFrame = (path: string, sel: Sel) => {
    setReady(false);
    setFrameSrc(previewSrc(themeKey, path, sel));
  };

  // ── Editing ────────────────────────────────────────────────────────────
  const editMode = mode === "dark" ? "colorsDark" : "colors";
  const setColor = (key: keyof ThemeColorTokens, value: string) => setTokens((t) => ({ ...t, [editMode]: { ...t[editMode], [key]: value } }));
  const setTypo = (patch: Partial<NonNullable<ThemeTokens["typography"]>>) => setTokens((t) => ({ ...t, typography: { ...(t.typography ?? DEFAULT_TYPOGRAPHY), ...patch } }));
  const setBrand = (patch: Partial<NonNullable<ThemeTokens["brand"]>>) => setTokens((t) => ({ ...t, brand: { ...(t.brand ?? DEFAULT_BRAND), ...patch } }));
  const radiusValue = parseFloat(tokens.radius) || 0;
  const setComponent = (next: Sel) => {
    setComponents(next);
    reloadFrame(currentPath, next);
  };

  const discard = async () => {
    if (!(await confirm({ title: "Discard your changes?", description: "Everything you changed since the last save goes back to how it was.", confirmLabel: "Discard changes", destructive: true }))) return;
    setTokens(baseline.tokens);
    if (JSON.stringify(components) !== JSON.stringify(baseline.components)) setComponent(baseline.components);
  };

  // ── Saving ─────────────────────────────────────────────────────────────
  const saveDraft = () =>
    startTransition(async () => {
      const res = await saveThemeDraftAction(themeKey, tokens, components);
      if (!res.ok) { toast.error(res.error); return; }
      setBaseline({ tokens, components });
      toast.success("Draft saved — not live yet");
    });

  const publish = async (activate: boolean) => {
    const ok = await confirm(
      activate
        ? { title: `Activate “${name}”?`, description: "Your changes are published and the whole public website switches to this theme straight away.", confirmLabel: "Publish & activate" }
        : { title: "Publish these changes?", description: isActive ? "This is the active theme, so the public website updates straight away." : "The theme's saved version is updated. It isn't the active theme, so the public website doesn't change.", confirmLabel: "Publish" }
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await publishThemeDraftAction(themeKey, tokens, components, activate);
      if (!res.ok) { toast.error(res.error); return; }
      setBaseline({ tokens, components });
      toast.success(activate ? `${name} is now live` : "Published");
      router.refresh();
    });
  };

  const install = async (activate: boolean) => {
    if (activate && !(await confirm({ title: `Install & activate “${name}”?`, description: "The theme is installed with your changes and the whole public website switches to it straight away.", confirmLabel: "Install & activate" }))) return;
    startTransition(async () => {
      const res = await installThemePresetAction(themeKey, { tokens, components, activate });
      if (!res.ok) { toast.error(res.error); return; }
      setBaseline({ tokens, components });
      toast.success(activate ? `${name} installed and live` : `${name} installed`);
      router.refresh();
    });
  };

  const close = async () => {
    if (dirty && !(await confirm({ title: "Leave without saving?", description: "Your unsaved changes will be lost.", confirmLabel: "Leave", destructive: true }))) return;
    dirtyRef.current = false;
    await fetch("/api/sitecraft-ai/theme-preview/exit", { method: "POST" }).catch(() => null);
    router.push("/sitecraft-ai/theme");
  };

  const status = isActive ? "Active theme" : installed ? "Previewing (not active)" : "Theme library preview";
  const pageOptions = useMemo(() => {
    const list = [...pages];
    if (!list.some((p) => p.path === currentPath)) list.unshift({ path: currentPath, title: currentPath });
    return list;
  }, [pages, currentPath]);

  const menu: { key: PanelKey; label: string; hint: string; icon: typeof Palette }[] = [
    { key: "colors", label: "Colours", hint: "Palette for light & dark mode", icon: Palette },
    { key: "typography", label: "Typography", hint: `${fontOption(tokens.typography?.headingFont).label.replace(" (site default)", "")} · ${tokens.typography?.scale ?? 100}%`, icon: Type },
    { key: "shape", label: "Shape", hint: `Corner radius ${tokens.radius}`, icon: Square },
    { key: "layout", label: "Header & footer", hint: `${HEADER_VARIANTS.find((v) => v.key === components.header)?.label} header · ${FOOTER_VARIANTS.find((v) => v.key === components.footer)?.label} footer`, icon: PanelTop },
    { key: "sections", label: "Section styles", hint: "Alternate section designs", icon: LayoutTemplate },
    { key: "css", label: "Additional CSS", hint: tokens.customCss?.trim() ? `${tokens.customCss.length} characters` : "Your own CSS rules", icon: Code2 },
  ];
  const panelMeta = menu.find((m) => m.key === panel);

  return (
    <div className="fixed inset-0 flex bg-background text-foreground">
      {/* ── Controls ─────────────────────────────────────────────── */}
      <aside className={cn("flex w-full shrink-0 flex-col border-r border-border/60 bg-background md:w-[340px]", collapsed && "hidden")}>
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close customizer"><X className="size-4" /></Button>
          <div className="ml-auto flex items-center gap-1.5">
            {installed ? (
              <>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={saveDraft} disabled={pending || !dirty}>
                    <Save className="size-3.5" /> Save draft
                  </Button>
                )}
                {canPublish && (
                  <Button size="sm" onClick={() => publish(!isActive)} disabled={pending || (isActive && !dirty && !hasUnpublishedDraft)}>
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} {isActive ? "Publish" : "Activate"}
                  </Button>
                )}
              </>
            ) : (
              <>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => install(false)} disabled={pending}>
                    <Download className="size-3.5" /> Install
                  </Button>
                )}
                {canPublish && (
                  <Button size="sm" onClick={() => install(true)} disabled={pending}>
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} Install & activate
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!panel ? (
            <div className="space-y-4 p-4">
              <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">You are customizing</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">{name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn(isActive && "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400")}>
                    {isActive && <CheckCircle2 className="size-3" />} {status}
                  </Badge>
                  {dirty && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400">Unsaved changes</Badge>}
                  {!dirty && hasUnpublishedDraft && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400">Draft not published</Badge>}
                </div>
                {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
                <button type="button" onClick={close} className="mt-3 text-xs font-medium text-primary hover:underline">Change theme</button>
              </div>

              <nav className="overflow-hidden rounded-2xl border border-border/60">
                {menu.map((m) => (
                  <button key={m.key} type="button" onClick={() => setPanel(m.key)} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><m.icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{m.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.hint}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </nav>

              {dirty && canEdit && (
                <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={discard}>
                  <RotateCcw className="size-3.5" /> Discard changes
                </Button>
              )}
              {readOnly && <p className="text-center text-xs text-muted-foreground">You can preview, but your role can&apos;t save theme changes.</p>}
            </div>
          ) : (
            <div>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-2.5 backdrop-blur">
                <Button variant="ghost" size="icon-sm" onClick={() => setPanel(null)} aria-label="Back"><ArrowLeft className="size-4" /></Button>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Customizing ▸ {name}</p>
                  <p className="text-sm font-semibold">{panelMeta?.label}</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                {panel === "colors" && (
                  <>
                    <div>
                      <GroupLabel>Start from a palette</GroupLabel>
                      <div className="flex flex-wrap gap-2">
                        {THEME_PRESETS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            title={p.name}
                            aria-label={`Use the ${p.name} palette`}
                            disabled={readOnly}
                            onClick={() => setTokens((t) => ({ ...t, colors: p.tokens.colors, colorsDark: p.tokens.colorsDark, brand: p.tokens.brand }))}
                            className="flex size-8 overflow-hidden rounded-full border border-border shadow-sm transition-transform hover:scale-110"
                          >
                            <span className="h-full w-1/2" style={{ background: p.tokens.colors.primary }} />
                            <span className="h-full w-1/2" style={{ background: p.tokens.brand?.gradient }} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <PanelTabs className="w-full [&>*]:flex-1" label="Preview mode" active={mode} onSelect={(k) => setMode(k as Mode)} tabs={[{ key: "light", label: "Light mode", icon: <Sun className="size-3.5" /> }, { key: "dark", label: "Dark mode", icon: <Moon className="size-3.5" /> }]} />
                    <p className="text-[11px] text-muted-foreground">Editing the {mode} palette — the preview switches to {mode} mode to match.</p>
                    {COLOR_GROUPS.map((g) => (
                      <div key={g.label}>
                        <GroupLabel>{g.label}</GroupLabel>
                        {g.fields.map((f) => (
                          <ColorRow key={f.key} id={`c-${mode}-${f.key}`} label={f.label} hint={f.hint} value={tokens[editMode][f.key]} onChange={(v) => setColor(f.key, v)} disabled={readOnly} />
                        ))}
                      </div>
                    ))}
                    <div>
                      <GroupLabel>Brand accents (both modes)</GroupLabel>
                      <ColorRow id="c-brand-gradient" label="Gradient end" hint="Paired with primary in gradients" value={tokens.brand?.gradient ?? DEFAULT_BRAND.gradient} onChange={(v) => setBrand({ gradient: v })} disabled={readOnly} />
                      <ColorRow id="c-brand-deep" label="Deep brand colour" hint="Dark bands and footer accents" value={tokens.brand?.deep ?? DEFAULT_BRAND.deep} onChange={(v) => setBrand({ deep: v })} disabled={readOnly} />
                    </div>
                  </>
                )}

                {panel === "typography" && (
                  <>
                    <div className="rounded-xl border border-border/60 p-4" style={{ background: tokens.colors.background, color: tokens.colors.foreground }}>
                      <p className="text-xl leading-tight font-bold" style={{ fontFamily: fontStack(tokens.typography?.headingFont) }}>Software that moves your business forward</p>
                      <p className="mt-2 text-sm opacity-75" style={{ fontFamily: fontStack(tokens.typography?.bodyFont) }}>We design, build and scale web apps, AI automations and digital products for ambitious teams.</p>
                    </div>
                    <div>
                      <GroupLabel>Popular pairings</GroupLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {[...new Map(THEME_PRESETS.map((p) => [`${p.tokens.typography?.headingFont}|${p.tokens.typography?.bodyFont}`, p.tokens.typography!])).values()].map((t) => (
                          <button key={`${t.headingFont}|${t.bodyFont}`} type="button" disabled={readOnly} onClick={() => setTypo({ headingFont: t.headingFont, bodyFont: t.bodyFont })} className="rounded-full border border-border/60 px-2.5 py-1 text-xs hover:border-primary/50 hover:text-primary">
                            <span style={{ fontFamily: fontStack(t.headingFont) }} className="font-semibold">{fontOption(t.headingFont).label}</span>
                            {t.headingFont !== t.bodyFont && <span className="text-muted-foreground"> + {fontOption(t.bodyFont).label}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                    <FontPicker id="font-heading" label="Heading font" value={tokens.typography?.headingFont ?? "geist"} onChange={(v) => setTypo({ headingFont: v })} disabled={readOnly} />
                    <FontPicker id="font-body" label="Body font" value={tokens.typography?.bodyFont ?? "geist"} onChange={(v) => setTypo({ bodyFont: v })} disabled={readOnly} />
                    <RangeRow id="font-scale" label="Text & spacing scale" value={tokens.typography?.scale ?? 100} min={85} max={115} step={1} format={(v) => `${v}% · ${((16 * v) / 100).toFixed(1)}px`} onChange={(v) => setTypo({ scale: v })} disabled={readOnly} />
                    <p className="text-[11px] text-muted-foreground">Scale resizes text and rem-based spacing together, so the layout keeps its proportions.</p>
                  </>
                )}

                {panel === "shape" && (
                  <>
                    <RangeRow id="radius" label="Corner radius" value={radiusValue} min={0} max={1.5} step={0.125} format={(v) => `${v}rem`} onChange={(v) => setTokens((t) => ({ ...t, radius: `${v}rem` }))} disabled={readOnly} />
                    <div className="flex flex-wrap gap-1.5">
                      {RADIUS_STOPS.map((s) => (
                        <button key={s.label} type="button" disabled={readOnly} onClick={() => setTokens((t) => ({ ...t, radius: `${s.value}rem` }))} className={cn("rounded-full border px-2.5 py-1 text-xs", radiusValue === s.value ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:border-primary/40")}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-3 rounded-xl border border-border/60 p-4" style={{ background: tokens.colors.muted }}>
                      <div className="flex gap-2">
                        <span className="px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: tokens.radius, background: tokens.colors.primary, color: tokens.colors.primaryForeground }}>Button</span>
                        <span className="border px-3 py-1.5 text-xs font-semibold" style={{ borderRadius: tokens.radius, borderColor: tokens.colors.border, background: tokens.colors.background, color: tokens.colors.foreground }}>Outline</span>
                      </div>
                      <div className="border p-3 text-xs" style={{ borderRadius: `calc(${tokens.radius} * 1.4)`, background: tokens.colors.card, borderColor: tokens.colors.border, color: tokens.colors.cardForeground }}>
                        Cards, inputs, images and menus all follow this radius.
                      </div>
                    </div>
                  </>
                )}

                {panel === "layout" && (
                  <>
                    <GroupLabel>Header</GroupLabel>
                    <OptionCards name="Header style" options={HEADER_VARIANTS} value={components.header} onChange={(v) => setComponent({ ...components, header: v })} disabled={readOnly} />
                    <GroupLabel>Header dropdown</GroupLabel>
                    <OptionCards name="Header dropdown" options={MENU_VARIANTS} value={components.menu} onChange={(v) => setComponent({ ...components, menu: v })} disabled={readOnly} />
                    <GroupLabel>Footer</GroupLabel>
                    <OptionCards name="Footer style" options={FOOTER_VARIANTS} value={components.footer} onChange={(v) => setComponent({ ...components, footer: v })} disabled={readOnly} />
                    <GroupLabel>Card style</GroupLabel>
                    <OptionCards name="Card style" options={CARD_VARIANTS} value={components.cards} onChange={(v) => setComponent({ ...components, cards: v })} disabled={readOnly} />
                    <GroupLabel>Photo treatment</GroupLabel>
                    <OptionCards name="Photo treatment" options={IMAGE_VARIANTS} value={components.images} onChange={(v) => setComponent({ ...components, images: v })} disabled={readOnly} />
                    <GroupLabel>Page width</GroupLabel>
                    <OptionCards name="Page width" options={WIDTH_VARIANTS} value={components.width} onChange={(v) => setComponent({ ...components, width: v })} disabled={readOnly} />
                    <GroupLabel>Section spacing</GroupLabel>
                    <OptionCards name="Section spacing" options={DENSITY_VARIANTS} value={components.density} onChange={(v) => setComponent({ ...components, density: v })} disabled={readOnly} />
                  </>
                )}

                {panel === "sections" && (
                  <>
                    <p className="text-xs text-muted-foreground">Choose an alternate design for sections that have one. Your page content stays the same — only how it&apos;s presented changes.</p>
                    {Object.entries(SECTION_VARIANTS).map(([type, options]) => (
                      <div key={type}>
                        <GroupLabel>{SECTION_LABELS[type] ?? type}</GroupLabel>
                        <OptionCards
                          name={SECTION_LABELS[type] ?? type}
                          options={options}
                          value={components.sections[type] ?? "default"}
                          onChange={(v) => {
                            const sections = { ...components.sections };
                            if (v === "default") delete sections[type];
                            else sections[type] = v;
                            setComponent({ ...components, sections });
                          }}
                          disabled={readOnly}
                        />
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground">Tip: open a service page in the preview (page picker above it) to see the page hero.</p>
                  </>
                )}

                {panel === "css" && (
                  <>
                    <p className="text-xs text-muted-foreground">Add your own CSS. It applies to the public website only (never the CMS) and is saved with the theme, including its version history.</p>
                    <Textarea
                      value={tokens.customCss ?? ""}
                      onChange={(e) => setTokens((t) => ({ ...t, customCss: e.target.value.slice(0, CUSTOM_CSS_LIMIT) }))}
                      rows={18}
                      spellCheck={false}
                      disabled={readOnly}
                      placeholder={".hero-title {\n  letter-spacing: -0.03em;\n}"}
                      className="font-mono text-xs"
                    />
                    <p className="text-right text-[11px] text-muted-foreground">{(tokens.customCss ?? "").length.toLocaleString()} / {CUSTOM_CSS_LIMIT.toLocaleString()}</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 border-t border-border/60 px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => setCollapsed(true)} className="text-muted-foreground">
            <PanelLeftClose className="size-4" /> Hide controls
          </Button>
          <PanelTabs className="ml-auto hidden md:inline-flex" label="Preview device" active={device} onSelect={(k) => setDevice(k as typeof device)} tabs={([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => ({ key: d, label: <span className="sr-only">{d} preview</span>, icon: <Icon className="size-4" /> }))} />
          <Button variant="ghost" size="icon-sm" onClick={() => setMode(mode === "light" ? "dark" : "light")} aria-label="Toggle light/dark preview" className="ml-auto md:ml-0">
            {mode === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </Button>
        </div>
      </aside>

      {/* ── Live preview ─────────────────────────────────────────── */}
      <section className={cn("min-w-0 flex-1 flex-col bg-muted/50", collapsed ? "flex" : "hidden md:flex")}>
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur">
          {collapsed && (
            <Button variant="outline" size="sm" onClick={() => setCollapsed(false)}>
              <PanelLeftOpen className="size-4" /> Controls
            </Button>
          )}
          <select
            aria-label="Page to preview"
            value={currentPath}
            onChange={(e) => reloadFrame(e.target.value, components)}
            className="h-8 max-w-[260px] min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs sm:max-w-xs"
          >
            {pageOptions.map((p) => (
              <option key={p.path} value={p.path}>{p.title} — {p.path}</option>
            ))}
          </select>
          <Button variant="ghost" size="icon-sm" onClick={() => reloadFrame(currentPath, components)} aria-label="Reload preview"><RefreshCw className="size-4" /></Button>
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground lg:inline-flex">
            <span className={cn("size-2 rounded-full", ready ? "bg-emerald-500" : "animate-pulse bg-amber-500")} /> {ready ? "Live preview — changes appear instantly" : "Loading preview…"}
          </span>
          <a href={currentPath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open this preview in a new tab (saved settings)">
            <ExternalLink className="size-3.5" /> <span className="hidden sm:inline">New tab</span>
          </a>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto p-0 md:p-4">
          <div className={cn("mx-auto h-full overflow-hidden bg-background transition-[width] duration-300", device !== "desktop" && "rounded-2xl border border-border shadow-xl", device === "desktop" && "md:rounded-xl md:border md:border-border/60 md:shadow-sm")} style={{ width: DEVICE_WIDTH[device], maxWidth: "100%" }}>
            <iframe
              ref={frameRef}
              src={frameSrc}
              title={`${name} theme preview`}
              className="size-full border-0"
              onLoad={() => {
                // The bridge's own "ready" message (after hydration) is what applies the edits; this only stops the
                // spinner spinning forever if a page never reports in (e.g. an error page).
                window.clearTimeout(loadFallback.current);
                loadFallback.current = window.setTimeout(() => setReady(true), 8000);
              }}
            />
          </div>
          {!ready && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 py-2 text-sm text-muted-foreground shadow-lg">
                <Loader2 className="size-4 animate-spin text-primary" /> Loading preview…
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
