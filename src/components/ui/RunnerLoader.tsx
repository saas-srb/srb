/**
 * A small cartoon runner in the company's brand colour (the shirt and cap are the theme's primary). Pure SVG + CSS: no library, no
 * script, nothing to download, so it paints with the first bytes. Server component; with reduced motion it stands still.
 *  - scene "run" (loading): it sprints along a scrolling track, swings its limbs, kicks up dust and speed lines, and hops a crate
 *    that slides in — a 3 s loop.
 *  - scene "lost" (404, no workspace): it has stopped at a leaning signpost (text from `sign`), scratches its head and wonders,
 *    with question marks floating up.
 */
const HEAD = "#FFD9B8";
const JEANS = "#334155";

type Rest = { a: number; b: number; scratch?: boolean };

function Limb({ x, y, delay, kind, rest }: { x: number; y: number; delay: string; kind: "leg" | "arm"; rest?: Rest }) {
  const len = kind === "leg" ? 15 : 12;
  // A resting limb is posed (angles in degrees) instead of animated; `scratch` raises the hand to the head and rubs it.
  const upper = rest ? { className: rest.scratch ? "run-scratch" : "", style: { transformOrigin: "0 0", transform: `rotate(${rest.a}deg)` } } : { className: kind === "leg" ? "run-thigh" : "run-arm", style: { animationDelay: delay } };
  const lower = rest ? { className: rest.scratch ? "run-scratch-fore" : "", style: { transformOrigin: "0 0", transform: `rotate(${rest.b}deg)` } } : { className: kind === "leg" ? "run-shin" : "run-forearm", style: { animationDelay: delay } };
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={upper.className} style={upper.style}>
        <line x1="0" y1="0" x2="0" y2={len} strokeWidth={kind === "leg" ? 6 : 5} strokeLinecap="round" className={kind === "leg" ? "" : "rl-s-primary"} stroke={kind === "leg" ? JEANS : undefined} />
        <g transform={`translate(0 ${len})`}>
          <g className={lower.className} style={lower.style}>
            <line x1="0" y1="0" x2="0" y2={len} strokeWidth={kind === "leg" ? 5.5 : 4.5} strokeLinecap="round" stroke={kind === "leg" ? JEANS : HEAD} />
            {kind === "leg" ? <ellipse cx="3" cy={len + 1} rx="6" ry="3.2" className="rl-f-foreground" /> : <circle cx="0" cy={len + 1} r="3" fill={HEAD} />}
          </g>
        </g>
      </g>
    </g>
  );
}

