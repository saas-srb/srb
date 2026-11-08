import type { CategorySlug } from "@/lib/categories";

export interface ThemedColor {
  light: string;
  dark: string;
}

/**
 * Fixed-order categorical ramp built only from the brand palette —
 * blue -> coral -> coral-light -> blue-light -> slate — so category-comparison
 * charts match the rest of the admin product. Distinct enough to read apart at a
 * glance; single-series charts keep the plain brand-coral treatment.
 */
export const CATEGORY_CHART_COLORS: Record<CategorySlug, ThemedColor> = {
  "software-development": { light: "var(--brand-deep)", dark: "color-mix(in srgb, var(--brand-deep) 65%, white)" },
  "digital-marketing": { light: "#059669", dark: "#34d399" },
  "ai-automations": { light: "var(--primary)", dark: "var(--primary)" },
  "industrial-training": { light: "var(--brand-gradient)", dark: "var(--brand-gradient)" },
  "resource-augmentation": { light: "color-mix(in srgb, var(--brand-deep) 45%, white)", dark: "color-mix(in srgb, var(--brand-deep) 55%, white)" },
  "internship-program": { light: "#94a3b8", dark: "#94a3b8" },
};
