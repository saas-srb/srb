"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Full-bleed, campaign-driven hero background. Everything is derived from the campaign's own
 * `themePreset` + colours (or its uploaded `bannerImage`), so a new campaign gets a matching
 * look from the LMS with no frontend change. All artwork is inline SVG/CSS — no image downloads.
 */

const FALLBACK_PRIMARY = "var(--primary)";
const FALLBACK_ACCENT = "var(--brand-deep)";
const INK = "#0a0d16";

/** Deterministic pseudo-random so server and client render identical particle positions. */
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function Particles({ colors, count = 26, kind = "dot" }: { colors: string[]; count?: number; kind?: "dot" | "snow" | "confetti" }) {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const left = seeded(i, 1) * 100;
        const top = seeded(i, 2) * 100;
        const size = kind === "snow" ? 3 + seeded(i, 3) * 6 : kind === "confetti" ? 5 + seeded(i, 3) * 6 : 2 + seeded(i, 3) * 4;
        const dur = 6 + seeded(i, 4) * 9;
        const color = colors[i % colors.length];
        return (
          <motion.span
            key={i}
            className={kind === "confetti" ? "absolute rounded-[2px]" : "absolute rounded-full"}
            style={{ left: `${left}%`, top: `${top}%`, width: size, height: kind === "confetti" ? size * 0.6 : size, background: color, boxShadow: kind === "dot" ? `0 0 ${size * 3}px ${color}` : undefined, opacity: 0.85 }}
            animate={reduce ? undefined : kind === "snow" || kind === "confetti" ? { y: [0, 60 + seeded(i, 5) * 80], x: [0, (seeded(i, 6) - 0.5) * 50], rotate: kind === "confetti" ? [0, 220] : 0, opacity: [0, 0.9, 0] } : { y: [0, -30 - seeded(i, 5) * 50], opacity: [0.15, 0.95, 0.15] }}
            transition={{ duration: dur, repeat: Infinity, ease: "easeInOut", delay: seeded(i, 7) * 6 }}
          />
        );
      })}
    </div>
  );
}

/** Rangoli-style mandala: concentric rings + petal ring. */
function Mandala({ color, accent, className }: { color: string; accent: string; className?: string }) {
  const petals = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg viewBox="-200 -200 400 400" className={className} aria-hidden="true">
      <g fill="none" strokeWidth="1.4">
        {[190, 160, 120, 80, 42].map((r, i) => (
          <circle key={r} r={r} stroke={i % 2 ? accent : color} opacity={0.5 - i * 0.05} strokeDasharray={i % 2 ? "3 7" : undefined} />
        ))}
        {petals.map((a) => (
          <path key={a} d="M0 -120 C 22 -140, 22 -170, 0 -190 C -22 -170, -22 -140, 0 -120 Z" stroke={color} opacity="0.55" transform={`rotate(${a})`} />
        ))}
        {petals.map((a) => (
          <path key={`i${a}`} d="M0 -50 C 10 -62, 10 -76, 0 -86 C -10 -76, -10 -62, 0 -50 Z" stroke={accent} opacity="0.6" transform={`rotate(${a + 11})`} />
        ))}
      </g>
    </svg>
  );
}

