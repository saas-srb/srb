"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { Field, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import type { FieldKey } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { createCampaignAction, updateCampaignBriefAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { AD_PLATFORMS, CAMPAIGN_OBJECTIVES, CTAS, INDUSTRIES, LANGUAGES, TONES } from "@/lib/products/viralpulse-ai/constants";
import { cn } from "@/lib/utils";
import type { CampaignFormValues } from "@/lib/products/viralpulse-ai/form-defaults";

/** Free text with suggestions (datalist) — the vocabularies are suggestions, not a closed list. */
function Suggest({ id, value, onChange, options, placeholder }: { id: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <>
      <Input id={id} list={`${id}-list`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={`${id}-list`}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}

export default function CampaignForm({ campaignId, initial, offers, clients, services, canGenerate }: { campaignId?: string; initial: CampaignFormValues; offers: { _id: string; title: string; badge: string }[]; clients: { _id: string; name: string }[]; services: string[]; canGenerate: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"save" | "generate" | null>(null);
  const set = <K extends keyof CampaignFormValues>(k: K, val: CampaignFormValues[K]) => setV((x) => ({ ...x, [k]: val }));
  // Every field's AI button reads the other fields of this form at click time; the server keeps only what that field may read.
  const ai = (fieldKey: FieldKey) => ({ fieldKey, getContext: () => ({ ...v }) as unknown as Record<string, unknown>, aiDisabled: !canGenerate, aiDisabledReason: "AI generation isn't available to you here." });

  function submit(generate: boolean) {
    setMode(generate ? "generate" : "save");
    start(async () => {
      const payload = { ...v, keywords: v.keywords, budget: v.budget };
      if (campaignId) {
        const res = await updateCampaignBriefAction(campaignId, payload);
        if (!res.ok) toast.error(res.error);
        else {
          toast.success("Brief saved.");
          router.push(`/viralpulse-ai/campaigns/${campaignId}`);
        }
        return;
      }
      const res = await createCampaignAction(payload, generate);
      if (!res.ok) return void toast.error(res.error);
      if (res.generateError) toast.warning(`Campaign saved. ${res.generateError}`);
      else toast.success(res.generated ? "Campaign created and AI strategy generated." : "Campaign created.");
      router.push(`/viralpulse-ai/campaigns/${res.id}`);
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <AiField {...ai("campaign.name")} label="Campaign name *" id="c-name" className="sm:col-span-2" value={v.name} onChange={(x) => set("name", String(x))} required maxLength={120} placeholder="Name the campaign after its offer or goal" />
        <AiField {...ai("campaign.platforms")} label="Platforms *" as="custom" className="sm:col-span-2" hint="Where the ads will run. Each ad targets one of these." value={v.platforms} onChange={(x) => set("platforms", Array.isArray(x) ? x : [String(x)])}>
          <div className="flex flex-wrap gap-2">
            {AD_PLATFORMS.map((p) => {
              const on = v.platforms.includes(p);
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => set("platforms", on ? v.platforms.filter((x) => x !== p) : [...v.platforms, p])} className={cn("rounded-lg border px-2.5 py-1.5 transition", on ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40")}>
                  <PlatformChip platform={p} full />
                </button>
              );
            })}
          </div>
        </AiField>
        <AiField {...ai("campaign.objective")} label="Objective" id="c-obj" as="custom" value={v.objective} onChange={(x) => set("objective", String(x))}><Suggest id="c-obj" value={v.objective} onChange={(x) => set("objective", x)} options={CAMPAIGN_OBJECTIVES} placeholder="Lead generation" /></AiField>
        <AiField {...ai("campaign.industry")} label="Industry" id="c-ind" as="custom" value={v.industry} onChange={(x) => set("industry", String(x))}><Suggest id="c-ind" value={v.industry} onChange={(x) => set("industry", x)} options={INDUSTRIES} /></AiField>
        <AiField {...ai("campaign.targetAudience")} label="Target audience" id="c-aud" as="textarea" rows={2} className="sm:col-span-2" value={v.targetAudience} onChange={(x) => set("targetAudience", String(x))} placeholder="Who should see this — roles, company size, interests, pain points" />
        <AiField {...ai("campaign.location")} label="Location" id="c-loc" value={v.location} onChange={(x) => set("location", String(x))} placeholder="India — Delhi NCR, Bengaluru" />
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <AiField {...ai("campaign.budget")} label="Budget" id="c-bud" inputType="number" value={v.budget} onChange={(x) => set("budget", String(x))} placeholder="50000" />
          <Field label="Currency" htmlFor="c-cur"><Input id="c-cur" value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().slice(0, 3))} /></Field>
        </div>
        <AiField {...ai("campaign.startDate")} label="Start date" id="c-start" inputType="date" value={v.startDate} onChange={(x) => set("startDate", String(x))} />
        <AiField {...ai("campaign.endDate")} label="End date" id="c-end" inputType="date" value={v.endDate} onChange={(x) => set("endDate", String(x))} hint="With a live offer chosen, the AI button fills the offer's own end date." />
        <AiField {...ai("campaign.cta")} label="Call to action" id="c-cta" as="custom" value={v.cta} onChange={(x) => set("cta", String(x))}><Suggest id="c-cta" value={v.cta} onChange={(x) => set("cta", x)} options={CTAS} /></AiField>
        <AiField {...ai("campaign.landingPage")} label="Landing page" id="c-lp" inputType="url" value={v.landingPage} onChange={(x) => set("landingPage", String(x))} placeholder="https://…" />
        <AiField {...ai("campaign.offerService")} label="Offer / service" id="c-os" as="custom" hint="From the site's service catalogue, or free text." value={v.offerService} onChange={(x) => set("offerService", String(x))}><Suggest id="c-os" value={v.offerService} onChange={(x) => set("offerService", x)} options={services} /></AiField>
        <Field label="Promote a live offer" hint="Read live from Festival Offers.">
          <OptionSelect value={v.offerId} onChange={(x) => set("offerId", x)} options={offers.map((o) => ({ value: o._id, label: `${o.title} · ${o.badge}` }))} noneLabel="No specific offer" aria-label="Offer" />
        </Field>
        <Field label="Client (optional)" hint="Run for a SprintOS client — the AI then writes in the client's voice.">
          <OptionSelect value={v.clientId} onChange={(x) => set("clientId", x)} options={clients.map((c) => ({ value: c._id, label: c.name }))} noneLabel="Our own brand" aria-label="Client" />
        </Field>
        <AiField {...ai("campaign.keywords")} label="Keywords" id="c-kw" as="custom" hint="Comma or line separated." value={v.keywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean)} onChange={(x) => set("keywords", Array.isArray(x) ? x.join(", ") : String(x))}><Input id="c-kw" value={v.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="Words people would search for" /></AiField>
        <AiField {...ai("campaign.tone")} label="Tone" id="c-tone" as="custom" value={v.tone} onChange={(x) => set("tone", String(x))}><Suggest id="c-tone" value={v.tone} onChange={(x) => set("tone", x)} options={TONES} placeholder="Brand default" /></AiField>
        <AiField {...ai("campaign.language")} label="Language" id="c-lang" as="custom" value={v.language} onChange={(x) => set("language", String(x))}><Suggest id="c-lang" value={v.language} onChange={(x) => set("language", x)} options={LANGUAGES} /></AiField>
        <AiField {...ai("campaign.brandInfo")} label="Brand information for this campaign" id="c-bi" as="textarea" rows={3} className="sm:col-span-2" hint="Anything beyond the central brand context (Settings) the AI should know." value={v.brandInfo} onChange={(x) => set("brandInfo", String(x))} />
      </div>
      <div className="flex flex-wrap gap-2">
        {!campaignId && canGenerate && (
          <Button type="button" onClick={() => submit(true)} disabled={pending}>
            {pending && mode === "generate" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {pending && mode === "generate" ? "Creating & generating…" : "Create & generate strategy"}
          </Button>
        )}
        <Button type="submit" variant={!campaignId && canGenerate ? "outline" : "default"} disabled={pending}>
          {pending && mode === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {campaignId ? "Save brief" : "Save as draft"}
        </Button>
      </div>
    </form>
  );
}
