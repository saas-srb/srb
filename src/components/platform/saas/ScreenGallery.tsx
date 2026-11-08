import Link from "next/link";
import { ArrowRight, Images } from "lucide-react";
import { getGallery } from "@/lib/platform/saas/gallery";

/**
 * A wall of real screens: three tilted rows drifting in opposite directions, each card opening the gallery at its product, with
 * the way into the full gallery floating over the middle. Pauses when you point at it.
 */
export default async function ScreenGallery() {
  const { items } = await getGallery();
  const feat = items.filter((i) => i.featured);
  if (feat.length < 6) return null;
  const rows = [0, 1, 2].map((r) => feat.filter((_, i) => i % 3 === r).slice(0, 8));
  return (
    <div className="sr-wall relative left-1/2 w-screen -translate-x-1/2 overflow-hidden py-16">
      <div className="space-y-6 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)] [transform:rotate(-4deg)_scale(1.08)]">
        {rows.map((row, r) => (
          <div key={r} className={`sr-wall-row ${r % 2 ? "sr-wall-rev" : ""}`} style={{ ["--wall-speed" as string]: `${70 + r * 14}s`, marginLeft: r * -120 }}>
            {[...row, ...row].map((it, i) => (
              <Link key={`${it.id}-${i}`} href={`/gallery?product=${it.panelKey}`} aria-hidden={i >= row.length || undefined} tabIndex={i >= row.length ? -1 : undefined} className="group relative block w-[340px] flex-none overflow-hidden rounded-[1.5rem] border border-border/60 bg-background shadow-xl shadow-primary/10 sm:w-[440px]">
                <span className="flex items-center gap-1.5 border-b border-border/60 bg-muted/50 px-3.5 py-2.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" /><span className="ml-2 truncate text-[11px] font-semibold text-muted-foreground">{it.panel} · {it.title}</span></span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.src} alt={`${it.panel}: ${it.title}`} width={1280} height={800} loading="lazy" decoding="async" className="block aspect-[16/10] w-full object-cover object-left-top transition-transform duration-700 group-hover:scale-[1.05]" />
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <div className="pointer-events-auto max-w-xl rounded-[2rem] border border-white/40 bg-background/80 p-8 text-center shadow-[0_40px_100px_-20px_rgb(15_23_42/.45)] backdrop-blur-xl sm:p-10">
          <span className="sr-icon mx-auto mb-5 h-14 w-14 rounded-2xl"><Images className="h-6 w-6" /></span>
          <p className="bg-gradient-to-br from-primary to-brand-accent bg-clip-text text-6xl font-black leading-none tracking-tighter text-transparent sm:text-7xl">Real</p>
          <p className="mt-2 text-lg font-bold">screens from the live product</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Filter by product, search, and open any screen full size.</p>
          <Link href="/gallery" className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-bold text-background shadow-xl transition-transform hover:scale-105">Open the gallery <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </div>
  );
}
