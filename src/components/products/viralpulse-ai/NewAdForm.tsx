"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import type { FieldKey } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { createAdAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { PLATFORM_META, type AdPlatform } from "@/lib/products/viralpulse-ai/constants";

export default function NewAdForm({ campaignId, platforms, campaign, canGenerate }: { campaignId: string; platforms: AdPlatform[]; campaign: Record<string, unknown>; canGenerate: boolean }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<string>(platforms[0] ?? "");
  const [format, setFormat] = useState<"image" | "video">("image");
  const [formatKey, setFormatKey] = useState("");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const sizes = platform ? PLATFORM_META[platform as AdPlatform].formats.filter((f) => f.kind === "both" || f.kind === format) : [];

  const ai = (fieldKey: FieldKey) => ({ fieldKey, getContext: () => ({ platform, format, formatKey: sizes.find((f) => f.key === formatKey)?.label ?? "", name, campaign, platforms, offerId: campaign.offerId, clientId: campaign.clientId, tone: campaign.tone, language: campaign.language }) as Record<string, unknown>, aiDisabled: !canGenerate, aiDisabledReason: "AI generation isn't available to you here." });

  function create() {
    start(async () => {
      const res = await createAdAction(campaignId, { name, platform, format, formatKey }, null);
      if (!res.ok) toast.error(res.error);
      else router.push(`/viralpulse-ai/campaigns/${campaignId}/ads/${res.id}`);
    });
  }

  return (
    <div className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_8rem_12rem_auto]">
      <AiField {...ai("ad.name")} label="Ad name" id="na-name" value={name} onChange={(x) => setName(String(x))} placeholder="Auto-named if empty" />
      <AiField {...ai("ad.platform")} label="Platform" as="custom" enumOptions={platforms} value={platform} onChange={(x) => { setPlatform(String(x)); setFormatKey(""); }}><OptionSelect value={platform} onChange={(v) => { setPlatform(v); setFormatKey(""); }} options={platforms.map((p) => ({ value: p, label: PLATFORM_META[p].label }))} aria-label="Platform" /></AiField>
      <AiField {...ai("ad.format")} label="Format" as="custom" value={format} onChange={(x) => { setFormat(x === "video" ? "video" : "image"); setFormatKey(""); }}><OptionSelect value={format} onChange={(v) => { setFormat(v === "video" ? "video" : "image"); setFormatKey(""); }} options={[{ value: "image", label: "Image ad" }, { value: "video", label: "Video ad" }]} aria-label="Format" /></AiField>
      <AiField {...ai("ad.formatKey")} label="Size / placement" as="custom" enumOptions={sizes.map((f) => f.key)} value={formatKey} onChange={(x) => setFormatKey(String(x))}><OptionSelect value={formatKey} onChange={setFormatKey} options={sizes.map((f) => ({ value: f.key, label: `${f.label} · ${f.width}×${f.height}` }))} noneLabel="Choose later" aria-label="Size" /></AiField>
      <Button type="button" onClick={create} disabled={pending || !platform}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add ad</Button>
    </div>
  );
}
