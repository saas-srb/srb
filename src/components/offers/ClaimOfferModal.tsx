"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Loader2, Tag, ShieldCheck, Clock3, MessageCircle, Phone, PartyPopper } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import LeadSuccessState from "@/components/sections/LeadSuccessState";
import { useClaimOfferSubmit, SUCCESS_AUTO_HIDE_MS, type ClaimOfferFields } from "@/lib/useClaimOfferSubmit";
import { useOfferTracking } from "@/lib/useOfferTracking";
import LiveCountdown from "@/components/offers/LiveCountdown";
import { formatOfferBadge, estimateSavings } from "@/lib/offers/constants";
import { claimProgress } from "@/lib/offers/live";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";
import { formatCurrency } from "@/lib/utils";
import type { SerializedOffer } from "@/lib/offers/offers";
import type { Audience } from "@/lib/offers/constants";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

function claimAudienceFor(offer: SerializedOffer): Extract<Audience, "CLIENT" | "STUDENT" | "INTERN" | "HIRING"> {
  if (offer.category === "internship-program") return "INTERN";
  if (offer.category === "resource-augmentation") return "HIRING";
  if (offer.category === "industrial-training") return "STUDENT";
  return "CLIENT";
}

const EMPTY_FIELDS: ClaimOfferFields = { name: "", email: "", phone: "" };
const DRAFT_KEY = "offer_claim_contact";

