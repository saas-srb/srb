"use client";

import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import ConnectionGate, { CONNECTED_ACCOUNTS_HREF } from "@/components/products/viralpulse-ai/shared/ConnectionGate";
import { Field, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { POST_PLATFORMS, PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { CONTENT_TYPES, OBJECTIVES, accountUse, objectiveKeyFor, objectiveLabel, pickAccount } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import { Callout, FieldError, sectionTitle, type StepProps } from "./shared";
import { cn } from "@/lib/utils";

const TONE_CLS = { ok: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300", warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300", bad: "bg-rose-500/12 text-rose-800 dark:text-rose-300" } as const;

export default function StepGoal({ init, s, dispatch, errors, showErrors, locked, ai }: StepProps) {
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const anyAccount = init.accounts.length > 0;
  const setPlatforms = (list: PostPlatform[]) => {
    for (const p of POST_PLATFORMS) {
      const want = list.includes(p);
      if (want !== s.platforms.includes(p)) dispatch({ type: "togglePlatform", platform: p, accounts: init.accounts });
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="goal-objective">
        <AiField {...ai("post.objective")} label="What is this post for? *" id="goal-objective" as="custom" value={objectiveLabel(s.objective)} disabled={locked}
          onChange={(x) => {
            const key = objectiveKeyFor(String(x));
            if (key) dispatch({ type: "set", patch: { objective: key } });
            else toast.info(`The AI suggested “${String(x)}”, which is not one of the choices. Pick one yourself.`);
          }}>
          <div role="radiogroup" aria-label="Objective" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {OBJECTIVES.map((o) => (
              <button key={o.key} type="button" role="radio" aria-checked={s.objective === o.key} disabled={locked} onClick={() => dispatch({ type: "set", patch: { objective: o.key } })}
                className={cn("rounded-xl border p-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:opacity-60", s.objective === o.key ? "border-primary bg-primary/8" : "border-border/60 hover:border-primary/40")}>
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="block text-[11px] text-muted-foreground">{o.hint}</span>
              </button>
            ))}
          </div>
        </AiField>
        <FieldError>{err("objective")}</FieldError>
        <Field label="Part of a campaign (optional)" hint="Links this post to a campaign so it shows up in the campaign's reports.">
          <OptionSelect value={s.campaignId} onChange={(v) => dispatch({ type: "set", patch: { campaignId: v } })} options={init.campaigns.map((c) => ({ value: c._id, label: c.name }))} noneLabel="No campaign" aria-label="Campaign" disabled={locked} />
        </Field>
      </section>

      <section className="space-y-3" aria-labelledby="goal-platforms">
        <div className="flex items-center justify-between gap-2">
          <h3 id="goal-platforms" className={sectionTitle}>Where should it go? *</h3>
        </div>
        <ConnectionGate requires={[{ name: "a social account (Instagram, Facebook, YouTube, LinkedIn or X)", connected: anyAccount, why: "to publish a post" }]} canManage={init.can.settings}>
          <AiField {...ai("post.platforms")} label="Platforms and accounts" as="custom" value={s.platforms} disabled={locked}
            onChange={(x) => setPlatforms((Array.isArray(x) ? x : [String(x)]).filter((p): p is PostPlatform => (POST_PLATFORMS as readonly string[]).includes(p) && init.accounts.some((a) => a.platform === p)))}>
            <div className="space-y-3">
              {POST_PLATFORMS.map((p) => {
                const meta = PLATFORM_META[p];
                const list = init.accounts.filter((a) => a.platform === p);
                const on = s.platforms.includes(p);
                const cap = init.caps[p];
                const off = list.length === 0;
                const gbpOff = p === "google_business" && !init.settings.gbpEnabled;
                const chosen = pickAccount(p, init.accounts, s.accountIds[p]);
                return (
                  <div key={p} className={cn("rounded-2xl border p-3 transition", on ? "border-primary/60 bg-primary/5" : "border-border/60")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" role="switch" aria-checked={on} aria-label={`Post to ${meta.label}`} disabled={locked || off || gbpOff} onClick={() => dispatch({ type: "togglePlatform", platform: p, accounts: init.accounts })}
                        className="flex items-center gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none disabled:opacity-60">
                        <span className={cn("flex size-5 items-center justify-center rounded-md border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <CheckCircle2 className="size-3.5" aria-hidden />}</span>
                        <PlatformChip platform={p} full />
                      </button>
                      {off && <span className="text-xs text-muted-foreground">No account connected. <Link href={CONNECTED_ACCOUNTS_HREF} className="font-semibold text-primary underline">Connect one</Link></span>}
                      {gbpOff && !off && <span className="text-xs text-muted-foreground">Switched off until Google approves API access (Settings &gt; Publishing).</span>}
                      {cap.needsAppApproval && on && <span className="text-[11px] text-muted-foreground">{`Needs: ${cap.needsAppApproval}`}</span>}
                    </div>
                    {on && (
                      <div className="mt-3 space-y-3 pl-7">
                        <div role="radiogroup" aria-label={`${meta.label} account`} className="grid gap-2 sm:grid-cols-2">
                          {list.map((a) => {
                            const use = accountUse(a);
                            const sel = chosen?.id === a.id;
                            return (
                              <button key={a.id} type="button" role="radio" aria-checked={sel} disabled={locked || !use.usable} onClick={() => dispatch({ type: "set", patch: { accountIds: { ...s.accountIds, [p]: a.id } } })}
                                className={cn("rounded-xl border p-2 text-left text-xs transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none", sel ? "border-primary bg-background" : "border-border/60", use.usable ? "hover:border-primary/40" : "cursor-not-allowed opacity-80")}>
                                <span className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 truncate font-semibold">{a.name}</span>
                                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", TONE_CLS[use.tone])}>
                                    {use.tone === "ok" ? <CheckCircle2 className="size-3" aria-hidden /> : use.tone === "warn" ? <Clock className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
                                    {use.label}
                                  </span>
                                </span>
                                <span className="block text-muted-foreground">{[a.providerLabel, a.handle && `@${a.handle.replace(/^@/, "")}`].filter(Boolean).join(" · ")}</span>
                                {use.fix && <span className="mt-1 block text-[11px] text-muted-foreground">{use.fix}</span>}
                              </button>
                            );
                          })}
                        </div>
                        <FieldError>{err(`account.${p}`)}</FieldError>
                        <AiField {...ai("post.contentFormat", { platform: p })} label={`${meta.label} post type *`} as="custom" value={CONTENT_TYPES[p].find((c) => c.key === s.contentTypes[p])?.label ?? ""} disabled={locked}
                          enumOptions={CONTENT_TYPES[p].map((c) => c.label)}
                          onChange={(x) => {
                            const def = CONTENT_TYPES[p].find((c) => c.label === String(x));
                            if (def) dispatch({ type: "set", patch: { contentTypes: { ...s.contentTypes, [p]: def.key } } });
                          }}>
                          <div role="radiogroup" aria-label={`${meta.label} post type`} className="flex flex-wrap gap-2">
                            {CONTENT_TYPES[p].map((c) => (
                              <button key={c.key} type="button" role="radio" aria-checked={s.contentTypes[p] === c.key} disabled={locked} onClick={() => dispatch({ type: "set", patch: { contentTypes: { ...s.contentTypes, [p]: c.key } } })} title={c.hint}
                                className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none", s.contentTypes[p] === c.key ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40")}>
                                {c.label}
                              </button>
                            ))}
                          </div>
                        </AiField>
                        <p className="text-[11px] text-muted-foreground">{CONTENT_TYPES[p].find((c) => c.key === s.contentTypes[p])?.hint}</p>
                        <FieldError>{err(`type.${p}`)}</FieldError>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </AiField>
          <FieldError>{err("platforms")}</FieldError>
          {s.platforms.length > 0 && <Callout tone="info">Pick the post type for each platform. Only what each platform lets us publish is listed.</Callout>}
        </ConnectionGate>
      </section>
    </div>
  );
}
