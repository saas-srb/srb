"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { META_BID_STRATEGIES, META_SPECIAL_AD_CATEGORIES, type MetaSpecialAdCategory, type MetaBidStrategy } from "@/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import { OBJECTIVE_OPTIONS, fieldId, formatMinor } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { ChoiceCards, CheckRow, DateTimeField, FieldBox, MoneyField, Note, Section, useErrors } from "./ads-bits";
import type { StepCtx } from "./ads-ctx";

const SAC_LABEL: Record<MetaSpecialAdCategory, { label: string; help: string }> = {
  EMPLOYMENT: { label: "Jobs (employment)", help: "Ads for job offers, internships or career programmes." },
  HOUSING: { label: "Housing", help: "Ads for property sales or rentals, housing finance or related services." },
  CREDIT: { label: "Credit", help: "Ads for credit cards, loans or other credit offers." },
  ISSUES_ELECTIONS_POLITICS: { label: "Social issues, elections or politics", help: "Needs Meta's ad authorisation for the Page." },
  ONLINE_GAMBLING_AND_GAMING: { label: "Online gambling and gaming", help: "Needs Meta's prior permission." },
  FINANCIAL_PRODUCTS_SERVICES: { label: "Financial products and services", help: "Loans, insurance, investments and similar." },
};
const BID_LABEL: Record<MetaBidStrategy, { label: string; help: string }> = {
  LOWEST_COST_WITHOUT_CAP: { label: "Highest volume (lowest cost)", help: "Meta spends the whole budget for the most results. No bid amount needed." },
  LOWEST_COST_WITH_BID_CAP: { label: "Bid cap", help: "Meta never bids above the amount you set on each ad set." },
  COST_CAP: { label: "Cost per result goal", help: "Meta aims to keep the average cost per result near the amount you set on each ad set." },
  LOWEST_COST_WITH_MIN_ROAS: { label: "ROAS goal", help: "Meta aims for a minimum return on ad spend. This version cannot send the ROAS floor, so Meta may reject it." },
};

