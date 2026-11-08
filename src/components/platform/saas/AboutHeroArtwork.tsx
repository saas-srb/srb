import Image from "next/image";
import PanelOrbit, { type OrbitPanel } from "@/components/platform/saas/PanelOrbit";

/** Reuses the home page's product orbit and pairs it with the original About artwork. */
export default function AboutHeroArtwork({ panels, brand }: { panels: OrbitPanel[]; brand: string }) {
  return (
    <div className="mx-auto grid w-full max-w-[900px] items-center gap-3 sm:gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,.38fr)]">
      <PanelOrbit panels={panels} brand={brand} />
      <div className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-[1.4rem] border border-white/75 bg-white/70 shadow-[0_20px_55px_rgba(57,45,123,.2)] ring-1 ring-violet-200/40 md:max-w-none">
        <Image
          src="/selfrun/hero/about.webp"
          alt="SelfRun workspace and product ecosystem artwork"
          width={2240}
          height={1568}
          priority
          className="h-auto w-full"
        />
      </div>
    </div>
  );
}
