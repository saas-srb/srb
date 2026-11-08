import { useId } from "react";
import { productKeyFromSlug } from "@/lib/platform/saas/product-routes";

type LogoDesign = { colors: [string, string]; paths: string[]; dots?: [number, number, number][] };

/** Product identity marks: distinct vector symbols drawn in one coherent family. */
const DESIGNS: Record<string, LogoDesign> = {
  workspace: { colors: ["#10b981", "#0f766e"], paths: ["M18 18h10v10H18zM36 18h10v10H36zM18 36h10v10H18zM36 36h10v10H36zM28 23h8M23 28v8M41 28v8M28 41h8"], dots: [[32, 32, 2.5]] },
  hrms: { colors: ["#0ea5e9", "#22c55e"], paths: ["M32 31a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM17 48c1.5-8 6.5-12 15-12s13.5 4 15 12", "M43 17c4-4 8-4 11-2-1 5-4 8-9 8"], dots: [[18, 20, 2]] },
  pms: { colors: ["#6366f1", "#06b6d4"], paths: ["M17 43h10V31h10V20h10", "m39 15 8 5-8 5", "m19 43 5 5 8-9"], dots: [[17, 43, 2.5], [47, 20, 2.5]] },
  lms: { colors: ["#f97316", "#db2777"], paths: ["M18 19h28l-8 10H26l-8-10ZM26 29h12l-3 9h-6l-3-9ZM32 38v8", "m26 46 6 4 6-4"], dots: [[32, 54, 2]] },
  fms: { colors: ["#0891b2", "#16a34a"], paths: ["M20 23c0-4 5-7 12-7s12 3 12 7-5 7-12 7-12-3-12-7ZM20 23v9c0 4 5 7 12 7 3 0 6-.6 8-2", "M20 32v9c0 4 5 7 12 7", "M43 34v12m-5-6h10"], dots: [[20, 23, 1.5]] },
  prms: { colors: ["#f59e0b", "#ef4444"], paths: ["M17 18h5l4 22h19l5-16H24", "M29 48h.1M44 48h.1", "m32 30 5 5 9-10"], dots: [[29, 48, 2], [44, 48, 2]] },
  tms: { colors: ["#8b5cf6", "#ec4899"], paths: ["M14 23c7-3 13-2 18 2v23c-5-4-11-5-18-2V23ZM50 23c-7-3-13-2-18 2v23c5-4 11-5 18-2V23Z", "M24 30c2 0 4 .5 6 1.5M40 30c-2 0-4 .5-6 1.5"], dots: [[32, 17, 3]] },
  messenger: { colors: ["#06b6d4", "#2563eb"], paths: ["M16 19h25a7 7 0 0 1 7 7v12a7 7 0 0 1-7 7H29l-9 5v-5h-4a7 7 0 0 1-7-7V26a7 7 0 0 1 7-7Z", "M23 31h.1M30 31h.1M37 31h.1", "M40 13h8a6 6 0 0 1 6 6v8"], dots: [[23, 31, 2], [30, 31, 2], [37, 31, 2]] },
  sop: { colors: ["#16a34a", "#84cc16"], paths: ["M14 19h17c4 0 7 2 7 6v25c-2-3-5-4-9-4H14V19ZM50 19H38v31c2-3 5-4 9-4h3V19Z", "m22 31 4 4 8-9", "M22 40h8"], dots: [] },
  lpms: { colors: ["#7c3aed", "#ec4899"], paths: ["M20 13h18l9 9v29H20z", "M38 13v10h9", "M27 32h12M27 38h8", "m29 46 5-1 9-9-4-4-9 9-1 5Z"], dots: [] },
  dlms: { colors: ["#0f172a", "#06b6d4"], paths: ["M32 12 49 19v12c0 11-7 18-17 23-10-5-17-12-17-23V19l17-7Z", "M26 31v-4a6 6 0 0 1 12 0v4", "M24 31h16v11H24z"], dots: [[32, 36, 1.5]] },
  ots: { colors: ["#2563eb", "#06b6d4"], paths: ["M32 12a20 20 0 1 0 20 20", "m24 32 6 6 15-16", "M32 20v6M44 32h-6"], dots: [[32, 32, 2.5]] },
  aibots: { colors: ["#7c3aed", "#4f46e5"], paths: ["M20 25h24a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V31a6 6 0 0 1 6-6Z", "M32 25v-7", "M25 36h.1M39 36h.1", "M25 43h14", "M12 32H8M56 32h-4"], dots: [[32, 15, 2.5], [25, 36, 2.2], [39, 36, 2.2]] },
  intelligence: { colors: ["#4f46e5", "#0891b2"], paths: ["M32 16a9 9 0 0 0-15 7 8 8 0 0 0 1 15 8 8 0 0 0 14 5V16ZM32 16a9 9 0 0 1 15 7 8 8 0 0 1-1 15 8 8 0 0 1-14 5V16Z", "M24 28h5m10 0h-5M25 37h4m10 0h-4"], dots: [[32, 21, 2], [32, 32, 2], [32, 43, 2]] },
  smms: { colors: ["#ec4899", "#f97316"], paths: ["M15 28h10l20-11v30L25 36H15z", "M25 36l4 13h8l-6-11", "M50 24c4 3 4 9 0 12", "M54 19c7 6 7 16 0 22"], dots: [] },
  seo: { colors: ["#f59e0b", "#22c55e"], paths: ["M29 15a15 15 0 1 0 0 30 15 15 0 0 0 0-30Z", "m40 40 11 11", "M23 36v-5M29 36V25M35 36v-8"], dots: [] },
  cms: { colors: ["#0ea5e9", "#6366f1"], paths: ["M13 17h38v30H13z", "M13 25h38", "M19 21h.1M24 21h.1M29 21h.1", "m29 31 14 7-7 2-3 7-4-16Z"], dots: [[19, 21, 1.3], [24, 21, 1.3], [29, 21, 1.3]] },
  portal: { colors: ["#059669", "#14b8a6"], paths: ["M32 12a20 20 0 1 0 0 40 20 20 0 0 0 0-40Z", "M12 32h40", "M32 12c-11 11-11 29 0 40", "M32 12c11 11 11 29 0 40", "M18 21h8M38 43h8"], dots: [[43, 21, 2]] },
  support: { colors: ["#f97316", "#f43f5e"], paths: ["M32 13a19 19 0 1 0 0 38 19 19 0 0 0 0-38Z", "M32 19v13l9 6", "M17 20l6 5M47 20l-6 5M17 44l6-5M47 44l-6-5"], dots: [[32, 32, 2.5]] },
  website: { colors: ["#0f766e", "#38bdf8"], paths: ["M12 32a20 20 0 1 0 40 0 20 20 0 0 0-40 0Z", "M12 32h40", "M32 12c-10 11-10 29 0 40", "M32 12c10 11 10 29 0 40", "M20 21h24M20 43h24"], dots: [] },
};

const FALLBACK: LogoDesign = { colors: ["#6366f1", "#06b6d4"], paths: ["M32 13 51 24v16L32 51 13 40V24l19-11Z", "M22 28h20v12H22z", "M28 28v-6h8v6"], dots: [] };

/** Product logo mark. Pair it with the registry name for a full product lockup. */
export default function ProductLogo({
  productKey,
  size,
  className,
  title,
}: {
  productKey: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const id = useId().replace(/:/g, "");
  const key = productKeyFromSlug(productKey) ?? productKey;
  const design = DESIGNS[key] ?? FALLBACK;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`product-logo-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={design.colors[0]} />
          <stop offset="100%" stopColor={design.colors[1]} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="19" fill={`url(#product-logo-${id})`} />
      <rect x="1.5" y="1.5" width="61" height="61" rx="18.5" fill="none" stroke="white" strokeOpacity=".2" />
      <g fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        {design.paths.map((d, index) => <path key={index} d={d} />)}
      </g>
      {design.dots?.map(([cx, cy, r], index) => <circle key={index} cx={cx} cy={cy} r={r} fill="white" />)}
    </svg>
  );
}
