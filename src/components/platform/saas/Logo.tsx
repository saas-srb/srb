import Link from "next/link";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

/** The product logo from /public/selfrun/logo: the mark with "SelfRun / BUSINESS" beside it, in the light or the dark version to suit the theme. */
export default function Logo({ href = "/", height = 46 }: { href?: string; height?: number }) {
  const w = Math.round(height * (597 / 189));
  const a = SAAS_BRAND.assets;
  return (
    <Link href={href} className="inline-flex items-center" aria-label={`${SAAS_BRAND.name} — home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.logo} alt={SAAS_BRAND.name} width={w} height={height} className="block w-auto [[data-theme=dark]_&]:hidden" style={{ height }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.logoDark} alt={SAAS_BRAND.name} width={w} height={height} className="hidden w-auto [[data-theme=dark]_&]:block" style={{ height }} />
    </Link>
  );
}
