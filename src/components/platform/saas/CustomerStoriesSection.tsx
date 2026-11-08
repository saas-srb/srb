import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, MessageCircle, ShieldCheck } from "lucide-react";
import { STORIES } from "@/lib/platform/saas/site";

/** Approved customer stories are shown here; product workflow examples live in their own section. */
export default function CustomerStoriesSection({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <section aria-labelledby="customer-stories-heading" className={dark ? "sr-glass rounded-[2rem] p-6 sm:p-9" : "rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm sm:p-9"}>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className={`sr-eyebrow ${dark ? "text-white/70" : ""}`}>Customer stories</p>
          <h2 id="customer-stories-heading" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Experiences shared by real customers</h2>
          <p className={`mt-3 text-sm leading-relaxed ${dark ? "text-white/75" : "text-muted-foreground"}`}>Customer stories are published with the featured business’s approval. Worked examples are shown separately below.</p>
        </div>
        <Link href="/contact" className={`inline-flex shrink-0 items-center gap-2 text-sm font-bold ${dark ? "text-white" : "text-primary"}`}>Share your experience <ArrowRight className="h-4 w-4" /></Link>
      </div>

      {STORIES.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {STORIES.map((story) => (
            <article key={story.slug} className={`overflow-hidden rounded-2xl border p-6 ${dark ? "border-white/15 bg-white/[0.06]" : "border-border/60 bg-background"}`}>
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${dark ? "bg-white/10" : "bg-primary/10 text-primary"}`}><Building2 className="h-5 w-5" /></span>
                <div><p className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-white/60" : "text-muted-foreground"}`}>{story.industry ?? "Customer story"}</p><h3 className="font-black">{story.company}</h3></div>
                <BadgeCheck className="ml-auto h-5 w-5 text-primary" aria-label="Approved customer story" />
              </div>
              {story.quote && <blockquote className={`mt-5 border-l-2 border-primary pl-4 text-lg font-semibold leading-relaxed ${dark ? "text-white" : ""}`}>“{story.quote}”</blockquote>}
              <p className={`mt-5 text-sm leading-relaxed ${dark ? "text-white/80" : "text-muted-foreground"}`}>{story.summary}</p>
              {story.challenge && <div className="mt-5"><p className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-white/60" : "text-muted-foreground"}`}>Challenge</p><p className="mt-1 text-sm leading-relaxed">{story.challenge}</p></div>}
              {story.approach?.length ? <div className="mt-5"><p className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-white/60" : "text-muted-foreground"}`}>How they use SelfRun</p><ul className="mt-2 space-y-2">{story.approach.map((item) => <li key={item} className="flex gap-2 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul></div> : null}
              {story.results.length > 0 && <div className="mt-5 border-t border-border/50 pt-4"><p className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-white/60" : "text-muted-foreground"}`}>Results reported by the customer</p><ul className="mt-2 space-y-2">{story.results.map((result) => <li key={result} className="flex gap-2 text-sm"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{result}</li>)}</ul></div>}
            </article>
          ))}
        </div>
      ) : (
        <div className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center ${dark ? "border-white/15 bg-white/[0.06]" : "border-border/60 bg-muted/30"}`}>
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${dark ? "bg-white/10" : "bg-primary/10 text-primary"}`}><MessageCircle className="h-5 w-5" /></span>
          <p className={`max-w-3xl text-sm leading-relaxed ${dark ? "text-white/80" : "text-muted-foreground"}`}>We add a customer story when a business has approved the details it wants to share. Until then, the worked examples below show how connected work can run.</p>
        </div>
      )}
    </section>
  );
}