export default function ClaimOfferModal({
  offer,
  campaignId,
  onOpenChange,
}: {
  offer: SerializedOffer | null;
  campaignId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const tx = useText();
  const { contact } = useSiteInfo();
  const { status, error, fieldErrors, pricing, portal, submit, reset } = useClaimOfferSubmit();
  const [expired, setExpired] = useState(false);
  const [fields, setFields] = useState<ClaimOfferFields>(EMPTY_FIELDS);
  const [couponCode, setCouponCode] = useState("");
  const [couponPreview, setCouponPreview] = useState<{ ok: boolean; message: string } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [wallet, setWallet] = useState<{ email: string; available: number } | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const track = useOfferTracking(campaignId);
  const formStartFired = useRef<string | null>(null);

  const open = Boolean(offer);
  const summary = offer ? estimateSavings(offer.pricing) : { original: null, savings: 0, final: null };
  const progress = claimProgress(offer?.claimedCount, offer?.claimLimit);
  const audience = offer ? claimAudienceFor(offer) : "CLIENT";

  useEffect(() => {
    if (!offer || formStartFired.current === offer._id) return;
    formStartFired.current = offer._id;
    track("form_start", { offerId: offer._id, category: offer.category, audience });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?._id]);

  useEffect(() => {
    if (!offer) return;
    let cancelled = false;
    fetch("/api/clientos/wallet-balance", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.signedIn && j.available > 0) setWallet({ email: j.email, available: j.available });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [offer]);

  // Less typing = more finished claims: signed-in portal users are pre-filled from their account, everyone else
  // from the contact details they used last time on this device (name / email / phone only — nothing sensitive).
  useEffect(() => {
    if (!offer) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per opened offer
    setExpired(false);
    let cancelled = false;
    (async () => {
      let prefill: Partial<ClaimOfferFields> = {};
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (raw) prefill = JSON.parse(raw) as Partial<ClaimOfferFields>;
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch("/api/offers/prefill", { cache: "no-store" });
        const json = await res.json();
        if (json?.signedIn) prefill = { name: json.name, email: json.email, phone: json.phone };
      } catch {
        /* anonymous / offline — fall back to the local draft */
      }
      if (cancelled) return;
      setFields((f) => ({ ...f, name: f.name || prefill.name || "", email: f.email || prefill.email || "", phone: f.phone || prefill.phone || "" }));
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?._id]);

  function set<K extends keyof ClaimOfferFields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function checkCoupon() {
    if (!offer || !couponCode.trim()) return;
    track("coupon_apply", { offerId: offer._id, category: offer.category, audience });
    setCheckingCoupon(true);
    setCouponPreview(null);
    try {
      const res = await fetch("/api/offers/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, offerId: offer._id, audience, couponCode }),
      });
      const json = await res.json();
      if (!res.ok) setCouponPreview({ ok: false, message: json?.error ?? "That coupon isn't valid." });
      else setCouponPreview({ ok: true, message: `Applies! Estimated extra savings: ${formatCurrency(json.discountAmount, offer.pricing.currency)}` });
    } catch {
      setCouponPreview({ ok: false, message: "Couldn't check that coupon right now." });
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!offer) return;
    const ok = await submit({ campaignId, offerId: offer._id, audience, couponCode: couponCode.trim() || undefined, useWallet: useWallet && !!wallet, fields });
    if (ok) {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: fields.name, email: fields.email, phone: fields.phone }));
      } catch {
        /* ignore */
      }
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setTimeout(() => {
        setFields(EMPTY_FIELDS);
        setCouponCode("");
        setCouponPreview(null);
        reset();
      }, 200);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0">
        <SheetHeader className="border-b border-border/50">
          <SheetTitle>{offer ? offer.title : "Claim this offer"}</SheetTitle>
          {offer && <SheetDescription>{offer.badgeText || formatOfferBadge(offer.pricing)}{tx("offers.claimOfferModal.claim-this-festival-offer")}</SheetDescription>}
          {offer && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LiveCountdown endDate={offer.validUntil} variant="pill" onExpire={() => setExpired(true)} />
              {summary.savings > 0 && (
                <span className="rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
                  {tx("offers.claimOfferModal.you-save")}{formatCurrency(summary.savings, offer.pricing.currency)}
                </span>
              )}
              {progress.limit !== null && !progress.soldOut && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{progress.remaining}{tx("offers.claimOfferModal.of")}{progress.limit}{tx("offers.claimOfferModal.left")}</span>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="p-4">
          <AnimatePresence mode="wait">
            {status === "success" ? (
              <div key="success" className="space-y-4">
                <LeadSuccessState
                  title={tx("offers.claimOfferModal.offer-claimed")}
                  description={tx("offers.claimOfferModal.our-team-will-reach-out-shortly-with-you")}
                  onDismiss={() => handleOpenChange(false)}
                  autoHideMs={SUCCESS_AUTO_HIDE_MS}
                />
                {pricing?.originalPrice != null && pricing.finalPrice != null && (
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4 text-sm">
                    <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground"><PartyPopper className="size-4 text-primary" />{tx("offers.claimOfferModal.your-locked-in-price")}</p>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground line-through">{formatCurrency(pricing.originalPrice, pricing.currency)}</span>
                      <span className="text-xl font-black text-primary">{formatCurrency(pricing.finalPrice, pricing.currency)}</span>
                    </div>
                    {pricing.walletAmountApplied ? <p className="mt-1 text-xs text-muted-foreground">{tx("offers.claimOfferModal.includes")}{formatCurrency(pricing.walletAmountApplied, pricing.currency)}{tx("offers.claimOfferModal.of-brand-credits")}</p> : null}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {portal?.redirect && (
                    <Link href={portal.redirect} className="inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                      {portal.isNewAccount ? "Open my portal — your account is ready" : "Sign in to track this claim"}
                    </Link>
                  )}
                  <Button type="button" variant="outline" className="w-full" onClick={() => handleOpenChange(false)}>{tx("offers.claimOfferModal.keep-exploring-offers")}</Button>
                </div>
              </div>
            ) : (
              <form key="form" onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="space-y-1.5">
                  <Label>{tx("offers.claimOfferModal.full-name")}</Label>
                  <Input value={fields.name} onChange={(e) => set("name", e.target.value)} required />
                  {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{tx("offers.claimOfferModal.email")}</Label>
                    <Input type="email" value={fields.email} onChange={(e) => set("email", e.target.value)} required />
                    {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tx("offers.claimOfferModal.phone")}</Label>
                    <Input value={fields.phone} onChange={(e) => set("phone", e.target.value)} required />
                    {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
                  </div>
                </div>

                {(audience === "CLIENT" || audience === "HIRING") && (
                  <>
                    <div className="space-y-1.5">
                      <Label>{tx("offers.claimOfferModal.company-optional")}</Label>
                      <Input value={fields.company ?? ""} onChange={(e) => set("company", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{tx("offers.claimOfferModal.budget-range-optional")}</Label>
                      <Input value={fields.budgetRange ?? ""} onChange={(e) => set("budgetRange", e.target.value)} placeholder="e.g. ₹1L–3L" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{tx("offers.claimOfferModal.message-optional")}</Label>
                      <textarea
                        value={fields.message ?? ""}
                        onChange={(e) => set("message", e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                      />
                    </div>
                  </>
                )}

                {audience === "STUDENT" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>{tx("offers.claimOfferModal.college-university")}</Label>
                      <Input value={fields.college ?? ""} onChange={(e) => set("college", e.target.value)} required />
                      {fieldErrors.college && <p className="text-xs text-destructive">{fieldErrors.college}</p>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{tx("offers.claimOfferModal.graduation-year-optional")}</Label>
                        <Input value={fields.graduationYear ?? ""} onChange={(e) => set("graduationYear", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{tx("offers.claimOfferModal.experience-level-optional")}</Label>
                        <Input value={fields.experienceLevel ?? ""} onChange={(e) => set("experienceLevel", e.target.value)} placeholder={tx("offers.claimOfferModal.fresher-1-2-yrs")} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{tx("offers.claimOfferModal.program-interested-in-optional")}</Label>
                      <Input value={fields.program ?? ""} onChange={(e) => set("program", e.target.value)} />
                    </div>
                  </>
                )}

                {audience === "INTERN" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>{tx("offers.claimOfferModal.college-university")}</Label>
                      <Input value={fields.college ?? ""} onChange={(e) => set("college", e.target.value)} required />
                      {fieldErrors.college && <p className="text-xs text-destructive">{fieldErrors.college}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>{tx("offers.claimOfferModal.internship-track-optional")}</Label>
                      <Input value={fields.track ?? ""} onChange={(e) => set("track", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{tx("offers.claimOfferModal.skills-optional")}</Label>
                      <Input value={fields.skills ?? ""} onChange={(e) => set("skills", e.target.value)} />
                    </div>
                  </>
                )}

                <div className="space-y-1.5 rounded-xl border border-dashed border-border/60 p-3">
                  <Label className="flex items-center gap-1.5"><Tag className="size-3.5" />{tx("offers.claimOfferModal.coupon-code-optional")}</Label>
                  <div className="flex gap-2">
                    <Input value={couponCode} onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponPreview(null); }} placeholder={tx("offers.claimOfferModal.festive90")} className="font-mono" />
                    <Button type="button" variant="outline" size="sm" onClick={checkCoupon} disabled={checkingCoupon || !couponCode.trim()}>
                      {checkingCoupon ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                  {couponPreview && (
                    <p className={`text-xs ${couponPreview.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>{couponPreview.message}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{tx("offers.claimOfferModal.final-pricing-and-coupon-eligibility-are")}</p>
                </div>

                {wallet && (
                  <label className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm">
                    <input type="checkbox" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
                    <span>
                      {tx("offers.claimOfferModal.use-my-brand-credits")}{wallet.available.toLocaleString("en-IN")}{tx("offers.claimOfferModal.available")}<span className="block text-[11px] text-muted-foreground">{tx("offers.claimOfferModal.applied-only-if-the-offer-has-a-price-an")}</span>
                    </span>
                  </label>
                )}

                {(expired || progress.soldOut) && (
                  <p className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
                    {progress.soldOut ? "This offer is fully claimed." : "This offer has just ended."}{tx("offers.claimOfferModal.please-pick-another-live-offer")}</p>
                )}

                <Button type="submit" className="w-full" disabled={status === "submitting" || expired || progress.soldOut}>
                  {status === "submitting" ? <Loader2 className="size-4 animate-spin" /> : "Claim Offer"}
                </Button>

                <ul className="grid gap-1.5 text-[11px] text-muted-foreground sm:grid-cols-3">
                  <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 shrink-0 text-primary" />{tx("offers.claimOfferModal.no-payment-now")}</li>
                  <li className="flex items-center gap-1.5"><Clock3 className="size-3.5 shrink-0 text-primary" />{tx("offers.claimOfferModal.reply-in-1-working-day")}</li>
                  <li className="flex items-center gap-1.5"><Tag className="size-3.5 shrink-0 text-primary" />{tx("offers.claimOfferModal.price-locked-on-claim")}</li>
                </ul>

                <div className="flex items-center gap-2 border-t border-border/50 pt-3 text-xs">
                  <span className="text-muted-foreground">{tx("offers.claimOfferModal.prefer-to-talk")}</span>
                  <a href={contact.whatsappHref} target="_blank" rel="noopener noreferrer" onClick={() => offer && track("whatsapp_click", { offerId: offer._id, category: offer.category })} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <MessageCircle className="size-3.5" />{tx("offers.claimOfferModal.whatsapp")}</a>
                  <a href={contact.phoneHref} onClick={() => offer && track("call_click", { offerId: offer._id, category: offer.category })} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    <Phone className="size-3.5" />{tx("offers.claimOfferModal.call-us")}</a>
                </div>
                <p className="text-center text-[11px] text-muted-foreground">
                  {tx("offers.claimOfferModal.by-submitting-you-agree-to-be-contacted-")}{" "}
                  <a href="/about/terms-and-conditions" className="underline">{tx("offers.claimOfferModal.terms")}</a>.
                </p>
              </form>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}
