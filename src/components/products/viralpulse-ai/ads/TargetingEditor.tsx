"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import SourceBadge from "@/components/products/viralpulse-ai/shared/SourceBadge";
import { searchTargetingAction, searchGeoAction, searchLocalesAction, matchInterestsAction, deliveryEstimateAction } from "@/app/(products)/viralpulse-ai/(protected)/campaigns/ads-actions";
import type { GeoOption, LocaleOption, TargetingOption } from "@/lib/products/viralpulse-ai/ads-platforms/meta/search";
import type { MetaAdSetDraft, MetaTargetingDraft, TargetingRef } from "@/lib/products/viralpulse-ai/ads-platforms/meta/draft";
import { fieldId } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { CheckRow, FieldBox, Note, Pill, useErrors } from "./ads-bits";
import type { StepCtx } from "./ads-ctx";

type Res<T> = { ok: true; options: T[] } | { ok: false; error: string };

/** Debounced live lookup against the platform's search API. Stale answers are dropped so fast typing never shows old results. */
function useLookup<T>(q: string, run: (q: string) => Promise<Res<T>>, min = 2) {
  const [state, setState] = useState<{ items: T[]; loading: boolean; error: string | null }>({ items: [], loading: false, error: null });
  const seq = useRef(0);
  const fn = useRef(run);
  useEffect(() => { fn.current = run; });
  useEffect(() => {
    const text = q.trim();
    if (text.length < min) { seq.current++; const t = setTimeout(() => setState({ items: [], loading: false, error: null }), 0); return () => clearTimeout(t); }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      const r = await fn.current(text);
      if (my !== seq.current) return;
      setState(r.ok ? { items: r.options, loading: false, error: null } : { items: [], loading: false, error: r.error });
    }, 350);
    return () => clearTimeout(t);
  }, [q, min]);
  return state;
}

const size = (o: { audienceLower?: number; audienceUpper?: number }) => {
  const f = (n: number) => n.toLocaleString("en-IN");
  if (o.audienceLower && o.audienceUpper && o.audienceLower !== o.audienceUpper) return `about ${f(o.audienceLower)} to ${f(o.audienceUpper)} people`;
  const one = o.audienceUpper ?? o.audienceLower;
  return one ? `about ${f(one)} people` : null;
};

export default function TargetingEditor({ ctx, index, set }: { ctx: StepCtx; index: number; set: MetaAdSetDraft }) {
  const { state, dispatch, editable } = ctx;
  const t = set.targeting;
  const acct = state.meta.adAccountId;
  const base = `meta.adSets[${index}].targeting`;
  const patch = (p: Partial<MetaTargetingDraft>) => dispatch({ type: "targeting", index, patch: p });
  const geoErrors = useErrors(`${base}.geo`, false);
  void geoErrors;

  if (!acct) return <Note tone="warn">Choose the ad account in step 1 first. Locations, interests and audiences come live from Meta for that account.</Note>;

  return (
    <div className="space-y-5">
      <Locations ctx={ctx} t={t} base={base} acct={acct} patch={patch} editable={editable} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FieldBox path={`${base}.ageMin`} label="Minimum age" help="13 to 65. People under 18 restrict audience options.">
          <Input id={fieldId(`${base}.ageMin`)} type="number" min={13} max={65} value={t.ageMin} disabled={!editable} onChange={(e) => patch({ ageMin: Number(e.target.value) })} className="max-w-28" />
        </FieldBox>
        <FieldBox path={`${base}.ageMax`} label="Maximum age" help="Meta caps this at 65 (shown as 65+).">
          <Input id={fieldId(`${base}.ageMax`)} type="number" min={13} max={65} value={t.ageMax} disabled={!editable} onChange={(e) => patch({ ageMax: Number(e.target.value) })} className="max-w-28" />
        </FieldBox>
        <FieldBox path={`${base}.genders`} label="Gender" help="All genders unless the offer is specific to one.">
          <OptionSelect id={fieldId(`${base}.genders`)} value={t.genders.length === 1 ? String(t.genders[0]) : ""} disabled={!editable} options={[{ value: "", label: "All genders" }, { value: "1", label: "Men" }, { value: "2", label: "Women" }]} onChange={(v) => patch({ genders: v ? [Number(v) as 1 | 2] : [] })} />
        </FieldBox>
      </div>
      <Locales acct={acct} t={t} base={base} patch={patch} editable={editable} />
      <Detailed ctx={ctx} t={t} base={base} acct={acct} patch={patch} editable={editable} />
      <CustomAudiences ctx={ctx} t={t} patch={patch} editable={editable} />
      <CheckRow id={`adv-${index}`} checked={t.advantageAudience} disabled={!editable} onChange={(v) => patch({ advantageAudience: v })} label="Advantage+ audience" help="Meta may reach people outside your detailed targeting when it expects better results. Your age and location settings still limit it." />
      <Estimate acct={acct} set={set} editable={editable} />
    </div>
  );
}

