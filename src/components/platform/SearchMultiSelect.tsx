"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** The part of a label that matches the search, marked so the eye finds it. */
function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-primary/20 px-0.5 text-foreground">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** A direct hit for what was typed that lives elsewhere (e.g. a sub-category found from the category field); picking it runs `onPick`. */
export interface SearchExtra {
  key: string;
  label: string;
  hint: string;
  picked?: boolean;
  onPick: () => void;
}

export interface MultiOption {
  value: string;
  label: string;
  /** Options with the same group are listed under a heading. */
  group?: string;
  /** A short line under the label saying what the option covers (hidden while a search is showing why it matched). */
  description?: string;
  /** Extra words the search also matches (shown as "matches …" when that is why the option is listed). */
  keywords?: string[];
}

/**
 * A searchable multi-select: pick any number of options from a long list. Chips show the choices, the product has a
 * search box and (optionally) grouped options with per-group "all / none". Each choice is also rendered as a hidden
 * input named `name`, so a plain <form> submission carries them all.
 */
export default function SearchMultiSelect({
  name, options, values, onChange, placeholder, searchPlaceholder = "Search…", emptyText = "Nothing matches your search.", disabled, invalid, id,
  max, customPrefix, cleanCustom, title, customLabel = "option", customExample = "", searchExtras,
}: {
  name: string;
  options: MultiOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** At most this many choices (custom ones included). */
  max?: number;
  /** When set, people can type their own entry; it is stored as `<customPrefix><text>`. */
  customPrefix?: string;
  /** Cleans typed text (returns "" to reject). */
  cleanCustom?: (text: string) => string;
  /** Heading of the full-screen picker on phones. */
  title?: string;
  /** What a typed entry is called in the "Add your own …" button, e.g. "category". */
  customLabel?: string;
  /** An example shown in the "add your own" form, e.g. "Flat broker". */
  customExample?: string;
  /** Direct matches shown above the list while searching, e.g. business types found inside other categories. */
  searchExtras?: (query: string) => SearchExtra[];
}) {
  const auto = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Phones: the picker is a full-screen sheet sized to the VISIBLE area, so the on-screen keyboard never covers the list.
  const [phone, setPhone] = useState(false);
  const [view, setView] = useState<{ h: number; top: number } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => new Set(values), [values]);
  const labelOf = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const nameOf = (v: string) => labelOf.get(v) ?? (customPrefix && v.startsWith(customPrefix) ? v.slice(customPrefix.length) : v);
  const atMax = max !== undefined && values.length >= max;

  // "Add your own": a small form of its own, separate from the search box.
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState("");
  const [notice, setNotice] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(-1);
  // Desktop: the product is fixed to the screen at the field's position (so no card or section can clip it), opening upward when there is more room above.
  const [anchor, setAnchor] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const close = () => {
    setOpen(false);
    setQuery("");
    setAdding(false);
    setDraft("");
    setAddError("");
    setNotice("");
  };

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 639px)");
    setPhone(mq.matches);
    const onMq = () => setPhone(mq.matches);
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, [open]);
  useEffect(() => {
    if (!open || !phone) return;
    const vv = window.visualViewport;
    const sync = () => setView({ h: vv?.height ?? window.innerHeight, top: vv?.offsetTop ?? 0 });
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      document.body.style.overflow = prev;
      setView(null);
    };
  }, [open, phone]);
  useEffect(() => {
    if (!open || phone) return;
    const place = () => {
      const r = root.current?.getBoundingClientRect();
      if (!r) return;
      const gap = 6, margin = 12;
      const below = window.innerHeight - r.bottom - gap - margin;
      const above = r.top - gap - margin;
      const up = below < 340 && above > below;
      setAnchor(up ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + gap, maxH: Math.max(260, above) } : { left: r.left, width: r.width, top: r.bottom + gap, maxH: Math.max(260, below) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      setAnchor(null);
    };
  }, [open, phone]);
  useEffect(() => {
    if (!open || phone) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (root.current && !root.current.contains(t) && !panel.current?.contains(t)) close();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, phone]);
  useEffect(() => {
    // On a phone the keyboard would cover half the list, so the search box is focused by tapping it, not on open.
    if (open && !phone) {
      search.current?.focus({ preventScroll: true });
    }
  }, [open, phone]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q) || o.keywords?.some((k) => k.toLowerCase().includes(q))) : options), [options, q]);
  const groups = useMemo(() => {
    const map = new Map<string, MultiOption[]>();
    for (const o of shown) {
      const g = o.group ?? "";
      map.set(g, [...(map.get(g) ?? []), o]);
    }
    return [...map.entries()];
  }, [shown]);

  const extras = useMemo(() => (q && searchExtras ? searchExtras(q) : []), [q, searchExtras]);
  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups]);
  const indexOf = useMemo(() => new Map(flat.map((o, i) => [o, i])), [flat]);
  useEffect(() => { setActive(-1); }, [q]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id ?? auto}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, auto]);
  const toggle = (v: string) => {
    if (selected.has(v)) return onChange(values.filter((x) => x !== v));
    if (atMax) return;
    onChange([...values, v]);
  };
  // A typed entry: matches an existing option exactly → pick that one; otherwise add it as custom.
  const typed = customPrefix && cleanCustom ? cleanCustom(query) : "";
  const exact = typed ? options.find((o) => o.label.toLowerCase() === typed.toLowerCase()) : undefined;
  const addTyped = () => {
    if (!typed || atMax) return;
    const value = exact ? exact.value : `${customPrefix}${typed}`;
    if (!selected.has(value)) onChange([...values, value]);
    setQuery("");
    search.current?.focus();
  };
  const openAdd = () => {
    setDraft(query.trim());
    setAddError("");
    setNotice("");
    setAdding(true);
    setTimeout(() => draftRef.current?.focus(), 30);
  };
  const submitAdd = () => {
    const name = cleanCustom ? cleanCustom(draft) : draft.trim();
    if (!name) return setAddError("Type a name first (at least 2 letters).");
    const same = options.find((o) => o.label.toLowerCase() === name.toLowerCase());
    const value = same ? same.value : `${customPrefix}${name}`;
    if (selected.has(value)) return setAddError(`“${name}” is already in your choices.`);
    if (atMax) return setAddError(`You can choose up to ${max}. Remove one to add another.`);
    onChange([...values, value]);
    setAdding(false);
    setDraft("");
    setAddError("");
    setQuery("");
    setNotice(same ? `Selected “${same.label}” from the list.` : `Added “${name}” as your own ${customLabel}.`);
  };
  const setGroup = (items: MultiOption[], on: boolean) => {
    const ids = new Set(items.map((i) => i.value));
    const add = items.map((i) => i.value).filter((v) => !selected.has(v));
    const room = max === undefined ? add.length : Math.max(0, max - values.length);
    onChange(on ? [...values, ...add.slice(0, room)] : values.filter((v) => !ids.has(v)));
  };
  const controlId = id ?? auto;

  return (
    <div ref={root} className="relative">
      {values.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      <div
        id={controlId}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id ?? auto}-list`}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === "Escape") close();
        }}
        className={cn(
          "flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30",
          invalid && "border-destructive",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {values.length === 0 && <span className="px-1 text-muted-foreground">{placeholder}</span>}
        {values.slice(0, 4).map((v) => (
          <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-foreground">
            <span className="truncate">{nameOf(v)}</span>
            <button type="button" aria-label={`Remove ${nameOf(v)}`} onClick={(e) => { e.stopPropagation(); toggle(v); }} className="rounded hover:text-destructive">
              <X className="size-3" />
            </button>
          </span>
        ))}
        {values.length > 4 && <span className="px-1 text-xs text-muted-foreground">+{values.length - 4} more</span>}
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </div>

      {open && (() => {
        const sheet = (
        <div
          ref={panel}
          id={`${id ?? auto}-list`}
          className={cn(
            "flex flex-col overflow-hidden bg-popover text-popover-foreground",
            phone ? "fixed inset-x-0 z-[100]" : "fixed z-[100] rounded-lg border border-border shadow-2xl"
          )}
          style={phone ? { top: view?.top ?? 0, height: view?.h ?? "100dvh" } : anchor ? { left: anchor.left, width: anchor.width, top: anchor.top, bottom: anchor.bottom, maxHeight: anchor.maxH } : { visibility: "hidden" }}
          role={phone ? "dialog" : "listbox"}
          aria-modal={phone || undefined}
          aria-label={title ?? searchPlaceholder}
          aria-multiselectable="true"
        >
          {phone && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-base font-bold">{title ?? "Select"}</h2>
              <button type="button" onClick={close} aria-label="Close" className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground"><X className="size-5" /></button>
            </div>
          )}
          <div className={cn("shrink-0 space-y-2 border-b border-border bg-muted/20 px-3", phone ? "py-3" : "py-2.5")}>
            {/* A clearly boxed field: icon, text, and a button to wipe what was typed. */}
            <label className={cn("flex items-center gap-2 rounded-lg border-2 border-input bg-background px-3 shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20", phone ? "h-12" : "h-10")}>
              <Search className="size-4 shrink-0 text-primary" aria-hidden />
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(flat.length - 1, i + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (active >= 0 && flat[active]) toggle(flat[active].value);
                    else if (flat.length === 1 && q) toggle(flat[0].value);
                    else if (typed && !exact) openAdd();
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                enterKeyHint="search"
                autoComplete="off"
                // The themed pages draw their own focus ring on every :focus-visible; this field already shows one on its box.
                style={{ outline: "none", boxShadow: "none", border: 0, background: "transparent", padding: 0 }}
                className={cn("min-w-0 flex-1 bg-transparent font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground", phone ? "text-base" : "text-sm")}
              />
              {query && (
                <button type="button" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="Clear search" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">
                {q ? `${shown.length} ${shown.length === 1 ? "match" : "matches"} for “${query.trim()}”` : `${options.length} options — type to search`}
              </span>
              {max !== undefined && <span className={cn("shrink-0 tabular-nums", atMax ? "font-semibold text-primary" : "")}>{values.length}/{max} chosen</span>}
              {values.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="shrink-0 font-medium text-primary hover:underline">Clear chosen</button>
              )}
              <button type="button" onClick={close} aria-label="Close list" className={cn("shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground", phone && "hidden")}>
                <X className="size-4" />
              </button>
            </div>
          </div>
          {customPrefix && (
            <div className="shrink-0 border-b border-border bg-primary/[0.04] px-3 py-2.5">
              {adding ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">Add your own {customLabel}</p>
                    <button type="button" onClick={() => { setAdding(false); setAddError(""); }} className="text-xs font-medium text-muted-foreground hover:text-foreground">← Back to the list</button>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">Name of your {customLabel}{customExample ? ` (for example: ${customExample})` : ""}</span>
                    <input
                      ref={draftRef}
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); setAddError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }}
                      placeholder={customExample ? `e.g. ${customExample}` : `Your ${customLabel}`}
                      maxLength={60}
                      autoComplete="off"
                      enterKeyHint="done"
                      style={{ outline: "none" }}
                      aria-invalid={!!addError || undefined}
                      className={cn("w-full rounded-lg border-2 bg-background px-3 font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20", addError ? "border-destructive" : "border-input", phone ? "h-12 text-base" : "h-10 text-sm")}
                    />
                  </label>
                  {addError && <p role="alert" className="text-xs font-medium text-destructive">{addError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={submitAdd} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"><Plus className="size-4" />Add {customLabel}</button>
                    <button type="button" onClick={() => { setAdding(false); setAddError(""); }} className="rounded-lg border border-input px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {notice && <p role="status" className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-foreground"><Check className="size-3.5 text-primary" />{notice}</p>}
                  <div className="flex items-center gap-3">
                    <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">{typed && !exact ? <>No “{typed}” in the list?</> : <>Not in the list?</>}</p>
                    <button type="button" onClick={openAdd} disabled={atMax} className="flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
                      <Plus className="size-4" /> Add your own {customLabel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {phone && values.length > 0 && !adding && (
            <div className="flex max-h-24 shrink-0 flex-wrap gap-1.5 overflow-y-auto border-b border-border px-3 py-2" aria-label="Your choices">
              {values.map((v) => (
                <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-foreground">
                  <span className="truncate">{nameOf(v)}</span>
                  <button type="button" aria-label={`Remove ${nameOf(v)}`} onClick={() => toggle(v)} className="flex size-4 items-center justify-center rounded-full hover:bg-primary/20"><X className="size-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className={cn("overflow-y-auto overscroll-contain py-1", "min-h-0 flex-1", adding && "hidden")}>
            {extras.length > 0 && (
              <div className="border-b border-border pb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-primary">Matching business types</p>
                {extras.map((x) => (
                  <button key={x.key} type="button" onClick={() => { x.onPick(); setQuery(""); }} className={cn("flex w-full items-start gap-3 px-3 text-left hover:bg-muted/60", x.picked && "bg-primary/[0.06]", phone ? "py-3 text-base" : "py-1.5 text-sm")}>
                    <span className={cn("mt-0.5 flex shrink-0 items-center justify-center rounded border", phone ? "size-5" : "size-4", x.picked ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{x.picked && <Check className="size-3" />}</span>
                    <span className="min-w-0">
                      <span className="font-bold text-foreground"><Highlight text={x.label} q={q} /></span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">in {x.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {groups.length === 0 && extras.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Search className="size-5" /></span>
                <p className="text-sm font-medium text-foreground">{emptyText}</p>
                {customPrefix && <p className="text-xs text-muted-foreground">Not finding it? Use <b>Add your own {customLabel}</b> above.</p>}
              </div>
            )}
            {groups.map(([group, items]) => {
              const all = items.every((i) => selected.has(i.value));
              return (
                <div key={group || "all"}>
                  {group && (
                    <div className="sticky top-0 z-10 flex items-center justify-between bg-popover/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                      <span className="truncate">{group}</span>
                      <button type="button" onClick={() => setGroup(items, !all)} className="shrink-0 normal-case text-primary hover:underline">{all ? "None" : "All"}</button>
                    </div>
                  )}
                  {items.map((o) => {
                    const on = selected.has(o.value);
                    const idx = indexOf.get(o) ?? -1;
                    return (
                      <button
                        key={o.value}
                        id={`${id ?? auto}-opt-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => toggle(o.value)}
                        onMouseEnter={() => setActive(idx)}
                        disabled={!on && atMax}
                        className={cn("flex w-full items-start gap-3 px-3 text-left hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40", on && "bg-primary/[0.06]", idx === active && "bg-muted/80 ring-1 ring-inset ring-primary/40", phone ? "py-3 text-base" : "gap-2 py-1.5 text-sm")}
                      >
                        <span className={cn("mt-0.5 flex shrink-0 items-center justify-center rounded border", phone ? "size-5" : "size-4", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                          {on && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0">
                          <span className="font-bold text-foreground"><Highlight text={o.label} q={q} /></span>
                          {o.description && !(q && !o.label.toLowerCase().includes(q) && o.keywords?.some((k) => k.toLowerCase().includes(q))) && (
                            <span className="line-clamp-2 block text-xs font-normal leading-snug text-muted-foreground">{o.description}</span>
                          )}
                          {q && !o.label.toLowerCase().includes(q) && o.keywords?.find((k) => k.toLowerCase().includes(q)) && (
                            <span className="block truncate text-xs text-muted-foreground">includes: {o.keywords.filter((k) => k.toLowerCase().includes(q)).slice(0, 3).join(", ")}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className={cn("flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/30 px-3", phone ? "py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "py-2")}>
            <span className="text-xs text-muted-foreground">{values.length === 0 ? "Nothing selected yet" : `${values.length} selected`}{atMax ? " · limit reached" : ""}</span>
            <button type="button" onClick={close} className={cn("rounded-md bg-primary font-semibold text-primary-foreground hover:opacity-90", phone ? "px-6 py-2.5 text-sm" : "px-3 py-1 text-xs")}>Done</button>
          </div>
        </div>
        );
        // Into the nearest themed wrapper (the SelfRun pages colour themselves from `.sr`), not the bare body.
        return createPortal(sheet, (root.current?.closest(".sr") as HTMLElement | null) ?? document.body);
      })()}
    </div>
  );
}
