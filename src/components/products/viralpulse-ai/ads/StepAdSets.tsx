"use client";

import { useEffect } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import EmptyState from "@/components/products/viralpulse-ai/shared/EmptyState";
import type { MetaAdSetDraft } from "@/lib/products/viralpulse-ai/ads-platforms/meta/draft";
import { BID_AMOUNT_STRATEGIES, META_BID_STRATEGIES, META_CUSTOM_EVENT_TYPES, type MetaBidStrategy } from "@/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import { DESTINATION_LABEL, ctaLabel, destinationsFor, fieldId, formatMinor, goalLabel, goalsFor, promotedNeeds, targetsEu } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { CheckRow, ChoiceCards, DateTimeField, FieldBox, MoneyField, Note, Section } from "./ads-bits";
import TargetingEditor from "./TargetingEditor";
import PlacementsEditor from "./PlacementsEditor";
import type { StepCtx } from "./ads-ctx";

const BID_LABEL: Record<MetaBidStrategy, string> = { LOWEST_COST_WITHOUT_CAP: "Highest volume (lowest cost)", LOWEST_COST_WITH_BID_CAP: "Bid cap", COST_CAP: "Cost per result goal", LOWEST_COST_WITH_MIN_ROAS: "ROAS goal" };
const ATTRIBUTION: { value: string; label: string; spec: { eventType: "CLICK_THROUGH" | "VIEW_THROUGH"; windowDays: number }[] }[] = [
  { value: "default", label: "Meta default", spec: [] },
  { value: "c1", label: "1-day click", spec: [{ eventType: "CLICK_THROUGH", windowDays: 1 }] },
  { value: "c7", label: "7-day click", spec: [{ eventType: "CLICK_THROUGH", windowDays: 7 }] },
  { value: "c7v1", label: "7-day click and 1-day view", spec: [{ eventType: "CLICK_THROUGH", windowDays: 7 }, { eventType: "VIEW_THROUGH", windowDays: 1 }] },
];
const attributionKey = (a: { eventType: string; windowDays: number }[]) => ATTRIBUTION.find((x) => x.spec.length === a.length && x.spec.every((s, i) => s.eventType === a[i].eventType && s.windowDays === a[i].windowDays))?.value ?? "default";

export default function StepAdSets({ ctx, active, onActive }: { ctx: StepCtx; active: number; onActive: (i: number) => void }) {
  const { state, dispatch, editable } = ctx;
  const sets = state.meta.adSets;
  const at = Math.min(active, Math.max(sets.length - 1, 0));
  const set = sets[at];

  if (!state.meta.objective) return <Note tone="warn">Choose the objective in step 2 first. The conversion locations and goals depend on it.</Note>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelTabs label="Ad sets" active={String(at)} onSelect={(k) => onActive(Number(k))} tabs={sets.map((s, i) => ({ key: String(i), label: s.name || `Ad set ${i + 1}` }))} />
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!editable || sets.length >= 20} onClick={() => { dispatch({ type: "addAdSet" }); onActive(sets.length); }}><Plus className="size-3.5" /> Add ad set</Button>
          {set && <Button type="button" size="sm" variant="outline" disabled={!editable} onClick={() => { dispatch({ type: "duplicateAdSet", index: at }); onActive(sets.length); }}><Copy className="size-3.5" /> Duplicate</Button>}
          {set && <Button type="button" size="sm" variant="outline" disabled={!editable} onClick={() => { dispatch({ type: "removeAdSet", index: at }); onActive(Math.max(at - 1, 0)); }}><Trash2 className="size-3.5" /> Remove</Button>}
        </div>
      </div>
      {!set ? (
        <EmptyState title="No ad sets yet" action={<Button type="button" size="sm" disabled={!editable} onClick={() => dispatch({ type: "addAdSet" })}><Plus className="size-3.5" /> Add the first ad set</Button>}>An ad set holds one audience, one placement choice, one schedule and (unless the campaign has the budget) one budget. Ads go inside ad sets.</EmptyState>
      ) : (
        <AdSetForm key={set.key} ctx={ctx} index={at} />
      )}
    </div>
  );
}

