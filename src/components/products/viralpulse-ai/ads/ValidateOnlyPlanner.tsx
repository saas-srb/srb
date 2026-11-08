"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardCopy, Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { buildGoogleSearchOperations, validateGoogleSearch, RSA_DESCRIPTION_MAX, RSA_HEADLINE_MAX, RSA_HEADLINES, RSA_DESCRIPTIONS, type GoogleSearchCampaignDraft } from "@/lib/products/viralpulse-ai/ads-platforms/google";
import { buildLinkedInCampaignBody, validateLinkedInCampaign, validateLinkedInCampaignGroup, LINKEDIN_CAMPAIGN_TYPES, LINKEDIN_COST_TYPES, LINKEDIN_OBJECTIVES, LINKEDIN_OPTIMIZATION_TARGETS, type LinkedInCampaignDraft, type LinkedInCampaignGroupDraft } from "@/lib/products/viralpulse-ai/ads-platforms/linkedin";
import { validateXCampaign, type XCampaignDraft } from "@/lib/products/viralpulse-ai/ads-platforms/x";
import { CAPABILITIES, result, type AdsPlatformKey, type FieldError } from "@/lib/products/viralpulse-ai/ads-platforms/types";
import { emptyGoogleDraft, emptyLinkedInCampaign, emptyLinkedInGroup, emptyXDraft, keywordsToText as kwText, majorToMicros, microsToMajor, parseKeywords } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { ErrorsContext, ErrorsFor, FieldBox, Messages, Note, Section } from "./ads-bits";
import type { StepCtx } from "./ads-ctx";

const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const dateInput = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");
const dateMs = (v: string): number => (v ? new Date(`${v}T00:00:00.000Z`).getTime() : 0);

function usePersisted<T>(key: string, empty: () => T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(empty);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try { const raw = localStorage.getItem(key); if (raw) setV({ ...empty(), ...JSON.parse(raw) }); } catch { /* storage unavailable: the plan lives in this tab only */ }
      setReady(true);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, [key]);
  useEffect(() => { if (ready) try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v, ready]);
  return [v, setV];
}

export default function ValidateOnlyPlanner({ platform, ctx }: { platform: Exclude<AdsPlatformKey, "meta">; ctx: StepCtx }) {
  const cap = CAPABILITIES[platform];
  return (
    <div className="space-y-4">
      <Note tone="warn">
        <p className="font-semibold">Launch needs approved API access. This is a plan checker, not a launcher.</p>
        <p>{cap.scope}</p>
        <p>What the company must obtain: {cap.approval}</p>
        <p>The plan below is kept only in this browser. Use Copy or Download to take it to the platform&apos;s own tools.</p>
      </Note>
      {platform === "google" && <Google ctx={ctx} />}
      {platform === "linkedin" && <LinkedIn />}
      {platform === "x" && <XPlan />}
    </div>
  );
}

