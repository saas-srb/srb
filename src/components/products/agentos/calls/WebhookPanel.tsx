"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Copy, KeyRound, LoaderCircle, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ActionButton from "@/components/products/agentos/ActionButton";
import { registerWebhookAction, resetWebhookUrlAction, saveWebhookSecretAction } from "@/app/(products)/commandos/(protected)/settings/products/agentos/phone-actions";
import type { WebhookSetupView } from "@/lib/products/agentos/calls/webhook";

/**
 * How call results reach AgentOS: ElevenLabs posts each finished call to a private address, signed with a secret. Automatic setup
 * works on the company's own ElevenLabs account; otherwise the manual steps are shown. Until a secret is saved, results are
 * fetched from ElevenLabs on a schedule instead.
 */
export default function WebhookPanel({ setup }: { setup: WebhookSetupView & { urlAvailable: boolean } }) {
  const router = useRouter();
  const [url, setUrl] = useState(setup.url);
  const [steps, setSteps] = useState<string[]>(setup.manualSteps);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [secret, setSecret] = useState("");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"auto" | "secret" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Address copied");
    } catch {
      toast.error("Couldn't copy. Select the address and copy it by hand.");
    }
  };
  const auto = () =>
    start(async () => {
      setBusy("auto");
      const r = await registerWebhookAction();
      setBusy(null);
      if (!r.ok) return void toast.error(r.error);
      if (r.result.ok) {
        setNotice({ tone: "ok", text: "The webhook is set up in ElevenLabs. Finished calls now arrive as soon as they end." });
        setSteps([]);
        router.refresh();
      } else {
        setNotice({ tone: "warn", text: r.result.reason });
        setSteps(r.result.manualSteps);
        const found = r.result.manualSteps.find((s) => s.startsWith("Use this URL: "));
        if (found) setUrl(found.slice("Use this URL: ".length));
      }
    });
  const reset = async (): Promise<{ ok: boolean; error?: string }> => {
    const r = await resetWebhookUrlAction();
    if (!r.ok) return { ok: false, error: r.error };
    setUrl(r.url);
    setSteps([
      "In ElevenLabs open Agents → Settings → Post-call webhooks and create a webhook with HMAC authentication.",
      `Use this URL: ${r.url}`,
      "Copy the webhook secret ElevenLabs shows and paste it here. Turn on the transcript and call-initiation-failure events.",
    ]);
    return { ok: true };
  };
  const saveSecret = () =>
    start(async () => {
      setBusy("secret");
      const r = await saveWebhookSecretAction(secret);
      setBusy(null);
      if (!r.ok) return void toast.error(r.error);
      setSecret("");
      setNotice({ tone: "ok", text: "Secret saved. Calls that end are now verified and recorded straight away." });
      toast.success("Webhook secret saved");
      router.refresh();
    });

  const live = setup.registered && setup.hasSecret;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-3.5" />Webhook active{setup.secretLast4 ? ` · secret ends in ${setup.secretLast4}` : ""}</span>
        ) : (
          <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Not set up: results are fetched from ElevenLabs on a schedule, so they can arrive a few minutes late</span>
        )}
      </div>

      {notice && <div role="status" className={notice.tone === "ok" ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200" : "rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"}>{notice.text}</div>}

      {url ? (
        <div className="space-y-1.5">
          <Label htmlFor="wh-url">Webhook address (shown now only)</Label>
          <div className="flex gap-2">
            <Input id="wh-url" readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy the webhook address"><Copy className="size-4" /></Button>
          </div>
          <p className="text-[11px] text-muted-foreground">The address contains a private key, so it can&apos;t be shown again after you leave this page. Anyone with it can send results, but only calls signed with your secret are accepted.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">The webhook address is hidden for safety. Create a new one if you need to see it again; the old one then stops working.</p>
      )}

      {steps.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          {steps.filter((s) => !s.startsWith("Use this URL: ")).map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={auto} disabled={pending}>{busy === "auto" ? <LoaderCircle className="size-4 animate-spin" /> : <Wand2 className="size-4" />}Set up automatically</Button>
        <ActionButton
          action={reset}
          success="New address created below. The old one has stopped working."
          variant="outline"
          confirm={{ title: "Create a new webhook address?", description: "The current address stops working. If ElevenLabs is already using it, you must update the webhook there with the new address.", confirmLabel: "Create new address" }}
        >
          <RefreshCw className="size-3.5" />Create a new webhook address
        </ActionButton>
      </div>

      <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
        <p className="text-sm font-semibold">Webhook secret</p>
        <p className="mb-3 text-xs text-muted-foreground">Set up by hand? Paste the secret ElevenLabs shows for the webhook. It is stored encrypted and never displayed again.</p>
        <div className="flex gap-2">
          <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} aria-label="Webhook secret from ElevenLabs" disabled={pending} />
          <Button type="button" variant="outline" onClick={saveSecret} disabled={pending || secret.trim().length < 8}>{busy === "secret" ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Save secret</Button>
        </div>
      </div>
    </div>
  );
}
