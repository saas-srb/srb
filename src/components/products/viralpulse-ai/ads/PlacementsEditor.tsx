"use client";

import { CheckRow, Note } from "./ads-bits";
import { PLACEMENT_OPTIONS, isPlacementOn, placementBlockReason, togglePlacement, fieldId } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { validatePlacements } from "@/lib/products/viralpulse-ai/ads-platforms/meta/validate";
import type { MetaOptimizationGoal } from "@/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import type { MetaTargetingDraft } from "@/lib/products/viralpulse-ai/ads-platforms/meta/draft";

const GROUPS: { publisher: "facebook" | "instagram" | "messenger" | "audience_network"; label: string }[] = [
  { publisher: "facebook", label: "Facebook" },
  { publisher: "instagram", label: "Instagram" },
  { publisher: "messenger", label: "Messenger" },
  { publisher: "audience_network", label: "Audience Network" },
];

/** Advantage+ placements (recommended) or the manual list. Rules come from the same validator the launch uses; an option that would break one is disabled with Meta's reason. */
export default function PlacementsEditor({ index, targeting, goal, onChange, editable }: { index: number; targeting: MetaTargetingDraft; goal: MetaOptimizationGoal | null; onChange: (p: MetaTargetingDraft["placements"]) => void; editable: boolean }) {
  const p = targeting.placements;
  const base = `meta.adSets[${index}].targeting.placements`;
  const problems = p.automatic ? [] : validatePlacements(p, goal, base);
  return (
    <div className="space-y-3">
      <CheckRow id={`auto-pl-${index}`} checked={p.automatic} disabled={!editable} onChange={(v) => onChange(v ? { ...p, automatic: true } : { ...p, automatic: false })} label="Advantage+ placements (recommended)" help="Meta shows the ad wherever it expects the best result across Facebook, Instagram, Messenger and Audience Network. Turn off to pick places yourself." />
      {!p.automatic && (
        <div id={fieldId(`${base}.publisherPlatforms`)} tabIndex={-1} className="space-y-3 rounded-xl border border-border/50 p-3">
          {GROUPS.map((g) => (
            <fieldset key={g.publisher} className="space-y-1.5" disabled={!editable}>
              <legend className="text-[11px] font-semibold text-muted-foreground">{g.label}</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PLACEMENT_OPTIONS.filter((o) => o.publisher === g.publisher).map((o) => {
                  const on = isPlacementOn(p, o);
                  const reason = placementBlockReason(p, o, goal);
                  return <CheckRow key={`${o.group}-${o.value}`} id={`pl-${index}-${o.group}-${o.value}`} checked={on} disabled={!editable || (!on && reason !== null)} onChange={(v) => onChange(togglePlacement(p, o, v))} label={o.label} help={!on && reason ? reason : undefined} />;
                })}
              </div>
            </fieldset>
          ))}
          <fieldset className="space-y-1.5" disabled={!editable}>
            <legend className="text-[11px] font-semibold text-muted-foreground">Devices</legend>
            <div className="flex flex-wrap gap-4">
              <CheckRow id={`dev-m-${index}`} checked={p.devicePlatforms.includes("mobile")} disabled={!editable} onChange={(v) => onChange({ ...p, devicePlatforms: v ? [...new Set([...p.devicePlatforms, "mobile"])] : p.devicePlatforms.filter((x) => x !== "mobile") })} label="Mobile" />
              <CheckRow id={`dev-d-${index}`} checked={p.devicePlatforms.includes("desktop")} disabled={!editable} onChange={(v) => onChange({ ...p, devicePlatforms: v ? [...new Set([...p.devicePlatforms, "desktop"])] : p.devicePlatforms.filter((x) => x !== "desktop") })} label="Desktop" />
            </div>
            <p className="text-[11px] text-muted-foreground">Leave both off for all devices. Operating-system targeting is not available in this version.</p>
          </fieldset>
        </div>
      )}
      {problems.length > 0 && (
        <Note tone="bad">{problems.map((e) => <p key={`${e.code}-${e.path}`}>{e.message}</p>)}</Note>
      )}
    </div>
  );
}
