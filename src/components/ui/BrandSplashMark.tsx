"use client";

import { useRef } from "react";
import { Compass } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { useBrand } from "@/components/platform/BrandProvider";

/**
 * The centrepiece of the app-opening screen: THIS company's own logo (its uploaded one, else its monogram) on a glass tile with a
 * gradient ring turning around it, a breathing halo, small lights orbiting, and a light sweep across the tile. Moving a pointer (or a
 * finger) over it tilts the tile in 3D with a glare that follows — so the wait is something to play with, not stare at.
 * The logo keeps its own proportions and colours (never cropped or tinted). Client-only; no data besides the brand from context.
 */
export default function BrandSplashMark({ size = "lg" }: { size?: "lg" | "md" | "sm" }) {
  const brand = useBrand();
  const hasIdentity = Boolean(brand.logoUrl || brand.name || brand.namePrimary);
  // Sizes are set inline (not by utility classes): whatever logo a company uploaded, however large its pixels, the mark never grows past these.
  const boxPx = size === "lg" ? 160 : size === "md" ? 128 : 84;
  const tilePx = size === "lg" ? 112 : size === "md" ? 88 : 60;
  const ref = useRef<HTMLDivElement>(null);

  const tilt = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 16).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    for (const k of ["--rx", "--ry"]) el.style.setProperty(k, "0deg");
    el.style.setProperty("--gx", "50%");
    el.style.setProperty("--gy", "30%");
  };

  return (
    <div className="app-pop relative flex shrink-0 items-center justify-center" style={{ width: boxPx, height: boxPx }} onPointerMove={tilt} onPointerLeave={reset} onPointerCancel={reset}>
      <span aria-hidden className="app-halo absolute inset-3 rounded-full bg-primary/30 blur-2xl" />
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full">
        <rect x="2" y="2" width="96" height="96" rx="30" fill="none" strokeWidth="1" className="stroke-primary/15" />
        <g className="app-ring" style={{ transformOrigin: "50px 50px" }}>
          <circle cx="50" cy="50" r="47.5" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="62 237" className="stroke-primary" />
          <circle cx="50" cy="50" r="47.5" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="14 285" strokeDashoffset="-120" className="stroke-primary/60" />
        </g>
      </svg>
      <span aria-hidden className="app-orbit absolute inset-0"><i className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" /></span>
      <span aria-hidden className="app-orbit absolute inset-2 [animation-direction:reverse] [animation-duration:7s]"><i className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary/70" /></span>

      <div
        ref={ref}
        className="app-tile relative flex shrink-0 items-center justify-center overflow-hidden rounded-[2rem] border border-border/60 bg-card/95 shadow-2xl shadow-primary/20 backdrop-blur-md"
        style={{ width: tilePx, height: tilePx }}
      >
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- company-uploaded logo from arbitrary storage hosts
          <img src={brand.logoUrl} alt="" aria-hidden="true" draggable={false} width={Math.round(tilePx * 0.68)} height={Math.round(tilePx * 0.68)} style={{ width: "68%", height: "68%" }} className="select-none object-contain" />
        ) : hasIdentity ? (
          <BrandMark className={size === "lg" ? "size-16" : size === "md" ? "size-12" : "size-8"} />
        ) : (
          <Compass className={`${size === "lg" ? "size-12" : size === "md" ? "size-9" : "size-6"} text-primary`} strokeWidth={1.6} />
        )}
        {/* light sweep and pointer glare */}
        <span aria-hidden className="app-sweep pointer-events-none absolute inset-0" />
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_var(--gx,50%)_var(--gy,30%),color-mix(in_oklab,white_28%,transparent),transparent_55%)]" />
      </div>
    </div>
  );
}
