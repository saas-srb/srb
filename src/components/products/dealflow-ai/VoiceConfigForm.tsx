"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveVoiceConfigAction } from "@/app/(products)/commandos/(protected)/chatbot/actions";
import type { VoiceConfig } from "@/lib/chatbot-config";
import { useBrand } from "@/components/platform/BrandProvider";

const MODELS = [
  { id: "eleven_flash_v2_5", label: "Flash v2.5 — lowest latency (recommended)" },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5 — balanced" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 — highest quality" },
];

interface VoiceOption {
  voiceId: string;
  name: string;
  category: string | null;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <Field label={`${label} · ${value.toFixed(2)}`} hint={hint}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full max-w-sm cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
    </Field>
  );
}

export default function VoiceConfigForm({
  voice,
  elevenLabsConfigured,
}: {
  voice: VoiceConfig;
  elevenLabsConfigured: boolean;
}) {
  const brand = useBrand();
  const router = useRouter();
  const [saving, startSaving] = React.useTransition();
  const [form, setForm] = React.useState<VoiceConfig>(voice);
  const [voices, setVoices] = React.useState<VoiceOption[]>([]);
  const [voicesLoaded, setVoicesLoaded] = React.useState(!elevenLabsConfigured);

  React.useEffect(() => {
    if (!elevenLabsConfigured) return;
    let cancelled = false;
    fetch("/api/dealflow-ai/chatbot/voice/voices", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setVoices(Array.isArray(d.voices) ? d.voices : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setVoicesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [elevenLabsConfigured]);

  function set<K extends keyof VoiceConfig>(key: K, value: VoiceConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const knownVoice = voices.some((v) => v.voiceId === form.voiceId);
  const useCustom = voicesLoaded && voices.length > 0 && !knownVoice;

  function submit() {
    startSaving(async () => {
      const res = await saveVoiceConfigAction(form);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Voice settings saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!elevenLabsConfigured && (
        <GlassCard interactive={false} className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">ElevenLabs isn&apos;t connected.</span> Add your key in{" "}
              <Link href="/commandos/settings/integrations" className="font-medium text-primary underline">CommandOS → Settings → Integrations</Link>. Settings save
              normally, but voice mode stays offline until the key is connected.
            </p>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard>
        <CardHeader>
          <CardTitle>Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            <span className="font-medium text-foreground">Enable Voice Mode on the Ask {brand.name} page</span>
          </label>
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle>Voice &amp; Model</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Default voice" hint="The ElevenLabs voice used for every spoken reply.">
            {voicesLoaded && voices.length > 0 && !useCustom ? (
              <select
                value={form.voiceId}
                onChange={(e) => set("voiceId", e.target.value)}
                className="h-8 w-full max-w-xs rounded-xl border border-input bg-transparent px-2 text-sm outline-none dark:bg-input/30"
              >
                {voices.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>
                    {v.name}
                    {v.category ? ` (${v.category})` : ""}
                  </option>
                ))}
                <option value="__custom__">Other — paste an ID…</option>
              </select>
            ) : (
              <Input
                value={form.voiceId}
                onChange={(e) => set("voiceId", e.target.value)}
                placeholder="ElevenLabs voice ID"
                className="h-8 w-full max-w-xs"
              />
            )}
            {form.voiceId === "__custom__" && (
              <Input
                autoFocus
                placeholder="Paste voice ID"
                onChange={(e) => set("voiceId", e.target.value)}
                className="mt-1.5 h-8 w-full max-w-xs"
              />
            )}
          </Field>

          <Field label="Voice model">
            <select
              value={form.modelId}
              onChange={(e) => set("modelId", e.target.value)}
              className="h-8 w-full max-w-sm rounded-xl border border-input bg-transparent px-2 text-sm outline-none dark:bg-input/30"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle>Voice Character</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <Slider label="Stability" value={form.stability} min={0} max={1} step={0.05} onChange={(v) => set("stability", v)} hint="Higher = more consistent, lower = more expressive." />
          <Slider label="Similarity" value={form.similarityBoost} min={0} max={1} step={0.05} onChange={(v) => set("similarityBoost", v)} hint="How closely to match the original voice." />
          <Slider label="Style" value={form.style} min={0} max={1} step={0.05} onChange={(v) => set("style", v)} hint="Style exaggeration. 0 is safest / fastest." />
          <Slider label="Speed" value={form.speed} min={0.7} max={1.2} step={0.05} onChange={(v) => set("speed", v)} hint="Speaking rate." />
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={form.streaming}
              onChange={(e) => set("streaming", e.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            <span className="font-medium text-foreground">Stream audio as it is generated (lower time-to-first-sound)</span>
          </label>
        </CardContent>
      </GlassCard>

      <div className={cn("sticky bottom-0 flex justify-end gap-2 rounded-xl border border-border/50 bg-card/80 p-3 backdrop-blur-xl")}>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Save className="size-4" data-icon="inline-start" />}
          Save voice settings
        </Button>
      </div>
    </div>
  );
}
