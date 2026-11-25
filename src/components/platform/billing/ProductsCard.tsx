"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { openSubscriptionCheckout, type RazorpayHandlerResponse } from "@/components/platform/billing/razorpay-checkout";
import { formatMoney } from "@/lib/platform/billing/types";
import { parseSelection, ownedModules, NEEDS_ONE_OF, INCLUDED_WITH } from "@/lib/platform/products/selection";
import type { PriceSummary } from "@/lib/platform/billing/billing-details";

type Checkout = { key: string; subscriptionId: string; name: string; description: string; prefill: { name: string; email: string } };

export interface ProductsCardActions {
  preview: (products: string[]) => Promise<{ ok: true; summary: PriceSummary | null; when: "now" | "renewal" } | { ok: false; error: string }>;
  change: (products: string[]) => Promise<{ ok: true; message: string; checkout?: Checkout } | { ok: false; error: string }>;
  confirm: (response: RazorpayHandlerResponse) => Promise<{ ok: true; message?: string } | { ok: false; error: string }>;
}

export interface ProductsCardProps {
  /** Every product that can be picked, with its registry name. */
  choices: { key: string; name: string; description: string }[];
  /** null = All products. */
  current: string[] | null;
  next: { names: string; on: string } | null;
  held: string[];
  maxProducts: number | null;
  actions: ProductsCardActions;
}

/** Settings → Billing: which products the company has, what a change costs and when it starts. */
export default function ProductsCard({ choices, current, next, held, maxProducts, actions }: ProductsCardProps) {
  const router = useRouter();
  const [all, setAll] = useState(current === null);
  const [picked, setPicked] = useState<string[]>(current ?? []);
  const [preview, setPreview] = useState<{ summary: PriceSummary | null; when: "now" | "renewal" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const payMount = useRef<HTMLDivElement>(null);

  const values = all ? ["all"] : picked;
  const selection = parseSelection(values);
  const owned = selection ? ownedModules(selection) : null;
  const changed = JSON.stringify([...values].sort()) !== JSON.stringify([...(current ?? ["all"])].sort());

  function pick(nextAll: boolean, nextPicked: string[]) {
    setAll(nextAll);
    setPicked(nextPicked);
    setPreview(null);
    setError(null);
  }
  const toggle = (key: string, on: boolean) => {
    const keys = on ? [...picked, key] : picked.filter((k) => k !== key);
    // A product that only comes beside another leaves with it.
    pick(false, keys.filter((k) => !NEEDS_ONE_OF[k as keyof typeof NEEDS_ONE_OF] || NEEDS_ONE_OF[k as keyof typeof NEEDS_ONE_OF]!.some((n) => keys.includes(n))));
  };

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      await fn().catch(() => setError("Something went wrong. Please try again."));
    });

  const check = () =>
    run(async () => {
      const res = await actions.preview(values);
      if (!res.ok) setError(res.error);
      else setPreview({ summary: res.summary, when: res.when });
    });

  const save = () =>
    run(async () => {
      const res = await actions.change(values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.checkout) {
        const c = res.checkout;
        const paid = await openSubscriptionCheckout({ key: c.key, subscriptionId: c.subscriptionId, name: c.name, description: c.description, prefill: c.prefill, onPaymentFailed: (m) => setError(m), mount: payMount.current });
        if (!paid) {
          setError("Payment was not approved, so nothing has changed.");
          return;
        }
        const confirmed = await actions.confirm(paid);
        if (!confirmed.ok) {
          setError(confirmed.error);
          return;
        }
      }
      toast.success(res.message);
      setPreview(null);
      router.refresh();
    });

  return (
    <GlassCard interactive={false} containerClassName="h-auto">
      <CardHeader>
        <CardTitle className="text-base">Your products</CardTitle>
        <CardDescription>
          CommandOS and Huddle come with every workspace. {maxProducts ? `Your plan includes ${maxProducts === 1 ? "one product" : `${maxProducts} products`}.` : "Pick some products, or take them all."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {next && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
            From {next.on} you will have: <strong>{next.names}</strong>.
          </p>
        )}
        <label className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm font-semibold has-checked:border-primary has-checked:bg-primary/5">
          <input type="checkbox" checked={all} disabled={maxProducts !== null} onChange={(e) => pick(e.target.checked, picked)} />
          All products
        </label>
        <fieldset disabled={all} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="sr-only">Products</legend>
          {choices.map((c) => {
            const needs = NEEDS_ONE_OF[c.key as keyof typeof NEEDS_ONE_OF];
            const bundledBy = picked.find((k) => INCLUDED_WITH[k as keyof typeof INCLUDED_WITH]?.includes(c.key as never));
            const unavailable = Boolean(needs && !needs.some((n) => picked.includes(n)));
            return (
              <label key={c.key} className="flex items-start gap-2 rounded-xl border border-border/60 p-3 text-sm has-checked:border-primary has-checked:bg-primary/5 has-disabled:opacity-60">
                <input type="checkbox" className="mt-1" disabled={unavailable} checked={all || picked.includes(c.key) || Boolean(owned?.has(c.key) && bundledBy)} onChange={(e) => toggle(c.key, e.target.checked)} />
                <span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {unavailable ? "Add a product with data first." : bundledBy ? "Comes with your selection." : held.includes(c.key) ? "Just added: can be removed after one bill." : c.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {preview && (
          <div role="status" className="rounded-xl border border-border/60 bg-muted/60 p-3 text-sm">
            {preview.summary ? (
              <p>
                <strong>{formatMoney(preview.summary.total, preview.summary.currency)}</strong> per {preview.summary.interval === "yearly" ? "year" : "month"}, including GST.
              </p>
            ) : (
              <p>Nothing to pay on your current plan.</p>
            )}
            <p className="text-xs text-muted-foreground">
              {preview.when === "renewal" ? "Added products open now; the new price starts at your next renewal. Removed products stay until the paid period ends." : "The change applies at once."}
            </p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div ref={payMount} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending || !selection || !changed} onClick={check}>
            See the price
          </Button>
          <Button type="button" size="sm" disabled={pending || !selection || !changed || !preview} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Update products"}
          </Button>
        </div>
      </CardContent>
    </GlassCard>
  );
}
