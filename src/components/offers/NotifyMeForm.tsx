"use client";

import { useState } from "react";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useReferralCode } from "@/lib/useReferralCode";
import type { SubscriptionSource } from "@/lib/offers/subscription-validation";
import type { Audience } from "@/lib/offers/constants";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

const INTERESTS = (tx: (key: string) => string): { value: Audience; label: string }[] => ([
  { value: "CLIENT", label: tx("offers.notifyMeForm.software-ai-projects") },
  { value: "STUDENT", label: tx("offers.notifyMeForm.courses-training") },
  { value: "INTERN", label: tx("offers.notifyMeForm.internships") },
  { value: "HIRING", label: tx("offers.notifyMeForm.hiring-developers") },
]);

/**
 * One lead-capture form for every non-live state: "Notify me" for a coming-soon / future campaign
 * (`campaignId` set), or early-access + inquiry for the no-campaign fallback (`campaignId` null, optional message).
 */
export default function NotifyMeForm({
  campaignId,
  campaignName,
  source,
  withMessage = false,
  cta = "Notify me",
  className = "",
  onSubscribed,
}: {
  campaignId: string | null;
  campaignName?: string;
  source: SubscriptionSource;
  withMessage?: boolean;
  cta?: string;
  className?: string;
  onSubscribed?: () => void;
}) {
  const tx = useText();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState<Audience | "">("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useReferralCode(); // keep first-touch referral capture running on this page too

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/offers/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, phone, interest: interest || null, message, campaignId, source, website }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFieldErrors(json?.fields ?? {});
        setError(json?.error ?? "Something went wrong. Please try again.");
        setState("idle");
        return;
      }
      setState("done");
      onSubscribed?.();
    } catch {
      setError("Network error. Please check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className={`rounded-3xl border border-primary/30 bg-primary/5 p-6 text-center ${className}`} role="status">
        <CheckCircle2 className="mx-auto size-10 text-primary" />
        <p className="mt-3 text-lg font-bold text-foreground">{tx("offers.notifyMeForm.you-re-on-the-list")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {campaignName ? `We'll let you know the moment “${campaignName}” goes live.` : "We'll reach out as soon as the next offers are ready."}{tx("offers.notifyMeForm.if-you-have-a-brand-portal-account-y")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`space-y-3 rounded-3xl border border-border/50 bg-background/95 p-6 backdrop-blur-md ${className}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10"><Bell className="size-4 text-primary" /></span>
        <div>
          <p className="text-base font-bold text-foreground">{campaignName ? `Get notified — ${campaignName}` : "Get first access to new offers"}</p>
          <p className="text-xs text-muted-foreground">{tx("offers.notifyMeForm.one-message-when-it-s-live-no-spam")}</p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-1.5">
        <Label htmlFor={`nm-email-${source}`}>{tx("offers.notifyMeForm.email")}</Label>
        <Input id={`nm-email-${source}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tx("offers.notifyMeForm.you-company-com")} />
        {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{tx("offers.notifyMeForm.name-optional")}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{tx("offers.notifyMeForm.phone-whatsapp")}</Label>
          <Input type="tel" required autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{tx("offers.notifyMeForm.i-m-interested-in")}</Label>
        <div className="flex flex-wrap gap-2">
          {INTERESTS(tx).map((i) => (
            <button
              key={i.value}
              type="button"
              onClick={() => setInterest(interest === i.value ? "" : i.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${interest === i.value ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-foreground hover:border-primary hover:text-primary"}`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>
      {withMessage && (
        <div className="space-y-1.5">
          <Label>{tx("offers.notifyMeForm.what-do-you-need-optional")}</Label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" placeholder={tx("offers.notifyMeForm.e-g-e-commerce-app-for-2-cities-3-month-")} />
        </div>
      )}
      {/* honeypot — hidden from people, tempting to bots */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />

      <Button type="submit" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : cta}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">{tx("offers.notifyMeForm.by-subscribing-you-agree-to-be-contacted")}<a href="/about/terms-and-conditions" className="underline">{tx("offers.notifyMeForm.terms")}</a>.</p>
    </form>
  );
}
