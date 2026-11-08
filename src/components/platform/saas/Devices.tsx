/**
 * Laptop frames drawn in CSS around real, full-resolution captures of the product. Six different laptops, so a page never repeats
 * one look: MacBook (silver), MacBook (space black, notch), frosted-glass laptop, open laptop with keyboard deck, Windows ultrabook
 * and a brand-coloured laptop. Only the hardware is drawn; every screen is a real capture.
 */
type Img = { src: string; alt: string; priority?: boolean };

function Screen({ src, alt, priority, className = "" }: Img & { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={1280} height={800} loading={priority ? "eager" : "lazy"} decoding="async" className={`block h-auto w-full ${className}`} />;
}

/** MacBook, silver: aluminium base with the hinge cut-out. */
export function MacBookSilver({ src, alt, priority }: Img) {
  return (
    <div className="relative mx-auto w-full">
      <div className="relative rounded-t-[1.1rem] bg-gradient-to-b from-[#c5cad4] to-[#9aa1ae] p-[1.9%] pb-[1.4%] shadow-[0_30px_70px_-25px_rgba(15,23,42,.5)] ring-1 ring-black/15">
        <div className="relative overflow-hidden rounded-[0.4rem] bg-black p-[0.55%]">
          <span className="absolute left-1/2 top-[1.2%] z-10 h-[1.4%] w-[0.9%] min-h-[3px] min-w-[3px] -translate-x-1/2 rounded-full bg-[#14161b] ring-1 ring-white/10" aria-hidden />
          <Screen src={src} alt={alt} priority={priority} className="rounded-[0.3rem]" />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.08] via-transparent to-transparent" aria-hidden />
        </div>
      </div>
      <div className="relative mx-auto h-[2%] min-h-[9px] w-[112%] -translate-x-[5.35%] rounded-b-[1.2rem] bg-gradient-to-b from-[#dfe3ea] via-[#bcc2cd] to-[#9aa1ae] shadow-[0_18px_30px_-12px_rgba(15,23,42,.45)]" aria-hidden>
        <span className="absolute left-1/2 top-0 h-[55%] w-[16%] -translate-x-1/2 rounded-b-md bg-gradient-to-b from-[#9097a4] to-[#aab0bc]" />
      </div>
    </div>
  );
}

/** MacBook, space black: dark lid and a camera notch cut into the display. */
export function MacBookBlack({ src, alt, priority }: Img) {
  return (
    <div className="relative mx-auto w-full">
      <div className="relative rounded-t-[1.1rem] bg-gradient-to-b from-[#34373f] to-[#15171c] p-[1.7%] pb-[1.2%] shadow-[0_35px_70px_-25px_rgba(10,12,20,.65)] ring-1 ring-white/10">
        <div className="relative overflow-hidden rounded-[0.45rem] bg-black">
          <span className="absolute left-1/2 top-0 z-10 h-[3.2%] w-[11%] -translate-x-1/2 rounded-b-[0.45rem] bg-black" aria-hidden />
          <Screen src={src} alt={alt} priority={priority} />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.06] via-transparent to-transparent" aria-hidden />
        </div>
      </div>
      <div className="relative mx-auto h-[2%] min-h-[9px] w-[110%] -translate-x-[4.55%] rounded-b-[1.2rem] bg-gradient-to-b from-[#3d4049] via-[#262930] to-[#16181d] shadow-[0_20px_34px_-12px_rgba(10,12,20,.6)]" aria-hidden>
        <span className="absolute left-1/2 top-0 h-[55%] w-[16%] -translate-x-1/2 rounded-b-md bg-[#0e1014]" />
      </div>
    </div>
  );
}

/** Frosted-glass laptop: translucent lid with a gradient edge and a glow underneath. */
export function GlassLaptop({ src, alt, priority }: Img) {
  return (
    <div className="relative mx-auto w-full">
      <div className="pointer-events-none absolute inset-x-[6%] -bottom-[6%] h-[28%] rounded-full bg-gradient-to-r from-primary/40 to-brand-accent/40 blur-2xl" aria-hidden />
      <div className="relative rounded-t-[1.3rem] bg-gradient-to-br from-primary/70 via-white/60 to-brand-accent/70 p-[1.5px] shadow-[0_35px_70px_-25px_color-mix(in_oklch,var(--primary)_60%,transparent)]">
        <div className="rounded-t-[1.25rem] bg-white/40 p-[2%] pb-[1.4%] backdrop-blur-xl">
          <div className="relative overflow-hidden rounded-[0.6rem] bg-black/90 p-[0.5%]">
            <Screen src={src} alt={alt} priority={priority} className="rounded-[0.5rem]" />
          </div>
        </div>
      </div>
      <div className="relative mx-auto h-[2.2%] min-h-[10px] w-[108%] -translate-x-[3.7%] rounded-b-[1.3rem] bg-gradient-to-b from-white/80 to-white/30 shadow-[0_18px_30px_-12px_rgba(15,23,42,.35)] ring-1 ring-white/70 backdrop-blur" aria-hidden />
    </div>
  );
}

