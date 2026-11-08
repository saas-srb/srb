import { Check, Sparkles, X } from "lucide-react";
import Reveal from "@/components/platform/saas/Reveal";

/**
 * A true side-by-side comparison: a stack of separate tools on the left, the one platform on the right, every question
 * answered on the same line with its label in the middle. On phones each question becomes a pair of answers.
 */
export default function WhyCompare({ rows, brand }: { rows: { row: string; us: string; them: string }[]; brand: string }) {
  const n = rows.length + 1;
  return (
    <Reveal>
      {/* wide screens: three aligned columns over two continuous products */}
      <div className="relative mx-auto hidden max-w-6xl grid-cols-[1fr_190px_1fr] md:grid">
        <div className="rounded-[2.25rem] border-2 border-dashed border-border bg-muted/40" style={{ gridColumn: 1, gridRow: `1 / span ${n}` }} aria-hidden />
        <div className="sr-band relative z-0 -my-5 rounded-[2.25rem] shadow-[0_50px_100px_-30px] shadow-primary/60" style={{ gridColumn: 3, gridRow: `1 / span ${n}` }} aria-hidden />
        <div className="absolute inset-y-6 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-border to-transparent" aria-hidden />

        <div className="relative z-10 flex items-center justify-center gap-3 px-8 py-8 text-2xl font-black tracking-tight text-muted-foreground" style={{ gridColumn: 1, gridRow: 1 }}>A stack of separate tools</div>
        <div className="relative z-10 flex items-center justify-center" style={{ gridColumn: 2, gridRow: 1 }}><span className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-sm font-black tracking-widest text-background shadow-xl ring-8 ring-background">VS</span></div>
        <div className="sr-compare-us relative z-10 flex items-center justify-center gap-3 px-8 py-8 text-2xl font-black tracking-tight text-white" style={{ gridColumn: 3, gridRow: 1 }}><Sparkles className="h-6 w-6" />{brand}</div>

        {rows.map((r, i) => (
          <RowCells key={r.row} r={r} row={i + 2} />
        ))}
      </div>

      {/* phones and small tablets: one pair per question */}
      <ul className="mx-auto max-w-xl space-y-4 md:hidden">
        {rows.map((r) => (
          <li key={r.row} className="overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm">
            <p className="bg-muted/50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{r.row}</p>
            <div className="flex gap-3 px-5 py-4 text-muted-foreground"><span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-rose-500/15 text-rose-600"><X className="h-3.5 w-3.5" strokeWidth={3} /></span><span><span className="block text-[11px] font-bold uppercase tracking-wider">Separate tools</span>{r.them}</span></div>
            <div className="sr-band flex gap-3 px-5 py-4"><span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-400 text-emerald-950"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span><span><span className="block text-[11px] font-bold uppercase tracking-wider text-white/70">{brand}</span><span className="font-semibold">{r.us}</span></span></div>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

function RowCells({ r, row }: { r: { row: string; us: string; them: string }; row: number }) {
  return (
    <>
      <div className="relative z-10 flex items-center justify-end gap-4 border-t border-border/60 px-8 py-5 text-right text-muted-foreground " style={{ gridColumn: 1, gridRow: row }}>
        <span className="leading-snug line-through decoration-muted-foreground/30">{r.them}</span>
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-rose-500/15 text-rose-600"><X className="h-4 w-4" strokeWidth={3} /></span>
      </div>
      <div className="relative z-10 flex items-center justify-center px-2" style={{ gridColumn: 2, gridRow: row }}>
        <span className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-foreground shadow-sm">{r.row}</span>
      </div>
      <div className="sr-compare-us relative z-10 flex items-center gap-4 border-t border-white/15 px-8 py-5 text-white" style={{ gridColumn: 3, gridRow: row }}>
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-400 text-emerald-950"><Check className="h-4 w-4" strokeWidth={3} /></span>
        <span className="font-semibold leading-snug">{r.us}</span>
      </div>
    </>
  );
}
