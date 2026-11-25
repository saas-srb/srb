"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SettingState } from "@/lib/platform/defaults/product/company";
import { resetProductSettingAction } from "@/app/(products)/commandos/(protected)/settings/products/defaults-actions";

/**
 * Under a product's settings forms: for each setting that has a default, whether this company uses the included default or its own value, and
 * "Reset to default". It lists the settings; the fields themselves are edited once, in the forms above.
 */
export default function ProductDefaultsList({ product, states }: { product: string; states: SettingState[] }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const reset = (key: string) => {
    setBusy(key);
    setError("");
    start(async () => {
      const r = await resetProductSettingAction(product, key).catch(() => ({ ok: false as const, error: "That could not be reset. Please try again." }));
      // The forms above hold their own copy of the values: load the page again so they show the default.
      if (r.ok) window.location.reload();
      else setError(r.error);
    });
  };
  const sections = [...new Set(states.map((s) => s.section))];
  return (
    <section aria-label="Defaults" data-product-defaults={product} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold">Defaults</h2>
      <p className="text-sm text-muted-foreground">A setting you have not saved follows the included default. Saving your own value keeps it; reset it to follow the default again.</p>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      {sections.map((section) => (
        <div key={section} className="mt-3">
          <h3 className="text-sm font-medium">{section}</h3>
          <ul className="divide-y divide-border/60">
            {states.filter((s) => s.section === section).map((s) => (
              <li key={s.key} data-setting={s.key} data-source={s.source === "own" ? "own" : "default"} className="flex flex-col gap-1.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p>{s.label}</p>
                  <p className="break-words text-xs text-muted-foreground">{s.value}{s.source === "own" && s.value !== s.defaultValue ? ` · default: ${s.defaultValue}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={s.source === "own" ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300" : "rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary"}>{s.source === "own" ? "Using your own" : "Using included default"}</span>
                  {s.source === "own" && (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => reset(s.key)} aria-label={`Reset ${s.label} to default`}>
                      {pending && busy === s.key ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Reset to default
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
