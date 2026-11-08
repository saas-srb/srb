"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setCompanyAddonAction } from "../../addons/actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

export interface CompanyAddonView {
  addonId: string;
  name: string;
  effect: string;
  quantity: number;
  complimentary: boolean;
}

/** Add / remove add-ons for one company. Every change is audited server-side. */
export default function CompanyAddonsCard({
  companyId,
  held,
  available,
}: {
  companyId: string;
  held: CompanyAddonView[];
  available: { id: string; name: string; maxQuantity: number | null }[];
}) {
  const router = useRouter();
  const [addonId, setAddonId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [complimentary, setComplimentary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = available.find((a) => a.id === addonId);

  const run = (fn: () => ReturnType<typeof setCompanyAddonAction>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAddonId("");
      setQuantity("1");
      setComplimentary(false);
      router.refresh();
    });

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Add-ons</CardTitle>
        <CardDescription>{held.length ? "Extras on top of this company's plan." : "No add-ons. Grant one below — complimentary grants are never charged."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {held.length > 0 && (
          <ul className="divide-y divide-border text-sm" aria-label="Company add-ons">
            {held.map((h) => (
              <li key={h.addonId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="font-medium">{h.name}</span> <span className="text-muted-foreground">× {h.quantity}</span>
                  <p className="text-xs text-muted-foreground">{h.effect}</p>
                </div>
                <span className="flex items-center gap-2">
                  {h.complimentary && <Badge variant="outline">Complimentary</Badge>}
                  <Button type="button" size="sm" variant="destructive" disabled={pending} aria-label={`Remove ${h.name}`} onClick={() => run(() => setCompanyAddonAction(companyId, h.addonId, 0, false))}>
                    <Trash2 className="size-3.5" data-icon="inline-start" />
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 && (
          <form
            noValidate
            className="grid gap-3 sm:grid-cols-[1fr_6rem_auto_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!addonId) return setError("Choose an add-on.");
              run(() => setCompanyAddonAction(companyId, addonId, Number(quantity), complimentary));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="ca-addon">Add-on</Label>
              <select id="ca-addon" className={selectClass} value={addonId} onChange={(e) => setAddonId(e.target.value)}>
                <option value="">Choose…</option>
                {available.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ca-qty">Units</Label>
              <Input id="ca-qty" type="number" min={1} max={chosen?.maxQuantity ?? undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input id="ca-comp" type="checkbox" className="size-4 accent-primary" checked={complimentary} onChange={(e) => setComplimentary(e.target.checked)} />
              Complimentary
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : held.some((h) => h.addonId === addonId) ? "Update" : "Add"}
            </Button>
          </form>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </GlassCard>
  );
}
