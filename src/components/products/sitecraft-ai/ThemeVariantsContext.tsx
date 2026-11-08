"use client";

import { createContext, useContext } from "react";

/**
 * The active theme's section-variant choices (section type -> variant key),
 * provided once by `(site)/layout.tsx` so every page's `SectionRenderer`
 * picks them up without each page passing them down. The theme preview
 * provides the previewed theme's choices instead.
 */
const ThemeVariantsContext = createContext<Record<string, string>>({});

export function ThemeVariantsProvider({ sections, children }: { sections: Record<string, string>; children: React.ReactNode }) {
  return <ThemeVariantsContext.Provider value={sections}>{children}</ThemeVariantsContext.Provider>;
}

export function useSectionVariants(): Record<string, string> {
  return useContext(ThemeVariantsContext);
}
