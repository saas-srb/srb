"use client";

import { useEffect, useRef, useState } from "react";

/** Fades its children up once they scroll into view. Shows them at once when motion is reduced or observers are unavailable. */
export default function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: React.ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Component = Tag as React.ElementType;
  return (
    <Component ref={ref} className={`sr-reveal ${seen ? "is-in" : ""} ${className}`} style={{ ["--d" as string]: `${delay}ms` }}>
      {children}
    </Component>
  );
}
