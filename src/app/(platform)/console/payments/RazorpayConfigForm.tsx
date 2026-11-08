"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Loader2, PlugZap, Save, TriangleAlert, XCircle } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { RazorpayConfigView } from "@/lib/platform/billing/razorpay-config";
import { saveRazorpayConfigAction, testRazorpayConnectionAction } from "./actions";

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export default function RazorpayConfigForm({ view, webhookUrl }: { view: RazorpayConfigView; webhookUrl: string }) {
  const router = useRouter();
  const [keyId, setKeyId] = useState(view.keyId);
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [mode, setMode] = useState(view.mode);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(view.lastTest);
  const [copied, setCopied] = useState(false);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  return (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Razorpay keys</CardTitle>
          <CardDescription>The platform&apos;s own Razorpay account that charges companies for their subscriptions. The secret is encrypted before it is stored and is never shown again.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="razorpay-config-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(false);
              startSave(async () => {
                const res = await saveRazorpayConfigAction({ keyId, keySecret, mode, webhookSecret });
                if (res.ok) {
                  setErrors({});
                  setKeySecret("");
                  setWebhookSecret("");
                  setSaved(true);
                  setTest(null);
                  router.refresh();
                } else setErrors(res.errors);
              });
            }}
          >
            {view.source === "env" && (
              <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">These keys come from the server environment because none are saved here yet. Save keys below to manage them from the product.</p>
            )}
            {view.secretUnreadable && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">The saved secret can&apos;t be decrypted (PLATFORM_ENCRYPTION_KEY is missing or changed). Enter the key secret again.</p>
            )}
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Mode</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(["test", "live"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2">
                    <input type="radio" name="mode" value={m} className="size-4 accent-primary" checked={mode === m} onChange={() => setMode(m)} />
                    {m === "test" ? "Test" : "Live"}
                  </label>
                ))}
              </div>
              {errors.mode && <p className="text-xs text-destructive">{errors.mode}</p>}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rzp-key-id">Key id</Label>
                <Input id="rzp-key-id" value={keyId} onChange={(e) => setKeyId(e.target.value.trim())} placeholder="rzp_test_…" autoComplete="off" spellCheck={false} className="font-mono" />
                {errors.keyId && <p className="text-xs text-destructive">{errors.keyId}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rzp-key-secret">Key secret</Label>
                <Input
                  id="rzp-key-secret"
                  type="password"
                  value={keySecret}
                  onChange={(e) => setKeySecret(e.target.value)}
                  placeholder={view.secretLast4 ? `Saved — ends in ${view.secretLast4}. Leave blank to keep.` : "Paste the key secret"}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                {errors.keySecret && <p className="text-xs text-destructive">{errors.keySecret}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rzp-webhook-secret">Webhook secret</Label>
              <Input
                id="rzp-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={view.webhookLast4 ? `Saved — ends in ${view.webhookLast4}. Leave blank to keep.` : "The secret you set on the webhook in Razorpay"}
                autoComplete="new-password"
                spellCheck={false}
              />
              {errors.webhookSecret && <p className="text-xs text-destructive">{errors.webhookSecret}</p>}
              <p className="text-xs text-muted-foreground">Use the same value when you add the webhook in Razorpay (see Webhook below).</p>
            </div>
            {!view.encryptionConfigured && <Status ok={false}>PLATFORM_ENCRYPTION_KEY isn&apos;t set on the server — secrets can&apos;t be saved until it is.</Status>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save keys
              </Button>
              <Button
                type="button"
                variant="outline"
                id="razorpay-test-connection"
                disabled={testing || view.source === "none"}
                onClick={() => startTest(async () => setTest(await testRazorpayConnectionAction()))}
              >
                {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Test connection
              </Button>
              {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</span>}
            </div>
            {test && (
              <p role="status" className={`flex items-start gap-2 text-sm ${test.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                {test.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
                {test.message}
              </p>
            )}
          </form>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
          <CardDescription>
            In Razorpay → Settings → Webhooks, add this URL with the events subscription.authenticated, activated, charged, pending, halted, cancelled, completed, updated and payment.failed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex min-w-0 items-center gap-2">
            <code id="billing-webhook-url" className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              {webhookUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Copy webhook URL"
              onClick={() => {
                navigator.clipboard?.writeText(webhookUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              <Copy className="size-4" /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Status ok={view.webhookSecretSet && !view.webhookUnreadable}>
            {view.webhookUnreadable ? (
              <>The saved webhook secret can&apos;t be decrypted (PLATFORM_ENCRYPTION_KEY is missing or changed). Enter it again under Razorpay keys.</>
            ) : view.webhookSecretSet ? (
              <>Webhook secret is set{view.webhookLast4 ? ` (ends in ${view.webhookLast4})` : ""}. Use the same secret in Razorpay.</>
            ) : (
              <>Webhook secret is not set. Enter it under Razorpay keys and use the same value in Razorpay — until then every webhook is refused.</>
            )}
          </Status>
        </CardContent>
      </GlassCard>
    </div>
  );
}
