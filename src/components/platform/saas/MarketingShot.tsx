import DeviceScene, { type SceneVariant } from "@/components/platform/saas/DeviceScene";
import { marketingFor, screenFor } from "@/lib/platform/saas/screens";

/**
 * The real screen of a product in a marketing photograph: a person at a laptop, with the product's actual screenshot on the display.
 * Falls back to the clear laptop frame, then to nothing, when an image is missing.
 */
export default function MarketingShot({ screenKey, name, priority = false, fallbackVariant = 0, rounded = true, zoom = 1.28 }: { screenKey: string; name: string; priority?: boolean; fallbackVariant?: SceneVariant; rounded?: boolean; zoom?: number }) {
  const src = marketingFor(screenKey);
  if (!src) return screenFor(screenKey) ? <DeviceScene screenKey={screenKey} name={name} variant={fallbackVariant} priority={priority} /> : null;
  return (
    <div className="relative">
      <div className="sr-shot-glow" aria-hidden />
      <div className={`relative aspect-[4/3] overflow-hidden border border-border/50 shadow-[0_35px_70px_-30px_rgba(15,23,42,.55)] ${rounded ? "rounded-[2rem]" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${name} — real screen of the product on a laptop`} width={1600} height={1067} loading={priority ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ transform: `scale(${zoom})`, transformOrigin: "50% 48%" }} />
      </div>
    </div>
  );
}
