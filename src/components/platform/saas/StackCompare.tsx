import Link from "next/link";
import { ArrowRight, Check, Gift } from "lucide-react";
import { COMPARE_AS_OF, COMPARE_TEAM, COMPARE_USD_INR, compareStack } from "@/lib/platform/saas/compare";
import Reveal from "@/components/platform/saas/Reveal";
import ProductLogo from "@/components/products/ProductLogo";
import { SAAS_PRODUCT_COUNT } from "@/lib/platform/saas/product-routes";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** The same jobs on separate tools (prices read from each vendor's own pricing page) next to the plan that covers a team of ten. */
export default function StackCompare({ plan, products }: {
  plan: { name: string; price: string; monthly: number } | null;
  products: { key: string; name: string }[];
}) {
  const c = compareStack(COMPARE_TEAM);
  return (
    <Reveal>
      <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-background shadow-sm">
        <div className="grid gap-px bg-border/60 md:grid-cols-2">
          <div className="flex flex-col bg-background p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Separate tools · a team of {COMPARE_TEAM}</p>
            <ul className="mb-4 mt-4 flex flex-1 flex-col divide-y divide-border/60">
              {c.rows.map((r) => (
                <li key={r.job} className="flex flex-1 items-center justify-between gap-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-bold">{r.job}</span>
                    <span className="block text-xs text-muted-foreground">Popular paid plan · {r.note}</span>
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    <span className="font-semibold tabular-nums">{inr(r.monthlyInr)}<span className="text-xs font-normal text-muted-foreground"> /mo</span></span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-auto flex items-baseline justify-between border-t border-border pt-4 text-lg font-black"><span>Only these jobs</span><span className="tabular-nums">{inr(c.totalInr)}<span className="text-sm font-semibold text-muted-foreground"> /mo</span></span></p>
          </div>
          <div className="sr-band relative flex flex-col gap-5 overflow-hidden p-6 sm:p-8">
            <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden />
            <span className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-brand-accent/30 blur-3xl" aria-hidden />
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 p-5 text-emerald-950 shadow-[0_20px_60px_-15px] shadow-emerald-400/60 ring-2 ring-white/60">
              <span className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/30 blur-2xl" aria-hidden />
              <div className="relative flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em]"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-950/60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-950" /></span>Start today</span>
                <Gift className="h-5 w-5" />
              </div>
              <p className="relative mt-2 flex items-baseline gap-2"><span className="text-5xl font-black leading-none tracking-tighter">₹0</span><span className="text-xl font-black">Free forever</span></p>
              <ul className="relative mt-3 grid gap-1 text-[13px] font-semibold sm:grid-cols-2">
                {["No card needed", "Every product unlocked", "AI built in", "Live in minutes"].map((t) => (<li key={t} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 flex-none" strokeWidth={3} />{t}</li>))}
              </ul>
              <Link href="/signup" className="group relative mt-4 flex items-center justify-center gap-2 rounded-full bg-emerald-950 px-6 py-3.5 text-sm font-black text-white shadow-xl transition-transform hover:scale-[1.03]">Start free now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
            </div>
            <p className="relative -mb-2 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Need a team? Upgrade any time</p>
            <p className="relative text-xs font-black uppercase tracking-[0.16em] text-white/75">SelfRun {plan?.name ?? ""}</p>
            <div className="relative">
              <p className="text-6xl font-black leading-none tracking-tighter tabular-nums">{plan?.price ?? "—"}<span className="text-lg font-bold text-white/75"> /mo</span></p>
              <p className="mt-2 text-sm text-white/80">for up to {COMPARE_TEAM} people · every product · every feature · AI built in</p>
            </div>

            {plan && plan.monthly > 0 && (
              <div className="relative rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/75">You keep every month</p>
                  <p className="text-2xl font-black tabular-nums text-emerald-300">{inr(c.totalInr - plan.monthly)}</p>
                </div>
                <div className="mt-3 space-y-2" aria-hidden>
                  <div className="flex items-center gap-2"><span className="w-20 flex-none text-[10px] font-bold uppercase text-white/70">Separate tools</span><span className="h-2.5 flex-1 rounded-full bg-rose-400/80" /><span className="w-16 flex-none text-right text-[11px] font-bold tabular-nums">{inr(c.totalInr)}</span></div>
                  <div className="flex items-center gap-2"><span className="w-20 flex-none text-[10px] font-bold uppercase text-white/70">SelfRun</span><span className="flex-1"><span className="block h-2.5 rounded-full bg-emerald-300" style={{ width: `${Math.max(1.5, (plan.monthly / c.totalInr) * 100)}%` }} /></span><span className="w-16 flex-none text-right text-[11px] font-bold tabular-nums">{inr(plan.monthly)}</span></div>
                </div>
                <p className="mt-3 text-xs font-semibold text-white/85">About {Math.round(c.totalInr / plan.monthly)}× less — and {inr((c.totalInr - plan.monthly) * 12)} a year.</p>
              </div>
            )}

            <div className="relative">
              <p className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-white/75"><span>Independent products, together in one suite</span><span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] normal-case tracking-normal">All products</span></p>
              <div className="grid grid-cols-2 gap-2">
                {products.slice(0, SAAS_PRODUCT_COUNT).map((product) => {
                  return (
                    <div key={product.key} className="group flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5 ring-1 ring-white/15 transition-all hover:-translate-y-0.5 hover:bg-white/[0.17]">
                      <span className="flex h-8 w-8 flex-none items-center justify-center"><ProductLogo productKey={product.key} size={32} title={product.name} /></span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[12px] font-bold">{product.name}</span>
                        <span className="block truncate text-[10px] text-emerald-200/90">included in the suite</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative mt-auto grid gap-2">
              <Link href="/signup" className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-black shadow-xl transition-transform hover:scale-[1.03]">Start free — ₹0, no card <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              <Link href="/pricing" className="text-center text-xs font-bold text-white/80 underline-offset-4 hover:underline">See every plan &amp; the launch offer</Link>
            </div>
          </div>
        </div>
        <p className="border-t border-border/60 bg-muted/20 px-6 py-3 text-xs text-muted-foreground sm:px-8">
          Prices read on {COMPARE_AS_OF} from the public pricing pages of a popular paid plan in each category: billing period as shown on each row, before tax; dollar prices at about ₹{COMPARE_USD_INR} per $. Prices change and other plans exist, so check current prices before you decide. SelfRun price is monthly, before tax, for up to {COMPARE_TEAM} people.
        </p>
      </div>
    </Reveal>
  );
}
