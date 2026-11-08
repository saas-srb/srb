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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveChatbotConfigAction } from "@/app/(products)/commandos/(protected)/chatbot/actions";
import type { SerializedChatbotConfig } from "@/lib/chatbot-config";

const MODEL_SUGGESTIONS = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5-mini"];

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function ChatbotConfigForm({
  config,
  openAiConfigured,
}: {
  config: SerializedChatbotConfig;
  openAiConfigured: boolean;
}) {
  const router = useRouter();
  const [saving, startSaving] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [form, setForm] = React.useState({
    model: config.model,
    temperature: String(config.temperature),
    maxOutputTokens: String(config.maxOutputTokens),
    contextMessageLimit: String(config.contextMessageLimit),
    maxNumResults: String(config.retrieval.maxNumResults),
    rateLimitPerMinute: String(config.rateLimit.perMinute),
    rateLimitPerDay: String(config.rateLimit.perDay),
    maxMessageChars: String(config.rateLimit.maxMessageChars),
    systemPrompt: config.systemPrompt,
    welcomeMessage: config.welcomeMessage,
    suggestedQuestions: config.suggestedQuestions.join("\n"),
  });

  const [preChat, setPreChat] = React.useState(config.preChat);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setField(key: keyof typeof preChat.fields, value: string) {
    setPreChat((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value as typeof prev.fields.name } }));
  }

  function submit() {
    setErrors({});
    startSaving(async () => {
      const res = await saveChatbotConfigAction({
        model: form.model,
        temperature: form.temperature,
        maxOutputTokens: form.maxOutputTokens,
        contextMessageLimit: form.contextMessageLimit,
        maxNumResults: form.maxNumResults,
        rateLimitPerMinute: form.rateLimitPerMinute,
        rateLimitPerDay: form.rateLimitPerDay,
        maxMessageChars: form.maxMessageChars,
        systemPrompt: form.systemPrompt,
        welcomeMessage: form.welcomeMessage,
        suggestedQuestions: form.suggestedQuestions,
        preChat,
      });
      if (res.error) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success("Configuration saved");
      router.refresh();
    });
  }

  const num = "h-8 w-28";

  return (
    <div className="space-y-4">
      {!openAiConfigured && (
        <GlassCard interactive={false} className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">OpenAI isn&apos;t connected.</span> Add your key in{" "}
              <Link href="/commandos/settings/integrations" className="font-medium text-primary underline">CommandOS → Settings → Integrations</Link>. Settings save
              normally, but the assistant stays offline until the key is connected.
            </p>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard>
        <CardHeader>
          <CardTitle>Model &amp; Generation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="OpenAI model" hint="Any model that supports the Responses API + file_search." error={errors.model}>
            <Input list="model-suggestions" value={form.model} onChange={(e) => set("model", e.target.value)} className="h-8 w-full max-w-xs" />
            <datalist id="model-suggestions">
              {MODEL_SUGGESTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Temperature" hint="0 = deterministic, 2 = very creative. Ignored by reasoning models." error={errors.temperature}>
            <Input type="number" min={0} max={2} step={0.1} value={form.temperature} onChange={(e) => set("temperature", e.target.value)} className={num} />
          </Field>
          <Field label="Max output tokens" hint="Upper bound on a single answer's length (128–8192)." error={errors.maxOutputTokens}>
            <Input type="number" min={128} max={8192} step={64} value={form.maxOutputTokens} onChange={(e) => set("maxOutputTokens", e.target.value)} className={num} />
          </Field>
          <Field label="Context size" hint="Prior messages replayed as conversation history (0–40)." error={errors.contextMessageLimit}>
            <Input type="number" min={0} max={40} value={form.contextMessageLimit} onChange={(e) => set("contextMessageLimit", e.target.value)} className={num} />
          </Field>
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle>Retrieval</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="Max retrieved chunks" hint="file_search max_num_results — higher = more context, more tokens (1–50)." error={errors.maxNumResults}>
            <Input type="number" min={1} max={50} value={form.maxNumResults} onChange={(e) => set("maxNumResults", e.target.value)} className={num} />
          </Field>
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle>Rate Limiting</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <Field label="Messages / minute / IP" error={errors.rateLimitPerMinute}>
            <Input type="number" min={1} max={120} value={form.rateLimitPerMinute} onChange={(e) => set("rateLimitPerMinute", e.target.value)} className={num} />
          </Field>
          <Field label="Messages / day / IP" error={errors.rateLimitPerDay}>
            <Input type="number" min={1} max={100000} value={form.rateLimitPerDay} onChange={(e) => set("rateLimitPerDay", e.target.value)} className={num} />
          </Field>
          <Field label="Max message length" hint="Characters accepted per message." error={errors.maxMessageChars}>
            <Input type="number" min={100} max={8000} step={100} value={form.maxMessageChars} onChange={(e) => set("maxMessageChars", e.target.value)} className={num} />
          </Field>
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <Field
            label="Instructions"
            hint="Sent as `instructions` on every request. Keep the grounding + safety rules."
            error={errors.systemPrompt}
          >
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              className="min-h-56 font-mono text-xs"
            />
          </Field>
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle>Visitor Pre-chat Form</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={preChat.enabled}
              onChange={(e) => setPreChat((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="size-4 rounded border-border accent-primary"
            />
            <span className="font-medium text-foreground">
              Ask visitors who they are before the conversation starts
            </span>
          </label>

          {preChat.enabled && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["name", "email", "phone", "service"] as const).map((f) => (
                  <Field key={f} label={f === "service" ? "Main Service" : f[0].toUpperCase() + f.slice(1)}>
                    <select
                      value={f === "email" || f === "phone" ? "required" : preChat.fields[f]}
                      onChange={(e) => setField(f, e.target.value)}
                      disabled={f === "email" || f === "phone"}
                      title={f === "email" || f === "phone" ? "Email and phone are always required" : undefined}
                      className="h-8 w-40 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                      <option value="off">Hidden</option>
                    </select>
                  </Field>
                ))}
              </div>
              <Field label="Form title" error={errors.preChat}>
                <Input
                  value={preChat.title}
                  onChange={(e) => setPreChat((prev) => ({ ...prev, title: e.target.value }))}
                  className="h-8 w-full max-w-sm"
                />
              </Field>
              <Field label="Form description">
                <Textarea
                  value={preChat.description}
                  onChange={(e) => setPreChat((prev) => ({ ...prev, description: e.target.value }))}
                  className="min-h-16"
                />
              </Field>
              <Field label="Consent / privacy note" hint="Small print shown under the form.">
                <Textarea
                  value={preChat.consentText}
                  onChange={(e) => setPreChat((prev) => ({ ...prev, consentText: e.target.value }))}
                  className="min-h-16"
                />
              </Field>
            </>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle>Welcome Experience</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field label="Welcome message" error={errors.welcomeMessage}>
            <Textarea value={form.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} className="min-h-20" />
          </Field>
          <Field label="Suggested questions" hint="One per line, up to 8. Shown as chips on the welcome screen." error={errors.suggestedQuestions}>
            <Textarea
              value={form.suggestedQuestions}
              onChange={(e) => set("suggestedQuestions", e.target.value)}
              className="min-h-28"
            />
          </Field>
        </CardContent>
      </GlassCard>

      <div className={cn("sticky bottom-0 flex justify-end gap-2 rounded-xl border border-border/50 bg-card/80 p-3 backdrop-blur-xl")}>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Save className="size-4" data-icon="inline-start" />}
          Save configuration
        </Button>
      </div>
    </div>
  );
}