function Out({ errors, plan, name }: { errors: FieldError[]; plan: unknown; name: string }) {
  const bad = errors.filter((e) => e.severity === "error");
  const warns = errors.filter((e) => e.severity === "warning");
  const text = JSON.stringify(plan, null, 2);
  return (
    <Section title="Check and export" description="What the platform would reject, and the request that would be sent. Nothing is sent.">
      <p role="status" className={`text-xs font-semibold ${bad.length ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{bad.length ? `${bad.length} problem${bad.length === 1 ? "" : "s"} to fix` : "No problems found in the checks this app knows"}</p>
      <Messages items={bad} />
      <Messages items={warns} />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(text).then(() => toast.success("Copied")); }}><ClipboardCopy className="size-3.5" /> Copy request</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = `${name}-plan.json`; a.click(); URL.revokeObjectURL(a.href); }}><Download className="size-3.5" /> Download</Button>
      </div>
      <pre className="max-h-96 overflow-auto rounded-xl bg-muted/50 p-3 text-[11px]" tabIndex={0} aria-label="Request preview">{text}</pre>
    </Section>
  );
}

const txt = (id: string, label: string, path: string, value: string, set: (v: string) => void, help?: string, type = "text", placeholder?: string) => (
  <FieldBox path={path} label={label} help={help} htmlFor={id}><Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} /></FieldBox>
);

function Google({ ctx }: { ctx: StepCtx }) {
  const [d, setD] = usePersisted<GoogleSearchCampaignDraft>("ads-plan-google", emptyGoogleDraft);
  const [kw, setKw] = useState("");
  useEffect(() => { const t = setTimeout(() => setKw(kwText(d.keywords)), 0); return () => clearTimeout(t); /* once */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const v = useMemo(() => validateGoogleSearch(d), [d]);
  const all = [...v.errors, ...v.warnings];
  const set = (p: Partial<GoogleSearchCampaignDraft>) => setD({ ...d, ...p });
  return (
    <ErrorsContext.Provider value={all}>
      <Section title="Google Ads Search campaign" description="One Search campaign with one ad group and one responsive search ad, as the Google Ads API builds it.">
        {txt("g-cust", "Customer ID", "google.customerId", d.customerId, (x) => set({ customerId: x }), "The 10-digit Google Ads account number, with or without dashes.")}
        <AiField fieldKey="campaign.name" label="Campaign name" id="g-name" as="input" value={d.name} onChange={(x) => set({ name: String(x) })} getContext={ctx.aiContext} aiDisabled={!ctx.canGenerate} />
        <FieldBox path="google.dailyBudgetMicros" label="Daily budget" help="In your Google Ads account currency." htmlFor="g-budget"><Input id="g-budget" inputMode="decimal" value={microsToMajor(d.dailyBudgetMicros)} onChange={(e) => set({ dailyBudgetMicros: majorToMicros(e.target.value) })} className="max-w-48" /></FieldBox>
        <div className="grid gap-4 sm:grid-cols-2">
          {txt("g-start", "Start date", "google.startDate", d.startDate ?? "", (x) => set({ startDate: x || null }), undefined, "date")}
          {txt("g-end", "End date", "google.endDate", d.endDate ?? "", (x) => set({ endDate: x || null }), undefined, "date")}
        </div>
        {txt("g-url", "Final URL", "google.finalUrl", d.finalUrl, (x) => set({ finalUrl: x.trim() }), "Where people land. Must be https://.", "url", "https://")}
        <AiField fieldKey="campaign.strategy.keywords" label="Keywords (one per line)" id="g-kw" as="list" rows={5} value={lines(kw)} onChange={(x) => { const t = (Array.isArray(x) ? x : String(x).split("\n")).join("\n"); setKw(t); set({ keywords: parseKeywords(t) }); }} getContext={() => ({ ...ctx.aiContext(), campaign: ctx.aiContext() })} aiDisabled={!ctx.canGenerate} hint={'Plain words match broadly. Wrap in "quotes" for phrase match or [brackets] for exact match.'} />
        <FieldBox path="google.headlines" label={`Headlines (${RSA_HEADLINES.min} to ${RSA_HEADLINES.max}, up to ${RSA_HEADLINE_MAX} characters each)`} help="One per line. Google mixes them. Each line shows its length."><Textarea id="g-head" rows={5} value={d.headlines.join("\n")} onChange={(e) => set({ headlines: e.target.value.split("\n") })} onBlur={(e) => set({ headlines: lines(e.target.value) })} /></FieldBox>
        <Counts items={d.headlines} max={RSA_HEADLINE_MAX} />
        <FieldBox path="google.descriptions" label={`Descriptions (${RSA_DESCRIPTIONS.min} to ${RSA_DESCRIPTIONS.max}, up to ${RSA_DESCRIPTION_MAX} characters each)`} help="One per line."><Textarea id="g-desc" rows={3} value={d.descriptions.join("\n")} onChange={(e) => set({ descriptions: e.target.value.split("\n") })} onBlur={(e) => set({ descriptions: lines(e.target.value) })} /></FieldBox>
        <Counts items={d.descriptions} max={RSA_DESCRIPTION_MAX} />
      </Section>
      <Out errors={all} plan={{ platform: "google", mode: "validate-only", apiVersion: "v26", operations: buildGoogleSearchOperations(d) }} name="google-ads" />
    </ErrorsContext.Provider>
  );
}

function Counts({ items, max }: { items: string[]; max: number }) {
  const real = items.map((x) => x.trim()).filter(Boolean);
  if (!real.length) return null;
  return <ul className="flex flex-wrap gap-1.5 text-[11px]">{real.map((h, i) => <li key={i} className={`rounded-full border px-2 py-0.5 tabular-nums ${h.length > max ? "border-rose-500/40 text-rose-700 dark:text-rose-300" : "border-border/60 text-muted-foreground"}`}>{h.length}/{max}</li>)}</ul>;
}

function LinkedIn() {
  const [g, setG] = usePersisted<LinkedInCampaignGroupDraft>("ads-plan-linkedin-group", emptyLinkedInGroup);
  const [c, setC] = usePersisted<LinkedInCampaignDraft>("ads-plan-linkedin", emptyLinkedInCampaign);
  const [cur, setCur] = usePersisted<{ v: string }>("ads-plan-linkedin-cur", () => ({ v: "USD" }));
  const [facets, setFacets] = useState("");
  useEffect(() => { const t = setTimeout(() => setFacets(Object.entries(c.targetingInclude).map(([k, u]) => `${k}: ${u.join(", ")}`).join("\n")), 0); return () => clearTimeout(t); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const gv = useMemo(() => validateLinkedInCampaignGroup(g), [g]);
  const cv = useMemo(() => validateLinkedInCampaign(c, cur.v.toUpperCase()), [c, cur.v]);
  const all = result([...gv.errors, ...gv.warnings, ...cv.errors, ...cv.warnings.filter((w) => w.code !== "requires_access" || !gv.warnings.some((x) => x.code === "requires_access"))]);
  const set = (p: Partial<LinkedInCampaignDraft>) => setC({ ...c, ...p });
  const money = (amount: string) => (amount.trim() && Number(amount) > 0 ? { amount: amount.trim(), currencyCode: cur.v.toUpperCase() } : null);
  const b = "linkedin.campaign";
  return (
    <ErrorsContext.Provider value={[...all.errors, ...all.warnings]}>
      <Section title="Campaign group" description="Groups campaigns and can carry a total budget.">
        <div className="grid gap-4 sm:grid-cols-2">
          {txt("l-acct", "Ad account ID", "linkedin.accountId", g.accountId, (x) => { setG({ ...g, accountId: x.trim() }); set({ accountId: x.trim() }); }, "The numeric id of the LinkedIn ad account.")}
          {txt("l-cur", "Ad account currency", "linkedin.currency", cur.v, (x) => setCur({ v: x }), "Three letters, for example USD or INR. All amounts use it.")}
        </div>
        {txt("l-gname", "Group name", "linkedin.group.name", g.name, (x) => setG({ ...g, name: x }), "Up to 200 bytes.")}
        <div className="grid gap-4 sm:grid-cols-3">
          {txt("l-gs", "Start", "linkedin.group.runSchedule.start", dateInput(g.runStartMs), (x) => setG({ ...g, runStartMs: dateMs(x) }), undefined, "date")}
          {txt("l-ge", "End", "linkedin.group.runSchedule.end", dateInput(g.runEndMs), (x) => setG({ ...g, runEndMs: x ? dateMs(x) : null }), undefined, "date")}
          {txt("l-gb", "Total budget", "linkedin.group.totalBudget", g.totalBudget?.amount ?? "", (x) => setG({ ...g, totalBudget: x.trim() && Number(x) > 0 ? { amount: x.trim(), currencyCode: cur.v.toUpperCase() } : null }), "Needs an end date.")}
        </div>
      </Section>
      <Section title="Campaign" description="Objective, bidding, budget, schedule and audience.">
        <AiFieldName value={c.name} onChange={(x) => set({ name: x })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBox label="Campaign type" help="Sponsored updates promote your company page posts."><OptionSelect value={c.type} options={LINKEDIN_CAMPAIGN_TYPES.map((x) => ({ value: x, label: x.replaceAll("_", " ").toLowerCase() }))} onChange={(v) => set({ type: v as typeof c.type })} /></FieldBox>
          <FieldBox path={`${b}.objectiveType`} label="Objective"><OptionSelect value={c.objectiveType ?? ""} noneLabel="None" options={LINKEDIN_OBJECTIVES.map((x) => ({ value: x, label: x.replaceAll("_", " ").toLowerCase() }))} onChange={(v) => set({ objectiveType: (v || null) as typeof c.objectiveType })} /></FieldBox>
          <FieldBox path={`${b}.costType`} label="Charged by" help="Cost cap bidding is charged per thousand impressions (CPM)."><OptionSelect value={c.costType} options={LINKEDIN_COST_TYPES.map((x) => ({ value: x, label: x }))} onChange={(v) => set({ costType: v as typeof c.costType })} /></FieldBox>
          <FieldBox path={`${b}.optimizationTargetType`} label="Bidding"><OptionSelect value={c.optimizationTargetType} options={LINKEDIN_OPTIMIZATION_TARGETS.map((x) => ({ value: x, label: x.replaceAll("_", " ").toLowerCase() }))} onChange={(v) => set({ optimizationTargetType: v as typeof c.optimizationTargetType })} /></FieldBox>
          {txt("l-daily", "Daily budget", `${b}.dailyBudget`, c.dailyBudget?.amount ?? "", (x) => set({ dailyBudget: money(x) }))}
          {txt("l-total", "Total budget", `${b}.totalBudget`, c.totalBudget?.amount ?? "", (x) => set({ totalBudget: money(x) }), "Needs an end date.")}
          {txt("l-unit", "Bid amount", `${b}.unitCost`, c.unitCost?.amount ?? "", (x) => set({ unitCost: money(x) }), "Needed by manual, target-cost and cost-cap bidding.")}
          {txt("l-assoc", "Company page", `${b}.associatedEntity`, c.associatedEntity ?? "", (x) => set({ associatedEntity: x.trim() || null }), "urn:li:organization:123. Needed for sponsored updates, dynamic ads and lead gen.")}
          {txt("l-rs", "Start", `${b}.runSchedule.start`, dateInput(c.runStartMs), (x) => set({ runStartMs: dateMs(x) }), undefined, "date")}
          {txt("l-re", "End", `${b}.runSchedule.end`, dateInput(c.runEndMs), (x) => set({ runEndMs: x ? dateMs(x) : null }), undefined, "date")}
          {txt("l-lc", "Locale country", `${b}.locale`, c.locale.country, (x) => set({ locale: { ...c.locale, country: x.toUpperCase() } }), "Two capital letters, e.g. US.")}
          {txt("l-ll", "Locale language", `${b}.locale`, c.locale.language, (x) => set({ locale: { ...c.locale, language: x.toLowerCase() } }), "Two lowercase letters, e.g. en.")}
        </div>
        <FieldBox path={`${b}.targeting`} label="Audience (targeting facets)" help="One per line: urn:li:adTargetingFacet:locations: urn:li:geo:103644278. Facet and URN values come from LinkedIn's targeting API; none are suggested here."><Textarea id="l-facets" rows={4} value={facets} onChange={(e) => { setFacets(e.target.value); set({ targetingInclude: Object.fromEntries(lines(e.target.value).map((l) => { const i = l.lastIndexOf(": "); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 2).split(",").map((u) => u.trim()).filter(Boolean)] : [l, []]; }).filter(([, u]) => (u as string[]).length)) }); }} /></FieldBox>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-2"><input type="checkbox" checked={c.audienceExpansionEnabled} onChange={(e) => set({ audienceExpansionEnabled: e.target.checked })} /> Audience expansion</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={c.offsiteDeliveryEnabled} onChange={(e) => set({ offsiteDeliveryEnabled: e.target.checked })} /> LinkedIn Audience Network</label>
        </div>
      </Section>
      <Out errors={[...all.errors, ...all.warnings]} plan={{ platform: "linkedin", mode: "validate-only", version: "202610", campaignGroup: g, campaign: buildLinkedInCampaignBody(c) }} name="linkedin" />
    </ErrorsContext.Provider>
  );
}

function AiFieldName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <FieldBox path="linkedin.campaign.name" label="Campaign name" htmlFor="l-name"><Input id="l-name" value={value} onChange={(e) => onChange(e.target.value)} /></FieldBox>;
}

function XPlan() {
  const [d, setD] = usePersisted<XCampaignDraft>("ads-plan-x", emptyXDraft);
  const v = useMemo(() => validateXCampaign(d), [d]);
  const all = [...v.errors, ...v.warnings];
  const set = (p: Partial<XCampaignDraft>) => setD({ ...d, ...p });
  const li = (i: number, p: Partial<XCampaignDraft["lineItems"][number]>) => set({ lineItems: d.lineItems.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <ErrorsContext.Provider value={all}>
      <Section title="X campaign" description="Account, funding instrument, campaign and line items, as the X Ads hierarchy defines them. Objective and placement values are not suggested because X's value lists could not be verified.">
        <div className="grid gap-4 sm:grid-cols-2">
          {txt("x-acct", "Ads account ID", "x.accountId", d.accountId, (x) => set({ accountId: x.trim() }), "Letters and digits.")}
          {txt("x-fund", "Funding instrument ID", "x.fundingInstrumentId", d.fundingInstrumentId, (x) => set({ fundingInstrumentId: x.trim() }), "Every X campaign needs one.")}
        </div>
        {txt("x-name", "Campaign name", "x.name", d.name, (x) => set({ name: x })) }
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBox path="x.dailyBudgetMicros" label="Daily budget" htmlFor="x-daily"><Input id="x-daily" inputMode="decimal" value={d.dailyBudgetMicros ? microsToMajor(d.dailyBudgetMicros) : ""} onChange={(e) => set({ dailyBudgetMicros: majorToMicros(e.target.value) || null })} /></FieldBox>
          <FieldBox path="x.totalBudgetMicros" label="Total budget" htmlFor="x-total"><Input id="x-total" inputMode="decimal" value={d.totalBudgetMicros ? microsToMajor(d.totalBudgetMicros) : ""} onChange={(e) => set({ totalBudgetMicros: majorToMicros(e.target.value) || null })} /></FieldBox>
          {txt("x-start", "Start", "x.startTime", d.startTime?.slice(0, 16) ?? "", (x) => set({ startTime: x ? new Date(x).toISOString() : null }), undefined, "datetime-local")}
          {txt("x-end", "End", "x.endTime", d.endTime?.slice(0, 16) ?? "", (x) => set({ endTime: x ? new Date(x).toISOString() : null }), undefined, "datetime-local")}
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold">Line items</p><Button type="button" size="sm" variant="outline" onClick={() => set({ lineItems: [...d.lineItems, { name: "", objective: "", placements: [], bidAmountMicros: null, tweetIds: [] }] })}><Plus className="size-3.5" /> Add line item</Button></div>
          <ErrorsFor path="x.lineItems" />
          {d.lineItems.map((l, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border/50 p-3">
              <div className="flex justify-end"><Button type="button" size="xs" variant="ghost" onClick={() => set({ lineItems: d.lineItems.filter((_, j) => j !== i) })}><Trash2 className="size-3" /> Remove</Button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {txt(`x-li-n-${i}`, "Name", `x.lineItems[${i}].name`, l.name, (x) => li(i, { name: x }))}
                {txt(`x-li-o-${i}`, "Objective", `x.lineItems[${i}].objective`, l.objective, (x) => li(i, { objective: x.trim() }), "As X's API names it. All line items in a campaign share one objective.")}
                {txt(`x-li-p-${i}`, "Placements (comma separated)", `x.lineItems[${i}].placements`, l.placements.join(", "), (x) => li(i, { placements: x.split(",").map((p) => p.trim()).filter(Boolean) }))}
                {txt(`x-li-b-${i}`, "Bid amount", `x.lineItems[${i}].bidAmountMicros`, l.bidAmountMicros ? microsToMajor(l.bidAmountMicros) : "", (x) => li(i, { bidAmountMicros: majorToMicros(x) || null }))}
              </div>
              {txt(`x-li-t-${i}`, "Promoted post IDs (comma separated)", `x.lineItems[${i}].tweetIds`, l.tweetIds.join(", "), (x) => li(i, { tweetIds: x.split(",").map((p) => p.trim()).filter(Boolean) }), "Each line item needs at least one post to run.")}
            </div>
          ))}
        </div>
      </Section>
      <Out errors={all} plan={{ platform: "x", mode: "validate-only", campaign: d }} name="x-ads" />
    </ErrorsContext.Provider>
  );
}
