"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { completeWith } from "@/lib/access/complete";
import type { AccessMap, Level } from "@/lib/access/types";
import type { AccessUiModel, UiFeature, UiProduct } from "@/lib/access/ui-model";

/**
 * Step 2: every product and every feature, each with three states: None, Read only, Read & Write (write implies read).
 * `picked` holds only what the Director chose; the product basics ("baseline") are added by `completeWith` and shown locked as Included.
 * Access is only ever shown as features and levels.
 */

type State = "none" | "read" | "write";
const STATES: { value: State; label: string }[] = [
  { value: "none", label: "None" },
  { value: "read", label: "Read only" },
  { value: "write", label: "Read & Write" },
];

function stateOf(picked: AccessMap, product: string, key: string): State {
  return picked[product]?.[key] ?? "none";
}

export default function AccessMatrix({
  model,
  picked,
  carried,
  onChange,
  isDirector = false,
  defaultOpen,
}: {
  model: AccessUiModel;
  /** The features the Director picked (real features only). */
  picked: AccessMap;
  /** Identity gates carried from the older roles (kept while the product is in use). */
  carried?: AccessMap;
  onChange: (next: AccessMap) => void;
  isDirector?: boolean;
  /** Products shown expanded at first. */
  defaultOpen?: string[];
}) {
  const [query, setQuery] = useState("");
  const [onlyGranted, setOnlyGranted] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set(defaultOpen ?? []));
  const q = query.trim().toLowerCase();

  const effective = useMemo(
    () => completeWith(picked, carried ?? {}, (p) => model.baselineByProduct[p] ?? []),
    [picked, carried, model.baselineByProduct]
  );

  const set = (product: string, key: string, level: State) => {
    const next: AccessMap = { ...picked, [product]: { ...(picked[product] ?? {}) } };
    if (level === "none") delete next[product][key];
    else next[product][key] = level;
    if (Object.keys(next[product]).length === 0) delete next[product];
    onChange(next);
  };

  const setProduct = (p: UiProduct, mode: "none" | "read" | "write") => {
    const next: AccessMap = { ...picked };
    if (mode === "none") delete next[p.key];
    else {
      const preset = model.presets[p.key];
      const keys = mode === "read" ? preset.read : preset.write;
      // The read preset grants each listed feature at the level it needs (for most products all of them are view features).
      next[p.key] = Object.fromEntries(keys.map((k) => [k, (mode === "read" || p.features.find((f) => f.key === k)?.needs === "read" ? (p.features.find((f) => f.key === k)?.needs ?? "read") : mode) as Level]));
    }
    onChange(next);
  };

  /** Sets one area (module) of a product at once: every feature in it to none, read (where it has a view level) or write. */
  const setArea = (p: UiProduct, area: string, mode: State) => {
    const next: AccessMap = { ...picked, [p.key]: { ...(picked[p.key] ?? {}) } };
    for (const f of p.features.filter((x) => x.area === area)) {
      if (mode === "none") delete next[p.key][f.key];
      else next[p.key][f.key] = mode === "write" && f.needs !== "read" ? "write" : "read";
    }
    if (Object.keys(next[p.key]).length === 0) delete next[p.key];
    onChange(next);
  };

  const toggle = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandAll = () => setOpen(new Set(model.products.map((p) => p.key)));
  const collapseAll = () => setOpen(new Set());

  const matches = (f: UiFeature) => !q || f.label.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.area.toLowerCase().includes(q);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products and features" aria-label="Search products and features" className="h-10 rounded-xl pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium"><input type="checkbox" checked={onlyGranted} onChange={(e) => setOnlyGranted(e.target.checked)} className="accent-primary" />Show only granted</label>
          <Button type="button" variant="outline" size="sm" onClick={expandAll}>Expand all</Button>
          <Button type="button" variant="outline" size="sm" onClick={collapseAll}>Collapse all</Button>
        </div>
      </div>

      <p className="rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Pick what this person can do in each product. <strong>Read only</strong> means they can open and view; <strong>Read &amp; Write</strong> also lets them change, create, approve or send.
        Anyone who gets a product also gets its basics, shown as <span className="font-medium text-foreground">Included</span>; those cannot be turned off.
        {isDirector && " A Director always has full access, so nothing here can be changed."}
      </p>

      <div className="space-y-2">
        {model.products.filter((p) => p.key !== model.workspaceProduct).map((p) => {
          const granted = (f: UiFeature) => isDirector || Boolean(effective[p.key]?.[f.key]);
          // A search that names the product shows all of its features; otherwise only the features that match.
          const productHit = Boolean(q) && p.name.toLowerCase().includes(q);
          const shown = p.features.filter((f) => (productHit || matches(f)) && (!onlyGranted || granted(f)));
          if ((q || onlyGranted) && shown.length === 0) return null;
          const isOpen = open.has(p.key) || Boolean(q) || onlyGranted;
          const baseline = new Set(model.baselineByProduct[p.key] ?? []);
          const counts = { read: 0, write: 0 };
          for (const f of p.features) {
            const s = isDirector ? (f.needs === "read" ? "read" : "write") : (effective[p.key]?.[f.key] as Level | undefined);
            if (s === "write") counts.write++; else if (s === "read") counts.read++;
          }
          const level = counts.write ? "Read & Write" : counts.read ? "Read only" : "No access";
          const preset = model.presets[p.key];
          const areas = [...new Set(shown.map((f) => f.area))];
          return (
            <section key={p.key} className="rounded-2xl border border-border/50 bg-card" aria-label={p.name}>
              <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => toggle(p.key)} aria-expanded={isOpen} aria-controls={`prod-${p.key}`} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  {isOpen ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${counts.write ? "border-primary/30 bg-primary/10 text-primary" : counts.read ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300" : ""}`}>{level}</Badge>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{counts.write + counts.read} of {p.features.length} features</span>
                </button>
                {!isDirector && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Quick choice for ${p.name}`}>
                    <Button type="button" size="xs" variant="outline" onClick={() => setProduct(p, "none")}>No access</Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => setProduct(p, "read")} title={preset.readExtras.length ? `This product's lowest level also includes: ${preset.readExtras.join(", ")}` : undefined}>{preset.readLabel}</Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => setProduct(p, "write")}>Read &amp; Write (everything)</Button>
                  </div>
                )}
              </div>
              {isOpen && (
                <div id={`prod-${p.key}`} className="space-y-3 border-t border-border/40 p-3">
                  {!isDirector && preset.readExtras.length > 0 && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                      For this product the lowest level that can be applied also includes: {preset.readExtras.join(", ")}.
                    </p>
                  )}
                  {areas.map((area) => (
                    <div key={area}>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{area} <span className="font-normal normal-case">({shown.filter((f) => f.area === area).filter(granted).length} of {p.features.filter((f) => f.area === area).length})</span></h4>
                        {!isDirector && (
                          <span className="flex gap-1" role="group" aria-label={`Quick choice for ${area}`}>
                            {([["none", "None"], ["read", "All read"], ["write", "All write"]] as const).map(([m, l]) => <button key={m} type="button" onClick={() => setArea(p, area, m)} className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">{l}</button>)}
                          </span>
                        )}
                      </div>
                      <ul className="divide-y divide-border/40 rounded-xl border border-border/40">
                        {shown.filter((f) => f.area === area).map((f) => {
                          const forced = baseline.has(f.key) && Boolean(effective[p.key]?.[f.key]) && !picked[p.key]?.[f.key];
                          const any = Boolean(effective[p.key]?.[f.key]);
                          const baselineLocked = any && !picked[p.key]?.[f.key];
                          const current: State = isDirector ? (f.needs === "read" ? "read" : "write") : baselineLocked ? ((effective[p.key]![f.key] as State)) : stateOf(picked, p.key, f.key);
                          void forced;
                          return (
                            <li key={f.key} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1.5 text-sm font-medium">
                                  {f.label}
                                  {f.scope === "all" && <Badge variant="outline" className="text-[10px]">Everyone&apos;s, not only own</Badge>}
                                  {baselineLocked && <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="size-3" aria-hidden />Included</Badge>}
                                </p>
                                {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                              </div>
                              <div role="radiogroup" aria-label={`${f.label} access`} className="flex shrink-0 overflow-hidden rounded-lg border border-border/60 text-xs">
                                {STATES.map((s) => {
                                  const disabled = isDirector || baselineLocked || (s.value === "write" && f.needs === "read");
                                  const active = current === s.value;
                                  return (
                                    <button
                                      key={s.value}
                                      type="button"
                                      role="radio"
                                      aria-checked={active}
                                      disabled={disabled && !active}
                                      title={s.value === "write" && f.needs === "read" ? "This feature only has a view level" : undefined}
                                      onClick={() => !disabled && set(p.key, f.key, s.value)}
                                      className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary ${active ? (s.value === "none" ? "bg-muted font-semibold text-foreground" : s.value === "read" ? "bg-sky-500/15 font-semibold text-sky-700 dark:text-sky-300" : "bg-primary/15 font-semibold text-primary") : "text-muted-foreground hover:bg-muted/60 disabled:opacity-40"}`}
                                    >
                                      {active && s.value !== "none" && <Check className="size-3" aria-hidden />}
                                      {s.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
