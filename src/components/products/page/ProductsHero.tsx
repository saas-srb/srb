"use client";

import Link from "next/link";
import { ArrowRight, Boxes } from "lucide-react";
import ListingHero from "@/components/sections/ListingHero";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/products/page/cta-styles";
import { SIGNUP_PATH } from "@/lib/products/shared";

/**
 * The /products hero: the same `ListingHero` Services, Industries and Software Development use (photo behind a
 * background wash, icon tile, eyebrow, big title), with the two calls to action.
 */
export default function ProductsHero({ text }: { text: Record<string, string> }) {
  return (
    <ListingHero eyebrow={text["products.listing.heroEyebrow"]} title={text["products.listing.heroTitle"]} description={text["products.listing.description"]} icon={Boxes} image={text["products.listing.heroImage"]}>
      <Link href={SIGNUP_PATH} className={BTN_PRIMARY}>
        {text["products.cta.startAutomating"]}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
      </Link>
      <a href="#demo" className={BTN_SECONDARY}>
        {text["products.cta.requestDemo"]}
      </a>
    </ListingHero>
  );
}
