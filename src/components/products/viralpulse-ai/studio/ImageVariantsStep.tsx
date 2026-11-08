"use client";

import { Check, Loader2 } from "lucide-react";
import { Chip } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import type { StudioConfig } from "@/components/products/viralpulse-ai/studio/config";
import { goalById } from "@/lib/products/viralpulse-ai/images/specs";
import { IMAGE_QUALITIES } from "@/lib/products/viralpulse-ai/image-pricing-core";
import { formatUsd } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import type { Brief } from "@/lib/products/viralpulse-ai/images/types";
import type { Errors, EstimateView } from "@/lib/products/viralpulse-ai/images/wizard";
import { cn } from "@/lib/utils";

const QUALITY_NOTE: Record<string, string> = { low: "Quick drafts", medium: "Good for most posts", high: "Sharper detail", xhigh: "Extra detail", max: "Highest detail" };

function Pick({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={disabled} aria-pressed={on} onClick={onClick} className={cn("rounded-xl border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50", on ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/60 hover:border-primary/40")}>{children}</button>
  );
}

export default function ImageVariantsStep({ brief, set, errors, config, estimate, estimating, estimateError, disabled }: { brief: Brief; set: (patch: Partial<Brief>) => void; errors: Errors; config: StudioConfig; estimate: EstimateView | null; estimating: boolean; estimateError: string | null; disabled: boolean }) {
  const goal = goalById(brief.goalId)!;
  const max = Math.min(config.settings.maxVariants, 4);
  return (
    <div className="space-y-6">
      <section aria-label="Number of options" className="space-y-2">
        <h3 className="text-sm font-bold">{goal.slides ? "Slides" : "How many options?"}</h3>
        {goal.slides ? (
          <p className="rounded-xl bg-muted/40 p-3 text-xs">{`A carousel makes one picture per slide: ${brief.overlayText.length} slides. Add or remove slides in the Brief step.`}</p>
        ) : (
          <div role="group" aria-label="Options" className="grid grid-cols-4 gap-2">
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <Pick key={n} on={brief.variants === n} disabled={disabled} onClick={() => set({ variants: n })}>
                <span className="block text-lg font-bold tabular-nums">{n}</span>
                <span className="text-[11px] text-muted-foreground">{n === 1 ? "one picture" : "pictures to pick from"}</span>
              </Pick>
            ))}
          </div>
        )}
        {errors.variants && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{errors.variants}</p>}
      </section>

      <section aria-label="Model" className="space-y-2">
        <h3 className="text-sm font-bold">Model</h3>
        <p className="text-xs text-muted-foreground">Each model is billed to your own account. Only models your account can actually use are offered.</p>
        <div role="group" aria-label="Model" className="grid gap-2 sm:grid-cols-2">
          {(["openai", "gemini"] as const).map((p) => (
            <Pick key={p} on={brief.provider === p} disabled={disabled || !config.providers[p]} onClick={() => set({ provider: p })}>
              <span className="flex items-center gap-2 text-sm font-semibold">{p === "openai" ? "OpenAI" : "Google Gemini"}{brief.provider === p && <Check className="size-3.5 text-primary" />}</span>
              <span className="block text-xs text-muted-foreground">{config.providers[p] ? config.models[p] : "Not connected. Connect it in Settings, Integrations."}</span>
              {config.providers[p] && <span className="mt-1 block"><Chip tone="ok">Connected</Chip></span>}
            </Pick>
          ))}
        </div>
        {errors.provider && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{errors.provider}</p>}
      </section>

      {brief.provider === "openai" && (
        <section aria-label="Quality" className="space-y-2">
          <h3 className="text-sm font-bold">Quality</h3>
          <div role="group" aria-label="Quality" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {IMAGE_QUALITIES.map((q) => (
              <Pick key={q} on={brief.quality === q} disabled={disabled} onClick={() => set({ quality: q })}>
                <span className="block text-sm font-semibold capitalize">{q}</span>
                <span className="text-[11px] text-muted-foreground">{QUALITY_NOTE[q] ?? ""}</span>
              </Pick>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Estimate" className="rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">Estimated cost</h3>
            <p className="text-xs text-muted-foreground">{estimateError ?? (estimate ? `${estimate.images} picture${estimate.images === 1 ? "" : "s"} with ${estimate.model}, ${formatUsd(estimate.perImageUsd)} each (${estimate.basis === "usage" ? "from recent real usage" : estimate.basis === "unknown" ? "price not known: set it in Settings" : "from the price table"}).` : "Working it out…")}</p>
          </div>
          <p className="flex items-center gap-1.5 text-2xl font-bold tabular-nums">{estimating && <Loader2 className="size-4 animate-spin text-muted-foreground" />}{estimate ? formatUsd(estimate.totalUsd) : "–"}</p>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Nothing is drawn or charged until you approve on the last step.</p>
      </section>
    </div>
  );
}
