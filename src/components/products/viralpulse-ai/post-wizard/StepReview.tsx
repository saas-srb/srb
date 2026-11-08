"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlatformPreview from "@/components/products/viralpulse-ai/PlatformPreview";
import { PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { PLATFORM_META } from "@/lib/products/viralpulse-ai/constants";
import { WIZARD_STEPS, contentTypeDef, disclosureSummary, nativeLabelMap, finalLink, type StepKey } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import { previewFor } from "@/lib/products/viralpulse-ai/post-wizard/preview";
import { Callout, FieldError, sectionTitle, type StepProps } from "./shared";
import { usePlan } from "./usePlan";
import { cn } from "@/lib/utils";

export default function StepReview(p: StepProps & { onGoTo: (k: StepKey) => void; blockedStep: StepKey | null }) {
  const { init, s, dispatch, errors, showErrors, cards, ensureSaved, onGoTo, blockedStep } = p;
  const key = JSON.stringify([s.platforms, s.variants, s.mediaIds, s.thumbnailId, s.options, s.link, s.utm, s.contentTypes, s.accountIds]);
  const { plan, loading, error, refresh } = usePlan(!blockedStep, key, ensureSaved, 600);
  const media = s.mediaIds.map((id) => cards[id]).filter(Boolean);
  const previews = useMemo(() => Object.fromEntries(s.platforms.map((pl) => [pl, previewFor(s, pl, media, init.caps[pl], init.settings.aiDisclosureOff)])), [s, media, init.caps, init.settings.aiDisclosureOff]);
  const link = finalLink(s.link, s.utm);
  const aiMedia = media.filter((m) => m.aiDisclosed);
  const disc = disclosureSummary({ any: aiMedia.length > 0, video: aiMedia.some((m) => m.kind === "video") }, s.platforms, init.settings.aiDisclosureOff, nativeLabelMap(s.platforms, s.contentTypes, init.caps));
  const blocking = plan?.platforms.filter((x) => x.blocking) ?? [];
  const sc = s.schedule;

  return (
    <div className="space-y-6">
      {blockedStep && (
        <Callout tone="bad">
          <p className="font-medium">{`The “${WIZARD_STEPS.find((x) => x.key === blockedStep)?.label}” step still has something to fix.`}</p>
          <button type="button" className="font-semibold underline" onClick={() => onGoTo(blockedStep)}>Go to that step</button>
        </Callout>
      )}

      <section className="space-y-3" aria-labelledby="rv-checks" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <h3 id="rv-checks" className={sectionTitle}>Final check by each platform</h3>
          <Button type="button" size="xs" variant="ghost" onClick={() => void refresh()} disabled={loading || Boolean(blockedStep)}>{loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Check again</Button>
        </div>
        {error && !blockedStep && <Callout tone="warn">{error}</Callout>}
        {loading && !plan && <p className="text-xs text-muted-foreground">Checking…</p>}
        {plan && (
          <>
            <Callout tone={blocking.length ? "bad" : "ok"}>{blocking.length ? `${blocking.map((b) => b.label).join(", ")} can't be sent until the problems below are fixed.` : "No blocking problems. Warnings below are worth a look but do not stop the post."}</Callout>
            <ul className="space-y-3">
              {plan.platforms.map((pp) => {
                const errs = pp.issues.filter((i) => i.severity === "error");
                const warns = pp.issues.filter((i) => i.severity === "warning");
                return (
                  <li key={pp.platform} className="rounded-xl border border-border/60 p-3 text-xs">
                    <p className="flex flex-wrap items-center gap-2"><PlatformChip platform={pp.platform} full /><span className="font-semibold">{pp.format}</span>{pp.blocking ? <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="size-3" aria-hidden /> Blocked</span> : <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-3" aria-hidden /> Ready</span>}</p>
                    {errs.map((i, k) => <p key={`e${k}`} className="mt-1 text-rose-700 dark:text-rose-300"><span className="font-semibold">Must fix:</span> {i.message} <span className="text-muted-foreground">{i.fix}</span></p>)}
                    {warns.map((i, k) => <p key={`w${k}`} className="mt-1 text-amber-800 dark:text-amber-300"><span className="font-semibold">Check:</span> {i.message} <span className="text-muted-foreground">{i.fix}</span></p>)}
                    {pp.disclosure.mode !== "none" && <p className="mt-1 text-muted-foreground">{`AI disclosure: ${pp.disclosure.reason}${pp.disclosure.nativeFlag ? " The platform's own AI label is set." : ""}`}</p>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="rv-prev">
        <h3 id="rv-prev" className={sectionTitle}>Exactly what will be sent</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {s.platforms.map((pl) => {
            const pv = previews[pl];
            const v = s.variants[pl];
            return (
              <div key={pl} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{`${PLATFORM_META[pl].label} · ${contentTypeDef(pl, s.contentTypes[pl])?.label ?? ""}`}</p>
                <PlatformPreview platform={pl} brand={init.brandName} title={v?.title || undefined} body={pv.parts ? pv.parts[0] : pv.text} hashtags={[]} cta={pl === "google_business" ? v?.cta : undefined} link={link || null} media={media[0] ?? null} aspect={null} />
                {pv.parts && pv.parts.length > 1 && <p className="text-[11px] text-muted-foreground">{`Sent as a thread of ${pv.parts.length} posts.`}</p>}
                {media.length > 1 && <p className="text-[11px] text-muted-foreground">{`${media.length} files, in this order: ${media.map((m) => m.name).join(", ")}`}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-1" aria-labelledby="rv-ai">
        <h3 id="rv-ai" className={sectionTitle}>AI disclosure</h3>
        {disc.applies ? <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{disc.lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="text-xs text-muted-foreground">{disc.lines[0]}</p>}
      </section>

      <section className="space-y-2 rounded-2xl border border-border/60 p-4" aria-labelledby="rv-go">
        <h3 id="rv-go" className={sectionTitle}>Ready?</h3>
        <p className="text-xs text-muted-foreground">
          {sc.mode === "now" ? "It will be sent to every platform above right away." : sc.mode === "schedule" ? `It will be scheduled for ${sc.local.replace("T", " ")} (${sc.timezone})${init.can.publish && sc.approve ? " and approved to publish by itself." : ". Someone with Publish must approve it before it goes out."}` : "It will be saved as a draft. Nothing is sent."}
          {" "}{s.platforms.length > 0 && `Accounts: ${s.platforms.map((pl) => `${PLATFORM_META[pl].label} (${init.accounts.find((a) => a.id === s.accountIds[pl])?.name ?? "default"})`).join(", ")}.`}
        </p>
        <label className="flex items-start gap-2 text-xs font-medium">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={s.confirmed} onChange={(e) => dispatch({ type: "set", patch: { confirmed: e.target.checked } })} aria-describedby="rv-confirm-err" />
          <span>I have read the text, looked at the media and checked the accounts. I am happy for this to be {sc.mode === "now" ? "published" : sc.mode === "schedule" ? "scheduled" : "saved"}.</span>
        </label>
        <div id="rv-confirm-err"><FieldError>{showErrors ? errors.confirmed : undefined}</FieldError></div>
        <p className={cn("text-[11px] text-muted-foreground", !init.can.publish && "hidden")}>Edit any earlier step and this box is cleared, so you always confirm what is final.</p>
        <p className="text-[11px] text-muted-foreground">Prefer to publish by hand in the platform&apos;s app? Save as a draft, then use “Mark as published” on the post page. <Link href="/viralpulse-ai/posts" className="font-semibold text-primary underline">Back to posts</Link></p>
      </section>
    </div>
  );
}
