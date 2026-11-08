import { safeRect, textBand } from "@/lib/products/viralpulse-ai/images/wizard";
import type { ImageSpec } from "@/lib/products/viralpulse-ai/images/specs";
import type { TextPosition } from "@/lib/products/viralpulse-ai/images/types";
import { cn } from "@/lib/utils";

/**
 * An honest layout guide for one size: the exact aspect ratio, the margins the platform's interface covers (hatched), the safe area
 * (dashed) and where printed text lands. It is a diagram, not a sample picture.
 */
export default function FormatIllustration({ spec, textPosition = "bottom", showText = true, className, label }: { spec: Pick<ImageSpec, "width" | "height" | "safe" | "label">; textPosition?: TextPosition; showText?: boolean; className?: string; label?: string }) {
  const W = 100;
  const H = (spec.height / spec.width) * W;
  const r = safeRect(spec);
  const sx = (r.x / 100) * W, sy = (r.y / 100) * H, sw = (r.w / 100) * W, sh = (r.h / 100) * H;
  const band = textBand(textPosition);
  const id = `hatch-${Math.round(spec.width)}x${Math.round(spec.height)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? `${spec.label}: ${spec.width} by ${spec.height} pixels. Dashed box is the safe area for text and logos.`} className={cn("block h-auto w-full text-primary", className)} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id={id} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="currentColor" strokeOpacity="0.28" strokeWidth="0.8" /></pattern>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="1.5" className="fill-muted" />
      <rect x="0" y="0" width={W} height={H} rx="1.5" fill={`url(#${id})`} />
      <rect x={sx} y={sy} width={sw} height={sh} className="fill-background" />
      <rect x={sx} y={sy} width={sw} height={sh} fill="none" stroke="currentColor" strokeWidth="0.7" strokeDasharray="2.2 1.6" />
      {showText && (
        <g className="fill-foreground/70">
          <rect x={sx + sw * 0.08} y={sy + sh * band.y + sh * 0.04} width={sw * 0.84} height={Math.max(sh * 0.07, 1.4)} rx="0.8" />
          <rect x={sx + sw * 0.08} y={sy + sh * band.y + sh * 0.04 + Math.max(sh * 0.11, 2.4)} width={sw * 0.56} height={Math.max(sh * 0.07, 1.4)} rx="0.8" />
        </g>
      )}
      <rect x={sx} y={sy} width={sw} height={sh} rx="0.5" fill="none" className="stroke-foreground/10" strokeWidth="0.3" />
    </svg>
  );
}
