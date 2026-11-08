"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { SerializedPaymentLink } from "@/lib/products/cashflow-ai/payments/links";
import { ShieldCheck, CheckCircle2, AlertCircle, Loader2, ArrowRight, Download, Share2, Printer, Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BrandMark from "@/components/BrandMark";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { BrandName } from "@/components/platform/BrandProvider";
import { useBrand } from "@/components/platform/BrandProvider";
import type { PublicReceipt } from "@/lib/products/cashflow-ai/payments/public-receipt";
import { openOrderCheckout } from "@/components/platform/billing/razorpay-checkout";

export default function PublicCheckoutClient({ link, receipt }: { link: SerializedPaymentLink; receipt: PublicReceipt | null }) {
  const brand = useBrand();
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement>(null);
  const [paying, setPaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"IDLE" | "SUCCESS" | "FAILED">(
    link.status === "PAID" ? "SUCCESS" : "IDLE"
  );
  const [errorMsg, setErrorMsg] = useState("");

  const isExpired = link.status === "EXPIRED" || (link.expiresAt && new Date(link.expiresAt) < new Date());
  const isPaid = link.status === "PAID" || status === "SUCCESS";

  const handlePay = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const intentRes = await fetch("/api/cashflow-ai/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The link's secret token authorises this payment; the server takes amount, invoice and customer from the link itself.
          linkToken: link.token,
          sourceModule: link.sourceModule,
          sourceType: "DIRECT_LINK",
          sourceId: link._id,
          invoiceId: link.invoiceId,
          customerName: link.customerName,
          customerEmail: link.customerEmail,
          customerPhone: link.customerPhone,
          amount: link.amount,
          currency: link.currency,
          paymentProvider: "razorpay",
        }),
      });

      const intentData = await intentRes.json();
      if (!intentRes.ok || !intentData.ok) {
        throw new Error(intentData.error || "Failed to initialize payment");
      }

      const intentId = intentData.paymentIntent._id;
      if (!intentData.keyId || !intentData.gatewayOrderId) throw new Error("Online payment is not set up for this link yet. Please contact the sender to pay another way.");

      // Razorpay Checkout opens INSIDE this card, in the company's colours, rather than as a separate full-page window.
      flushSync(() => setPaying(true));
      let paid: Awaited<ReturnType<typeof openOrderCheckout>>;
      try {
        paid = await openOrderCheckout({
          key: intentData.keyId,
          orderId: intentData.gatewayOrderId,
          amount: intentData.amountPaise,
          currency: intentData.currency || link.currency,
          name: brand.name,
          description: link.title || "Payment",
          prefill: { name: link.customerName, email: link.customerEmail, ...(link.customerPhone ? { contact: link.customerPhone } : {}) },
          onPaymentFailed: (m) => setErrorMsg(m),
          mount: mountRef.current,
          surface: "--card",
        });
      } finally {
        setPaying(false);
      }
      if (!paid) {
        setLoading(false);
        return;
      }

      const verifyRes = await fetch("/api/cashflow-ai/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId, gatewayPaymentId: paid.razorpay_payment_id, gatewaySignature: paid.razorpay_signature }),
      });

      const verifyData = await verifyRes.json();
      if (verifyRes.ok && verifyData.ok) {
        setStatus("SUCCESS");
        // The page is read again on the server: it now shows the receipt of this payment.
        router.refresh();
      } else {
        throw new Error(verifyData.error || "We could not confirm the payment yet. If money was deducted it will be reflected shortly.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus("FAILED");
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lms-surface rounded-3xl border border-border/60 bg-background/95 p-6 md:p-8 shadow-xl backdrop-blur-md dark:bg-card/90">
      {/* Brand Header */}
      <div className="flex items-center justify-between pb-6 border-b border-border/60">
        <div className="flex items-center gap-2">
          <BrandMark className="size-7 shrink-0" />
          <div>
            <span className="text-lg font-bold">
              <BrandName />
            </span>
            <p className="text-xs text-muted-foreground">Financial Operations</p>
          </div>
        </div>
        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 gap-1 text-xs">
          <ShieldCheck className="size-3.5" />
          Secure Checkout
        </Badge>
      </div>

      {/* Main Content State Machine */}
      {isPaid ? (
        <ReceiptView link={link} receipt={receipt} />
      ) : isExpired ? (
        <div className="py-8 text-center space-y-4">
          <div className="size-16 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
            <AlertCircle className="size-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Payment Link Expired</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This payment link has expired or been deactivated. Please request a new link from {brand.name}.
            </p>
          </div>
        </div>
      ) : (
        <div className="py-6 space-y-6">
          {/* Payment Details */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Payment Request
            </span>
            <h2 className="text-lg font-bold text-foreground mt-0.5">{link.title}</h2>
            {link.description && (
              <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
            )}
          </div>

          <div className="bg-muted/40 rounded-2xl p-4 border border-border/60 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-muted-foreground">Total Payable</span>
              <span className="text-2xl font-black text-primary">
                {formatMoney(link.amount, link.currency)}
              </span>
            </div>

            <div className="pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Customer Name:</span>
                <span className="text-foreground font-medium">{link.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer Email:</span>
                <span className="text-foreground font-medium">{link.customerEmail}</span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div ref={mountRef} className={paying ? "relative h-[640px] overflow-hidden rounded-2xl border border-border/60" : "hidden"} />

          <Button
            onClick={handlePay}
            disabled={loading}
            hidden={paying}
            size="lg"
            className="w-full text-base font-semibold gap-2 shadow-lg shadow-primary/20"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Processing Payment...</span>
              </>
            ) : (
              <>
                <span>Pay Securely {formatMoney(link.amount, link.currency)}</span>
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}


function ReceiptView({ link, receipt }: { link: SerializedPaymentLink; receipt: PublicReceipt | null }) {
  const [copied, setCopied] = useState(false);
  if (!receipt) {
    return (
      <div className="py-8 text-center space-y-3">
        <CheckCircle2 className="mx-auto size-10 text-green-600 dark:text-green-400" />
        <h2 className="text-xl font-bold text-foreground">Payment received</h2>
        <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline size-3.5 animate-spin" />Preparing your receipt…</p>
      </div>
    );
  }
  const pageUrl = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
  const pdfUrl = `/api/cashflow-ai/payments/receipt/${link.token}`;
  const when = new Date(receipt.paidAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const message = `Payment receipt ${receipt.number}: ${formatMoney(receipt.amount, receipt.currency)} paid for ${receipt.title}.`;
  const rows: [string, string, boolean?][] = [
    ["Receipt no.", receipt.number, true],
    ["Date and time", `${when} IST`],
    ["Paid by", receipt.customerName],
    ["For", receipt.title],
    ["Payment method", receipt.method],
    ...(receipt.gatewayPaymentId ? ([["Razorpay payment id", receipt.gatewayPaymentId, true]] as [string, string, boolean][]) : []),
    ...(receipt.utr ? ([["Bank reference (UTR)", receipt.utr, true]] as [string, string, boolean][]) : []),
  ];

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Receipt ${receipt!.number}`, text: message, url: pageUrl });
        return;
      } catch {
        /* closed without sharing: nothing to do */
      }
    }
    try {
      await navigator.clipboard.writeText(`${message} ${pageUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* the links below still work */
    }
  }

  return (
    <div className="space-y-5 py-6">
      <div className="text-center space-y-2">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-green-500/20 bg-green-500/15 text-green-600 dark:text-green-400"><CheckCircle2 className="size-7" /></div>
        <h2 className="text-xl font-bold text-foreground">Payment successful</h2>
        <p className="text-3xl font-black text-primary">{formatMoney(receipt.amount, receipt.currency)}</p>
        <p className="text-xs text-muted-foreground">Thank you. A copy of this receipt is below to keep, print or share.</p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Payment receipt</p>
        <dl className="space-y-2">
          {rows.map(([k, v, mono]) => (
            <div key={k} className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className={`text-right font-medium text-foreground break-all ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <a href={`${pdfUrl}?download=1`} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"><Download className="size-4" />PDF</a>
        <Button type="button" variant="outline" className="gap-1.5" onClick={share}><Share2 className="size-4" />{copied ? "Copied" : "Share"}</Button>
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <a className="inline-flex items-center gap-1 hover:text-foreground" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${message} ${pageUrl}`)}`}>WhatsApp</a>
        <a className="inline-flex items-center gap-1 hover:text-foreground" href={`mailto:?subject=${encodeURIComponent(`Receipt ${receipt.number}`)}&body=${encodeURIComponent(`${message}\n${pageUrl}`)}`}><Mail className="size-3.5" />Email</a>
        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => navigator.clipboard?.writeText(pageUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })}><Copy className="size-3.5" />Copy link</button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Keep this page&apos;s address: anyone who has it can see this receipt.</p>
    </div>
  );
}