/** Open laptop seen from slightly above: the screen, then the keyboard deck and trackpad. */
export function OpenLaptop({ src, alt, priority }: Img) {
  return (
    <div className="relative mx-auto w-full" style={{ perspective: "1800px" }}>
      <div className="relative rounded-t-[1rem] bg-gradient-to-b from-[#2d313b] to-[#1a1d24] p-[2%] pb-[1.5%] shadow-[0_20px_50px_-25px_rgba(15,23,42,.6)] ring-1 ring-black/40" style={{ transform: "rotateX(-4deg)", transformOrigin: "bottom" }}>
        <div className="relative overflow-hidden rounded-[0.4rem] bg-black p-[0.5%]">
          <Screen src={src} alt={alt} priority={priority} className="rounded-[0.3rem]" />
        </div>
      </div>
      <div className="relative mx-auto -mt-px h-[16%] min-h-[48px] w-[112%] -translate-x-[5.35%] bg-gradient-to-b from-[#aeb4c0] to-[#8c93a1]" style={{ clipPath: "polygon(5% 0, 95% 0, 100% 100%, 0 100%)", borderRadius: "0 0 1rem 1rem" }} aria-hidden>
        <span className="absolute inset-x-[12%] top-[14%] h-[44%] rounded-md opacity-70" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(15,23,42,.25) 0 5.5%, transparent 5.5% 6.7%), repeating-linear-gradient(0deg, rgba(15,23,42,.0) 0 0%, transparent 0 100%)", background: "linear-gradient(#5d6371,#4a4f5c)" }} />
        <span className="absolute inset-x-[12%] top-[14%] h-[44%] rounded-md" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 5%, rgba(255,255,255,.18) 5% 5.4%), repeating-linear-gradient(0deg, transparent 0 24%, rgba(255,255,255,.14) 24% 26%)" }} />
        <span className="absolute bottom-[10%] left-1/2 h-[22%] w-[24%] -translate-x-1/2 rounded-md bg-gradient-to-b from-[#c7ccd6] to-[#9da4b1] ring-1 ring-black/10" />
      </div>
      <div className="mx-auto h-[3%] w-[84%] rounded-full bg-black/20 blur-xl" aria-hidden />
    </div>
  );
}

/** Windows ultrabook: slim black bezel, chin with a logo dot, light base with a thumb notch. */
export function WindowsLaptop({ src, alt, priority }: Img) {
  return (
    <div className="relative mx-auto w-full">
      <div className="relative rounded-t-[0.7rem] bg-[#0f1116] p-[1.1%] pb-[2.2%] shadow-[0_30px_60px_-25px_rgba(15,23,42,.55)] ring-1 ring-black/60">
        <span className="absolute left-1/2 top-[0.5%] h-[0.7%] w-[0.7%] min-h-[2px] min-w-[2px] -translate-x-1/2 rounded-full bg-[#2a2f3a]" aria-hidden />
        <div className="relative overflow-hidden rounded-[0.15rem] bg-black">
          <Screen src={src} alt={alt} priority={priority} />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.06] via-transparent to-transparent" aria-hidden />
        </div>
        <span className="absolute bottom-[0.7%] left-1/2 h-[0.9%] w-[1.6%] min-h-[3px] min-w-[8px] -translate-x-1/2 rounded-sm bg-gradient-to-br from-sky-400 to-blue-600 opacity-80" aria-hidden />
      </div>
      <div className="relative mx-auto h-[1.8%] min-h-[8px] w-[104%] -translate-x-[1.9%] rounded-b-[0.9rem] bg-gradient-to-b from-[#e7eaf0] to-[#b5bbc7] shadow-[0_16px_28px_-12px_rgba(15,23,42,.4)]" aria-hidden>
        <span className="absolute left-1/2 top-0 h-[45%] w-[12%] -translate-x-1/2 rounded-b-full bg-[#a1a8b5]" />
      </div>
    </div>
  );
}

/** Brand laptop: aluminium in the product's own colour, so the screen feels part of the page. */
export function BrandLaptop({ src, alt, priority }: Img) {
  return (
    <div className="relative mx-auto w-full">
      <div className="relative rounded-t-[1.1rem] bg-gradient-to-br from-primary via-[color-mix(in_oklch,var(--primary)_70%,black)] to-[color-mix(in_oklch,var(--brand-gradient)_60%,black)] p-[1.8%] pb-[1.3%] shadow-[0_35px_70px_-25px_color-mix(in_oklch,var(--primary)_65%,transparent)] ring-1 ring-white/20">
        <div className="relative overflow-hidden rounded-[0.4rem] bg-black p-[0.5%]">
          <Screen src={src} alt={alt} priority={priority} className="rounded-[0.3rem]" />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/[0.1] via-transparent to-transparent" aria-hidden />
        </div>
      </div>
      <div className="relative mx-auto h-[2%] min-h-[9px] w-[112%] -translate-x-[5.35%] rounded-b-[1.2rem] bg-gradient-to-b from-[color-mix(in_oklch,var(--primary)_60%,white)] to-[color-mix(in_oklch,var(--primary)_80%,black)] shadow-[0_18px_30px_-12px_color-mix(in_oklch,var(--primary)_60%,transparent)]" aria-hidden>
        <span className="absolute left-1/2 top-0 h-[55%] w-[16%] -translate-x-1/2 rounded-b-md bg-black/25" />
      </div>
    </div>
  );
}
