import type { ComponentType } from "react";
import AIPageHero from "@/components/sections/ai-theme/AIPageHero";
import { PageHeroMinimal, PageHeroBanner } from "@/components/sections/variants/PageHeroVariants";
import { HomeHeroCentered, HomeHeroSpotlight } from "@/components/sections/variants/HomeHeroVariants";
import { ListingGridRows, ListingGridCompact } from "@/components/sections/variants/ListingGridVariants";
import { ListingHeroCentered, ListingHeroSplit, ListingHeroBanner } from "@/components/sections/variants/ListingHeroVariants";
import { FaqCards, FaqSplit, DetailCtaBanner, DetailCtaSplit } from "@/components/sections/variants/FaqCtaVariants";
import { WhyChooseUsList, WhyChooseUsSplit, StepsTimeline, StepsNumbered } from "@/components/sections/variants/HomeStepsVariants";
import { SECTION_REGISTRY } from "@/lib/products/sitecraft-ai/section-registry";

/**
 * Section type -> variant key -> alternate renderer, for the variants listed
 * in `component-variants.ts`. Which variant a theme uses is CMS data
 * (`cms_theme.components.sections`), not code. "default" (or anything
 * unmapped) is the base `SECTION_REGISTRY[type].Renderer`.
 * `config.parse`/`toProps` always stay on the base registry entry; only
 * which component renders the resolved props differs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_VARIANT_RENDERERS: Record<string, Record<string, ComponentType<any>>> = {
  "page-hero": { terminal: AIPageHero, minimal: PageHeroMinimal, banner: PageHeroBanner },
  "listing-hero": { centered: ListingHeroCentered, split: ListingHeroSplit, banner: ListingHeroBanner },
  "faq-accordion": { cards: FaqCards, split: FaqSplit },
  "detail-cta": { banner: DetailCtaBanner, split: DetailCtaSplit },
  "home-hero": { centered: HomeHeroCentered, spotlight: HomeHeroSpotlight },
  "listing-grid": { list: ListingGridRows, compact: ListingGridCompact },
  "home-why-choose-us": { list: WhyChooseUsList, split: WhyChooseUsSplit },
  "home-how-we-work": { timeline: StepsTimeline, numbered: StepsNumbered },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveSectionRenderer(type: string, variantKey?: string): ComponentType<any> | null {
  return (variantKey ? SECTION_VARIANT_RENDERERS[type]?.[variantKey] : undefined) ?? SECTION_REGISTRY[type]?.Renderer ?? null;
}
