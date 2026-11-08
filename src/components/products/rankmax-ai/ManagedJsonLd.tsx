"use client";

import { escapeJsonForScript } from "@/lib/security/json-script";
import { usePathname } from "next/navigation";
import type { PublishedSchema } from "@/lib/products/rankmax-ai/public";

/**
 * Renders the JSON-LD published from the SEO product (/rankmax-ai/schema) for the
 * current public page. It lives in the (site) layout so no page has to opt in;
 * `usePathname` resolves during static rendering, so the scripts are in the
 * server HTML crawlers read. `json` is re-serialized with `<` escaped when it
 * is published, so it cannot close the script element.
 */
export default function ManagedJsonLd({ schemas }: { schemas: PublishedSchema[] }) {
  const pathname = usePathname() || "/";
  const matching = schemas.filter((s) => s.path === "*" || s.path === pathname);
  if (matching.length === 0) return null;
  return (
    <>
      {matching.map((s, i) => (
        <script key={`${s.path}-${i}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: escapeJsonForScript(s.json) }} />
      ))}
    </>
  );
}
