"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

/** Pick a role on the left and see what that person does in the product on the right. */
export default function RoleExplorer({ productName, roles }: { productName: string; roles: { who: string; does: string }[] }) {
  const [i, setI] = useState(0);
  const r = roles[i];
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible" role="tablist" aria-label="Roles">
        {roles.map((x, n) => (
          <button key={x.who} type="button" role="tab" aria-selected={i === n} onClick={() => setI(n)} className={`flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all ${i === n ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25 md:translate-x-1" : "border-border/60 bg-card hover:border-primary/40"}`}>
            <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl text-base font-black ${i === n ? "bg-white/20" : "bg-gradient-to-br from-primary to-brand-accent text-white"}`}>{x.who.charAt(0)}</span>
            <span className="font-black leading-snug">{x.who}</span>
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-card to-primary/[0.06] p-7 sm:p-10">
        <AnimatePresence mode="wait">
          <motion.div key={r.who} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }} role="tabpanel">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">In {productName}</p>
            <h3 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">{r.who}</h3>
            <p className="mt-4 text-xl leading-relaxed text-muted-foreground">{r.does}</p>
            <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-border/60"><ShieldCheck className="h-4 w-4 text-primary" />Sees and does only what this role allows</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
