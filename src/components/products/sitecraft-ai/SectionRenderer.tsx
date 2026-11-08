"use client";

import * as React from "react";

import { SECTION_REGISTRY, type PageSection } from "@/lib/products/sitecraft-ai/section-registry";
import { resolveSectionRenderer } from "@/lib/products/sitecraft-ai/theme-components";
import { useSectionVariants } from "@/components/products/sitecraft-ai/ThemeVariantsContext";
import { useCollectionsRuntime } from "@/components/products/sitecraft-ai/CollectionsContext";
import { useSiteInfo } from "@/components/products/sitecraft-ai/SiteInfoContext";

/**
 * Renders a page's sections through the type registry. Unknown types and
 * configs that fail to parse are skipped, never thrown — a bad CMS write
 * must never break the live site (same fail-soft principle as the SEO
 * product's metadata overrides).
 *
 * `config.parse`/`toProps` always come from the base `SECTION_REGISTRY`
 * entry (content shape is theme-agnostic); which component renders the
 * resolved props can differ per theme: the active theme's variant choices
 * come from `ThemeVariantsProvider` (set once in `(site)/layout.tsx`, or by
 * the theme preview) and are resolved by `resolveSectionRenderer`.
 *
 * Client component: `toProps()` resolves icon keys into real icon component
 * references, and a component reference can't cross the server/client
 * boundary as a prop — only the (JSON-safe) `sections` data does that, from
 * the server page down into this component.
 */
export default function SectionRenderer({
  sections,
  runtimeProps,
}: {
  sections: PageSection[];
  /**
   * Request-time props for specific section types, keyed by type — for things
   * that must never live in stored config (e.g. the contact page's ?category
   * pre-selection and its CMS form fields, /register's ?ref code).
   */
  runtimeProps?: Record<string, Record<string, unknown>>;
}) {
  const variants = useSectionVariants();
  const collections = useCollectionsRuntime();
  const { brand } = useSiteInfo();
  const ctx = React.useMemo(() => ({ ...collections, brand }), [collections, brand]);
  const ordered = [...sections].filter((s) => s.enabled).sort((a, b) => a.orderKey - b.orderKey);

  return (
    <>
      {ordered.map((section) => {
        const def = SECTION_REGISTRY[section.type];
        if (!def) return null;
        const config = def.parse(section.config);
        if (!config) return null;
        const base = def.toProps(config, ctx);
        if (!base) return null;
        const props = { ...base, ...runtimeProps?.[section.type] };
        const Renderer = resolveSectionRenderer(section.type, variants[section.type]);
        if (!Renderer) return null;
        return <Renderer key={section.id} {...props} />;
      })}
    </>
  );
}
