"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Save, Film, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { Field, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import type { FieldKey } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { createPostAction, updatePostBriefAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { LANGUAGES, POST_OBJECTIVES, POST_PLATFORMS, TONES } from "@/lib/products/viralpulse-ai/constants";
import { cn } from "@/lib/utils";
import type { PostBriefValues } from "@/lib/products/viralpulse-ai/form-defaults";

function Suggest({ id, value, onChange, options, placeholder }: { id: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <>
      <Input id={id} list={`${id}-list`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <datalist id={`${id}-list`}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}

export default function PostBriefForm({ postId, initial, offers, clients, services, campaigns, canGenerate, lockedPlatforms = [] }: { postId?: string; initial: PostBriefValues; offers: { _id: string; title: string; badge: string }[]; clients: { _id: string; name: string }[]; services: string[]; campaigns: { _id: string; name: string }[]; canGenerate: boolean; lockedPlatforms?: string[] }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"save" | "generate" | null>(null);
  const set = <K extends keyof PostBriefValues>(k: K, val: PostBriefValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const ai = (fieldKey: FieldKey) => ({ fieldKey, getContext: () => ({ ...v, campaign: campaigns.find((c) => c._id === v.campaignId)?.name ?? "" }) as unknown as Record<string, unknown>, aiDisabled: !canGenerate, aiDisabledReason: "AI generation isn't available to you here." });

  function submit(generate: boolean) {
    setMode(generate ? "generate" : "save");
    start(async () => {
      const payload = { ...v, plannedAt: v.plannedAt ? new Date(v.plannedAt).toISOString() : "" };
      if (postId) {
        const res = await updatePostBriefAction(postId, payload);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Brief saved.");
        router.push(`/viralpulse-ai/posts/${postId}`);
        return;
      }
      const res = await createPostAction(payload, generate);
      if (!res.ok) return void toast.error(res.error);
      if (res.generateError) toast.warning(`Post saved. ${res.generateError}`);
      else toast.success(generate ? "Post created — review the AI versions." : "Draft created.");
      router.push(`/viralpulse-ai/posts/${res.id}`);
    });
  }

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <AiField {...ai("post.topic")} label="Topic *" id="p-topic" as="textarea" rows={2} className="sm:col-span-2" hint="What the post is about. One idea — the AI adapts it per platform." value={v.topic} onChange={(x) => set("topic", String(x).slice(0, 500))} required maxLength={500} placeholder="Describe the one idea this post is about" />
        <AiField {...ai("post.platforms")} label="Platforms *" as="custom" className="sm:col-span-2" value={v.platforms} onChange={(x) => set("platforms", [...new Set([...(Array.isArray(x) ? x : [String(x)]), ...lockedPlatforms])])}>
          <div className="flex flex-wrap gap-2">
            {POST_PLATFORMS.map((p) => {
              const on = v.platforms.includes(p);
              const locked = lockedPlatforms.includes(p);
              return (
                <button key={p} type="button" aria-pressed={on} disabled={locked} title={locked ? "Already published — can't be removed" : undefined} onClick={() => set("platforms", on ? v.platforms.filter((x) => x !== p) : [...v.platforms, p])} className={cn("rounded-lg border px-2.5 py-1.5 transition disabled:opacity-60", on ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/40")}>
                  <PlatformChip platform={p} full />
                </button>
              );
            })}
          </div>
        </AiField>
        <AiField {...ai("post.contentType")} label="Media type" as="custom" value={v.contentType} onChange={(x) => set("contentType", x === "video" ? "video" : "image")}>
          <PanelTabs className="w-full [&>*]:flex-1" label="Media type" active={v.contentType} onSelect={(k) => set("contentType", k as "image" | "video")} tabs={[{ key: "image", label: "Image", icon: <ImageIcon className="size-4" /> }, { key: "video", label: "Video", icon: <Film className="size-4" /> }]} />
        </AiField>
        <AiField {...ai("post.objective")} label="Content objective" id="p-obj" as="custom" value={v.objective} onChange={(x) => set("objective", String(x))}><Suggest id="p-obj" value={v.objective} onChange={(x) => set("objective", x)} options={POST_OBJECTIVES} placeholder="Engagement" /></AiField>
        <AiField {...ai("post.serviceProduct")} label="Service / product" id="p-svc" as="custom" value={v.serviceProduct} onChange={(x) => set("serviceProduct", String(x))}><Suggest id="p-svc" value={v.serviceProduct} onChange={(x) => set("serviceProduct", x)} options={services} /></AiField>
        <AiField {...ai("post.audience")} label="Audience" id="p-aud" value={v.audience} onChange={(x) => set("audience", String(x))} placeholder="Brand default audience" />
        <AiField {...ai("post.tone")} label="Tone" id="p-tone" as="custom" value={v.tone} onChange={(x) => set("tone", String(x))}><Suggest id="p-tone" value={v.tone} onChange={(x) => set("tone", x)} options={TONES} placeholder="Brand default" /></AiField>
        <AiField {...ai("post.language")} label="Language" id="p-lang" as="custom" value={v.language} onChange={(x) => set("language", String(x))}><Suggest id="p-lang" value={v.language} onChange={(x) => set("language", x)} options={LANGUAGES} /></AiField>
        <AiField {...ai("post.plannedAt")} label="Planned publish date & time" id="p-when" inputType="datetime-local" hint="Pre-fills scheduling after review — nothing is scheduled automatically." value={v.plannedAt} onChange={(x) => set("plannedAt", String(x))} />
        <AiField {...ai("post.link")} label="Link (optional)" id="p-link" inputType="url" hint="Landing page for link posts and CTA buttons." value={v.link} onChange={(x) => set("link", String(x))} placeholder="https://…" />
        <Field label="Part of a campaign"><OptionSelect value={v.campaignId} onChange={(x) => set("campaignId", x)} options={campaigns.map((c) => ({ value: c._id, label: c.name }))} noneLabel="None" aria-label="Campaign" /></Field>
        <Field label="Promote a live offer"><OptionSelect value={v.offerId} onChange={(x) => set("offerId", x)} options={offers.map((o) => ({ value: o._id, label: `${o.title} · ${o.badge}` }))} noneLabel="No specific offer" aria-label="Offer" /></Field>
        <Field label="Client (optional)"><OptionSelect value={v.clientId} onChange={(x) => set("clientId", x)} options={clients.map((c) => ({ value: c._id, label: c.name }))} noneLabel="Our own brand" aria-label="Client" /></Field>
        <AiField {...ai("post.title")} label="Internal title" id="p-title" hint="Defaults to the topic." value={v.title} onChange={(x) => set("title", String(x).slice(0, 120))} maxLength={120} />
        <AiField {...ai("post.notes")} label="Notes for the AI" id="p-notes" as="textarea" rows={2} className="sm:col-span-2" value={v.notes} onChange={(x) => set("notes", String(x))} placeholder="Points to include, things to avoid, facts and figures to use" />
      </div>
      <div className="flex flex-wrap gap-2">
        {!postId && canGenerate && (
          <Button type="button" onClick={() => submit(true)} disabled={pending}>
            {pending && mode === "generate" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {pending && mode === "generate" ? "Generating platform versions…" : "Create & generate with AI"}
          </Button>
        )}
        <Button type="submit" variant={!postId && canGenerate ? "outline" : "default"} disabled={pending}>
          {pending && mode === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {postId ? "Save brief" : "Save as draft"}
        </Button>
      </div>
    </form>
  );
}
