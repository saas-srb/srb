"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2, Download, Eye, Info, Loader2, Paintbrush, Palette, Plus, Rocket, Search, SlidersHorizontal, Trash2, Moon, Sun, LayoutTemplate,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/products/sitecraft-ai/ui/ConfirmProvider";
import { Panel, PanelContent, PanelBody, PanelHeader, PanelTitle, PanelDescription, PanelFooter } from "@/components/products/sitecraft-ai/ui/SidePanel";
import { SearchInput, FilterChips, ToolbarSelect } from "@/components/products/sitecraft-ai/ui/ListToolbar";
import EmptyState from "@/components/products/sitecraft-ai/ui/EmptyState";
import ThemeThumbnail from "@/components/products/sitecraft-ai/theme/ThemeThumbnail";
import NewThemePanelContent from "@/components/products/sitecraft-ai/theme/NewThemePanel";
import type { CmsThemeDoc } from "@/lib/products/sitecraft-ai/theme";
import { fontOption, type ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";
import { THEME_CATEGORIES, getThemePreset, type ThemePreset } from "@/lib/products/sitecraft-ai/theme-presets";
import { HEADER_VARIANTS, FOOTER_VARIANTS, SECTION_VARIANTS, normalizeSelections, type ThemeComponentSelections } from "@/lib/products/sitecraft-ai/component-variants";
import { activateThemeAction, deleteThemeAction, installThemePresetAction } from "@/app/(products)/sitecraft-ai/(protected)/theme/actions";

interface GalleryItem {
  key: string;
  name: string;
  description: string;
  tokens: ThemeTokens;
  components: ThemeComponentSelections;
  installed: boolean;
  builtIn: boolean;
  category: string;
  tags: string[];
}

type Scope = "all" | "installed" | "library";

function toItems(themes: CmsThemeDoc[], presets: ThemePreset[]): GalleryItem[] {
  const installedKeys = new Set(themes.map((t) => t._id));
  const installed: GalleryItem[] = themes.map((t) => {
    const preset = getThemePreset(t.presetId ?? t._id);
    return {
      key: t._id, name: t.name, description: t.description, tokens: t.tokens, components: t.components ?? {},
      installed: true, builtIn: t.builtIn, category: t.builtIn ? "Built-in" : preset?.category ?? "Custom", tags: preset?.tags ?? [],
    };
  });
  const library: GalleryItem[] = presets
    .filter((p) => !installedKeys.has(p.id))
    .map((p) => ({ key: p.id, name: p.name, description: p.description, tokens: p.tokens, components: p.components, installed: false, builtIn: false, category: p.category, tags: p.tags }));
  return [...installed, ...library];
}

export default function ThemeGallery({
  themes: initialThemes,
  presets,
  activeKey: initialActiveKey,
  canEdit,
  canPublish,
}: {
  themes: CmsThemeDoc[];
  presets: ThemePreset[];
  activeKey: string;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [themes, setThemes] = useState(initialThemes);
  const [activeKey, setActiveKey] = useState(initialActiveKey);
  const [scope, setScope] = useState<Scope>("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<GalleryItem | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const items = useMemo(() => toItems(themes, presets), [themes, presets]);
  const counts = { all: items.length, installed: items.filter((i) => i.installed).length, library: items.filter((i) => !i.installed).length };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (scope === "all" ? true : scope === "installed" ? i.installed : !i.installed))
      .filter((i) => category === "all" || i.category === category)
      .filter((i) => !q || `${i.name} ${i.description} ${i.tags.join(" ")} ${i.category}`.toLowerCase().includes(q))
      // Active theme first, then installed, then the library.
      .sort((a, b) => Number(b.key === activeKey) - Number(a.key === activeKey) || Number(b.installed) - Number(a.installed));
  }, [items, scope, category, query, activeKey]);

  const run = (key: string, fn: () => Promise<void>) => {
    setBusyKey(key);
    startTransition(async () => {
      await fn();
      setBusyKey(null);
    });
  };

  const activate = async (item: GalleryItem) => {
    if (!(await confirm({ title: `Activate “${item.name}”?`, description: "The whole public website switches to this theme's colours, fonts and layout choices straight away. You can switch back at any time.", confirmLabel: "Activate theme" }))) return;
    run(item.key, async () => {
      if (!item.installed) {
        const res = await installThemePresetAction(item.key, { activate: true });
        if (!res.ok) { toast.error(res.error); return; }
      } else {
        const res = await activateThemeAction(item.key);
        if (!res.ok) { toast.error(res.error); return; }
      }
      setActiveKey(item.key);
      setDetails(null);
      toast.success(`${item.name} is now the active theme`);
      router.refresh();
    });
  };

  const install = (item: GalleryItem) => {
    run(item.key, async () => {
      const res = await installThemePresetAction(item.key);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`${item.name} installed`);
      setDetails(null);
      router.refresh();
      // Reflect it immediately; the refresh brings the real doc.
      const p = getThemePreset(item.key);
      if (p) setThemes((prev) => [...prev, { _id: p.id, name: p.name, description: p.description, builtIn: false, presetId: p.id, tokens: p.tokens, draftTokens: p.tokens, components: p.components, publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null }]);
    });
  };

  const remove = async (item: GalleryItem) => {
    const fromLibrary = !!getThemePreset(item.key);
    if (!(await confirm({
      title: `Delete the “${item.name}” theme?`,
      description: fromLibrary
        ? "Your customizations and page arrangements for it are deleted. The original stays in the theme library, so you can install it again."
        : "Its colours, fonts, component choices and page arrangements are deleted.",
      confirmLabel: "Delete theme",
      destructive: true,
    }))) return;
    run(item.key, async () => {
      const res = await deleteThemeAction(item.key);
      if (!res.ok) { toast.error(res.error); return; }
      setThemes((prev) => prev.filter((t) => t._id !== item.key));
      setDetails(null);
      toast.success("Theme deleted");
    });
  };

  const categories = ["Built-in", ...THEME_CATEGORIES, "Custom"].filter((c) => items.some((i) => i.category === c));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips<Scope>
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All themes", count: counts.all },
            { value: "installed", label: "Installed", count: counts.installed },
            { value: "library", label: "Theme library", count: counts.library },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search themes…" />
          <ToolbarSelect label="Category" value={category} onChange={setCategory} options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
          {canEdit && (
            <Panel open={newOpen} onOpenChange={setNewOpen}>
              <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="size-3.5" /> New theme
              </Button>
              <NewThemePanelContent
                themes={themes}
                onClose={() => setNewOpen(false)}
                onCreated={(doc) => {
                  setThemes((prev) => [...prev, doc]);
                  setNewOpen(false);
                  toast.success("Theme created");
                }}
              />
            </Panel>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Search} title="No themes match" description="Try another search or category." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => {
            const isActive = item.key === activeKey;
            const busy = busyKey === item.key;
            return (
              <div
                key={item.key}
                data-theme-key={item.key}
                className={cn(
                  "lms-surface group overflow-hidden rounded-2xl border bg-card/80 transition-all hover:-translate-y-0.5 hover:shadow-lg",
                  isActive ? "border-primary/50 ring-2 ring-primary/30" : "border-border/60"
                )}
              >
                <button type="button" onClick={() => setDetails(item)} className="relative block w-full text-left" aria-label={`${item.name} details`}>
                  <ThemeThumbnail tokens={item.tokens} components={item.components} className="border-b border-border/60" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black shadow">
                      <Info className="size-3.5" /> Theme details
                    </span>
                  </span>
                  <span className="absolute top-2.5 left-2.5 flex gap-1.5">
                    {isActive && <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600"><CheckCircle2 className="size-3" /> Active</Badge>}
                    {!item.installed && <Badge variant="secondary" className="bg-background/90 backdrop-blur">Library</Badge>}
                  </span>
                </button>
                <div className="flex items-center gap-2 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.category} · {fontOption(item.tokens.typography?.headingFont).label.replace(" (site default)", "")}
                    </p>
                  </div>
                  <Link href={`/sitecraft-ai/customize/${item.key}`} className={buttonVariants({ variant: "outline", size: "sm" })} title={isActive ? "Customize" : "Live preview"}>
                    {isActive ? <Paintbrush className="size-3.5" /> : <Eye className="size-3.5" />}
                    <span className="hidden sm:inline">{isActive ? "Customize" : "Live Preview"}</span>
                  </Link>
                  {!isActive && canPublish && (
                    <Button size="sm" onClick={() => activate(item)} disabled={busy}>
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} Activate
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ThemeDetailsPanel
        item={details}
        isActive={details?.key === activeKey}
        busy={!!details && busyKey === details.key}
        canEdit={canEdit}
        canPublish={canPublish}
        onClose={() => setDetails(null)}
        onActivate={activate}
        onInstall={install}
        onDelete={remove}
      />
    </div>
  );
}

function ThemeDetailsPanel({
  item, isActive, busy, canEdit, canPublish, onClose, onActivate, onInstall, onDelete,
}: {
  item: GalleryItem | null;
  isActive: boolean;
  busy: boolean;
  canEdit: boolean;
  canPublish: boolean;
  onClose: () => void;
  onActivate: (item: GalleryItem) => void;
  onInstall: (item: GalleryItem) => void;
  onDelete: (item: GalleryItem) => void;
}) {
  const [dark, setDark] = useState(false);
  if (!item) return null;
  const c = dark ? item.tokens.colorsDark : item.tokens.colors;
  const sel = normalizeSelections(item.components);
  const typo = item.tokens.typography;
  const swatches: [string, string][] = [
    ["Primary", c.primary], ["Secondary", c.secondary], ["Accent", c.accent], ["Background", c.background],
    ["Text", c.foreground], ["Muted", c.muted], ["Border", c.border], ["Gradient", item.tokens.brand?.gradient ?? "#ff8e75"],
  ];
  const variantLabel = (list: { key: string; label: string }[], key: string) => list.find((v) => v.key === key)?.label ?? "Standard";

  return (
    <Panel open onOpenChange={(o) => !o && onClose()}>
      <PanelContent size="xl">
        <PanelHeader>
          <div className="flex flex-wrap items-center gap-2">
            <PanelTitle>{item.name}</PanelTitle>
            {isActive && <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">Active</Badge>}
            <Badge variant="secondary">{item.installed ? item.category : `Theme library · ${item.category}`}</Badge>
          </div>
          <PanelDescription>{item.description}</PanelDescription>
        </PanelHeader>
        <PanelBody className="space-y-6">
          <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border border-border/60 shadow-sm">
              <ThemeThumbnail tokens={item.tokens} components={item.components} dark={dark} />
            </div>
            <div className="flex justify-end">
              <div className="inline-flex rounded-full border border-border/60 p-0.5 text-xs">
                <button type="button" onClick={() => setDark(false)} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1", !dark && "bg-primary text-primary-foreground")}><Sun className="size-3" /> Light</button>
                <button type="button" onClick={() => setDark(true)} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1", dark && "bg-primary text-primary-foreground")}><Moon className="size-3" /> Dark</button>
              </div>
            </div>
          </div>

          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((t) => <Badge key={t} variant="outline" className="font-normal">{t}</Badge>)}
            </div>
          )}

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><Palette className="size-3.5" /> Colours ({dark ? "dark" : "light"} mode)</h3>
            <div className="grid grid-cols-4 gap-2">
              {swatches.map(([label, color]) => (
                <div key={label} className="space-y-1">
                  <div className="h-10 rounded-lg border border-border/60" style={{ background: color }} />
                  <p className="text-[11px] leading-tight text-muted-foreground">{label}<br /><span className="font-mono">{color}</span></p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border border-border/60 p-3">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Typography</h3>
              <p className="text-sm">Headings: <strong>{fontOption(typo?.headingFont).label}</strong></p>
              <p className="text-sm">Body: <strong>{fontOption(typo?.bodyFont).label}</strong></p>
              <p className="text-sm">Scale: <strong>{typo?.scale ?? 100}%</strong> · Corners: <strong>{item.tokens.radius}</strong></p>
            </div>
            <div className="space-y-1.5 rounded-xl border border-border/60 p-3">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><LayoutTemplate className="size-3.5" /> Layout</h3>
              <p className="text-sm">Header: <strong>{variantLabel(HEADER_VARIANTS, sel.header)}</strong></p>
              <p className="text-sm">Footer: <strong>{variantLabel(FOOTER_VARIANTS, sel.footer)}</strong></p>
              <p className="text-sm">Page hero: <strong>{variantLabel(SECTION_VARIANTS["page-hero"] ?? [], sel.sections["page-hero"] ?? "default")}</strong></p>
            </div>
          </section>

          {item.installed && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">More tools</h3>
              <div className="flex flex-wrap gap-2">
                <Link href={`/sitecraft-ai/theme/${item.key}`} className={buttonVariants({ variant: "outline", size: "sm" })}><SlidersHorizontal className="size-3.5" /> Advanced settings & history</Link>
                <Link href={`/sitecraft-ai/theme/${item.key}/preview`} className={buttonVariants({ variant: "outline", size: "sm" })}><LayoutTemplate className="size-3.5" /> Page arrangements</Link>
              </div>
            </section>
          )}
        </PanelBody>
        <PanelFooter className="flex-wrap justify-between gap-2">
          <div>
            {item.installed && !item.builtIn && !isActive && canPublish && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(item)} disabled={busy}>
                <Trash2 className="size-3.5" /> Delete
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!item.installed && canEdit && (
              <Button variant="outline" size="sm" onClick={() => onInstall(item)} disabled={busy}>
                <Download className="size-3.5" /> Install
              </Button>
            )}
            <Link href={`/sitecraft-ai/customize/${item.key}`} className={buttonVariants({ variant: isActive ? "default" : "outline", size: "sm" })}>
              {isActive ? <Paintbrush className="size-3.5" /> : <Eye className="size-3.5" />} {isActive ? "Customize" : "Live Preview"}
            </Link>
            {!isActive && canPublish && (
              <Button size="sm" onClick={() => onActivate(item)} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />} {item.installed ? "Activate" : "Install & Activate"}
              </Button>
            )}
          </div>
        </PanelFooter>
      </PanelContent>
    </Panel>
  );
}
