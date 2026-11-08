"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import ConnectionGate from "@/components/products/viralpulse-ai/shared/ConnectionGate";
import ErrorState from "@/components/products/viralpulse-ai/shared/ErrorState";
import SourceBadge from "@/components/products/viralpulse-ai/shared/SourceBadge";
import { CAPABILITIES, ADS_PLATFORMS } from "@/lib/products/viralpulse-ai/ads-platforms/types";
import { formatMinor, targetsEu } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { FieldBox, Note, Section, ChoiceCards } from "./ads-bits";
import type { StepCtx } from "./ads-ctx";
import { fieldId } from "@/lib/products/viralpulse-ai/ads-platforms/ui";

const PLATFORM_DOC: Record<string, string> = {
  meta: "Facebook and Instagram. Campaigns are created in your ad account, paused, and only start after an approval.",
  google: "Search campaigns. You can build and check the full request here; nothing is sent to Google.",
  linkedin: "Campaign groups and campaigns. You can build and check the request here; nothing is sent to LinkedIn.",
  x: "Campaigns and line items. You can build and check the request here; nothing is sent to X.",
};

export default function StepAccount({ ctx, platformLocked, saveStatus }: { ctx: StepCtx; platformLocked: boolean; saveStatus?: ReactNode }) {
  const { state, dispatch, editable, accounts, account } = ctx;
  const m = state.meta;
  const page = accounts.pages.find((p) => p.id === m.pageAccountId) ?? null;
  const igAll = accounts.instagram;
  const igForPage = page ? igAll.filter((i) => i.pageExternalId === page.externalId) : [];
  const igOptions = igForPage.length > 0 ? igForPage : igAll;
  const info = account.data?.info ?? null;

  return (
    <div className="space-y-4">
      <Section title="Ad platform" description="Where these ads run. Only Meta can be launched from here today; the others build and check the real request but are never sent." actions={saveStatus}>
        <ChoiceCards
          name="platform"
          value={state.platform}
          disabled={platformLocked}
          onChange={(v) => dispatch({ type: "replace", state: { ...state, platform: v } })}
          cols="sm:grid-cols-2"
          options={ADS_PLATFORMS.map((k) => ({ value: k, label: `${CAPABILITIES[k].label}${CAPABILITIES[k].realLaunch ? "" : "  -  validate only"}`, description: PLATFORM_DOC[k] }))}
        />
        {state.platform !== "meta" && (
          <Note tone="warn">
            <p className="font-semibold">Launch needs approved API access</p>
            <p>{CAPABILITIES[state.platform].scope}</p>
            <p>What the company must obtain: {CAPABILITIES[state.platform].approval}</p>
            <p>You can still fill every real field, see what the platform would reject and copy the request. Nothing is saved to the platform or sent to it.</p>
          </Note>
        )}
      </Section>

      {state.platform === "meta" && (
        <ConnectionGate
          requires={[
            { name: "A Meta ad account", connected: accounts.adAccounts.length > 0, why: "to create campaigns and read their results" },
            { name: "A Facebook Page", connected: accounts.pages.length > 0, why: "because every Meta ad runs as a Page" },
          ]}
        >
          <Section title="Ad account" description="The Meta ad account that pays for and runs the campaign. Budgets, currency and the time zone come from it, not from this app.">
            <FieldBox path="meta.adAccountId" label="Ad account" required help="Choose one of the ad accounts connected under Settings > Connected accounts.">
              <OptionSelect id={fieldId("meta.adAccountId")} value={m.adAccountId ?? ""} disabled={!editable} placeholder="Choose an ad account" options={accounts.adAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.externalId})` }))} onChange={(v) => dispatch({ type: "campaign", patch: { adAccountId: v || null } })} />
            </FieldBox>
            {m.adAccountId && account.status === "loading" && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="size-3.5 animate-spin" /> Reading the account from Meta…</p>
            )}
            {account.status === "error" && (
              <ErrorState title="Meta did not return this ad account" onRetry={account.reload}>{account.error}</ErrorState>
            )}
            {info && (
              <div className="space-y-3 rounded-xl border border-border/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{info.name}</p>
                  <SourceBadge source="synced" at={account.data?.readAt} label="Read from Meta" />
                </div>
                <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  <Fact k="Status" v={info.statusLabel} bad={info.status !== null && info.status !== 1} />
                  <Fact k="Currency" v={info.currency} />
                  <Fact k="Time zone" v={info.timezone ?? "Not given"} />
                  <Fact k="Account spend limit" v={info.spendCapMinor ? formatMinor(info.spendCapMinor, info.currency) : "None set on the account"} />
                  <Fact k="Minimum daily budget" v={info.minDailyBudgetMinor ? formatMinor(info.minDailyBudgetMinor, info.currency) : "Not given"} />
                  <Fact k="Minimum campaign spend cap" v={info.minSpendCapMinor ? formatMinor(info.minSpendCapMinor, info.currency) : "Not given"} />
                  <Fact k="Spent so far" v={info.amountSpentMinor !== null ? formatMinor(info.amountSpentMinor, info.currency) : "Not given"} />
                  <Fact k="Payment method" v={info.hasPaymentMethod === null ? "Not shown by Meta" : info.hasPaymentMethod ? "On file" : "None on file"} bad={info.hasPaymentMethod === false} />
                  <Fact k="Billing" v={info.isPrepay === null ? "Not given" : info.isPrepay ? "Prepaid" : "Postpaid"} />
                </dl>
                {info.status !== null && info.status !== 1 && <Note tone="bad">This ad account is not active ({info.statusLabel}). Meta will not run ads on it. Fix it in Meta Business settings first.</Note>}
                {info.hasPaymentMethod === false && <Note tone="warn">Meta shows no payment method on this account. The campaign can be created paused, but it cannot deliver until one is added in Meta.</Note>}
                {Object.entries(account.data?.problems ?? {}).map(([k, v]) => <Note key={k} tone="warn">Could not read the account&apos;s {k}: {v}</Note>)}
              </div>
            )}
          </Section>

          <Section title="Identity" description="Who the ads appear to come from.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldBox path="meta.pageAccountId" label="Facebook Page" required help="Required by Meta. Its name and picture appear on the ad.">
                <OptionSelect id={fieldId("meta.pageAccountId")} value={m.pageAccountId ?? ""} disabled={!editable} placeholder="Choose a Page" options={accounts.pages.map((p) => ({ value: p.id, label: p.name }))} onChange={(v) => dispatch({ type: "campaign", patch: { pageAccountId: v || null, instagramAccountId: null } })} />
              </FieldBox>
              <FieldBox path="meta.instagramAccountId" label="Instagram account" help={igAll.length === 0 ? "No Instagram account is connected. Ads then run as the Page on Facebook and, if you choose, on Instagram as the Page." : igForPage.length > 0 ? "Instagram accounts linked to the chosen Page." : "No connected Instagram account is linked to this Page; showing all connected ones."}>
                <OptionSelect id={fieldId("meta.instagramAccountId")} value={m.instagramAccountId ?? ""} disabled={!editable || igAll.length === 0} placeholder="Use the Page" noneLabel="Use the Page (no Instagram account)" options={igOptions.map((i) => ({ value: i.id, label: i.handle ? `@${i.handle.replace(/^@/, "")}` : i.name }))} onChange={(v) => dispatch({ type: "campaign", patch: { instagramAccountId: v || null } })} />
              </FieldBox>
            </div>
            {account.data && account.data.instagram.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Instagram accounts Meta lists for this ad account: {account.data.instagram.map((i) => `@${(i.username ?? i.name).replace(/^@/, "")}`).join(", ")}.</p>
            )}
          </Section>

          <Section title="Pixel and conversion events" description="Pixels (datasets) that Meta lists on this ad account. You choose the pixel and the conversion event for each ad set in step 3, where the goal needs one.">
            {!m.adAccountId ? (
              <p className="text-xs text-muted-foreground">Choose an ad account to see its pixels.</p>
            ) : account.status === "loading" ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : (account.data?.pixels.length ?? 0) === 0 ? (
              <Note tone="info">
                <p>No pixel is listed on this ad account. Goals that count website conversions need one. Create it in Meta Events Manager, then reload.</p>
                <a className="inline-flex items-center gap-1 font-semibold underline" href="https://business.facebook.com/events_manager2" target="_blank" rel="noreferrer">Open Events Manager <ExternalLink className="size-3" /></a>
              </Note>
            ) : (
              <ul className="flex flex-wrap gap-2">{account.data!.pixels.map((p) => <li key={p.id} className="rounded-full border border-border/60 px-2 py-0.5 text-[11px]">{p.name} <span className="text-muted-foreground">{p.id}</span></li>)}</ul>
            )}
          </Section>
          {state.meta.adSets.some((s) => targetsEu(s.targeting)) && <Note tone="info">An ad set targets the EU, so it also needs the payor and beneficiary (step 3). Defaults on the ad account are used when you leave them empty.</Note>}
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden /> Tokens never reach this page. Manage logins in <Link className="underline" href="/viralpulse-ai/settings?tab=integrations">Connected accounts</Link>.</p>
        </ConnectionGate>
      )}
    </div>
  );
}

function Fact({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className={bad ? "font-semibold text-rose-700 dark:text-rose-300" : "font-medium"}>{v}</dd>
    </div>
  );
}
