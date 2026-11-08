"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, CheckCircle2, User, IndianRupee, FileText, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";

export interface PaymentLinkDrawerProps {
  defaultTitle?: string;
  defaultCustomerName?: string;
  defaultAmount?: number;
  defaultSourceModule?: string;
  sourceTransactionId?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}

export default function PaymentLinkDialog({
  defaultTitle = "",
  defaultCustomerName = "",
  defaultAmount = 0,
  defaultSourceModule = "DIRECT",
  sourceTransactionId = "",
  triggerLabel = "Send Payment Link",
  triggerClassName = "",
}: PaymentLinkDrawerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const seed = () => ({
    title: defaultTitle,
    customerName: defaultCustomerName,
    customerEmail: "",
    customerPhone: "",
    amount: defaultAmount ? String(defaultAmount) : "",
    sourceModule: defaultSourceModule,
    expiresInDays: "7",
    description: "",
  });

  const [form, setForm] = useState(seed);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setCreatedUrl(null);
    }
    setOpen(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerName || !form.amount) {
      toast.error("Customer name and amount are required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/cashflow-ai/payments/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title || `Payment for ${form.customerName}`,
            amount: Number(form.amount),
            customerName: form.customerName,
            customerEmail: form.customerEmail || `${form.customerName.toLowerCase().replace(/\s+/g, ".")}@placeholder.com`,
            sourceModule: form.sourceModule,
            expiresInDays: Number(form.expiresInDays) || 7,
            sourceTransactionId: sourceTransactionId || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Failed to generate link");
        setCreatedUrl(data.publicUrl);
        toast.success("Payment link generated & ready to share!");
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function copyLink() {
    if (!createdUrl) return;
    navigator.clipboard.writeText(createdUrl);
    toast.success("Link copied to clipboard!");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Trigger button — same style as other products */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ||
          "inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
        }
      >
        <Link2 className="size-3" />
        {triggerLabel}
      </button>

      <SheetContent className="sm:max-w-lg" side="right">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent text-white">
              <Link2 className="size-3.5" />
            </div>
            Send Payment Link
          </SheetTitle>
          <SheetDescription>
            Generate a secure payment link to collect money from a student, client, or any party. All fields are pre-filled from the record.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {createdUrl ? (
            /* ── Success State ── */
            <div className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/20">
                <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Payment Link Ready!</h3>
                <p className="text-xs text-muted-foreground mt-1">Share this link with the payer</p>
              </div>

              {/* URL Display */}
              <div className="w-full rounded-xl border border-primary/20 bg-primary/5 p-3 text-left">
                <p className="text-[10px] font-semibold uppercase text-primary tracking-wider mb-1.5">Payment URL</p>
                <p className="text-xs font-mono text-primary break-all select-all leading-relaxed">{createdUrl}</p>
              </div>

              <div className="flex w-full flex-col gap-2">
                <Button className="w-full gap-2" onClick={copyLink}>
                  <Copy className="size-4" />
                  Copy Payment Link
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: "Payment Link", url: createdUrl }).catch(() => {});
                    } else {
                      copyLink();
                    }
                  }}
                >
                  <Share2 className="size-4" />
                  Share via WhatsApp / Email
                </Button>
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setOpen(false)}>
                  Close Product
                </Button>
              </div>
            </div>
          ) : (
            /* ── Link Generator Form ── */
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Pre-filled info banner */}
              <div className="flex items-center gap-2.5 rounded-xl bg-primary/8 border border-primary/20 px-3 py-2.5">
                <Link2 className="size-4 text-primary shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-primary">Auto-filled from record</p>
                  <p className="text-muted-foreground">Verify details before generating link</p>
                </div>
              </div>

              {/* Customer / Payer Name */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <User className="size-3.5 text-muted-foreground" />
                  Payer Name (Student / Client) <span className="text-destructive">*</span>
                </Label>
                <Input
                  required
                  placeholder="e.g. Rohan Verma / Apex Healthcare"
                  value={form.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                />
              </div>

              {/* Email + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email (optional)</Label>
                  <Input
                    type="email"
                    placeholder="rohan@example.com"
                    value={form.customerEmail}
                    onChange={(e) => set("customerEmail", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone (optional)</Label>
                  <Input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={form.customerPhone}
                    onChange={(e) => set("customerPhone", e.target.value)}
                  />
                </div>
              </div>

              {/* Amount + Expiry */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <IndianRupee className="size-3.5 text-muted-foreground" />
                    Amount to Collect (₹) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="15000"
                    value={form.amount}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Link Expires In</Label>
                  <select
                    value={form.expiresInDays}
                    onChange={(e) => set("expiresInDays", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="1">1 day</option>
                    <option value="3">3 days</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                  </select>
                </div>
              </div>

              {/* Target Portal */}
              <div className="space-y-1.5">
                <Label>Target Portal</Label>
                <select
                  value={form.sourceModule}
                  onChange={(e) => set("sourceModule", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="TMS">Cohort AI — Student Portal</option>
                  <option value="PMS">SprintOS — Client Portal</option>
                  <option value="DIRECT">Direct Link (Public)</option>
                </select>
              </div>

              {/* Purpose / Description */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <FileText className="size-3.5 text-muted-foreground" />
                  Purpose / Description
                </Label>
                <Input
                  placeholder="e.g. Course Fee Q3 / Project Milestone 2 payment"
                  value={form.title || form.description}
                  onChange={(e) => { set("title", e.target.value); set("description", e.target.value); }}
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                <Button type="submit" disabled={pending} className="w-full gap-2">
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Generating Link…
                    </>
                  ) : (
                    <>
                      <Link2 className="size-4" />
                      Generate &amp; Share Payment Link
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
