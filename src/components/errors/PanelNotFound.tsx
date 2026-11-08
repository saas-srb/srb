"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import BrandBackdrop from "@/components/ui/BrandBackdrop";
import ArcadeStage from "@/components/game/ArcadeStage";
import { buttonVariants } from "@/components/ui/button";

/**
 * The 404 of a product: the same moving stage as the website's 404 (the company's own logo and name, the lost cartoon runner at a
 * leaning "404" signpost), but drawn inside the product so the sidebar and top bar stay and the person can simply carry on. The way back
 * is the product's own start page (the first part of the address).
 */
export default function PanelNotFound() {
  const pathname = usePathname() ?? "/";
  const first = pathname.split("/")[1] ?? "";
  const home = first ? `/${first}` : "/commandos";
  return (
    <div className="relative overflow-hidden rounded-3xl px-1 py-6 sm:px-4" role="status">
      <BrandBackdrop />
      <ArcadeStage code="404" chip="Page not found" title="This page can’t be found" description="The address may be mistyped, or the page may have been moved, renamed or removed." gamePage="404">
        <Link href={home} className={buttonVariants({ size: "lg" })}>
          Back to dashboard <ArrowRight className="size-4" data-icon="inline-end" />
        </Link>
        <p className="mt-3 text-xs text-muted-foreground">Or play a round while you are here.</p>
      </ArcadeStage>
    </div>
  );
}
