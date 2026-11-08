import { Check, Lock, Sparkles } from "lucide-react";
import { PANEL_STYLE, type ScreenKind } from "@/lib/platform/saas/palette";

/**
 * Product-screen illustrations. They are drawn from shapes (no sample names, figures or customers) and labelled with the module's own
 * capability names, so each one shows how the module is organised without pretending to be real data.
 */
const bar = (w: string, c = "var(--sr-surface-2)", h = 8) => <span className="block rounded-full" style={{ width: w, height: h, background: c }} />;
const pill = (c: string, t: string) => <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${c}1f`, color: c }}>{t}</span>;
const avatar = (c: string, i: number) => <span className="size-6 shrink-0 rounded-full" style={{ background: `${c}${["33", "55", "77", "44"][i % 4]}` }} />;

function Frame({ title, color, labels, children }: { title: string; color: string; labels: string[]; children: React.ReactNode }) {
  return (
    <div className="sr-window w-full" role="img" aria-label={`${title} screen illustration`}>
      <div className="sr-window-bar">
        <span className="sr-dot" style={{ background: "#fda4af" }} /><span className="sr-dot" style={{ background: "#fde68a" }} /><span className="sr-dot" style={{ background: "#86efac" }} />
        <span className="sr-mono sr-muted ml-3 text-[11px]">{title}</span>
      </div>
      <div className="grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[118px_minmax(0,1fr)]">
        <div className="space-y-2 border-r p-2.5 sm:p-3" style={{ background: "var(--sr-surface)" }}>
          {labels.slice(0, 5).map((l, i) => (
            <div key={l} className="flex items-center gap-2 rounded-lg p-1.5" style={{ background: i === 0 ? `${color}1a` : undefined }}>
              <span className="size-3.5 shrink-0 rounded-[5px]" style={{ background: i === 0 ? color : "var(--sr-line-strong)" }} />
              <span className="hidden truncate text-[10.5px] font-medium sm:block" style={{ color: i === 0 ? color : "var(--sr-muted)" }}>{l}</span>
            </div>
          ))}
        </div>
        <div className="min-h-[250px] space-y-3 p-3.5 sm:p-4">{children}</div>
      </div>
    </div>
  );
}

function Body({ kind, color, labels }: { kind: ScreenKind; color: string; labels: string[] }) {
  const L = (i: number) => labels[i] ?? "";
  switch (kind) {
    case "kanban":
      return (
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((c) => (
            <div key={c} className="space-y-2 rounded-xl p-2" style={{ background: "var(--sr-surface)" }}>
              <p className="truncate text-[10.5px] font-semibold" style={{ color }}>{L(c) || ["New", "In progress", "Won"][c]}</p>
              {Array.from({ length: 3 - (c === 2 ? 1 : 0) }).map((_, r) => (
                <div key={r} className="space-y-1.5 rounded-lg border bg-card p-2" style={{ borderColor: "var(--sr-line)" }}>
                  {bar("80%", "var(--sr-line-strong)", 7)}{bar("55%")}
                  <div className="flex items-center justify-between pt-0.5">{avatar(color, r + c)}<span className="size-1.5 rounded-full" style={{ background: color }} /></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="space-y-2">
          <div className="flex gap-2">{[0, 1, 2].map((i) => <span key={i} className="flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold" style={{ background: `${color}14`, color }}>{L(i) || "—"}</span>)}</div>
          {Array.from({ length: 5 }).map((_, r) => (
            <div key={r} className="flex items-center gap-2.5 rounded-lg border bg-card p-2" style={{ borderColor: "var(--sr-line)" }}>
              {avatar(color, r)}<div className="flex-1 space-y-1.5">{bar("60%", "var(--sr-line-strong)", 7)}{bar("35%")}</div>
              {pill(color, ["Present", "Leave", "Present", "Present", "Remote"][r])}
            </div>
          ))}
        </div>
      );
    case "dashboard":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="space-y-2 rounded-xl border p-2.5" style={{ borderColor: "var(--sr-line)" }}><p className="truncate text-[10px] text-[var(--sr-muted)]">{L(i)}</p>{bar("70%", `${color}66`, 12)}</div>)}</div>
          <div className="flex h-28 items-end gap-1.5 rounded-xl border p-3" style={{ borderColor: "var(--sr-line)" }}>
            {[38, 52, 44, 66, 58, 80, 70, 92, 76, 100].map((h, i) => <span key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: i > 6 ? color : `${color}44` }} />)}
          </div>
        </div>
      );
    case "chat":
      return (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`flex items-end gap-2 ${i % 2 ? "flex-row-reverse" : ""}`}>
              {avatar(color, i)}
              <div className="max-w-[72%] space-y-1.5 rounded-2xl px-3 py-2.5" style={{ background: i % 2 ? color : "var(--sr-surface-2)" }}>
                {bar(`${90 - i * 12}%`, i % 2 ? "rgba(255,255,255,.75)" : "var(--sr-line-strong)", 7)}{i < 2 && bar("55%", i % 2 ? "rgba(255,255,255,.5)" : "var(--sr-line-strong)", 7)}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--sr-line-strong)" }}>{bar("55%")}<span className="ml-auto size-5 rounded-full" style={{ background: color }} /></div>
        </div>
      );
    case "calendar":
      return <div className="grid grid-cols-7 gap-1.5">{Array.from({ length: 28 }).map((_, i) => <div key={i} className="h-9 rounded-lg border p-1" style={{ borderColor: "var(--sr-line)" }}>{[3, 8, 9, 15, 20, 22].includes(i) && <span className="block h-full rounded" style={{ background: `${color}55` }} />}</div>)}</div>;
    case "document":
      return (
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <div className="space-y-2 rounded-xl border bg-card p-3.5" style={{ borderColor: "var(--sr-line)" }}>
            {bar("45%", color, 10)}{[100, 92, 96, 70, 88, 60].map((w, i) => <span key={i} className="block">{bar(`${w}%`)}</span>)}
            <svg viewBox="0 0 120 30" className="mt-2 h-8 w-28" aria-hidden><path d="M2 22c10-22 16-22 20-6s8 14 14-2 12-10 18 0 10 6 20-4 22-6 40 8" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" /></svg>
          </div>
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: "var(--sr-line)" }}><Check className="size-3.5 shrink-0" style={{ color }} /><span className="truncate text-[10.5px] font-medium">{L(i)}</span></div>)}</div>
        </div>
      );
    case "builder":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_1.6fr]">
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: i === 1 ? color : "var(--sr-line)", background: i === 1 ? `${color}10` : undefined }}><span className="size-3.5 rounded" style={{ background: `${color}88` }} /><span className="truncate text-[10.5px] font-medium">{L(i)}</span></div>)}</div>
          <div className="space-y-2.5 rounded-xl border p-3" style={{ borderColor: "var(--sr-line)" }}>
            <div className="h-16 rounded-lg" style={{ background: `linear-gradient(120deg, ${color}, ${color}66)` }} />
            <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="space-y-1.5 rounded-lg p-2" style={{ background: "var(--sr-surface)" }}><span className="block size-4 rounded-full" style={{ background: `${color}77` }} />{bar("80%")}{bar("50%")}</div>)}</div>
          </div>
        </div>
      );
    case "flow":
      return (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{i + 1}</span>
              <div className="flex flex-1 items-center justify-between rounded-lg border bg-card px-3 py-2" style={{ borderColor: "var(--sr-line)" }}><span className="truncate text-[11px] font-semibold">{L(i)}</span>{pill(color, i < 3 ? "Done" : "Next")}</div>
            </div>
          ))}
        </div>
      );
    case "vault":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: `${color}14` }}><span className="flex size-9 items-center justify-center rounded-full text-white" style={{ background: color }}><Lock className="size-4" /></span><div className="flex-1 space-y-1.5">{bar("55%", color, 8)}{bar("35%")}</div></div>
          {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-2.5" style={{ borderColor: "var(--sr-line)" }}><span className="size-5 rounded-md" style={{ background: `${color}33` }} /><span className="flex-1 truncate text-[11px] font-medium">{L(i)}</span>{pill(i === 2 ? "#f59e0b" : color, i === 2 ? "Expires soon" : "Secure")}</div>)}
        </div>
      );
    case "ai":
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--sr-line-strong)" }}><Sparkles className="size-4 shrink-0" style={{ color }} />{bar("68%", "var(--sr-line-strong)", 9)}</div>
          <div className="rounded-xl border bg-card p-3" style={{ borderColor: "var(--sr-line)" }}>
            <div className="flex h-24 items-end gap-2">{[45, 70, 38, 88, 60].map((h, i) => <span key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: i === 3 ? color : `${color}44` }} />)}</div>
          </div>
          <div className="rounded-lg p-2.5 text-[10.5px]" style={{ background: `${color}10`, color }}><b>How this was calculated</b> — {L(3) || "the records used and the filters applied"}</div>
        </div>
      );
    case "timeline":
      return (
        <div className="space-y-2.5">
          {[[0, 55], [18, 62], [38, 50], [10, 70], [52, 40]].map(([l, w], i) => (
            <div key={i} className="flex items-center gap-3"><span className="w-16 shrink-0 truncate text-[10px] text-[var(--sr-muted)]">{L(i)}</span><div className="relative h-5 flex-1 rounded-full" style={{ background: "var(--sr-surface)" }}><span className="absolute inset-y-0 rounded-full" style={{ left: `${l}%`, width: `${w}%`, background: `linear-gradient(90deg, ${color}, ${color}99)` }} /></div></div>
          ))}
        </div>
      );
    case "social":
      return (
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => <div key={i} className="space-y-2 rounded-xl border bg-card p-2" style={{ borderColor: "var(--sr-line)" }}><div className="aspect-square rounded-lg" style={{ background: `linear-gradient(135deg, ${color}${["aa", "77", "55"][i]}, ${color}22)` }} />{bar("85%")}{bar("50%")}<div className="flex items-center justify-between">{pill(color, ["Draft", "Approved", "Scheduled"][i])}<span className="size-2 rounded-full" style={{ background: color }} /></div></div>)}
        </div>
      );
    case "rank":
      return (
        <div className="space-y-3">
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--sr-line)" }}><svg viewBox="0 0 200 70" className="h-20 w-full" aria-hidden><path d="M0 60C20 55 30 58 50 42s30-10 50-18 40-4 60-14 28-6 40-8" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" /><path d="M0 60C20 55 30 58 50 42s30-10 50-18 40-4 60-14 28-6 40-8V70H0Z" fill={`${color}18`} /></svg></div>
          {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-2.5" style={{ borderColor: "var(--sr-line)" }}><span className="flex-1 truncate text-[11px] font-medium">{L(i)}</span>{pill(color, ["Fix first", "Improving", "Tracked"][i])}</div>)}
        </div>
      );
    case "test":
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold" style={{ color }}>{L(0) || "Question"}</span>{pill(color, "Timed")}</div>
          <div className="space-y-1.5 rounded-xl border bg-card p-3" style={{ borderColor: "var(--sr-line)" }}>{bar("90%", "var(--sr-line-strong)", 9)}{bar("60%")}</div>
          {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-2.5 rounded-lg border p-2.5" style={{ borderColor: i === 1 ? color : "var(--sr-line)", background: i === 1 ? `${color}12` : undefined }}><span className="size-4 rounded-full border-2" style={{ borderColor: i === 1 ? color : "var(--sr-line-strong)", background: i === 1 ? color : undefined }} />{bar(`${70 - i * 8}%`)}</div>)}
        </div>
      );
    case "course":
      return (
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 rounded-xl border bg-card p-2.5 text-center" style={{ borderColor: "var(--sr-line)" }}>
              <svg viewBox="0 0 36 36" className="mx-auto size-14" aria-hidden><circle cx="18" cy="18" r="15" fill="none" stroke="var(--sr-surface-2)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${[78, 52, 91][i]} 100`} pathLength="100" transform="rotate(-90 18 18)" /></svg>
              <p className="truncate text-[10.5px] font-semibold">{L(i)}</p>
            </div>
          ))}
        </div>
      );
    case "portal":
    default:
      return (
        <div className="space-y-3">
          <div className="rounded-xl p-3.5 text-white" style={{ background: `linear-gradient(120deg, ${color}, ${color}aa)` }}><div className="space-y-2">{bar("45%", "rgba(255,255,255,.85)", 9)}{bar("30%", "rgba(255,255,255,.5)")}</div></div>
          <div className="grid grid-cols-2 gap-2.5">{[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-2 rounded-lg border bg-card p-2.5" style={{ borderColor: "var(--sr-line)" }}><span className="size-6 shrink-0 rounded-full" style={{ background: `${color}33` }} /><span className="truncate text-[10.5px] font-medium">{L(i)}</span></div>)}</div>
        </div>
      );
  }
}

export default function PanelScreen({ moduleKey, name, labels }: { moduleKey: string; name: string; labels: string[] }) {
  const st = PANEL_STYLE[moduleKey] ?? { color: "#4f46e5", screen: "dashboard" as ScreenKind };
  const short = labels.map((l) => l.split(/ with | and |, | of | & /)[0].replace(/^(Create |Build |Track )/, "").slice(0, 26));
  return (
    <Frame title={name} color={st.color} labels={short}>
      <Body kind={st.screen} color={st.color} labels={short} />
    </Frame>
  );
}