/** Firework burst: radial spokes with bright tips. */
function Burst({ color, className, spokes = 28 }: { color: string; className?: string; spokes?: number }) {
  return (
    <svg viewBox="-100 -100 200 200" className={className} aria-hidden="true">
      {Array.from({ length: spokes }, (_, i) => {
        const a = (i / spokes) * Math.PI * 2;
        const r1 = 18 + seeded(i, 9) * 10;
        const r2 = 55 + seeded(i, 10) * 40;
        return (
          <g key={i}>
            <line x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2} stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
            <circle cx={Math.cos(a) * (r2 + 5)} cy={Math.sin(a) * (r2 + 5)} r="2.4" fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

/** Sun / spotlight rays. */
function Rays({ color, className, count = 22 }: { color: string; className?: string; count?: number }) {
  return (
    <svg viewBox="-200 -200 400 400" className={className} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <path key={i} d="M0 0 L-9 -190 L9 -190 Z" fill={color} opacity={i % 2 ? 0.16 : 0.3} transform={`rotate(${(i / count) * 360})`} />
      ))}
      <circle r="46" fill={color} opacity="0.55" />
    </svg>
  );
}

/** 24-spoke wheel (Ashoka-chakra style). */
function Chakra({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="-100 -100 200 200" className={className} aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth="1.6" opacity="0.6">
        <circle r="92" />
        <circle r="14" />
        {Array.from({ length: 24 }, (_, i) => (
          <line key={i} x1="0" y1="-14" x2="0" y2="-92" transform={`rotate(${i * 15})`} />
        ))}
      </g>
    </svg>
  );
}

/** Brand "orbit": rings + planets. Default for custom campaigns. */
function Orbits({ color, accent, className }: { color: string; accent: string; className?: string }) {
  return (
    <svg viewBox="-200 -200 400 400" className={className} aria-hidden="true">
      <g fill="none" strokeWidth="1.3">
        <ellipse rx="190" ry="70" stroke={color} opacity="0.5" transform="rotate(-25)" />
        <ellipse rx="150" ry="50" stroke={accent} opacity="0.5" transform="rotate(20)" />
        <circle r="95" stroke={color} opacity="0.3" strokeDasharray="2 8" />
      </g>
      <circle cx="-178" cy="-32" r="7" fill={color} />
      <circle cx="140" cy="52" r="5" fill={accent} />
      <circle cx="30" cy="-88" r="4" fill="#fff" opacity="0.8" />
      <circle r="24" fill={color} opacity="0.5" />
    </svg>
  );
}

function PresetArt({ preset, primary, accent }: { preset: string; primary: string; accent: string }) {
  const spin = "animate-[spin_120s_linear_infinite] motion-reduce:animate-none";
  switch (preset) {
    case "diwali":
      return (
        <>
          <Mandala color="#F5C542" accent={primary} className={`absolute -right-24 top-1/2 h-[720px] w-[720px] -translate-y-1/2 ${spin}`} />
          <Mandala color="#F5C542" accent={accent} className={`absolute -left-40 -bottom-40 h-[480px] w-[480px] opacity-60 ${spin} [animation-direction:reverse]`} />
          <Particles colors={["#FFD166", "#F5C542", "#FF9F45", "#FFF3B0"]} count={34} />
        </>
      );
    case "holi":
      return (
        <>
          {[["#FF3D81", "8%", "18%", 340], ["#2ED8A3", "78%", "12%", 380], ["#FFC933", "62%", "70%", 320], ["#7B5CFF", "20%", "74%", 360], ["#00B4FF", "48%", "34%", 260]].map(([c, l, t, s], i) => (
            <span key={i} className="absolute rounded-full blur-[70px]" style={{ background: c as string, left: l as string, top: t as string, width: s as number, height: s as number, opacity: 0.5 }} />
          ))}
          <Particles colors={["#FF3D81", "#2ED8A3", "#FFC933", "#7B5CFF", "#00B4FF"]} count={40} kind="confetti" />
        </>
      );
    case "new-year":
      return (
        <>
          <Burst color="#FFD166" className="absolute -left-10 -top-10 h-[420px] w-[420px]" />
          <Burst color={primary} className="absolute right-[6%] top-[2%] h-[360px] w-[360px]" spokes={22} />
          <Burst color="#9AD1FF" className="absolute right-[34%] bottom-[-8%] h-[300px] w-[300px]" spokes={18} />
          <Particles colors={["#FFD166", "#FFFFFF", primary, "#9AD1FF"]} count={36} kind="confetti" />
        </>
      );
    case "independence-day":
      return (
        <>
          <div className="absolute inset-0" style={{ background: "linear-gradient(115deg, rgba(255,153,51,0.38) 0%, rgba(255,153,51,0.05) 34%, transparent 42%, transparent 58%, rgba(19,136,8,0.05) 66%, rgba(19,136,8,0.38) 100%)" }} />
          <Chakra color="#7FA8FF" className={`absolute right-[8%] top-1/2 h-[460px] w-[460px] -translate-y-1/2 ${spin}`} />
          <Particles colors={["#FF9933", "#FFFFFF", "#22C55E"]} count={28} />
        </>
      );
    case "christmas":
      return (
        <>
          <Rays color="#FFD9A0" className="absolute -right-20 -top-28 h-[560px] w-[560px] opacity-40" count={16} />
          <Particles colors={["#FFFFFF", "#DCEBFF"]} count={56} kind="snow" />
          <Particles colors={["#FF5A5A", "#3DDC97", "#FFD166"]} count={18} />
        </>
      );
    case "summer-sale":
      return (
        <>
          <Rays color="#FFC24B" className={`absolute -right-32 -top-40 h-[760px] w-[760px] ${spin}`} />
          <Particles colors={["#FFE29A", "#FFB347", "#FFFFFF"]} count={26} />
        </>
      );
    case "back-to-college":
      return (
        <>
          <div className="absolute inset-0 opacity-[0.16]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at 70% 40%, black, transparent 70%)", WebkitMaskImage: "radial-gradient(ellipse at 70% 40%, black, transparent 70%)" }} />
          <Orbits color="#7FA8FF" accent={primary} className={`absolute -right-16 top-1/2 h-[560px] w-[560px] -translate-y-1/2 ${spin}`} />
          <Particles colors={["#7FA8FF", "#FFFFFF", primary]} count={26} />
        </>
      );
    default:
      return (
        <>
          <Orbits color={primary} accent="#9AD1FF" className={`absolute -right-20 top-1/2 h-[640px] w-[640px] -translate-y-1/2 ${spin}`} />
          <Particles colors={[primary, "#FFFFFF", accent]} count={30} />
        </>
      );
  }
}

