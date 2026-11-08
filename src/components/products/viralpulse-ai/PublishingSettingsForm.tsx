"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/products/viralpulse-ai/SmmsBits";
import { Switch } from "@/components/products/viralpulse-ai/post-wizard/shared";
import { savePublishingSettingsAction } from "@/app/(products)/viralpulse-ai/(protected)/settings/publishing/actions";

interface Initial { timezone: string; aiDisclosureOff: boolean; batchCap: number; gbpEnabled: boolean }

function zones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    list = [];
  }
  return [...new Set(["Asia/Kolkata", current, ...list])];
}

export default function PublishingSettingsForm({ initial }: { initial: Initial }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const capOk = Number.isInteger(v.batchCap) && v.batchCap >= 1 && v.batchCap <= 50;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await savePublishingSettingsAction(v);
      if (!res.ok) return void toast.error(res.error);
      setV(res.settings);
      setSaved(res.settings);
      toast.success("Publishing settings saved.");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Field label="Time zone" htmlFor="ps-tz" hint="Schedule times are entered and shown in this zone. Each scheduled post keeps its exact moment, so changing this later never moves a post.">
        <select id="ps-tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} className="h-9 w-full max-w-sm rounded-xl border border-border/50 bg-background px-3 text-sm">
          {zones(v.timezone).map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </Field>
      <div className="flex items-start gap-3">
        <Switch checked={v.aiDisclosureOff} onCheckedChange={(on) => setV({ ...v, aiDisclosureOff: on })} aria-label="Turn off the AI note in captions for AI pictures" />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">Leave the AI note out of captions for AI-generated pictures</p>
          <p className="text-xs text-muted-foreground">Only applies to pictures, and only on platforms that have no AI label of their own. AI-generated video is always disclosed, and platforms that have an AI label (Instagram, YouTube, X, and Facebook Reels) always get it switched on whatever you choose here.</p>
        </div>
      </div>
      <Field label="Posts started per run" htmlFor="ps-cap" hint="The publisher runs every 5 minutes and starts at most this many due posts each time (1 to 50). A lower number spreads a burst of posts over several runs.">
        <Input id="ps-cap" type="number" min={1} max={50} value={Number.isNaN(v.batchCap) ? "" : v.batchCap} onChange={(e) => setV({ ...v, batchCap: Number(e.target.value) })} className="w-28" aria-invalid={!capOk} />
      </Field>
      <div className="flex items-start gap-3">
        <Switch checked={v.gbpEnabled} onCheckedChange={(on) => setV({ ...v, gbpEnabled: on })} aria-label="Google Business Profile API access is approved" />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">Google Business Profile posting</p>
          <p className="text-xs text-muted-foreground">Turn on only after Google has approved your project for the Business Profile API. Until then posts to Business Profile are blocked.</p>
        </div>
      </div>
      <Button type="submit" disabled={pending || !dirty || !capOk}>{pending ? <Loader2 className="size-4 animate-spin" /> : null} Save changes</Button>
    </form>
  );
}