function AdSetForm({ ctx, index }: { ctx: StepCtx; index: number }) {
  const { state, dispatch, editable, accounts, account } = ctx;
  const c = state.meta;
  const s = c.adSets[index];
  const base = `meta.adSets[${index}]`;
  const info = account.data?.info ?? null;
  const cur = state.currency;
  const cbo = state.confirm.cbo || c.campaignBudget !== null;
  const dests = destinationsFor(c.objective);
  const goals = goalsFor(c.objective, s.destinationType);
  const { needs, alt } = promotedNeeds(c.objective, s.optimizationGoal);
  const wantsApp = needs.includes("application_id") || (alt?.includes("application_id") && s.destinationType === "APP");
  const wantsPixel = needs.includes("pixel_id") && !wantsApp ? true : Boolean(alt?.includes("pixel_id") && s.destinationType !== "APP");
  const wantsPage = needs.includes("page_id");
  const page = accounts.pages.find((p) => p.id === c.pageAccountId) ?? null;
  const patch = (p: Partial<MetaAdSetDraft>) => dispatch({ type: "adset", index, patch: p });
  const po = (k: Partial<typeof s.promotedObject>) => patch({ promotedObject: { ...s.promotedObject, ...k } });
  const strategy = s.bidStrategy ?? c.bidStrategy;
  const needsBid = strategy !== null && BID_AMOUNT_STRATEGIES.includes(strategy);
  const eu = targetsEu(s.targeting);
  const pixelOptions = (account.data?.pixels ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }));

  // The Page id Meta wants is the Page's own id, which the connected account already holds.
  useEffect(() => {
    if (editable && wantsPage && page && s.promotedObject.pageId !== page.externalId) dispatch({ type: "adset", index, patch: { promotedObject: { ...s.promotedObject, pageId: page.externalId } } });
  }, [editable, wantsPage, page, s.promotedObject, dispatch, index]);

  return (
    <div className="space-y-4">
      <Section title="Ad set" description="One audience, one placement choice and one schedule.">
        <AiField fieldKey="ad.name" label="Ad set name" id={fieldId(`${base}.name`)} as="input" value={s.name} limit={400} disabled={!editable} onChange={(v) => patch({ name: String(v) })} getContext={() => ({ ...ctx.aiContext(), format: "ad set" })} aiDisabled={!ctx.canGenerate} hint="For your team, for example the audience and goal." />
        {dests === null ? (
          <Note>A {c.objective ? "campaign with this objective" : "campaign"} has no conversion location to choose: Meta decides where people go.</Note>
        ) : (
          <FieldBox path={`${base}.destinationType`} label="Conversion location" required help="Where people end up after they see the ad.">
            <div id={fieldId(`${base}.destinationType`)} tabIndex={-1}>
              <ChoiceCards name={`dest-${index}`} value={s.destinationType} disabled={!editable} onChange={(v) => patch({ destinationType: v })} options={dests.map((d) => ({ value: d, label: DESTINATION_LABEL[d]?.label ?? ctaLabel(d), description: DESTINATION_LABEL[d]?.description }))} />
            </div>
            <p className="text-[11px] text-muted-foreground">Phone-call ads are not offered: the call destination is not part of this version.</p>
          </FieldBox>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBox path={`${base}.optimizationGoal`} label="Performance goal" required help="What Meta tries to get you more of for the money. Only goals that fit the objective and conversion location are listed.">
            <OptionSelect id={fieldId(`${base}.optimizationGoal`)} value={s.optimizationGoal ?? ""} disabled={!editable} placeholder="Choose a goal" options={goals.map((g) => ({ value: g, label: goalLabel(g) }))} onChange={(v) => patch({ optimizationGoal: (v || null) as typeof s.optimizationGoal })} />
          </FieldBox>
          <FieldBox path={`${base}.billingEvent`} label="You are charged per" help="Meta's usual billing for this goal. Set automatically; Meta can refuse another choice.">
            <p className="text-xs font-medium">{s.billingEvent ? ctaLabel(s.billingEvent) : "Choose a goal first"}</p>
          </FieldBox>
        </div>

        {wantsPage && <Note>This goal runs on your Page{page ? `: ${page.name}` : ""}. {page ? "It is set automatically." : "Choose a Page in step 1."}</Note>}
        {wantsPixel && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox path={`${base}.promotedObject.pixelId`} label="Pixel (dataset)" required help="The pixel that records the conversion on your website.">
              <OptionSelect id={fieldId(`${base}.promotedObject.pixelId`)} value={s.promotedObject.pixelId ?? ""} disabled={!editable} placeholder={pixelOptions.length ? "Choose a pixel" : "No pixel on this account"} options={pixelOptions} onChange={(v) => po({ pixelId: v || undefined })} />
            </FieldBox>
            <FieldBox path={`${base}.promotedObject.customEventType`} label="Conversion event" required help="The event Meta counts as a result, for example Lead or Purchase.">
              <OptionSelect id={fieldId(`${base}.promotedObject.customEventType`)} value={s.promotedObject.customEventType ?? ""} disabled={!editable} placeholder="Choose an event" options={META_CUSTOM_EVENT_TYPES.map((e) => ({ value: e, label: ctaLabel(e) }))} onChange={(v) => po({ customEventType: v || undefined })} />
            </FieldBox>
            {s.promotedObject.customEventType === "OTHER" && (
              <FieldBox path={`${base}.promotedObject.customEventStr`} label="Custom event name" required help="Exactly as your pixel sends it.">
                <Input id={fieldId(`${base}.promotedObject.customEventStr`)} value={s.promotedObject.customEventStr ?? ""} disabled={!editable} onChange={(e) => po({ customEventStr: e.target.value })} />
              </FieldBox>
            )}
          </div>
        )}
        {wantsApp && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox path={`${base}.promotedObject.applicationId`} label="App ID" required help="The Meta app ID of the app being promoted.">
              <Input id={fieldId(`${base}.promotedObject.applicationId`)} value={s.promotedObject.applicationId ?? ""} disabled={!editable} onChange={(e) => po({ applicationId: e.target.value.trim() || undefined })} />
            </FieldBox>
            <FieldBox path={`${base}.promotedObject.objectStoreUrl`} label="App store link" required help="The Google Play or Apple App Store address of the app.">
              <Input id={fieldId(`${base}.promotedObject.objectStoreUrl`)} type="url" value={s.promotedObject.objectStoreUrl ?? ""} disabled={!editable} placeholder="https://" onChange={(e) => po({ objectStoreUrl: e.target.value.trim() || undefined })} />
            </FieldBox>
          </div>
        )}
      </Section>

      <Section title="Budget, bid and schedule" description={cbo ? "The budget is set on the campaign, so it is shared by the ad sets." : "This ad set's own budget and dates."}>
        {cbo ? (
          <Note>Budget is on the campaign (step 2). Only dates and the bid amount are set here.</Note>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox path={`${base}.budget.type`} label="Budget type" help="Daily: about this much each day. Lifetime: this total by the end date (needs an end date).">
              <OptionSelect id={fieldId(`${base}.budget.type`)} value={s.budget?.type ?? "daily"} disabled={!editable} options={[{ value: "daily", label: "Daily budget" }, { value: "lifetime", label: "Lifetime budget" }]} onChange={(v) => patch({ budget: { type: v as "daily" | "lifetime", amountMinor: s.budget?.amountMinor ?? 0 } })} />
            </FieldBox>
            <MoneyField path={`${base}.budget.amountMinor`} label="Amount" required currency={cur} valueMinor={s.budget?.amountMinor || null} disabled={!editable} onChange={(minor) => patch({ budget: minor ? { type: s.budget?.type ?? "daily", amountMinor: minor } : null })} help={info?.minDailyBudgetMinor ? `Meta's minimum daily budget on this account is ${formatMinor(info.minDailyBudgetMinor, info.currency)}.` : "Meta checks the minimum for the account when you create the campaign."} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeField path={`${base}.startTime`} label="Start (optional)" value={s.startTime} disabled={!editable} onChange={(v) => patch({ startTime: v })} help="Empty = the campaign's start, or when it is switched on." />
          <DateTimeField path={`${base}.endTime`} label="End (optional)" value={s.endTime} disabled={!editable} onChange={(v) => patch({ endTime: v })} help="Required for a lifetime budget." />
        </div>
        <p className="text-[11px] text-muted-foreground">Ad scheduling by hour of day is not available in this version.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {!cbo && (
            <FieldBox path={`${base}.bidStrategy`} label="Bid strategy" help="How Meta bids for this ad set. Highest volume needs no bid amount.">
              <OptionSelect id={fieldId(`${base}.bidStrategy`)} value={s.bidStrategy ?? ""} disabled={!editable} noneLabel="Meta default (highest volume)" options={META_BID_STRATEGIES.map((b) => ({ value: b, label: BID_LABEL[b] }))} onChange={(v) => patch({ bidStrategy: (v || null) as MetaBidStrategy | null })} />
            </FieldBox>
          )}
          {needsBid && <MoneyField path={`${base}.bidAmountMinor`} label={strategy === "COST_CAP" ? "Cost per result goal" : "Bid cap"} required currency={cur} valueMinor={s.bidAmountMinor} disabled={!editable} onChange={(minor) => patch({ bidAmountMinor: minor })} help="The most you want to pay per result (or the average you aim for)." />}
        </div>
        <FieldBox path={`${base}.attribution`} label="Attribution window" help="How long after someone sees or clicks the ad a conversion still counts. Meta accepts only certain windows per goal.">
          <OptionSelect id={fieldId(`${base}.attribution`)} value={attributionKey(s.attribution)} disabled={!editable} options={ATTRIBUTION.map((a) => ({ value: a.value, label: a.label }))} onChange={(v) => patch({ attribution: ATTRIBUTION.find((a) => a.value === v)?.spec ?? [] })} />
        </FieldBox>
        {(s.optimizationGoal === "REACH" || s.optimizationGoal === "THRUPLAY") && (
          <FieldBox path={`${base}.frequencyControl`} label="Frequency cap (optional)" help="Limit how often one person sees the ad.">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Input id={fieldId(`${base}.frequencyControl`)} type="number" min={1} max={90} aria-label="Maximum times" value={s.frequencyControl?.maxFrequency ?? ""} disabled={!editable} placeholder="times" className="h-8 w-20" onChange={(e) => patch({ frequencyControl: e.target.value ? { event: s.frequencyControl?.event ?? "IMPRESSIONS", intervalDays: s.frequencyControl?.intervalDays ?? 7, maxFrequency: Number(e.target.value) } : null })} />
              <span>every</span>
              <Input type="number" min={1} max={90} aria-label="Days" value={s.frequencyControl?.intervalDays ?? 7} disabled={!editable || !s.frequencyControl} className="h-8 w-20" onChange={(e) => patch({ frequencyControl: s.frequencyControl ? { ...s.frequencyControl, intervalDays: Number(e.target.value) } : null })} />
              <span>days</span>
            </div>
          </FieldBox>
        )}
      </Section>

      <Section title="Audience" description="Who can see this ad set. Everything you search for here comes live from Meta for your ad account.">
        <TargetingEditor ctx={ctx} index={index} set={s} />
        {eu && (
          <div className="space-y-3 rounded-xl border border-border/50 p-3">
            <p className="text-xs font-semibold">EU Digital Services Act</p>
            <p className="text-[11px] text-muted-foreground">Ads shown in the EU must say who the ad is for (beneficiary) and who pays for it (payor).{info?.defaultDsaBeneficiary || info?.defaultDsaPayor ? " Your ad account has defaults that are used when you leave these empty." : ""}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBox path={`${base}.dsaBeneficiary`} label="Beneficiary" required help={info?.defaultDsaBeneficiary ? `Account default: ${info.defaultDsaBeneficiary}` : "The person or business the ad promotes."}>
                <Input id={fieldId(`${base}.dsaBeneficiary`)} value={s.dsaBeneficiary} maxLength={512} disabled={!editable} onChange={(e) => patch({ dsaBeneficiary: e.target.value })} />
              </FieldBox>
              <FieldBox path={`${base}.dsaPayor`} label="Payor" required help={info?.defaultDsaPayor ? `Account default: ${info.defaultDsaPayor}` : "The person or business that pays for the ad."}>
                <Input id={fieldId(`${base}.dsaPayor`)} value={s.dsaPayor} maxLength={512} disabled={!editable} onChange={(e) => patch({ dsaPayor: e.target.value })} />
              </FieldBox>
            </div>
          </div>
        )}
      </Section>

      <Section title="Placements" description="Where the ads can appear.">
        <PlacementsEditor index={index} targeting={s.targeting} goal={s.optimizationGoal} editable={editable} onChange={(placements) => dispatch({ type: "targeting", index, patch: { placements } })} />
        <CheckRow id={`dyn-${index}`} checked={s.isDynamicCreative} disabled={!editable} onChange={(v) => patch({ isDynamicCreative: v })} label="Dynamic creative" help="Meta mixes your texts, headlines and media to find the best combination. Carousel ads cannot be used with it." />
      </Section>
    </div>
  );
}
