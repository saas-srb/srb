"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bot, Send } from "lucide-react";

/** A try-it box: pick one of the questions the AI can answer and watch it typed into the box. (It shows the question; real answers come from your own records once you ask in the product.) */
export default function AskAiDemo({ productName, questions }: { productName: string; questions: string[] }) {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [auto, setAuto] = useState(true);
  const q = questions[i] ?? "";

  useEffect(() => {
    // Restart the typing for each question; with reduced motion show it at once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped("");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return void setTyped(q);
    let n = 0;
    const t = window.setInterval(() => { n += 1; setTyped(q.slice(0, n)); if (n >= q.length) window.clearInterval(t); }, 28);
    return () => window.clearInterval(t);
  }, [q]);
  useEffect(() => {
    if (!auto || questions.length < 2) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % questions.length), 5200);
    return () => window.clearTimeout(t);
  }, [auto, i, questions.length]);

  return (
    <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-card to-primary/[0.05] p-5 sm:p-7">
      <div className="mb-4 flex items-center gap-2 font-black"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-accent text-white"><Bot className="h-5 w-5" /></span>Ask {productName}</div>
      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background px-4 py-3.5 shadow-sm">
        <span className="min-h-6 flex-1 text-[16px] font-medium">{typed}<span className="sr-caret" /></span>
        <Link href="/signup" aria-label="Ask it with your own data" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-110"><Send className="h-4 w-4" /></Link>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Try a question</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {questions.map((x, n) => (
          <li key={x}><button type="button" onClick={() => { setAuto(false); setI(n); }} aria-pressed={i === n} className={`rounded-full border px-4 py-2 text-left text-sm font-semibold transition-all ${i === n ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-background hover:border-primary/40"}`}>{x}</button></li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-muted-foreground">Answers are worked out from your own records, only what the person asking may see. <Link href="/signup" className="font-bold text-primary hover:underline">Try it free <ArrowRight className="ml-0.5 inline h-4 w-4" /></Link></p>
    </div>
  );
}