// ── locations ───────────────────────────────────────────────────────────────────────────────────────

function Locations({ t, base, acct, patch, editable }: { ctx: StepCtx; t: MetaTargetingDraft; base: string; acct: string; patch: (p: Partial<MetaTargetingDraft>) => void; editable: boolean }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"include" | "exclude">("include");
  const lookup = useLookup<GeoOption>(q, async (text) => { const r = await searchGeoAction(acct, text, ["country", "region", "city"]); return r.ok ? { ok: true, options: r.options } : r; });
  const g = t.geo;
  const setGeo = (next: Partial<typeof g>) => patch({ geo: { ...g, ...next } });
  const setEx = (next: Partial<typeof g.excluded>) => patch({ geo: { ...g, excluded: { ...g.excluded, ...next } } });
  const add = (o: GeoOption) => {
    if (o.type === "country") {
      const code = (o.countryCode ?? o.key).toUpperCase();
      if (mode === "include") setGeo({ countries: [...new Set([...g.countries, code])] });
      else setEx({ countries: [...new Set([...g.excluded.countries, code])] });
    } else if (o.type === "region") {
      if (mode === "include") setGeo({ regions: g.regions.some((r) => r.key === o.key) ? g.regions : [...g.regions, { key: o.key, name: `${o.name}${o.countryName ? `, ${o.countryName}` : ""}` }] });
      else setEx({ regions: [...g.excluded.regions, { key: o.key, name: o.name }] });
    } else if (o.type === "city") {
      if (mode === "include") setGeo({ cities: g.cities.some((c) => c.key === o.key) ? g.cities : [...g.cities, { key: o.key, name: `${o.name}${o.region ? `, ${o.region}` : ""}` }] });
      else setEx({ cities: [...g.excluded.cities, { key: o.key, name: o.name }] });
    }
    setQ("");
  };
  return (
    <FieldBox path={`${base}.geo`} label="Locations" required help="Search countries, states or regions and cities. The results come from Meta. Add a radius around a single city if you want an area.">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={fieldId(`${base}.geo`)} value={q} onChange={(e) => setQ(e.target.value)} disabled={!editable} placeholder="Search a country, state or city" aria-label="Search locations" className="h-9 pl-8" />
          </div>
          <OptionSelect value={mode} onChange={(v) => setMode(v as "include" | "exclude")} disabled={!editable} options={[{ value: "include", label: "Include" }, { value: "exclude", label: "Exclude" }]} aria-label="Include or exclude the location" />
        </div>
        <Results loading={lookup.loading} error={lookup.error} empty={q.trim().length >= 2 && !lookup.loading && lookup.items.length === 0}>
          {lookup.items.map((o) => (
            <Row key={`${o.type}-${o.key}`} onAdd={() => add(o)} disabled={!editable} title={o.name} sub={[o.type, o.region, o.countryName].filter(Boolean).join(" · ")} />
          ))}
        </Results>
        <div className="flex flex-wrap gap-1.5">
          {g.countries.map((c) => <Pill key={`c-${c}`} onRemove={editable ? () => setGeo({ countries: g.countries.filter((x) => x !== c) }) : undefined} label={`Remove ${c}`}>{c} (country)</Pill>)}
          {g.regions.map((r) => <Pill key={`r-${r.key}`} onRemove={editable ? () => setGeo({ regions: g.regions.filter((x) => x.key !== r.key) }) : undefined} label={`Remove ${r.name ?? r.key}`}>{r.name ?? r.key}</Pill>)}
          {g.excluded.countries.map((c) => <Pill key={`xc-${c}`} tone="bad" onRemove={editable ? () => setEx({ countries: g.excluded.countries.filter((x) => x !== c) }) : undefined} label={`Remove excluded ${c}`}>Not {c}</Pill>)}
          {g.excluded.regions.map((r) => <Pill key={`xr-${r.key}`} tone="bad" onRemove={editable ? () => setEx({ regions: g.excluded.regions.filter((x) => x.key !== r.key) }) : undefined} label={`Remove excluded ${r.name ?? r.key}`}>Not {r.name ?? r.key}</Pill>)}
          {g.excluded.cities.map((r) => <Pill key={`xci-${r.key}`} tone="bad" onRemove={editable ? () => setEx({ cities: g.excluded.cities.filter((x) => x.key !== r.key) }) : undefined} label={`Remove excluded ${r.name ?? r.key}`}>Not {r.name ?? r.key}</Pill>)}
        </div>
        {g.cities.map((c, i) => (
          <div key={c.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium">{c.name ?? c.key}</span>
            <label className="flex items-center gap-1.5">Radius
              <Input aria-label={`Radius around ${c.name ?? c.key}`} id={fieldId(`${base}.geo.cities[${i}].radius`)} type="number" value={c.radius ?? ""} disabled={!editable} placeholder="none" onChange={(e) => setGeo({ cities: g.cities.map((x, j) => (j === i ? { ...x, radius: e.target.value ? Number(e.target.value) : undefined, distanceUnit: x.distanceUnit ?? "kilometer" } : x)) })} className="h-7 w-20" />
            </label>
            <OptionSelect value={c.distanceUnit ?? "kilometer"} disabled={!editable} onChange={(v) => setGeo({ cities: g.cities.map((x, j) => (j === i ? { ...x, distanceUnit: v as "kilometer" | "mile" } : x)) })} options={[{ value: "kilometer", label: "km (17 to 80)" }, { value: "mile", label: "miles (10 to 50)" }]} aria-label="Radius unit" />
            {editable && <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${c.name ?? c.key}`} onClick={() => setGeo({ cities: g.cities.filter((_, j) => j !== i) })}>Remove</button>}
          </div>
        ))}
      </div>
    </FieldBox>
  );
}

function Locales({ acct, t, base, patch, editable }: { acct: string; t: MetaTargetingDraft; base: string; patch: (p: Partial<MetaTargetingDraft>) => void; editable: boolean }) {
  const [q, setQ] = useState("");
  const [names, setNames] = useState<Record<number, string>>({});
  const lookup = useLookup<LocaleOption>(q, async (text) => { const r = await searchLocalesAction(acct, text); return r.ok ? { ok: true, options: r.options } : r; });
  return (
    <FieldBox path={`${base}.locales`} label="Languages (optional)" help="Only set this when the language people use differs from where they are. Leave empty to reach everyone in the locations.">
      <Input id={fieldId(`${base}.locales`)} value={q} onChange={(e) => setQ(e.target.value)} disabled={!editable} placeholder="Search a language" aria-label="Search languages" className="h-9 max-w-sm" />
      <Results loading={lookup.loading} error={lookup.error} empty={q.trim().length >= 2 && !lookup.loading && lookup.items.length === 0}>
        {lookup.items.map((o) => <Row key={o.id} title={o.name} disabled={!editable} onAdd={() => { setNames((n) => ({ ...n, [o.id]: o.name })); patch({ locales: [...new Set([...t.locales, o.id])] }); setQ(""); }} />)}
      </Results>
      <div className="flex flex-wrap gap-1.5">{t.locales.map((id) => <Pill key={id} onRemove={editable ? () => patch({ locales: t.locales.filter((x) => x !== id) }) : undefined} label={`Remove language ${names[id] ?? id}`}>{names[id] ?? `Language ${id}`}</Pill>)}</div>
    </FieldBox>
  );
}

// ── detailed targeting ──────────────────────────────────────────────────────────────────────────────

const KINDS = [
  { value: "interests", label: "Interests" }, { value: "behaviors", label: "Behaviours" }, { value: "life_events", label: "Life events" }, { value: "industries", label: "Industries" }, { value: "income", label: "Income" }, { value: "family_statuses", label: "Family status" },
];
type Group = MetaTargetingDraft["detailed"][number];
const emptyGroup = (): Group => ({ interests: [], behaviors: [], demographics: [] });
const addRef = (g: Group, kind: string, r: TargetingRef): Group => (kind === "interests" ? { ...g, interests: [...g.interests.filter((x) => x.id !== r.id), r] } : kind === "behaviors" ? { ...g, behaviors: [...g.behaviors.filter((x) => x.id !== r.id), r] } : { ...g, demographics: [...g.demographics.filter((x) => x.id !== r.id), { ...r, kind }] });

function Detailed({ ctx, t, base, acct, patch, editable }: { ctx: StepCtx; t: MetaTargetingDraft; base: string; acct: string; patch: (p: Partial<MetaTargetingDraft>) => void; editable: boolean }) {
  const [kind, setKind] = useState("interests");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"include" | "narrow" | "exclude">("include");
  const lookup = useLookup<TargetingOption>(q, async (text) => { const r = await searchTargetingAction(acct, kind, text); return r.ok ? { ok: true, options: r.options as TargetingOption[] } : r; }, kind === "interests" ? 2 : 1);
  // Behaviours and demographic classes are lists on Meta's side: show the first page before typing.
  const listMode = kind !== "interests";
  const browse = useLookup<TargetingOption>(listMode ? kind : "", async () => { const r = await searchTargetingAction(acct, kind, ""); return r.ok ? { ok: true, options: r.options as TargetingOption[] } : r; }, 1);
  const shown = listMode && q.trim().length === 0 ? browse : lookup;

  const add = (o: TargetingOption) => {
    const ref: TargetingRef = { id: o.id, name: o.name };
    const k = o.kind ?? kind;
    if (mode === "exclude") patch({ excludedDetailed: addRef(t.excludedDetailed, k, ref) });
    else if (mode === "narrow" || t.detailed.length === 0) patch({ detailed: [...t.detailed, addRef(emptyGroup(), k, ref)] });
    else patch({ detailed: t.detailed.map((g, i) => (i === 0 ? addRef(g, k, ref) : g)) });
    setQ("");
  };
  const removeFrom = (gi: number, kindKey: keyof Group, id: string) => patch({ detailed: t.detailed.map((g, i) => (i === gi ? { ...g, [kindKey]: g[kindKey].filter((x: TargetingRef) => x.id !== id) } : g)).filter((g) => g.interests.length + g.behaviors.length + g.demographics.length > 0) });
  const exRemove = (kindKey: keyof Group, id: string) => patch({ excludedDetailed: { ...t.excludedDetailed, [kindKey]: t.excludedDetailed[kindKey].filter((x: TargetingRef) => x.id !== id) } });

  // AI proposes names; only names Meta's own search returns can be added.
  const [names, setNames] = useState<string[]>([]);
  const [matches, setMatches] = useState<{ query: string; options: TargetingOption[] }[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  async function match() {
    setMatching(true); setMatchError(null);
    const r = await matchInterestsAction(acct, names);
    setMatching(false);
    if (r.ok) setMatches(r.matches as { query: string; options: TargetingOption[] }[]); else setMatchError(r.error);
  }

  return (
    <FieldBox path={`${base}.detailed`} label="Detailed targeting (optional)" help="Interests, behaviours and demographics from Meta. Items inside one box are OR; a second box narrows the audience (AND). Exclusions remove people. Sizes are Meta's own hints.">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <OptionSelect value={kind} onChange={(v) => { setKind(v); setQ(""); }} disabled={!editable} options={KINDS} aria-label="What to search" />
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={fieldId(`${base}.detailed`)} value={q} onChange={(e) => setQ(e.target.value)} disabled={!editable} placeholder={listMode ? "Filter the list" : "Search interests"} aria-label="Search detailed targeting" className="h-9 pl-8" />
          </div>
          <OptionSelect value={mode} onChange={(v) => setMode(v as typeof mode)} disabled={!editable} options={[{ value: "include", label: "Add to first box" }, { value: "narrow", label: "Narrow (new AND box)" }, { value: "exclude", label: "Exclude" }]} aria-label="How to add" />
        </div>
        <Results loading={shown.loading} error={shown.error} empty={!shown.loading && shown.items.length === 0 && (listMode || q.trim().length >= 2)}>
          {shown.items.map((o) => <Row key={`${o.kind ?? kind}-${o.id}`} title={o.name} sub={[o.path?.join(" > "), size(o)].filter(Boolean).join(" · ")} disabled={!editable} onAdd={() => add(o)} />)}
        </Results>
        {t.detailed.map((g, gi) => (
          <div key={gi} className="rounded-lg border border-border/50 p-2">
            <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{gi === 0 ? "People who match ANY of" : "AND must also match ANY of"}</p>
            <div className="flex flex-wrap gap-1.5">
              {(["interests", "behaviors", "demographics"] as const).flatMap((k) => g[k].map((r) => <Pill key={`${k}-${r.id}`} onRemove={editable ? () => removeFrom(gi, k, r.id) : undefined} label={`Remove ${r.name ?? r.id}`}>{r.name ?? r.id}</Pill>))}
            </div>
          </div>
        ))}
        {(["interests", "behaviors", "demographics"] as const).some((k) => t.excludedDetailed[k].length > 0) && (
          <div className="rounded-lg border border-rose-500/30 p-2">
            <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Excluded</p>
            <div className="flex flex-wrap gap-1.5">{(["interests", "behaviors", "demographics"] as const).flatMap((k) => t.excludedDetailed[k].map((r) => <Pill key={`${k}-${r.id}`} tone="bad" onRemove={editable ? () => exRemove(k, r.id) : undefined} label={`Remove ${r.name ?? r.id}`}>{r.name ?? r.id}</Pill>))}</div>
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-dashed border-border/60 p-3">
          <AiField fieldKey="campaign.strategy.audiences.interests" label="Describe the audience, get interest ideas" id={`ai-int-${base}`} as="list" rows={3} value={names} disabled={!editable} onChange={(v) => setNames(Array.isArray(v) ? v.map(String) : String(v).split("\n"))} getContext={() => ({ ...ctx.aiContext(), item: { description: ctx.state.brief.targetAudience } })} aiDisabled={!ctx.canGenerate} hint="One idea per line. These are only ideas: they are checked against Meta below and only real interests can be added." />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={!editable || matching || names.filter((n) => n.trim()).length === 0} onClick={() => void match()}>{matching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Check against Meta</Button>
            {matchError && <span role="alert" className="text-[11px] text-rose-700 dark:text-rose-300">{matchError}</span>}
          </div>
          {matches && (
            <ul className="space-y-1.5">
              {matches.map((m) => (
                <li key={m.query} className="text-xs">
                  <p className="font-medium">{m.query}</p>
                  {m.options.length === 0 ? <p className="text-[11px] text-muted-foreground">Meta has no interest with this name. It was not added.</p> : (
                    <div className="mt-1 space-y-1">{m.options.map((o) => <Row key={o.id} title={o.name} sub={[o.path?.join(" > "), size(o)].filter(Boolean).join(" · ")} disabled={!editable} onAdd={() => add({ ...o, kind: "interests" })} />)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </FieldBox>
  );
}

// ── custom audiences ────────────────────────────────────────────────────────────────────────────────

function CustomAudiences({ ctx, t, patch, editable }: { ctx: StepCtx; t: MetaTargetingDraft; patch: (p: Partial<MetaTargetingDraft>) => void; editable: boolean }) {
  const data = ctx.account.data;
  if (ctx.account.status === "loading") return <p className="text-xs text-muted-foreground">Loading saved audiences…</p>;
  const list = data?.audiences ?? [];
  const problem = data?.problems.audiences;
  const inc = (id: string) => t.customAudiences.some((a) => a.id === id);
  const exc = (id: string) => t.excludedCustomAudiences.some((a) => a.id === id);
  return (
    <FieldBox label="Saved audiences and lookalikes (optional)" help="Custom audiences and lookalike audiences that exist on this ad account in Meta. Include them to reach them, or exclude them to leave them out (for example existing customers).">
      {problem && <Note tone="warn">Meta did not return the saved audiences: {problem}</Note>}
      {!problem && list.length === 0 && <p className="text-xs text-muted-foreground">This ad account has no saved audiences. Create them in Meta Audiences; they appear here after you reload the account.</p>}
      <ul className="space-y-1.5">
        {list.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1"><span className="font-medium">{a.name}</span> <span className="text-muted-foreground">{[a.subtype, a.sizeLower && a.sizeUpper ? `${a.sizeLower.toLocaleString("en-IN")} to ${a.sizeUpper.toLocaleString("en-IN")} people` : null, a.deliveryStatus].filter(Boolean).join(" · ")}</span></span>
            <span className="flex gap-3">
              <CheckRow id={`ca-i-${a.id}`} checked={inc(a.id)} disabled={!editable || exc(a.id)} label="Include" onChange={(v) => patch({ customAudiences: v ? [...t.customAudiences, { id: a.id, name: a.name }] : t.customAudiences.filter((x) => x.id !== a.id) })} />
              <CheckRow id={`ca-x-${a.id}`} checked={exc(a.id)} disabled={!editable || inc(a.id)} label="Exclude" onChange={(v) => patch({ excludedCustomAudiences: v ? [...t.excludedCustomAudiences, { id: a.id, name: a.name }] : t.excludedCustomAudiences.filter((x) => x.id !== a.id) })} />
            </span>
          </li>
        ))}
      </ul>
    </FieldBox>
  );
}

// ── delivery estimate ───────────────────────────────────────────────────────────────────────────────

function Estimate({ acct, set, editable }: { acct: string; set: MetaAdSetDraft; editable: boolean }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ready: boolean; dailyActiveUsers: number | null; monthlyLower: number | null; monthlyUpper: number | null; at: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    const r = await deliveryEstimateAction({ adAccountId: acct, adSet: set });
    setBusy(false);
    if (r.ok) setRes({ ...r.estimate, at: r.at }); else { setErr(r.error); setRes(null); }
  }
  const f = (n: number | null) => (n === null ? "not given" : n.toLocaleString("en-IN"));
  return (
    <div className="space-y-2 rounded-xl border border-border/50 p-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">Estimated audience size</p>
        <Button type="button" size="sm" variant="outline" disabled={busy || !editable} onClick={() => void go()}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Ask Meta for an estimate</Button>
      </div>
      {err && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{err}</p>}
      {res ? (
        <div className="space-y-1 text-xs">
          <p>{res.ready ? <>Monthly active people: <strong>{f(res.monthlyLower)}</strong> to <strong>{f(res.monthlyUpper)}</strong>. Daily active people: <strong>{f(res.dailyActiveUsers)}</strong>.</> : "Meta is still working this out. Try again in a moment."}</p>
          <SourceBadge source="estimate" at={res.at} label="Estimate from Meta" />
          <p className="text-[11px] text-muted-foreground">The size is Meta&apos;s estimate for these exact targeting settings. It is not a promise of results.</p>
        </div>
      ) : <p className="text-[11px] text-muted-foreground">Needs a location and a performance goal. The number comes from Meta; nothing is estimated here.</p>}
    </div>
  );
}

// ── small list helpers ──────────────────────────────────────────────────────────────────────────────

function Results({ loading, error, empty, children }: { loading: boolean; error: string | null; empty: boolean; children: React.ReactNode }) {
  if (loading) return <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status"><Loader2 className="size-3 animate-spin" /> Searching Meta…</p>;
  if (error) return <p role="alert" className="text-[11px] text-rose-700 dark:text-rose-300">{error}</p>;
  if (empty) return <p className="text-[11px] text-muted-foreground">Nothing found. Try another word.</p>;
  return <div className="max-h-56 space-y-1 overflow-y-auto">{children}</div>;
}
function Row({ title, sub, onAdd, disabled }: { title: string; sub?: string; onAdd: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 px-2 py-1 text-xs">
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{title}</span>{sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}</span>
      <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={onAdd} aria-label={`Add ${title}`}><Plus className="size-3" /> Add</Button>
    </div>
  );
}