export default function CampaignBackdrop({
  preset,
  primaryColor,
  accentColor,
  image,
}: {
  preset?: string;
  primaryColor?: string | null;
  accentColor?: string | null;
  image?: string | null;
}) {
  const primary = primaryColor || FALLBACK_PRIMARY;
  const accent = accentColor || FALLBACK_ACCENT;
  // Darken the campaign colours into a deep base so white text always has contrast, whatever colours an admin picks.
  const base = `linear-gradient(135deg, color-mix(in srgb, ${primary} 42%, ${INK}) 0%, ${INK} 52%, color-mix(in srgb, ${accent} 46%, ${INK}) 100%)`;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: base }} aria-hidden="true">
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="absolute inset-0 h-full w-full animate-[kenburns_28s_ease-in-out_infinite_alternate] object-cover opacity-70 motion-reduce:animate-none" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${INK}cc 0%, ${INK}66 45%, ${INK}d9 100%)` }} />
          <style>{`@keyframes kenburns{from{transform:scale(1)}to{transform:scale(1.08) translateY(-1.5%)}}`}</style>
        </>
      ) : (
        <PresetArt preset={preset ?? "custom"} primary={primary} accent={accent} />
      )}

      {/* colour glows + fine grain, on top of either artwork or photo */}
      <div className="absolute -left-[12%] -top-[25%] h-[70%] w-[60%] rounded-full blur-[130px]" style={{ background: primary, opacity: 0.38 }} />
      <div className="absolute -bottom-[30%] right-[-8%] h-[70%] w-[55%] rounded-full blur-[130px]" style={{ background: accent, opacity: 0.4 }} />
      <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence baseFrequency='.9' numOctaves='2'/></filter><rect width='120' height='120' filter='url(%23n)'/></svg>\")" }} />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
}
