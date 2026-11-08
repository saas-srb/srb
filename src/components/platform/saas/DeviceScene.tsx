import { BrandLaptop, GlassLaptop, MacBookBlack, MacBookSilver, OpenLaptop, WindowsLaptop } from "@/components/platform/saas/Devices";
import { screenFor } from "@/lib/platform/saas/screens";

/** Which laptop and backdrop a scene uses. Pages rotate through these so neighbouring screenshots never look alike. */
export type SceneVariant = 0 | 1 | 2 | 3 | 4 | 5;

/** A real screen of the product on a laptop — six different laptop designs, each with its own backdrop. */
export default function DeviceScene({ screenKey, name, variant = 0, priority = false }: { screenKey: string; name: string; variant?: SceneVariant; priority?: boolean; labels?: boolean; url?: string }) {
  const src = screenFor(screenKey);
  if (!src) return null;
  const alt = `${name} — real screen of the product on a laptop`;

  switch (variant) {
    case 1:
      return (
        <div className="relative px-[2%] pb-[4%] pt-[3%]">
          <div className="pointer-events-none absolute inset-x-[8%] inset-y-[8%] rounded-[3rem] bg-gradient-to-br from-[#161a26] to-[#2a2f48] opacity-[0.07]" aria-hidden />
          <div className="sr-shot-glow" aria-hidden />
          <MacBookBlack src={src} alt={alt} priority={priority} />
        </div>
      );
    case 2:
      return (
        <div className="relative px-[3%] pb-[5%] pt-[3%]">
          <div className="pointer-events-none absolute -left-[4%] top-0 h-[70%] w-[55%] rounded-full bg-primary/25 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -right-[4%] bottom-0 h-[70%] w-[55%] rounded-full bg-brand-accent/25 blur-3xl" aria-hidden />
          <GlassLaptop src={src} alt={alt} priority={priority} />
        </div>
      );
    case 3:
      return (
        <div className="relative px-[2%] pb-[3%] pt-[2%]">
          <div className="sr-shot-glow" aria-hidden />
          <OpenLaptop src={src} alt={alt} priority={priority} />
        </div>
      );
    case 4:
      return (
        <div className="relative px-[3%] pb-[5%] pt-[3%]">
          <div className="pointer-events-none absolute inset-x-[2%] bottom-0 h-[34%] rounded-[50%] bg-gradient-to-r from-sky-400/25 via-primary/20 to-brand-accent/25 blur-2xl" aria-hidden />
          <WindowsLaptop src={src} alt={alt} priority={priority} />
        </div>
      );
    case 5:
      return (
        <div className="relative px-[3%] pb-[5%] pt-[4%]" style={{ perspective: "1800px" }}>
          <div className="sr-shot-glow" aria-hidden />
          <div style={{ transform: "rotateY(-10deg) rotateX(4deg)", transformStyle: "preserve-3d" }}><BrandLaptop src={src} alt={alt} priority={priority} /></div>
        </div>
      );
    default:
      return (
        <div className="relative px-[2%] pb-[4%] pt-[2%]">
          <div className="sr-shot-glow" aria-hidden />
          <MacBookSilver src={src} alt={alt} priority={priority} />
        </div>
      );
  }
}
