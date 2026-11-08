"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

/** A card whose surface lights up under the pointer. */
export default function SpotCard({ children, className = "", as: Tag = "div", href }: { children: React.ReactNode; className?: string; as?: "div" | "a"; href?: string }) {
  const Component = (href ? Link : Tag) as React.ElementType;
  return (
    <Component
      href={href}
      className={`sr-card sr-spot sr-card-hover ${className}`}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      style={{} as CSSProperties}
    >
      {children}
    </Component>
  );
}
