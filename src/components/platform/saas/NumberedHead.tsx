import Reveal from "@/components/platform/saas/Reveal";

/** A numbered section heading: the number in a circle, the section's name under it, then the title and one line of explanation. `band` is for a section painted in the brand colour. */
export default function NumberedHead({ n, eyebrow, title, accent, lead, band }: { n: number; eyebrow: string; title: React.ReactNode; accent?: string; lead?: React.ReactNode; band?: boolean }) {
  return (
    <Reveal className="mx-auto mb-8 max-w-4xl text-center">
      <p className={`mb-3 flex flex-col items-center gap-3 text-xs font-black uppercase tracking-[0.2em] ${band ? "text-white/80" : "text-primary"}`}><span className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] tracking-normal ${band ? "bg-white/15 text-white ring-1 ring-white/30" : "bg-gradient-to-br from-primary to-brand-accent text-white shadow-lg shadow-primary/30"}`}>{String(n).padStart(2, "0")}</span>{eyebrow}</p>
      <h2 className={`text-3xl font-black leading-[1.12] tracking-tight sm:text-4xl ${band ? "sr-dh" : ""}`}>{title}{accent && <> <span className={band ? "text-white/70" : "bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent [-webkit-box-decoration-break:clone] [box-decoration-break:clone]"}>{accent}</span></>}</h2>
      {lead && <p className={`mt-2.5 text-base leading-relaxed sm:text-lg ${band ? "text-white/80" : "text-muted-foreground"}`}>{lead}</p>}
    </Reveal>
  );
}
