"use client";

import { memo, useId, useMemo, useSyncExternalStore } from "react";
import { composeStoryboard, previewSeed, type FigureSpec, type Glyph, type RoomKind, type Storyboard, type StoryboardScene } from "@/lib/products/viralpulse-ai/ugc/styles/preview";
import { pickVariation, type UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";

/**
 * A stylised illustration of one storyboard beat: room, light, props and faceless figure silhouettes, all drawn from the style's own
 * catalogue data. It is deliberately flat and abstract: it shows composition, never a real person, photo or video.
 */

const W = 100;
export const heightFor = (aspect: string) => (aspect === "16:9" ? 56.25 : aspect === "1:1" ? 100 : 177.78);
const OUTDOOR = new Set<RoomKind>(["balcony", "market", "campus", "park", "rooftop", "courtyard", "farm", "travel", "temple"]);

/** Style + seed -> storyboard, memoised per component instance. */
export function useStoryboard(style: UgcStyle, seedN: number): Storyboard {
  return useMemo(() => composeStoryboard(style, pickVariation(style, previewSeed(seedN))), [style, seedN]);
}

function GlyphShape({ g, x, y, s, ink, glow }: { g: Glyph; x: number; y: number; s: number; ink: string; glow: string }) {
  const t = `translate(${x} ${y}) scale(${s})`;
  switch (g) {
    case "plant": return <g transform={t}><path d="M-4 0 L4 0 L3 -6 L-3 -6Z" fill={ink} /><path d="M0 -6 C-8 -10 -7 -18 0 -20 C7 -18 8 -10 0 -6Z" fill="hsl(140 35% 38%)" /><path d="M0 -6 L0 -16" stroke="hsl(140 35% 26%)" strokeWidth=".8" /></g>;
    case "mug": return <g transform={t}><rect x="-4" y="-7" width="8" height="7" rx="1.5" fill={ink} /><path d="M4 -5 q4 0 4 3 q0 3 -4 3" fill="none" stroke={ink} strokeWidth="1.2" /><path d="M-1 -9 q1 -2 0 -4 M2 -9 q1 -2 0 -4" stroke={glow} strokeWidth=".7" fill="none" opacity=".7" /></g>;
    case "lamp": return <g transform={t}><path d="M-5 -12 L5 -12 L3 -20 L-3 -20Z" fill={glow} /><rect x="-.8" y="-12" width="1.6" height="10" fill={ink} /><rect x="-4" y="-2" width="8" height="2" rx="1" fill={ink} /></g>;
    case "books": return <g transform={t}><rect x="-6" y="-3" width="12" height="3" fill="hsl(8 50% 45%)" /><rect x="-5" y="-6" width="10" height="3" fill="hsl(210 45% 42%)" /><rect x="-6.5" y="-9" width="11" height="3" fill="hsl(44 70% 50%)" /></g>;
    case "laptop": return <g transform={t}><rect x="-6" y="-9" width="12" height="8" rx="1" fill={ink} /><rect x="-5" y="-8" width="10" height="6" fill={glow} opacity=".8" /><path d="M-8 -1 L8 -1 L7 1 L-7 1Z" fill={ink} /></g>;
    case "lights": return <g transform={t}><path d="M-20 -2 Q0 8 20 -2" fill="none" stroke={ink} strokeWidth=".5" />{[-15, -8, 0, 8, 15].map((dx) => <circle key={dx} cx={dx} cy={Math.abs(dx) < 3 ? 3 : 2 - Math.abs(dx) / 14} r="1.3" fill={glow} />)}</g>;
    case "window": return <g transform={t}><rect x="-8" y="-14" width="16" height="14" fill={glow} opacity=".55" stroke={ink} strokeWidth="1" /><path d="M0 -14 V0 M-8 -7 H8" stroke={ink} strokeWidth=".8" /></g>;
    case "frame": return <g transform={t}><rect x="-5" y="-7" width="10" height="7" fill="none" stroke={ink} strokeWidth="1" /><path d="M-4 -1 L-1 -4 L1 -2 L3 -5 L4 -1Z" fill={ink} opacity=".5" /></g>;
    case "blanket": return <g transform={t}><path d="M-9 0 Q-9 -6 -2 -6 Q6 -6 9 0Z" fill="hsl(12 45% 52%)" /><path d="M-6 -2 H6" stroke="hsl(40 70% 80%)" strokeWidth=".6" /></g>;
    case "bottle": return <g transform={t}><rect x="-2.5" y="-12" width="5" height="12" rx="2" fill={ink} /><rect x="-1.2" y="-15" width="2.4" height="3" fill={ink} /></g>;
    case "bag": return <g transform={t}><rect x="-5" y="-9" width="10" height="9" rx="1" fill="hsl(30 40% 55%)" /><path d="M-2 -9 Q0 -14 2 -9" fill="none" stroke={ink} strokeWidth=".9" /></g>;
    case "plate": return <g transform={t}><ellipse cx="0" cy="-1" rx="7" ry="2" fill="hsl(0 0% 88%)" /><circle cx="-2" cy="-3" r="2" fill="hsl(34 70% 55%)" /><circle cx="2" cy="-3.2" r="1.7" fill="hsl(12 60% 50%)" /></g>;
    case "phone": return <g transform={t}><rect x="-3" y="-9" width="6" height="9" rx="1" fill={ink} /><rect x="-2.2" y="-8" width="4.4" height="6.5" fill={glow} opacity=".7" /></g>;
    case "diya": return <g transform={t}><path d="M-4 -1 Q0 3 4 -1Z" fill="hsl(18 60% 45%)" /><path d="M0 -2 Q-2 -6 0 -8 Q2 -6 0 -2Z" fill="hsl(40 100% 62%)" /></g>;
    case "flowers": return <g transform={t}>{[-6, -3, 0, 3, 6].map((dx, i) => <circle key={dx} cx={dx} cy={i % 2 ? -1 : 0} r="2" fill={i % 2 ? "hsl(30 95% 55%)" : "hsl(42 95% 55%)"} />)}</g>;
    case "sign": return <g transform={t}><rect x="-7" y="-9" width="14" height="8" rx="1" fill={ink} /><path d="M-5 -6 H5 M-5 -4 H2" stroke={glow} strokeWidth=".8" /></g>;
    case "clock": return <g transform={t}><circle cx="0" cy="-5" r="5" fill="hsl(0 0% 94%)" stroke={ink} strokeWidth=".9" /><path d="M0 -5 V-8 M0 -5 L2 -4" stroke={ink} strokeWidth=".8" /></g>;
    case "dumbbell": return <g transform={t}><rect x="-7" y="-4" width="14" height="1.6" fill={ink} /><rect x="-8" y="-6" width="3" height="5.6" rx=".6" fill={ink} /><rect x="5" y="-6" width="3" height="5.6" rx=".6" fill={ink} /></g>;
    case "board": return <g transform={t}><rect x="-9" y="-12" width="18" height="12" fill="hsl(0 0% 96%)" stroke={ink} strokeWidth=".9" /><path d="M-6 -8 L-2 -4 L2 -9 L6 -5" fill="none" stroke="hsl(210 60% 45%)" strokeWidth=".8" /></g>;
    case "tools": return <g transform={t}><rect x="-1" y="-11" width="2" height="11" fill={ink} /><rect x="-5" y="-12" width="10" height="3" rx="1" fill={ink} /><path d="M6 -2 L10 -9" stroke={ink} strokeWidth="1.4" /><circle cx="10.4" cy="-9.6" r="1.6" fill="none" stroke={ink} strokeWidth="1" /></g>;
    case "gem": return <g transform={t}><path d="M-5 -6 L-2 -10 L2 -10 L5 -6 L0 0Z" fill="hsl(200 60% 78%)" stroke={ink} strokeWidth=".6" /><path d="M-5 -6 H5 M-2 -10 L0 -6 L2 -10" stroke={ink} strokeWidth=".5" fill="none" /><path d="M7 -10 l1 2 l-2 -1 l2 0 l-2 1z" fill={glow} /></g>;
    case "mic": return <g transform={t}><rect x="-1" y="-10" width="2" height="10" fill={ink} /><circle cx="0" cy="-12" r="3" fill={ink} /><rect x="-4" y="-1.5" width="8" height="1.5" rx=".7" fill={ink} /></g>;
    case "crate": return <g transform={t}><rect x="-7" y="-8" width="14" height="8" fill="hsl(30 45% 52%)" stroke={ink} strokeWidth=".7" /><path d="M-7 -4 H7 M-2 -8 V0 M3 -8 V0" stroke={ink} strokeWidth=".6" /></g>;
    case "chair": return <g transform={t}><rect x="-4" y="-8" width="8" height="2" rx=".8" fill={ink} /><rect x="-4" y="-16" width="2" height="9" fill={ink} /><path d="M-3 -6 V0 M3 -6 V0" stroke={ink} strokeWidth="1.2" /></g>;
    case "keys": return <g transform={t}><circle cx="-3" cy="-5" r="3" fill="none" stroke={ink} strokeWidth="1.3" /><path d="M0 -5 H8 M6 -5 V-2 M8 -5 V-3" stroke={ink} strokeWidth="1.3" fill="none" /></g>;
    case "umbrella": return <g transform={t}><path d="M-8 -9 Q0 -20 8 -9 Q4 -11 0 -9 Q-4 -11 -8 -9Z" fill="hsl(8 55% 48%)" /><path d="M0 -9 V0 q0 1.6 -2 1.6" stroke={ink} strokeWidth="1" fill="none" /></g>;
    case "bell": return <g transform={t}><path d="M-5 -2 Q-5 -10 0 -10 Q5 -10 5 -2Z" fill="hsl(40 70% 50%)" /><circle cx="0" cy="0" r="1.2" fill={ink} /><path d="M0 -10 V-13" stroke={ink} strokeWidth=".8" /></g>;
    case "controller": return <g transform={t}><rect x="-7" y="-7" width="14" height="6" rx="3" fill={ink} /><circle cx="-3.5" cy="-4" r="1.1" fill={glow} /><circle cx="3.5" cy="-4" r="1.1" fill={glow} /></g>;
    default: return <g transform={t}><rect x="-5" y="-8" width="10" height="8" rx="1" fill="hsl(30 35% 60%)" /><path d="M-5 -5 H5" stroke={ink} strokeWidth=".6" opacity=".6" /></g>;
  }
}

/** The room behind everyone: a few flat shapes per room type. */
function Room({ room, H, ink, floorY, wall }: { room: RoomKind; H: number; ink: string; floorY: number; wall: string }) {
  const o = 0.55;
  const fy = floorY;
  switch (room) {
    case "bedroom": return <g fill={ink} opacity={o}><rect x="-4" y={fy - H * 0.16} width="78" height={H * 0.16} rx="3" /><rect x="6" y={fy - H * 0.22} width="30" height={H * 0.08} rx="4" opacity=".8" /></g>;
    case "living": case "festive": return <g fill={ink} opacity={o}><rect x="8" y={fy - H * 0.13} width="84" height={H * 0.13} rx="5" /><rect x="4" y={fy - H * 0.2} width="12" height={H * 0.2} rx="4" /><rect x="84" y={fy - H * 0.2} width="12" height={H * 0.2} rx="4" /><rect x="14" y={fy - H * 0.2} width="72" height={H * 0.08} rx="4" opacity=".7" /></g>;
    case "balcony": return <g stroke={ink} opacity={o} strokeWidth="1.2" fill="none"><path d={`M0 ${fy - H * 0.14} H100`} />{Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${i * 10} ${fy - H * 0.14} V${fy + 1}`} />)}</g>;
    case "kitchen": return <g fill={ink} opacity={o}><rect x="0" y={fy - H * 0.11} width="100" height={H * 0.11} /><circle cx="26" cy={fy - H * 0.11} r="0" /><rect x="10" y={fy - H * 0.14} width="22" height="2.2" rx="1" /><path d={`M70 ${fy - H * 0.36} V${fy - H * 0.3} M80 ${fy - H * 0.36} V${fy - H * 0.28}`} stroke={ink} strokeWidth="1" /></g>;
    case "cafe": return <g fill={ink} opacity={o}><rect x="14" y={fy - H * 0.12} width="72" height="2.6" rx="1.3" /><rect x="48" y={fy - H * 0.12} width="3" height={H * 0.12} /><rect x="64" y={fy - H * 0.42} width="26" height={H * 0.16} rx="1.5" opacity=".85" /></g>;
    case "office": case "study": return <g fill={ink} opacity={o}><rect x="0" y={fy - H * 0.1} width="100" height="3" /><rect x="52" y={fy - H * 0.2} width="22" height={H * 0.1} rx="1.5" /><rect x="60" y={fy - H * 0.1} width="6" height="2" /><rect x="8" y={fy - H * 0.46} width="30" height={H * 0.17} rx="1.5" opacity=".6" /></g>;
    case "market": return <g opacity={o}><path d={`M-2 ${fy - H * 0.28} L22 ${fy - H * 0.28} L18 ${fy - H * 0.22} L2 ${fy - H * 0.22}Z`} fill="hsl(8 60% 48%)" /><path d={`M62 ${fy - H * 0.3} L96 ${fy - H * 0.3} L92 ${fy - H * 0.23} L66 ${fy - H * 0.23}Z`} fill="hsl(44 80% 52%)" /><rect x="0" y={fy - H * 0.1} width="100" height={H * 0.1} fill={ink} /></g>;
    case "campus": return <g fill={ink} opacity={o}>{[0, 1, 2, 3].map((i) => <rect key={i} x={6 + i * 4} y={fy - H * 0.04 * (i + 1)} width={88 - i * 8} height={H * 0.04} />)}<circle cx="82" cy={fy - H * 0.3} r="10" opacity=".7" /><rect x="81" y={fy - H * 0.22} width="2" height={H * 0.1} /></g>;
    case "gym": return <g fill={ink} opacity={o}><rect x="6" y={fy - H * 0.24} width="38" height="2" /><rect x="6" y={fy - H * 0.24} width="2" height={H * 0.24} /><rect x="42" y={fy - H * 0.24} width="2" height={H * 0.24} />{[10, 18, 26, 34].map((x) => <circle key={x} cx={x} cy={fy - H * 0.2} r="2.6" />)}<rect x="60" y={fy - H * 0.5} width="34" height={H * 0.3} rx="1.5" fill={wall} stroke={ink} strokeWidth=".8" opacity=".9" /></g>;
    case "shop": return <g fill={ink} opacity={o}><rect x="0" y={fy - H * 0.12} width="100" height={H * 0.12} /><rect x="6" y={fy - H * 0.5} width="88" height="2" /><rect x="6" y={fy - H * 0.36} width="88" height="2" />{[12, 28, 44, 62, 78].map((x) => <rect key={x} x={x} y={fy - H * 0.43} width="8" height={H * 0.07} />)}</g>;
    case "car": return <g fill={ink} opacity=".7"><path d={`M0 ${fy - H * 0.08} Q50 ${fy - H * 0.2} 100 ${fy - H * 0.08} V${H} H0Z`} /><circle cx="76" cy={fy - H * 0.02} r="10" fill="none" stroke={ink} strokeWidth="2" /></g>;
    case "park": return <g opacity={o}>{[14, 54, 86].map((x) => <g key={x}><rect x={x - 1} y={fy - H * 0.2} width="2" height={H * 0.2} fill={ink} /><circle cx={x} cy={fy - H * 0.27} r="10" fill="hsl(130 30% 36%)" /></g>)}<rect x="26" y={fy - H * 0.06} width="26" height="2.6" rx="1" fill={ink} /></g>;
    case "rooftop": return <g fill={ink} opacity={o}><rect x="0" y={fy - H * 0.06} width="100" height={H * 0.06} /><rect x="70" y={fy - H * 0.22} width="18" height={H * 0.16} rx="2" /><rect x="8" y={fy - H * 0.16} width="14" height={H * 0.1} /><rect x="26" y={fy - H * 0.2} width="12" height={H * 0.14} /></g>;
    case "dining": return <g fill={ink} opacity={o}><rect x="8" y={fy - H * 0.1} width="84" height="3" rx="1.5" /><rect x="14" y={fy - H * 0.1} width="2.5" height={H * 0.1} /><rect x="83" y={fy - H * 0.1} width="2.5" height={H * 0.1} /><path d={`M50 0 V${H * 0.12}`} stroke={ink} strokeWidth=".8" /><path d={`M43 ${H * 0.12} H57 L54 ${H * 0.09} H46Z`} /></g>;
    case "mirror": return <g opacity={o}><ellipse cx="50" cy={fy - H * 0.3} rx="22" ry={H * 0.25} fill={wall} stroke={ink} strokeWidth="1.6" /><rect x="6" y={fy - H * 0.1} width="88" height="3" fill={ink} /></g>;
    case "doorway": return <g fill={ink} opacity={o}><rect x="26" y={fy - H * 0.5} width="48" height={H * 0.5} rx="2" /><circle cx="68" cy={fy - H * 0.25} r="1.6" fill={wall} /><rect x="30" y={fy - 1} width="40" height="2.4" rx="1" fill="hsl(8 55% 42%)" /></g>;
    case "courtyard": return <g opacity={o}><path d={`M4 ${fy} V${fy - H * 0.3} Q50 ${fy - H * 0.52} 96 ${fy - H * 0.3} V${fy}`} fill="none" stroke={ink} strokeWidth="2.4" /></g>;
    case "reception": return <g fill={ink} opacity={o}><rect x="14" y={fy - H * 0.12} width="58" height={H * 0.12} rx="1.5" /><rect x="10" y={fy - H * 0.13} width="66" height="2.4" rx="1" /><rect x="68" y={fy - H * 0.46} width="26" height={H * 0.18} rx="1.5" opacity=".7" /><rect x="76" y={fy - H * 0.07} width="18" height="2.4" rx="1" /></g>;
    case "salon": return <g opacity={o}><rect x="14" y={fy - H * 0.5} width="40" height={H * 0.34} rx="2" fill={wall} stroke={ink} strokeWidth="1.4" />{[18, 26, 34, 42, 50].map((x) => <circle key={x} cx={x} cy={fy - H * 0.52} r="1.2" fill="hsl(44 100% 80%)" />)}<rect x="62" y={fy - H * 0.2} width="14" height={H * 0.08} rx="3" fill={ink} /><rect x="64" y={fy - H * 0.31} width="10" height={H * 0.11} rx="2" fill={ink} /></g>;
    case "restaurant": return <g fill={ink} opacity={o}><rect x="0" y={fy - H * 0.13} width="100" height={H * 0.13} /><rect x="6" y={fy - H * 0.44} width="88" height="2" />{[14, 28, 42, 58, 72, 86].map((x) => <rect key={x} x={x} y={fy - H * 0.42} width="5" height={H * 0.06} fill="hsl(44 40% 90%)" />)}<rect x="10" y={fy - H * 0.18} width="30" height={H * 0.05} rx="2" opacity=".7" /></g>;
    case "workshop": return <g fill={ink} opacity={o}><rect x="0" y={fy - H * 0.12} width="100" height="3.4" /><rect x="6" y={fy - H * 0.12} width="3" height={H * 0.12} /><rect x="90" y={fy - H * 0.12} width="3" height={H * 0.12} /><rect x="10" y={fy - H * 0.5} width="52" height={H * 0.26} rx="1.5" opacity=".55" />{[16, 28, 40, 52].map((x) => <path key={x} d={`M${x} ${fy - H * 0.46} v${H * 0.12}`} stroke={wall} strokeWidth="1.4" />)}</g>;
    case "showroom": return <g opacity={o}><rect x="0" y={fy - 1} width="100" height="1.6" fill={ink} opacity=".5" /><rect x="8" y={fy - H * 0.5} width="46" height={H * 0.32} fill={wall} stroke={ink} strokeWidth="1" opacity=".9" /><rect x="64" y={fy - H * 0.09} width="24" height={H * 0.09} rx="1.5" fill={ink} /><rect x="14" y={fy - H * 0.07} width="16" height={H * 0.07} rx="1.5" fill={ink} /></g>;
    case "warehouse": return <g fill="none" stroke={ink} strokeWidth="1.2" opacity={o}>{[6, 38, 70].map((x) => <g key={x}><path d={`M${x} ${fy} V${fy - H * 0.52} M${x + 24} ${fy} V${fy - H * 0.52}`} />{[0.14, 0.28, 0.42].map((h) => <path key={h} d={`M${x} ${fy - H * h} H${x + 24}`} />)}</g>)}</g>;
    case "classroom": return <g opacity={o}><rect x="14" y={fy - H * 0.52} width="72" height={H * 0.24} rx="1.5" fill="hsl(150 25% 26%)" stroke={ink} strokeWidth="1.4" /><path d={`M22 ${fy - H * 0.44} H44 M22 ${fy - H * 0.39} H36`} stroke="white" strokeWidth=".8" opacity=".7" />{[12, 40, 68].map((x) => <rect key={x} x={x} y={fy - H * 0.1} width="20" height="2.6" fill={ink} />)}</g>;
    case "farm": return <g opacity={o}>{[10, 24, 38, 54, 70, 86].map((x, i) => <path key={x} d={`M${x} ${H}  L${50 + (x - 50) * 0.35} ${fy - H * 0.04}`} stroke="hsl(110 35% 32%)" strokeWidth={2 + (i % 2)} />)}<rect x="0" y={fy - H * 0.05} width="100" height={H * 0.05} fill="hsl(105 30% 36%)" /><circle cx="82" cy={fy - H * 0.2} r="9" fill="hsl(130 30% 32%)" /><rect x="81" y={fy - H * 0.12} width="2" height={H * 0.08} fill={ink} /></g>;
    case "jewellery": return <g opacity={o}><rect x="6" y={fy - H * 0.14} width="88" height={H * 0.14} fill={ink} /><rect x="10" y={fy - H * 0.2} width="80" height={H * 0.06} fill="hsl(200 30% 80%)" opacity=".5" stroke={ink} strokeWidth=".8" /><path d={`M30 0 L22 ${fy - H * 0.2} H38Z M70 0 L62 ${fy - H * 0.2} H78Z`} fill="hsl(44 100% 80%)" opacity=".35" /></g>;
    case "flat": return <g opacity={o}><rect x="8" y={fy - H * 0.5} width="40" height={H * 0.4} fill={wall} stroke={ink} strokeWidth="1.4" /><path d={`M28 ${fy - H * 0.5} V${fy - H * 0.1} M8 ${fy - H * 0.3} H48`} stroke={ink} strokeWidth="1" /><rect x="62" y={fy - H * 0.5} width="26" height={H * 0.5} fill={wall} stroke={ink} strokeWidth="1.4" /><rect x="0" y={fy - 1} width="100" height="1.2" fill={ink} opacity=".5" /></g>;
    case "travel": return <g opacity={o}><path d={`M0 ${fy - H * 0.12} Q22 ${fy - H * 0.3} 44 ${fy - H * 0.16} Q70 ${fy - H * 0.34} 100 ${fy - H * 0.14} V${fy} H0Z`} fill="hsl(210 25% 46%)" /><circle cx="78" cy={fy - H * 0.4} r="6" fill="hsl(44 100% 78%)" opacity=".9" /><path d={`M0 ${fy - H * 0.05} H100`} stroke={ink} strokeWidth="1.6" />{Array.from({ length: 11 }, (_, i) => <path key={i} d={`M${i * 10} ${fy - H * 0.05} V${fy + 1}`} stroke={ink} strokeWidth="1" />)}</g>;
    case "stage": return <g opacity={o}><rect x="8" y={fy - H * 0.46} width="84" height={H * 0.24} rx="1.5" fill="hsl(250 30% 30%)" /><rect x="0" y={fy - H * 0.14} width="100" height={H * 0.14} fill={ink} /><rect x="44" y={fy - H * 0.26} width="12" height={H * 0.12} fill={wall} stroke={ink} strokeWidth=".8" /><path d={`M24 0 L12 ${fy - H * 0.14} H36Z M76 0 L64 ${fy - H * 0.14} H88Z`} fill="hsl(44 100% 80%)" opacity=".25" /></g>;
    case "studio": return <g fill={ink} opacity={o}><rect x="10" y={fy - H * 0.44} width="46" height={H * 0.24} rx="1.5" fill={wall} stroke={ink} strokeWidth="1.2" /><rect x="0" y={fy - H * 0.1} width="100" height="3" /><rect x="74" y={fy - H * 0.3} width="3" height={H * 0.2} /><path d={`M70 ${fy - H * 0.3} H82 L79 ${fy - H * 0.38} H73Z`} fill="hsl(44 100% 80%)" /></g>;
    case "screen": return <g fill={ink} opacity=".35"><rect x="0" y={fy + H * 0.14} width="100" height={H * 0.16} /></g>;
    case "factory": return <g fill={ink} opacity={o}><rect x="8" y={fy - H * 0.34} width="30" height={H * 0.34} rx="2" /><rect x="44" y={fy - H * 0.2} width="48" height={H * 0.05} /><rect x="48" y={fy - H * 0.15} width="40" height="2" /><path d={`M0 ${fy + 2} H100`} stroke="hsl(48 90% 55%)" strokeWidth="1.6" strokeDasharray="4 3" /></g>;
    case "site": return <g opacity={o}><path d={`M10 ${fy} L22 ${fy - H * 0.5} M26 ${fy} L22 ${fy - H * 0.5}`} stroke={ink} strokeWidth="1.4" fill="none" />{[0.1, 0.2, 0.3, 0.4].map((h) => <path key={h} d={`M${12 + h * 10} ${fy - H * h} H${24 - h * 6}`} stroke={ink} strokeWidth="1" />)}{[52, 66, 80].map((x) => <rect key={x} x={x} y={fy - H * 0.3} width="3" height={H * 0.3} fill={ink} opacity=".5" />)}<rect x="62" y={fy - H * 0.06} width="8" height={H * 0.06} fill="hsl(8 55% 48%)" /></g>;
    case "venue": return <g opacity={o}><path d={`M22 ${fy} V${fy - H * 0.32} Q50 ${fy - H * 0.6} 78 ${fy - H * 0.32} V${fy}`} fill="none" stroke="hsl(36 90% 55%)" strokeWidth="3" />{[26, 40, 50, 60, 74].map((x, i) => <circle key={x} cx={x} cy={fy - H * (0.36 + (i === 2 ? 0.14 : i % 3 === 0 ? 0.02 : 0.08))} r="2.4" fill={i % 2 ? "hsl(8 80% 60%)" : "hsl(44 95% 58%)"} />)}<rect x="0" y={fy - H * 0.05} width="100" height={H * 0.05} fill={ink} /></g>;
    case "rain": return <g opacity={o}><rect x="14" y={fy - H * 0.5} width="72" height={H * 0.4} fill={wall} stroke={ink} strokeWidth="1.6" />{[24, 36, 48, 60, 72, 30, 54, 66].map((x, i) => <path key={x} d={`M${x} ${fy - H * (0.46 - (i % 3) * 0.05)} v${H * 0.05}`} stroke="hsl(205 60% 80%)" strokeWidth=".8" />)}<rect x="10" y={fy - H * 0.09} width="80" height="3" fill={ink} /></g>;
    case "puja": return <g opacity={o}><rect x="22" y={fy - H * 0.2} width="56" height="3" fill={ink} /><rect x="26" y={fy - H * 0.2} width="2.4" height={H * 0.2} fill={ink} /><rect x="72" y={fy - H * 0.2} width="2.4" height={H * 0.2} fill={ink} /><path d={`M50 ${fy - H * 0.2} q-3 -5 0 -9 q3 4 0 9z`} fill="hsl(40 100% 62%)" /><rect x="30" y={fy - H * 0.5} width="40" height={H * 0.22} rx="2" fill={wall} stroke={ink} strokeWidth="1" /></g>;
    case "temple": return <g opacity={o}>{[10, 34, 58, 82].map((x) => <rect key={x} x={x} y={fy - H * 0.5} width="7" height={H * 0.5} fill={ink} />)}<rect x="4" y={fy - H * 0.54} width="92" height="4" fill={ink} /><circle cx="46" cy={fy - H * 0.4} r="2" fill="hsl(40 70% 50%)" /><path d={`M0 ${fy} H100`} stroke={ink} strokeWidth="1" opacity=".5" /></g>;
    case "gaming": return <g opacity={o}><rect x="8" y={fy - H * 0.1} width="84" height="3" fill={ink} /><rect x="20" y={fy - H * 0.36} width="40" height={H * 0.2} rx="2" fill={ink} /><rect x="22.5" y={fy - H * 0.34} width="35" height={H * 0.16} fill="hsl(260 70% 55%)" opacity=".75" /><rect x="64" y={fy - H * 0.3} width="22" height={H * 0.14} rx="2" fill={ink} /><path d={`M8 ${fy - H * 0.5} H92`} stroke="hsl(280 80% 60%)" strokeWidth="1.4" opacity=".8" /></g>;
    default: return <rect x="0" y={fy - 1.2} width="100" height="1.2" fill={ink} opacity=".35" />;
  }
}

function Figure({ f, H, ink, speaking, id }: { f: FigureSpec; H: number; ink: string; speaking: boolean; id: string }) {
  const hF = f.size * H;
  const cx = f.x * W;
  const feet = f.y * H;
  const headR = hF * 0.1;
  const headY = feet - hF * 0.9;
  const shoulderY = headY + headR * 1.9;
  const shoulderW = hF * 0.2;
  const waistY = feet - hF * 0.42;
  const body = f.back ? "hsl(220 15% 24%)" : f.tint;
  const skin = f.back ? "hsl(220 14% 30%)" : "hsl(215 10% 72%)";
  const showLegs = f.size < 0.66;
  const lean = f.facing * headR * 0.25;
  return (
    <g>
      {showLegs && <g fill={ink} opacity=".8"><rect x={cx - shoulderW * 0.55} y={waistY} width={shoulderW * 0.45} height={feet - waistY} rx="1" /><rect x={cx + shoulderW * 0.1} y={waistY} width={shoulderW * 0.45} height={feet - waistY} rx="1" /></g>}
      <path d={`M${cx - shoulderW} ${waistY + (showLegs ? 0 : hF)} V${shoulderY + headR} Q${cx - shoulderW} ${shoulderY} ${cx - shoulderW * 0.45} ${shoulderY - headR * 0.3} L${cx + shoulderW * 0.45} ${shoulderY - headR * 0.3} Q${cx + shoulderW} ${shoulderY} ${cx + shoulderW} ${shoulderY + headR} V${waistY + (showLegs ? 0 : hF)}Z`} fill={body} />
      <rect x={cx - headR * 0.4} y={headY + headR * 0.8} width={headR * 0.8} height={headR * 1.2} fill={skin} />
      <circle cx={cx + lean} cy={headY} r={headR} fill={skin} />
      {!f.back && <path d={`M${cx + lean - headR} ${headY - headR * 0.1} Q${cx + lean} ${headY - headR * 1.5} ${cx + lean + headR} ${headY - headR * 0.1} Q${cx + lean} ${headY - headR * 0.7} ${cx + lean - headR} ${headY - headR * 0.1}Z`} fill={ink} opacity=".55" />}
      {f.back && <circle cx={cx + lean} cy={headY} r={headR} fill={ink} opacity=".45" />}
      {speaking && !f.back && (
        <g transform={`translate(${Math.min(88, Math.max(12, cx + headR * 1.8))} ${Math.max(6, headY - headR * 2.1)})`} aria-hidden>
          <rect x="-7" y="-4" width="14" height="7" rx="3.5" fill="white" opacity=".92" />
          <circle cx="-3" cy="-.5" r=".9" fill={ink} /><circle cx="0" cy="-.5" r=".9" fill={ink} /><circle cx="3" cy="-.5" r=".9" fill={ink} />
          <path d="M-2 3 L-3.5 5.5 L1 3Z" fill="white" opacity=".92" />
        </g>
      )}
      <title>{`${id}`}</title>
    </g>
  );
}

/** A large simple phone screen with generic cards: used for screen-recording framings. */
function ScreenMock({ H, ink, glow, role }: { H: number; ink: string; glow: string; role: string }) {
  const w = 46;
  const h = Math.min(H * 0.66, 92);
  const x = 28;
  const y = H * 0.06;
  return (
    <g>
      <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx="6" fill={ink} />
      <rect x={x} y={y} width={w} height={h} rx="5" fill="hsl(210 30% 96%)" />
      <rect x={x + 4} y={y + 6} width={w - 8} height="7" rx="2" fill="hsl(215 70% 55%)" />
      <rect x={x + 4} y={y + 17} width={w - 8} height="12" rx="2" fill="white" stroke="hsl(215 20% 85%)" strokeWidth=".5" />
      <rect x={x + 4} y={y + 32} width={w - 8} height="12" rx="2" fill="white" stroke="hsl(215 20% 85%)" strokeWidth=".5" />
      <rect x={x + 4} y={y + 47} width={(w - 8) * (role === "proof" ? 0.8 : role === "body" ? 0.5 : 0.25)} height="3" rx="1.5" fill="hsl(150 55% 42%)" />
      <circle cx={x + w * 0.62} cy={y + 38} r="4.2" fill={glow} opacity=".55" stroke="hsl(215 70% 55%)" strokeWidth=".7" />
    </g>
  );
}

/** Three swipe cards, the middle one in focus, with page dots. */
function CarouselMock({ H, ink, glow, role }: { H: number; ink: string; glow: string; role: string }) {
  const h = Math.min(H * 0.6, 84);
  const y = H * 0.08;
  const card = (x: number, o: number, c: string, k: string) => (
    <g key={k} opacity={o}>
      <rect x={x} y={y} width="44" height={h} rx="4" fill={c} stroke={ink} strokeWidth=".6" />
      <rect x={x + 5} y={y + 7} width="26" height="4" rx="2" fill={ink} opacity=".7" />
      <rect x={x + 5} y={y + 15} width="34" height="2.4" rx="1.2" fill={ink} opacity=".35" />
      <rect x={x + 5} y={y + 20} width="28" height="2.4" rx="1.2" fill={ink} opacity=".35" />
    </g>
  );
  const dot = role === "hook" ? 0 : role === "body" ? 1 : role === "proof" ? 2 : 3;
  return (
    <g>
      {card(-26, 0.55, "hsl(40 80% 90%)", "l")}
      {card(82, 0.55, "hsl(200 70% 90%)", "r")}
      {card(28, 1, "white", "m")}
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={41 + i * 6} cy={y + h + 6} r="1.4" fill={i === dot ? ink : glow} opacity={i === dot ? 0.9 : 0.6} />)}
    </g>
  );
}

export interface SceneArtProps {
  board: Storyboard;
  scene: StoryboardScene;
  className?: string;
  /** Slow camera drift while a beat is on screen. */
  drift?: boolean;
}

function SceneArtBase({ board, scene, className, drift = false }: SceneArtProps) {
  const uid = useId().replace(/:/g, "");
  const H = heightFor(board.aspect);
  const p = board.palette;
  const outdoor = OUTDOOR.has(board.room);
  const floorY = outdoor ? H * 0.74 : H * 0.7;
  const split = scene.split;
  const propScale = scene.prominentProp ? 1.7 : 1;
  const propY = scene.framing === "pov" || scene.framing === "topdown" ? H * 0.62 : floorY + H * 0.05;
  const propXs = [28, 50, 72];
  const hand = (x: number, rot: number) => <g key={x} transform={`translate(${x} ${H * 0.98}) rotate(${rot})`}><rect x="-6" y={-H * 0.2} width="12" height={H * 0.24} rx="6" fill="hsl(25 30% 62%)" /></g>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Illustration: ${board.settingLabel}, ${board.timeOfDay}, ${scene.framing.replace("-", " ")} framing`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.top[0]} /><stop offset="1" stopColor={p.top[1]} /></linearGradient>
        <radialGradient id={`${uid}g`} cx=".5" cy=".4" r=".7"><stop offset="0" stopColor={p.glow} stopOpacity={p.glowStrength} /><stop offset="1" stopColor={p.glow} stopOpacity="0" /></radialGradient>
      </defs>
      <g data-ugc-motion={drift ? "" : undefined} style={drift ? { transformOrigin: "50% 50%", animation: "ugc-drift 3.6s ease-in-out both" } : undefined}>
        <rect width={W} height={H} fill={outdoor ? `url(#${uid}s)` : p.wall} />
        {!outdoor && <rect width={W} height={floorY * 0.5} fill={`url(#${uid}s)`} opacity=".35" />}
        {outdoor && <g fill={p.ink} opacity=".28">{[0, 14, 30, 46, 62, 80].map((x, i) => <rect key={x} x={x} y={floorY - H * (0.06 + ((i * 37) % 11) / 100)} width={12 + (i % 3) * 3} height={H * 0.4} />)}</g>}
        <rect y={floorY} width={W} height={H - floorY} fill={p.floor} />
        <Room room={board.room} H={H} ink={p.ink} floorY={floorY} wall={p.wall} />
        {board.decor.includes("window") && !["car", "mirror", "doorway"].includes(board.room) && <GlyphShape g="window" x={outdoor ? 84 : 78} y={H * 0.34} s={1.3} ink={p.ink} glow={p.glow} />}
        {board.decor.includes("lights") && <GlyphShape g="lights" x={50} y={H * 0.08} s={2.4} ink={p.ink} glow={p.glow} />}
        {board.decor.includes("frame") && <GlyphShape g="frame" x={22} y={H * 0.28} s={1.4} ink={p.ink} glow={p.glow} />}
        {board.decor.includes("plant") && <GlyphShape g="plant" x={90} y={floorY + H * 0.02} s={1.5} ink={p.ink} glow={p.glow} />}
        <rect width={W} height={H} fill={`url(#${uid}g)`} />
        {split && <rect x={W / 2} width={W / 2} height={H} fill={p.dark ? "white" : "black"} opacity=".08" />}
        {scene.framing === "screen-rec" && <ScreenMock H={H} ink={p.ink} glow={p.glow} role={scene.role} />}
        {scene.framing === "carousel" && <CarouselMock H={H} ink={p.ink} glow={p.glow} role={scene.role} />}
        {scene.figures.map((f) => (
          <Figure key={f.actor} f={f} H={H} ink={p.ink} id={`Stylised figure ${f.actor + 1}`} speaking={f.actor === scene.lead && !f.back} />
        ))}
        {(scene.framing === "pov" || scene.framing === "topdown") && <g opacity=".9">{hand(36, -8)}{hand(64, 8)}</g>}
        {scene.framing === "anchor" && <g><rect x="0" y={H * 0.78} width={W} height={H * 0.22} fill={p.ink} opacity=".9" /><rect x="0" y={H * 0.78} width={W} height="1.4" fill={p.glow} opacity=".8" /><rect x="8" y={H * 0.68} width="56" height="6" rx="1" fill="white" opacity=".92" /><rect x="8" y={H * 0.68} width="3" height="6" fill="hsl(8 70% 50%)" /><path d={`M14 ${H * 0.7} H52`} stroke={p.ink} strokeWidth="1" opacity=".6" /></g>}
        {scene.framing !== "screen-rec" && scene.framing !== "carousel" && scene.props.map((g, i) => <GlyphShape key={g} g={g} x={propXs[i] ?? 50} y={propY} s={propScale} ink={p.ink} glow={p.glow} />)}
        {scene.framing === "mirror" && <ellipse cx="50" cy={H * 0.5} rx="46" ry={H * 0.46} fill="none" stroke="white" strokeOpacity=".5" strokeWidth="1.4" />}
      </g>
      {split && <path d={`M${W / 2} 0 V${H}`} stroke="white" strokeWidth="1.2" />}
      {(scene.framing === "tripod" || scene.framing === "wide") && <path d={`M6 14 V6 H14 M${W - 14} 6 H${W - 6} V14 M6 ${H - 14} V${H - 6} H14 M${W - 14} ${H - 6} H${W - 6} V${H - 14}`} stroke="white" strokeOpacity=".7" strokeWidth=".8" fill="none" />}
      {scene.framing === "selfie" && <circle cx={W / 2} cy="5" r="1.6" fill="white" opacity=".7" />}
    </svg>
  );
}

export const SceneArt = memo(SceneArtBase);

export const DRIFT_KEYFRAMES = `@keyframes ugc-drift{from{transform:scale(1)}to{transform:scale(1.07)}}@media (prefers-reduced-motion:reduce){[data-ugc-motion]{animation:none!important}}`;

const REDUCED = "(prefers-reduced-motion: reduce)";
/** True when the person asked their system for less motion: nothing auto-plays then, and every step is manual. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(REDUCED);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false
  );
}
