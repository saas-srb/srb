"use client";

import { useMemo } from "react";
import { qrToSvgPath } from "@/lib/products/cohort-ai/qrcode";

/** Renders a scannable QR as inline SVG. Falls back to nothing on encode error. */
export default function CertificateQr({ url, size = 160, className }: { url: string; size?: number; className?: string }) {
  const qr = useMemo(() => {
    try {
      return qrToSvgPath(url);
    } catch {
      return null;
    }
  }, [url]);

  if (!qr) return null;
  const quiet = 4;
  const dim = qr.size + quiet * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label="Certificate verification QR code"
    >
      <rect width={dim} height={dim} fill="#fff" />
      <g transform={`translate(${quiet},${quiet})`} fill="#000">
        <path d={qr.path} />
      </g>
    </svg>
  );
}
