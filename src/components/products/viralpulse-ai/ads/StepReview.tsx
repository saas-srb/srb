"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCw, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import SourceBadge from "@/components/products/viralpulse-ai/shared/SourceBadge";
import type { FieldError } from "@/lib/products/viralpulse-ai/ads-platforms/types";
import type { GuardSummary, LaunchView } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import { WIZARD_STEPS, describeError, formatMinor, groupErrorsByStep, type WizardStepKey } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import type { ValidationView } from "./AdsWizard";
import LaunchPanel, { type LaunchPerms } from "./LaunchPanel";
import { CheckRow, Note, Section } from "./ads-bits";
import type { StepCtx } from "./ads-ctx";

export default function StepReview({ ctx, validation, validating, onValidate, guard, launch, onLaunch, perms, onSave, saving, onGoto, onErrors, limitsHref }: {
  ctx: StepCtx; validation: ValidationView | null; validating: boolean; onValidate: () => void; guard: GuardSummary; launch: LaunchView | null; onLaunch: (l: LaunchView | null) => void; perms: LaunchPerms;
  onSave: () => void; saving: boolean; onGoto: (path: string) => void; onErrors: (e: FieldError[]) => void; limitsHref: string | null;
}) {
  const { state, dispatch } = ctx;
  const info = validation?.account ?? ctx.account.data?.info ?? null;
  const cur = info?.currency ?? state.currency;
  const grouped = validation ? groupErrorsByStep([...validation.errors]) : null;
  const names = { adSets: state.meta.adSets, ads: state.ads.map((a) => ({ id: a.id ?? a.key, name: a.name })) };
  const caps = cur ? guard.currencies[cur] : undefined;
  const noCap = Boolean(cur) && !caps && !guard.allowUncapped;
  const c = state.confirm;
  const allConfirmed = c.billing && c.rights && c.policies;
  const guardBlocks = validation?.guard ? validation.guard.reasons.filter((r) => !/No spending limit|kill switch/i.test(r)) : [];
  const canLaunchNow = Boolean(validation?.ok) && allConfirmed && guardBlocks.length === 0;
  const blocked = !validation ? "Check the draft first." : !validation.ok ? `Fix ${validation.errors.length} problem${validation.errors.length === 1 ? "" : "s"} listed below.` : !allConfirmed ? "Tick the three confirmations below." : guardBlocks.length ? guardBlocks[0] : null;

  return (
    <div className="space-y-4">
      <Section title="Check before launch" description="This reads the saved draft and your ad account in Meta and lists everything Meta or your company limits would refuse. It spends nothing." actions={
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onSave} disabled={saving || !perms.canEdit}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save draft</Button>
          <Button type="button" size="sm" onClick={onValidate} disabled={validating || !state.campaignId}>{validating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Check now</Button>
        </div>
      }>
        {!state.campaignId && <Note tone="warn">Name the campaign and the draft is saved, then it can be checked.</Note>}
        {validation && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span role="status" className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${validation.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
                {validation.ok ? <CheckCircle2 className="size-3.5" /> : <ShieldAlert className="size-3.5" />} {validation.ok ? "Ready to create" : `${validation.errors.length} problem${validation.errors.length === 1 ? "" : "s"} to fix`}
              </span>
              <SourceBadge source="synced" at={validation.checkedAt} label="Checked against Meta" />
            </div>
            {validation.errors.length > 0 && (
              <div className="space-y-3">
                {WIZARD_STEPS.filter((s) => (grouped?.[s.key].length ?? 0) > 0).map((s) => (
                  <div key={s.key}>
                    <p className="mb-1 text-xs font-semibold">{s.label}</p>
                    <ul className="space-y-1">
                      {grouped![s.key as WizardStepKey].map((e, i) => (
                        <li key={`${e.path}-${i}`} className="flex items-start justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-xs">
                          <span>{describeError(e, names)}</span>
                          <Button type="button" size="xs" variant="outline" onClick={() => onGoto(e.path)}>Fix</Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold">Worth a look (does not block)</p>
                <ul className="space-y-1">{validation.warnings.map((e, i) => <li key={`${e.path}-${i}`} className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs"><span>{describeError(e, names)}</span><Button type="button" size="xs" variant="ghost" onClick={() => onGoto(e.path)}>Go</Button></li>)}</ul>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Budget and spending limits" description="What this plan can spend, against your company's limits.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat k="Daily commitment" v={validation ? formatMinor(validation.commitment.dailyMinor, cur || "INR") : "-"} />
          <Stat k="Total it can spend" v={validation ? (validation.commitment.totalMinor === null ? "No end date: not limited" : formatMinor(validation.commitment.totalMinor, cur || "INR")) : "-"} />
          <Stat k="Counted against the 30-day limit" v={validation ? formatMinor(validation.commitment.monthlyMinor, cur || "INR") : "-"} />
        </div>
        {guard.killSwitch && <Note tone="bad"><p className="font-semibold">The ads kill switch is on.</p><p>Nothing can run until an approver turns it off in the spending limits.</p></Note>}
        {noCap && (
          <Note tone="bad">
            <p className="font-semibold">No spending limit is set for {cur}.</p>
            <p>The campaign can still be created paused, but it cannot be switched on until an approver sets limits for {cur}{perms.canApprove && limitsHref ? "" : "."}</p>
            {perms.canApprove && limitsHref ? <Link href={limitsHref} className="font-semibold underline">Set the spending limits</Link> : <p>Ask someone with the Approve ad spend permission.</p>}
          </Note>
        )}
        {validation?.guard && validation.guard.reasons.filter((r) => !/No spending limit|kill switch/i.test(r)).map((r) => <Note key={r} tone="bad">{r}</Note>)}
        {caps && (
          <ul className="text-[11px] text-muted-foreground">
            {caps.maxDailyPerLaunchMinor ? <li>Daily limit per launch: {formatMinor(caps.maxDailyPerLaunchMinor, cur)}</li> : null}
            {caps.maxTotalPerLaunchMinor ? <li>Total limit per launch: {formatMinor(caps.maxTotalPerLaunchMinor, cur)}</li> : null}
            {caps.companyDailyCapMinor ? <li>Company daily limit: {formatMinor(caps.companyDailyCapMinor, cur)}</li> : null}
            {caps.companyMonthlyCapMinor ? <li>Company monthly limit: {formatMinor(caps.companyMonthlyCapMinor, cur)}</li> : null}
          </ul>
        )}
        <Note tone="info">
          <p className="font-semibold">Approval</p>
          <p>Before this can spend, a person with the Approve ad spend permission approves the budget.{validation?.guard?.needsSecondApprover ? " This budget is above the approval threshold, so the approver must be someone other than the person who created it." : caps?.approvalThresholdMinor ? ` Above ${formatMinor(caps.approvalThresholdMinor, cur)} the approver cannot be the creator.` : ""}</p>
        </Note>
      </Section>

      <Section title="Confirm" description="Meta holds you responsible for these. They are recorded as your confirmation, not checked automatically.">
        <CheckRow id="c-billing" checked={c.billing} onChange={(v) => dispatch({ type: "confirm", patch: { billing: v } })} label="A payment method is set up on the ad account" help={info?.hasPaymentMethod === true ? "Meta shows a payment method on this account." : info?.hasPaymentMethod === false ? "Meta shows none. Add one in Meta before the ads can deliver." : "Meta did not say. Check in Meta Billing settings."} />
        <CheckRow id="c-rights" checked={c.rights} onChange={(v) => dispatch({ type: "confirm", patch: { rights: v } })} label="I have the rights to every picture, video, text and music in these ads" help="Including people shown, brands, logos and music." />
        <CheckRow id="c-policies" checked={c.policies} onChange={(v) => dispatch({ type: "confirm", patch: { policies: v } })} label="The ads follow Meta's advertising policies and the law" help="Including the special ad category choice and any AI-generated media disclosure." />
      </Section>

      <Section title="Launch" description="Create it in Meta paused, then approve and switch it on.">
        <LaunchPanel campaignId={state.campaignId} launch={launch} onLaunch={onLaunch} perms={perms} canLaunchNow={canLaunchNow} blockedReason={blocked} onErrors={onErrors} onGoto={onGoto} />
      </Section>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl border border-border/50 p-3"><p className="text-[11px] text-muted-foreground">{k}</p><p className="text-sm font-semibold tabular-nums">{v}</p></div>;
}