export default function StepCampaign({ ctx, saveStatus }: { ctx: StepCtx; saveStatus?: ReactNode }) {
  const { state, dispatch, editable, strategy } = ctx;
  const m = state.meta;
  const cur = state.currency;
  const sacErrors = useErrors("meta.specialAdCategories");
  const cbo = state.confirm.cbo;
  const set = (patch: Partial<typeof m>) => dispatch({ type: "campaign", patch });
  const toggleSac = (c: MetaSpecialAdCategory, on: boolean) => {
    set({ specialAdCategories: on ? [...new Set([...m.specialAdCategories, c])] : m.specialAdCategories.filter((x) => x !== c) });
    dispatch({ type: "confirm", patch: { noSpecialCategory: false } });
  };

  return (
    <div className="space-y-4">
      <Section title="Campaign" description="The campaign holds the objective and, optionally, the budget. The ad sets below it say who sees the ads." actions={saveStatus}>
        <AiField fieldKey="campaign.name" label="Campaign name" id="f-name" as="input" value={state.name} limit={120} disabled={!editable} onChange={(v) => dispatch({ type: "name", name: String(v) })} getContext={ctx.aiContext} hint="For your team. It is also the name in Meta Ads Manager." />
        <FieldBox path="meta.objective" label="Objective" required help="What you want people to do. Meta uses it to choose who sees the ad and which goals are available.">
          <div id={fieldId("meta.objective")} tabIndex={-1}>
            <ChoiceCards name="objective" value={m.objective} disabled={!editable} onChange={(v) => set({ objective: v })} options={OBJECTIVE_OPTIONS.map((o) => ({ value: o.value, label: o.label, description: o.description }))} />
          </div>
        </FieldBox>
      </Section>

      <Section title="Special ad categories" description="Meta requires you to say whether the ads are about credit, jobs, housing or social issues. Choosing wrongly can get the ad rejected or the account restricted.">
        <fieldset id={fieldId("meta.specialAdCategories")} tabIndex={-1} className="space-y-2" disabled={!editable}>
          <legend className="sr-only">Special ad categories</legend>
          <CheckRow id="sac-none" checked={state.confirm.noSpecialCategory && m.specialAdCategories.length === 0} disabled={!editable} onChange={(v) => { dispatch({ type: "confirm", patch: { noSpecialCategory: v } }); if (v) set({ specialAdCategories: [], specialAdCategoryCountry: [] }); }} label="None of these apply" help="These ads are not about credit, jobs, housing, financial products or social issues, elections or politics." />
          {META_SPECIAL_AD_CATEGORIES.map((c) => (
            <CheckRow key={c} id={`sac-${c}`} checked={m.specialAdCategories.includes(c)} disabled={!editable} onChange={(v) => toggleSac(c, v)} label={SAC_LABEL[c].label} help={SAC_LABEL[c].help} />
          ))}
        </fieldset>
        {sacErrors.length > 0 && <Note tone="warn">{sacErrors.map((e) => <p key={e.code}>{e.message}</p>)}</Note>}
        {m.specialAdCategories.length > 0 && (
          <>
            <Note tone="warn">Special categories restrict targeting: age, gender, postcodes and detailed targeting may be ignored or rejected by Meta.</Note>
            <FieldBox path="meta.specialAdCategoryCountry" label="Countries the category applies to" help="Two-letter country codes separated by commas, for example IN, US.">
              <Input id={fieldId("meta.specialAdCategoryCountry")} value={m.specialAdCategoryCountry.join(", ")} disabled={!editable} placeholder="IN" onChange={(e) => set({ specialAdCategoryCountry: e.target.value.split(/[ ,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean) })} className="max-w-60" />
            </FieldBox>
          </>
        )}
      </Section>

      <Section title="Budget and bidding" description="Choose where the money is set. Either the campaign shares one budget across its ad sets (Advantage+ campaign budget), or each ad set has its own.">
        <FieldBox label="Buying type" help="Auction. Reserved buying (reach and frequency) is not available from this app.">
          <p className="text-xs font-medium">Auction</p>
        </FieldBox>
        <CheckRow id="cbo" checked={cbo} disabled={!editable} onChange={(v) => { dispatch({ type: "confirm", patch: { cbo: v } }); if (!v) set({ campaignBudget: null }); }} label="Set one budget on the campaign (Advantage+ campaign budget)" help="Meta moves the money between ad sets to where it works best. Leave off to give each ad set its own budget in step 3." />
        {cbo && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox path="meta.campaignBudget.type" label="Budget type" help="Daily: spends about this much each day. Lifetime: spends this total by the end date (needs an end date).">
              <OptionSelect id={fieldId("meta.campaignBudget.type")} value={m.campaignBudget?.type ?? "daily"} disabled={!editable} options={[{ value: "daily", label: "Daily budget" }, { value: "lifetime", label: "Lifetime budget" }]} onChange={(v) => set({ campaignBudget: { type: v as "daily" | "lifetime", amountMinor: m.campaignBudget?.amountMinor ?? 0 } })} />
            </FieldBox>
            <MoneyField path="meta.campaignBudget.amountMinor" label="Amount" currency={cur} valueMinor={m.campaignBudget?.amountMinor || null} disabled={!editable} required onChange={(minor) => set({ campaignBudget: minor ? { type: m.campaignBudget?.type ?? "daily", amountMinor: minor } : null })} help="Meta may spend up to 25% more on a single day; the weekly total stays within seven times the daily budget." />
            <FieldBox path="meta.bidStrategy" label="Bid strategy" help={m.bidStrategy ? BID_LABEL[m.bidStrategy].help : "How Meta bids in the auction for this campaign."}>
              <OptionSelect id={fieldId("meta.bidStrategy")} value={m.bidStrategy ?? ""} disabled={!editable} noneLabel="Meta default (highest volume)" options={META_BID_STRATEGIES.map((b) => ({ value: b, label: BID_LABEL[b].label }))} onChange={(v) => set({ bidStrategy: (v || null) as MetaBidStrategy | null })} />
            </FieldBox>
          </div>
        )}
        <MoneyField path="meta.spendCapMinor" label="Campaign spend cap (optional)" currency={cur} valueMinor={m.spendCapMinor} disabled={!editable} onChange={(minor) => set({ spendCapMinor: minor })} help="Meta stops the campaign once its total spend reaches this amount. Leave empty for no cap." />
        {m.spendCapMinor !== null && cur && <p className="text-[11px] text-muted-foreground">Cap: {formatMinor(m.spendCapMinor, cur)}</p>}
      </Section>

      <Section title="Schedule" description="Times are read in the ad account's time zone by Meta. Leave the start empty to begin when the campaign is switched on.">
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeField path="meta.startTime" label="Start" value={m.startTime} disabled={!editable} onChange={(v) => set({ startTime: v })} />
          <DateTimeField path="meta.stopTime" label="End" value={m.stopTime} disabled={!editable} onChange={(v) => set({ stopTime: v })} help="Required for a lifetime budget. Without an end date a daily budget runs until you pause it." />
        </div>
      </Section>

      <Section title="Audience and message brief" description="Used by the AI on every field in this wizard and saved with the campaign. It does not change who is targeted; targeting is set per ad set.">
        <AiField fieldKey="campaign.targetAudience" label="Who is this for?" id="f-brief-audience" as="textarea" rows={3} value={state.brief.targetAudience} disabled={!editable} onChange={(v) => dispatch({ type: "brief", patch: { targetAudience: String(v) } })} getContext={ctx.aiContext} hint="Plain words. The AI never adds audience sizes or statistics." />
        <AiField fieldKey="campaign.landingPage" label="Website address people go to" id="f-brief-landing" as="input" inputType="url" value={state.brief.landingPage} disabled={!editable} onChange={(v) => dispatch({ type: "brief", patch: { landingPage: String(v) } })} getContext={ctx.aiContext} hint="A fact: the AI only restructures what you wrote or fills in your own company website." placeholder="https://" />
        <div className="space-y-1.5">
          <label htmlFor="f-brief-offer" className="block text-xs font-medium">Offer or service</label>
          <Input id="f-brief-offer" value={state.brief.offerService} disabled={!editable} maxLength={500} onChange={(e) => dispatch({ type: "brief", patch: { offerService: e.target.value } })} />
          <p className="text-[11px] text-muted-foreground">What the ads promote, in your words.</p>
        </div>
        {strategy ? (
          <div className="space-y-3 rounded-xl border border-border/50 p-3">
            <p className="text-xs font-semibold">From this campaign&apos;s strategy</p>
            {strategy.summary && <p className="text-xs text-muted-foreground">{strategy.summary}</p>}
            {strategy.audiences.length > 0 && (
              <div className="space-y-1.5">
                {strategy.audiences.map((a, i) => (
                  <div key={i} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                    <p className="min-w-0 flex-1"><span className="font-semibold">{a.name}.</span> {a.description}</p>
                    <Button type="button" size="xs" variant="outline" disabled={!editable} onClick={() => dispatch({ type: "brief", patch: { targetAudience: `${a.name}: ${a.description}` } })}>Use as audience</Button>
                  </div>
                ))}
              </div>
            )}
            {strategy.keyMessages.length > 0 && <p className="text-[11px] text-muted-foreground">Key messages: {strategy.keyMessages.join(" / ")}</p>}
            <p className="text-[11px] text-muted-foreground">Ad concepts from the strategy can start an ad in step 4.</p>
          </div>
        ) : state.campaignId ? (
          <Note>No strategy yet for this campaign. <Link className="font-semibold underline" href={`/viralpulse-ai/campaigns/${state.campaignId}`}>Generate one on the campaign page</Link> to prefill the audience and ad copy here.</Note>
        ) : (
          <Note>The campaign&apos;s AI strategy (audiences, messages, ad concepts) can prefill this step and step 4. Name the campaign and it is saved as a draft; the strategy is generated from the campaign page.</Note>
        )}
      </Section>
    </div>
  );
}
