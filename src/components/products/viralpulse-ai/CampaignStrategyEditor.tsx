"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StructuredFields, type FieldSpec } from "@/components/products/viralpulse-ai/StructuredEditor";
import { saveCampaignAiAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import type { CampaignAi } from "@/lib/products/viralpulse-ai/content";

const SPEC: FieldSpec[] = [
  { key: "summary", label: "Campaign strategy", kind: "textarea", rows: 4 },
  { key: "positioning", label: "Positioning", kind: "textarea", rows: 2 },
  { key: "keyMessages", label: "Key messages", kind: "list", rows: 4 },
  { key: "channelPlan", label: "Channel plan", kind: "objects", itemLabel: "Channel", blank: { platform: "", budgetPercent: 0, role: "" }, fields: [{ key: "platform", label: "Platform", kind: "text" }, { key: "budgetPercent", label: "Budget %", kind: "number" }, { key: "role", label: "Role in the funnel", kind: "textarea", rows: 2 }] },
  { key: "timeline", label: "Timeline", kind: "textarea", rows: 3 },
  { key: "kpis", label: "KPIs", kind: "list" },
  { key: "ideas", label: "Campaign ideas", kind: "objects", itemLabel: "Idea", blank: { title: "", description: "" }, fields: [{ key: "title", label: "Title", kind: "text", wide: true }, { key: "description", label: "Description", kind: "textarea", rows: 2 }] },
  { key: "audiences", label: "Audience suggestions", kind: "objects", itemLabel: "Audience", blank: { name: "", description: "", interests: [] }, fields: [{ key: "name", label: "Name", kind: "text", wide: true }, { key: "description", label: "Description", kind: "textarea", rows: 2 }, { key: "interests", label: "Interests", kind: "list", rows: 2 }] },
  { key: "keywords", label: "Keywords", kind: "list", rows: 4 },
  { key: "hashtags", label: "Hashtag suggestions", kind: "list", rows: 4 },
  {
    key: "adConcepts",
    label: "Ad concepts (per platform)",
    kind: "objects",
    itemLabel: "Concept",
    blank: { title: "", platform: "", format: "image", angle: "", headline: "", primaryText: "", description: "", cta: "" },
    fields: [
      { key: "title", label: "Title", kind: "text" },
      { key: "platform", label: "Platform", kind: "text" },
      { key: "format", label: "Format (image / video)", kind: "text" },
      { key: "cta", label: "CTA", kind: "text" },
      { key: "angle", label: "Angle / creative idea", kind: "textarea", rows: 2 },
      { key: "headline", label: "Headline", kind: "text", wide: true },
      { key: "primaryText", label: "Primary text", kind: "textarea", rows: 3 },
      { key: "description", label: "Description", kind: "textarea", rows: 2 },
    ],
  },
];

export default function CampaignStrategyEditor({ campaignId, ai, canEdit, campaign, canGenerate }: { campaignId: string; ai: CampaignAi; canEdit: boolean; campaign: Record<string, unknown>; canGenerate: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<CampaignAi>(ai);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await saveCampaignAiAction(campaignId, value);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Saved as version ${res.version}.`);
        setDirty(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <StructuredFields specs={SPEC} value={value as unknown as Record<string, unknown>} disabled={!canEdit} idPrefix="cai" ai={{ scope: "campaign.strategy", enabled: canGenerate, getContext: () => ({ campaign, strategy: value, language: campaign.language, tone: campaign.tone, offerId: campaign.offerId, clientId: campaign.clientId }) }} onChange={(v) => { setValue(v as unknown as CampaignAi); setDirty(true); }} />
      {canEdit && (
        <div className="sticky bottom-0 flex gap-2 rounded-xl border border-border/50 bg-background/95 p-2 backdrop-blur">
          <Button type="button" onClick={save} disabled={!dirty || pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save edits</Button>
          <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={() => { setValue(ai); setDirty(false); }}><Undo2 className="size-4" /> Discard</Button>
          {dirty && <span className="self-center text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}
