/** The progress ring: the percentage in the middle. Pure SVG, no script. */
export default function SetupRing({ percent, size = 112, label = true }: { percent: number; size?: number; label?: boolean }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div role="img" aria-label={`${percent}% of setup is done`} data-setup-ring className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={10} className="stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={10} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} className={percent === 100 ? "stroke-emerald-500" : "stroke-primary"} />
      </svg>
      {label && <span className="absolute inset-0 flex items-center justify-center text-2xl font-black tabular-nums" style={{ fontSize: size / 4.2 }}>{percent}%</span>}
    </div>
  );
}