export default function RunnerLoader({ width = "22rem", scene = "run", sign = "404" }: { width?: string; scene?: "run" | "lost"; sign?: string }) {
  const lost = scene === "lost";
  return (
    <svg viewBox="0 0 320 110" role="img" aria-label={lost ? "Lost" : "Loading"} className="rl" style={{ ["--rl-w" as string]: width }}>
      {/* parallax clouds */}
      <g className="rl-f-primary-10">
        <g className="run-cloud" style={{ animationDuration: "9s" }}><ellipse cx="300" cy="22" rx="22" ry="7" /><ellipse cx="288" cy="18" rx="12" ry="7" /></g>
        <g className="run-cloud" style={{ animationDuration: "13s", animationDelay: "-6s" }}><ellipse cx="300" cy="46" rx="16" ry="5" /><ellipse cx="292" cy="43" rx="9" ry="5" /></g>
      </g>

      {/* ground */}
      <line x1="0" y1="92" x2="320" y2="92" strokeWidth="3" strokeLinecap="round" className="rl-s-border" />
      <line x1="0" y1="98" x2="320" y2="98" strokeWidth="2" strokeLinecap="round" strokeDasharray="16 14" className={`${lost ? "" : "run-ground "}rl-s-primary-40`} />

      {lost ? (
        <g transform="translate(236 0)">
          {/* a signpost that has seen better days */}
          <g className="run-sign">
            <rect x="-2.5" y="40" width="5" height="52" rx="2" className="rl-f-muted-foreground-60" />
            <g transform="rotate(-6 0 44)">
              <rect x="-30" y="22" width="60" height="26" rx="6" strokeWidth="2.5" className="rl-f-card rl-s-primary" />
              <text x="0" y="40" textAnchor="middle" fontSize={sign.length > 6 ? 10 : sign.length > 3 ? 12 : 17} fontWeight="900" className="rl-f-primary">{sign}</text>
              <path d="M-30 30l9 3-6 5" strokeWidth="1.5" fill="none" strokeLinecap="round" className="rl-s-primary-40" />
            </g>
          </g>
        </g>
      ) : (
        /* crate to hop over */
        <g className="run-crate">
          <rect x="0" y="76" width="16" height="16" rx="3" strokeWidth="2.5" className="rl-f-primary-15 rl-s-primary" />
          <path d="M3 79l10 10M13 79L3 89" strokeWidth="2" strokeLinecap="round" className="rl-s-primary-60" />
        </g>
      )}

      {/* runner (x = 96, or further along when it has stopped) */}
      <g transform={`translate(${lost ? 150 : 96} 0)`}>
        <ellipse cx="2" cy="92" rx="16" ry="3.2" className={`${lost ? "" : "run-shadow "}rl-f-foreground-15`} />
        {/* dust + speed lines trail behind */}
        {!lost && [0, 1, 2].map((i) => (
          <circle key={i} cx="-12" cy="88" r="4" className="run-dust rl-f-muted-foreground-40" style={{ animationDelay: `${-i * 0.2}s` }} />
        ))}
        {!lost && [0, 1, 2].map((i) => (
          <line key={i} x1="-30" y1={40 + i * 14} x2={-48 - i * 4} y2={40 + i * 14} strokeWidth="2.5" strokeLinecap="round" className="run-speed rl-s-primary-50" style={{ animationDelay: `${-i * 0.25}s` }} />
        ))}

        {lost && [0, 1, 2].map((i) => (
          <text key={i} x={-6 + i * 12} y="-2" fontSize={14 + i * 2} fontWeight="900" textAnchor="middle" className="run-wonder-q rl-f-primary" style={{ animationDelay: `${i * 0.7}s` }}>?</text>
        ))}
        <g className={lost ? "" : "run-jump"}>
          <g className={lost ? "run-wonder" : "run-bob"}>
            <g transform="translate(0 52) rotate(8)" >
              <g transform="translate(0 -52)">
                {/* back arm + leg */}
                <Limb kind="arm" x={0} y={34} delay="-0.3s" rest={lost ? { a: 14, b: -12 } : undefined} />
                <Limb kind="leg" x={0} y={53} delay="-0.3s" rest={lost ? { a: 10, b: 6 } : undefined} />
                {/* torso */}
                <line x1="0" y1="32" x2="0" y2="52" strokeWidth="11" strokeLinecap="round" className="rl-s-primary" />
                <rect x="-5.5" y="50" width="11" height="6" rx="3" fill={JEANS} />
                {/* head, cap, eye */}
                <circle cx="2" cy="19" r="10" fill={HEAD} />
                <path d="M-8.5 17a10.5 10.5 0 0 1 21 0z" className="rl-f-primary" />
                <path d="M10 15.5h9a2 2 0 0 1 0 4h-9z" className="rl-f-primary" />
                <circle cx="7" cy="21" r="1.7" className="rl-f-foreground" />
                <path d="M6 26q3 2.4 6 0" strokeWidth="1.4" strokeLinecap="round" fill="none" className="rl-s-foreground" />
                {/* front leg + arm */}
                <Limb kind="leg" x={0} y={53} delay="0s" rest={lost ? { a: -12, b: 4 } : undefined} />
                <Limb kind="arm" x={0} y={34} delay="0s" rest={lost ? { a: -150, b: -45, scratch: true } : undefined} />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
