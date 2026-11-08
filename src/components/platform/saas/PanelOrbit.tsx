"use client";

import Link from "next/link";
import Image from "next/image";
import { productPath } from "@/lib/platform/saas/product-routes";
import type { IconKey } from "@/lib/platform/saas/content";
import ProductLogo from "@/components/products/ProductLogo";

export interface OrbitPanel {
  key: string;
  name: string;
  description: string;
  icon: IconKey;
  color: string;
}

/** Every product shown as a linked mark on two rings around the fixed platform logo. */
export default function PanelOrbit({ panels, brand }: { panels: OrbitPanel[]; brand: string }) {
  const innerCount = Math.min(7, Math.ceil(panels.length / 3));
  const inner = panels.slice(0, innerCount);
  const outer = panels.slice(innerCount);

  const ring = (list: OrbitPanel[], radius: number, size: string, rev: boolean) => (
    <div className={`absolute inset-0 ${rev ? "sr-orbit-spin-rev" : "sr-orbit-spin"} sr-orbit-spin`}>
      {list.map((p, i) => {
        const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
        return (
          <Link
            key={p.key}
            aria-label={p.name}
            href={productPath(p.key)}
            className="absolute -translate-x-1/2 -translate-y-1/2 outline-offset-4"
            style={{ left: `${50 + radius * 100 * Math.cos(a)}%`, top: `${50 + radius * 100 * Math.sin(a)}%`, width: size }}
          >
            <span className={`${rev ? "sr-orbit-node-rev" : "sr-orbit-node"} block`}>
              <span
                className="sr-circle aspect-square w-full shadow-lg shadow-primary/25 ring-4 ring-background"
              >
                <ProductLogo productKey={p.key} size={46} title={p.name} />
              </span>
              <span className="mt-1.5 hidden max-w-[96px] -translate-x-0 truncate text-center text-[11px] font-semibold text-foreground md:block">{(p as any).shortName || p.name.replace(/^SelfRun\s+/i, "")}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="sr-orbit relative mx-auto aspect-square w-full max-w-[680px]">
      <div className="sr-orbit-ring" style={{ inset: "4%" }} aria-hidden />
      <div className="sr-orbit-ring" style={{ inset: "20%" }} aria-hidden />
      <div className="absolute rounded-full" style={{ inset: "30%", background: "radial-gradient(circle, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)" }} aria-hidden />
      {ring(outer, 0.45, "min(11.5%, 76px)", false)}
      {ring(inner, 0.3, "min(12.5%, 82px)", true)}
      <div className="absolute inset-[35%] flex flex-col items-center justify-center rounded-full bg-card p-3 text-center" style={{ boxShadow: "0 20px 50px -18px color-mix(in oklch, var(--primary) 45%, transparent)", border: "1px solid var(--border)" }}>
        <Image
          src="/selfrun/logo/logo.png"
          alt="SelfRun Business logo"
          width={56}
          height={56}
          className="mb-1 size-12 rounded-xl object-cover sm:size-14"
          priority
        />
        <p className="sr-display text-[13px] font-semibold sm:text-lg">{brand}</p>
      </div>
    </div>
  );
}
