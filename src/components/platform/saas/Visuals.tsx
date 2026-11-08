import { ArrowRight } from "lucide-react";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";
import type { IconKey } from "@/lib/platform/saas/content";
import ProductLogo from "@/components/products/ProductLogo";

export interface JourneyStep {
  label: string;
  text: string;
  module: string;
  icon: IconKey;
  productKey?: string;
}

/** A connected row of coloured circles: one business process flowing across modules. Vertical on phones. */
export function Journey({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="relative grid gap-8 md:grid-flow-col md:auto-cols-fr md:gap-4">
      <span className="absolute top-7 right-[8%] left-[8%] hidden h-[3px] rounded-full md:block" style={{ background: "linear-gradient(90deg, var(--primary), var(--brand-gradient))", opacity: 0.45 }} aria-hidden />
      {steps.map((s, i) => {
        return (
          <Reveal key={s.label} as="li" delay={i * 90} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
            <span className="sr-circle relative size-14 shrink-0 shadow-lg shadow-primary/25 ring-4 ring-background">{s.productKey ? <ProductLogo productKey={s.productKey} size={40} title={s.module} /> : <Icon name={s.icon} className="size-6" />}</span>
            <div className="space-y-1">
              <p className="sr-mono text-[11px] tracking-wider uppercase text-primary">{String(i + 1).padStart(2, "0")} · {s.module}</p>
              <p className="text-[16px] font-semibold">{s.label}</p>
              <p className="sr-muted text-[14px] leading-snug">{s.text}</p>
            </div>
          </Reveal>
        );
      })}
    </ol>
  );
}

const SCATTER = ["Spreadsheets", "CRM", "HR software", "Accounting", "Project tool", "Team chat", "Document drive", "Website builder", "Email tool"];

/** Many disconnected tools on the left, one connected platform on the right. */
export function BeforeAfter({ modules }: { modules: { name: string; color: string }[] }) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-[1fr_auto_1fr]">
      <div className="space-y-4">
        <p className="sr-mono text-[12px] tracking-wider uppercase sr-muted">Before · many tools, many logins</p>
        <div className="flex flex-wrap gap-2.5">
          {SCATTER.map((t, i) => (
            <span key={t} className="rounded-xl border border-dashed bg-card px-3.5 py-2 text-[13.5px] font-medium text-[var(--sr-muted)]" style={{ transform: `rotate(${[-3, 2, -1.5, 3, -2, 1.5, -3, 2.5, -1][i]}deg)` }}>{t}</span>
          ))}
        </div>
        <p className="text-[14.5px] leading-snug sr-muted">Data copied by hand between apps. Nobody sees the whole picture.</p>
      </div>
      <div className="mx-auto flex size-14 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#4f46e5,#8b5cf6)", boxShadow: "0 14px 30px -12px #4f46e5" }}><ArrowRight className="size-6 rotate-90 md:rotate-0" aria-hidden /></div>
      <div className="space-y-4">
        <p className="sr-mono text-[12px] tracking-wider uppercase" style={{ color: "var(--sr-primary)" }}>After · independent products, one suite</p>
        <div className="flex flex-wrap gap-2">
          {modules.map((m) => <span key={m.name} className="inline-flex items-center gap-2 rounded-full bg-card py-1.5 pr-3.5 pl-2 text-[13px] font-medium shadow-sm ring-1 ring-[var(--sr-line)]"><span className="size-3.5 rounded-full" style={{ background: m.color }} />{m.name}</span>)}
        </div>
        <p className="text-[14.5px] leading-snug">Each product keeps its own data. Set up automations for the handoffs you want.</p>
      </div>
    </div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="sr-display text-[clamp(2rem,4vw,3rem)] leading-none font-semibold sr-grad">{value}</p>
      <p className="sr-muted mt-2 text-[14px]">{label}</p>
    </div>
  );
}
