"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, Loader2, PlugZap, Trash2, XCircle } from "lucide-react";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import type { PaymentAccountInput, PaymentAccountResult, PaymentAccountView } from "@/lib/platform/integrations/payments";

export interface PaymentAccountActions {
  save: (input: PaymentAccountInput, code: string) => Promise<PaymentAccountResult>;
  test: () => Promise<PaymentAccountResult>;
  disconnect: (code: string) => Promise<PaymentAccountResult>;
}

// Mirrors KEY_ID_PATTERN in the server module (which the client can't import).
const KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/;

type Field = keyof PaymentAccountInput;

function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "muted"; children: React.ReactNode }) {
  const tones = {
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    red: "bg-destructive/10 text-destructive",
    blue: "bg-primary/10 text-primary",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone])}>{children}</span>;
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-1">
      <code className="min-w-0 flex-1 break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs" data-testid={`url-${label}`}>
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${label} webhook URL`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard blocked — the value is still selectable.
          }
        }}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </Button>
    </div>
  );
}

const masked = (last4: string | null) => (last4 ? `••••${last4}` : null);

/** Settings → Payments & payouts: the company's own Razorpay / RazorpayX account. */
export default function PaymentAccountManager({ initial, actions }: { initial: PaymentAccountView; actions: PaymentAccountActions }) {
  const [account, setAccount] = useState(initial);
  const [keyId, setKeyId] = useState(initial.keyId ?? "");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [payoutsEnabled, setPayoutsEnabled] = useState(initial.payoutsEnabled);
  const [accountNumber, setAccountNumber] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [code, setCode] = useState("");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [disconnecting, startDisconnect] = useTransition();
  const busy = saving || testing || disconnecting;
  const connected = account.status === "connected";
  const hasRecord = account.status !== "not_connected";
  const formDisabled = !account.encryptionConfigured;

  function applyAccount(next: PaymentAccountView) {
    setAccount(next);
    setKeyId(next.keyId ?? "");
    setPayoutsEnabled(next.payoutsEnabled);
    setKeySecret("");
    setWebhookSecret("");
    setAccountNumber("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const trimmed = keyId.trim();
    const clientErrors: Partial<Record<Field, string>> = {};
    if (!trimmed) clientErrors.keyId = "Enter your Razorpay Key ID.";
    else if (!KEY_ID_PATTERN.test(trimmed)) clientErrors.keyId = "That doesn't look like a Razorpay Key ID — it starts with rzp_test_ or rzp_live_.";
    if (!connected && !keySecret.trim()) clientErrors.keySecret = "Enter your Razorpay Key Secret.";
    if (payoutsEnabled && !accountNumber.trim() && !account.accountNumberLast4) clientErrors.accountNumber = "Enter your RazorpayX account number to enable salary payouts.";
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;

    startSave(async () => {
      try {
        const res = await actions.save({ keyId: trimmed, keySecret, webhookSecret, payoutsEnabled, accountNumber }, code);
        if (res.ok) {
          applyAccount(res.account);
          setCode("");
          setErrors({});
          setNotice(res.message ? { tone: "ok", text: res.message } : null);
        } else {
          setErrors(res.errors ?? {});
          setNotice({ tone: "error", text: res.error });
        }
      } catch {
        setNotice({ tone: "error", text: "Something went wrong. Please try again." });
      }
    });
  }

  function runTest() {
    setNotice(null);
    startTest(async () => {
      try {
        const res = await actions.test();
        if (res.ok) {
          setAccount(res.account);
          setNotice({ tone: "ok", text: res.message ?? "Connection works." });
        } else {
          if (res.account) setAccount(res.account);
          setNotice({ tone: "error", text: res.error });
        }
      } catch {
        setNotice({ tone: "error", text: "Something went wrong. Please try again." });
      }
    });
  }

  function runDisconnect() {
    setNotice(null);
    startDisconnect(async () => {
      try {
        const res = await actions.disconnect(code);
        if (res.ok) {
          applyAccount(res.account);
          setCode("");
          setConfirmDisconnect(false);
          setNotice(res.message ? { tone: "ok", text: res.message } : null);
        } else setNotice({ tone: "error", text: res.error });
      } catch {
        setNotice({ tone: "error", text: "Something went wrong. Please try again." });
      }
    });
  }

  const fieldError = (f: Field) =>
    errors[f] ? (
      <p id={`pay-${f}-error`} role="alert" className="text-xs text-destructive">
        {errors[f]}
      </p>
    ) : null;

  return (
    <div className="space-y-6">
      {!account.encryptionConfigured && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Secure storage for payment keys isn&apos;t set up on this server yet, so keys can&apos;t be saved. Ask your platform administrator to configure it.
        </p>
      )}

      {/* Status */}
      <section id="payment-account-status" aria-label="Connection status" className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Razorpay</span>
          {connected && <Pill tone="green"><CheckCircle2 className="size-3" /> Connected</Pill>}
          {account.status === "unreadable" && <Pill tone="red"><XCircle className="size-3" /> Keys can&apos;t be read — enter them again</Pill>}
          {account.status === "not_connected" && <Pill tone="muted"><CircleDashed className="size-3" /> Not connected</Pill>}
          {account.mode && <Pill tone={account.mode === "live" ? "blue" : "amber"}>{account.mode === "live" ? "Live mode" : "Test mode"}</Pill>}
          {hasRecord && (account.payoutsEnabled ? <Pill tone="green">Payouts on</Pill> : <Pill tone="muted">Payouts off</Pill>)}
        </div>

        {hasRecord ? (
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Key ID</dt>
            <dd className="break-all font-mono text-xs" data-testid="stored-key-id">{account.keyId}</dd>
            <dt className="text-muted-foreground">Key secret</dt>
            <dd className="font-mono text-xs" data-testid="stored-key-secret">{masked(account.keySecretLast4)}</dd>
            <dt className="text-muted-foreground">Webhook secret</dt>
            <dd className="font-mono text-xs" data-testid="stored-webhook-secret">{masked(account.webhookSecretLast4) ?? <span className="font-sans text-amber-700 dark:text-amber-400">Not set — webhooks will be rejected</span>}</dd>
            <dt className="text-muted-foreground">RazorpayX account</dt>
            <dd className="font-mono text-xs" data-testid="stored-account-number">{masked(account.accountNumberLast4) ?? <span className="font-sans text-muted-foreground">—</span>}</dd>
            {account.lastTest && (
              <>
                <dt className="text-muted-foreground">Last test</dt>
                <dd className={cn("text-xs", account.lastTest.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")} suppressHydrationWarning>
                  {account.lastTest.ok ? "Passed" : "Failed"} · {formatDateTime(account.lastTest.at)} — {account.lastTest.message}
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            {account.usingPlatformEnv.payments || account.usingPlatformEnv.payouts
              ? "This workspace currently uses the platform's built-in Razorpay account (server environment settings). Connecting an account here replaces it for this workspace."
              : "Connect your Razorpay account to collect payments from customers and to pay salaries, vendors, refunds and reimbursements. Until you do, none of these can be paid from here."}
          </p>
        )}

        {hasRecord && !account.payoutsEnabled && account.usingPlatformEnv.payouts && (
          <p className="text-xs text-muted-foreground">Salary payouts still run on the platform&apos;s built-in RazorpayX account until you switch payouts on here.</p>
        )}

        {hasRecord && (
          <div className="flex flex-wrap gap-2">
            <Button id="pay-test" type="button" variant="outline" size="sm" disabled={busy || !connected} onClick={runTest}>
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />} Test connection
            </Button>
            {!confirmDisconnect && (
              <Button id="pay-disconnect" type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmDisconnect(true)}>
                <Trash2 className="size-3.5" /> Disconnect
              </Button>
            )}
          </div>
        )}

        {confirmDisconnect && (
          <div role="group" aria-label="Confirm disconnecting Razorpay" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">Disconnect Razorpay? The stored keys are deleted; online payments and automatic salary payouts stop until you connect again.</p>
            <div className="flex flex-col gap-2">
              <PaymentCodeField value={code} onChange={setCode} />
              <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmDisconnect(false)}>
                Cancel
              </Button>
              <Button id="pay-disconnect-confirm" type="button" variant="destructive" size="sm" disabled={busy} onClick={runDisconnect}>
                {disconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Yes, disconnect
              </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      <div aria-live="polite">
        {notice && (
          <p id="pay-notice" role={notice.tone === "error" ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-sm", notice.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
            {notice.text}
          </p>
        )}
      </div>

      {/* Connect / update form */}
      <form id="payment-account-form" aria-label="Razorpay keys" className="space-y-4" onSubmit={submit} noValidate>
        <h3 className="font-semibold">{hasRecord ? "Update keys" : "Connect Razorpay"}</h3>
        <p className="text-xs text-muted-foreground">Find these in the Razorpay Dashboard → Account &amp; Settings → API keys. Use test keys first, then switch to live keys.</p>
        <fieldset disabled={formDisabled || busy} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-keyId">Key ID</Label>
            <Input id="pay-keyId" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_test_…" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64} aria-invalid={errors.keyId ? true : undefined} aria-describedby={errors.keyId ? "pay-keyId-error" : undefined} />
            {fieldError("keyId")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-keySecret">Key secret</Label>
            <Input id="pay-keySecret" type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder={connected && account.keySecretLast4 ? `Leave blank to keep ••••${account.keySecretLast4}` : ""} autoComplete="new-password" maxLength={128} aria-invalid={errors.keySecret ? true : undefined} aria-describedby={errors.keySecret ? "pay-keySecret-error" : undefined} />
            {fieldError("keySecret")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-webhookSecret">Webhook secret</Label>
            <Input id="pay-webhookSecret" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={connected && account.webhookSecretLast4 ? `Leave blank to keep ••••${account.webhookSecretLast4}` : "The secret you set on the Razorpay webhook"} autoComplete="new-password" maxLength={128} aria-invalid={errors.webhookSecret ? true : undefined} aria-describedby={errors.webhookSecret ? "pay-webhookSecret-error" : undefined} />
            {fieldError("webhookSecret")}
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input id="pay-payoutsEnabled" type="checkbox" className="size-4 accent-primary" checked={payoutsEnabled} onChange={(e) => setPayoutsEnabled(e.target.checked)} />
              Pay salaries through RazorpayX
            </label>
            {payoutsEnabled && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-accountNumber">RazorpayX account number</Label>
                <Input id="pay-accountNumber" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder={account.accountNumberLast4 ? `Leave blank to keep ••••${account.accountNumberLast4}` : "Your RazorpayX current account number"} autoComplete="off" inputMode="numeric" maxLength={40} aria-invalid={errors.accountNumber ? true : undefined} aria-describedby={errors.accountNumber ? "pay-accountNumber-error" : undefined} />
                {fieldError("accountNumber")}
              </div>
            )}
          </div>
          <PaymentCodeField value={code} onChange={setCode} />
          <Button id="pay-submit" type="submit">
            {saving && <Loader2 className="size-4 animate-spin" />} {hasRecord ? "Save changes" : "Connect Razorpay"}
          </Button>
        </fieldset>
      </form>

      {/* Webhooks */}
      <section aria-label="Webhook URLs" className="space-y-3">
        <h3 className="font-semibold">Webhooks</h3>
        <p className="text-sm text-muted-foreground">In the Razorpay Dashboard → Webhooks (and RazorpayX → Webhooks for payouts), add these URLs with the same webhook secret you entered above, so payments and payouts update here automatically. They identify your workspace by its id, so they keep working if you change domains.</p>
        <div className="space-y-1">
          <p className="text-sm font-medium">Customer payments</p>
          <CopyValue value={account.webhookUrls.payments} label="payments" />
          <p className="text-xs text-muted-foreground">Events: payment.captured, payment.failed, order.paid</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Salary payouts (RazorpayX)</p>
          <CopyValue value={account.webhookUrls.payouts} label="payouts" />
          <p className="text-xs text-muted-foreground">Events: payout.processed, payout.failed, payout.reversed, payout.rejected</p>
        </div>
      </section>
    </div>
  );
}
