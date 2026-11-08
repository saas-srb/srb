"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { Field } from "@/components/products/viralpulse-ai/SmmsBits";
import { generateDraftAction } from "@/app/(products)/viralpulse-ai/(protected)/posts/wizard-actions";
import { CTAS, LANGUAGES, TONES } from "@/lib/products/viralpulse-ai/constants";
import { draftInstruction, normalizeHashtags } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import { Callout, FieldError, sectionTitle, type StepProps } from "./shared";

function Suggest({ id, value, onChange, options, placeholder, disabled }: { id: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean }) {
  return (
    <>
      <Input id={id} list={`${id}-list`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={`${id}-list`}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}

export default function StepBrief({ init, s, dispatch, errors, showErrors, locked, ai, ensureSaved }: StepProps) {
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const set = (patch: Partial<typeof s>) => dispatch({ type: "set", patch });
  const [pending, start] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);
  const hasDraft = s.platforms.some((p) => (s.variants[p]?.content ?? "").trim());

  function generate() {
    setGenError(null);
    start(async () => {
      if (!s.topic.trim()) return void setGenError("Write the topic first; the AI writes from it.");
      const id = await ensureSaved();
      if (!id) return void setGenError("The brief could not be saved yet. Check the highlighted fields.");
      const res = await generateDraftAction(id, draftInstruction(s));
      if (!res.ok) return void setGenError(res.error);
      const variants = { ...s.variants };
      for (const v of res.variants) if (s.platforms.includes(v.platform)) variants[v.platform] = { title: v.title, content: v.content, hashtags: normalizeHashtags(v.hashtags), keywords: v.keywords, cta: v.cta };
      set({ variants });
      toast.success("A version for every platform was written. Review it in the Content step.");
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className={sectionTitle}>Write the whole draft with AI</h3>
            <p className="text-xs text-muted-foreground">Uses the brief below and your brand details to write a version for each platform you chose. You can edit every word afterwards.</p>
          </div>
          <Button type="button" onClick={generate} disabled={pending || locked || !init.can.generate} title={!init.can.generate ? (init.aiReady ? "You don't have permission to use AI here." : "OpenAI isn't connected for this workspace (Settings > Integrations).") : undefined}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {pending ? "Writing…" : hasDraft ? "Rewrite all versions" : "Generate with AI"}
          </Button>
        </div>
        {hasDraft && <Callout tone="warn">Rewriting replaces the text, hashtags and title you have now on every platform. Earlier versions stay in the post&apos;s history.</Callout>}
        {genError && <Callout tone="bad">{genError}</Callout>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <AiField {...ai("post.topic")} label="Topic or idea *" id="b-topic" as="textarea" rows={2} value={s.topic} disabled={locked} maxLength={500} limit={500} placeholder="The one idea this post is about" hint="The AI adapts this idea for each platform." onChange={(x) => set({ topic: String(x).slice(0, 500) })} />
          <FieldError>{err("topic")}</FieldError>
        </div>
        <AiField {...ai("post.audience")} label="Audience" id="b-aud" value={s.audience} disabled={locked} placeholder="Who is this for? Leave empty for your brand's usual audience" onChange={(x) => set({ audience: String(x) })} />
        <AiField {...ai("post.serviceProduct")} label="Service or product" id="b-svc" as="custom" value={s.serviceProduct} disabled={locked} onChange={(x) => set({ serviceProduct: String(x) })}>
          <Suggest id="b-svc" value={s.serviceProduct} disabled={locked} onChange={(x) => set({ serviceProduct: x })} options={init.services} />
        </AiField>
        <AiField {...ai("post.tone")} label="Tone / brand voice" id="b-tone" as="custom" value={s.tone} disabled={locked} onChange={(x) => set({ tone: String(x) })}>
          <Suggest id="b-tone" value={s.tone} disabled={locked} onChange={(x) => set({ tone: x })} options={TONES} placeholder="Your brand's usual tone" />
        </AiField>
        <div className="space-y-1">
          <AiField {...ai("post.language")} label="Language *" id="b-lang" as="custom" value={s.language} disabled={locked} onChange={(x) => set({ language: String(x) })}>
            <Suggest id="b-lang" value={s.language} disabled={locked} onChange={(x) => set({ language: x })} options={LANGUAGES} />
          </AiField>
          <FieldError>{err("language")}</FieldError>
        </div>
        <AiField {...ai("post.keyMessage")} label="Key message" id="b-key" as="textarea" rows={2} className="sm:col-span-2" value={s.keyMessage} disabled={locked} maxLength={500} placeholder="The one thing people should remember" onChange={(x) => set({ keyMessage: String(x) })} />
        <AiField {...ai("post.variant.cta")} label="Call to action" id="b-cta" as="custom" value={s.cta} disabled={locked} onChange={(x) => set({ cta: String(x) })}>
          <Suggest id="b-cta" value={s.cta} disabled={locked} onChange={(x) => set({ cta: x })} options={CTAS} placeholder="What should people do?" />
        </AiField>
        <Field label="Promote a live offer" hint="Takes the offer's real title and dates from your offers.">
          <OptionSelect value={s.offerId} onChange={(v) => set({ offerId: v })} options={init.offers.map((o) => ({ value: o._id, label: `${o.title} · ${o.badge}` }))} noneLabel="No specific offer" aria-label="Offer" disabled={locked} />
        </Field>
        <AiField {...ai("post.offer")} label="Offer details (facts)" id="b-offer" as="textarea" rows={2} className="sm:col-span-2" value={s.offerText} disabled={locked} maxLength={600}
          hint="Prices, discounts, dates and conditions exactly as they should appear. The AI only tidies your words; it never adds a figure." placeholder="e.g. 20% off annual plans until 30 November" onChange={(x) => set({ offerText: String(x) })} />
        <Field label="Client (optional)">
          <OptionSelect value={s.clientId} onChange={(v) => set({ clientId: v })} options={init.clients.map((c) => ({ value: c._id, label: c.name }))} noneLabel="Our own brand" aria-label="Client" disabled={locked} />
        </Field>
        <div className="space-y-1">
          <AiField {...ai("post.title")} label="Internal title" id="b-title" value={s.title} disabled={locked} maxLength={120} hint="Only for finding the post later. Defaults to the topic." onChange={(x) => set({ title: String(x).slice(0, 120) })} />
          <FieldError>{err("title")}</FieldError>
        </div>
        <AiField {...ai("post.notes")} label="Notes for the AI" id="b-notes" as="textarea" rows={2} className="sm:col-span-2" value={s.notes} disabled={locked} placeholder="Points to include, things to avoid" onChange={(x) => set({ notes: String(x) })} />
      </section>
    </div>
  );
}
