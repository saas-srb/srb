import { themePhotoFilters, type ThemeTokens } from "@/lib/products/sitecraft-ai/theme-shared";

/** The hidden SVG that defines the theme's photo-toning filters (see `themePhotoFilters`). Render once per page. */
export default function ThemeImageFilters({ tokens }: { tokens: ThemeTokens }) {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs dangerouslySetInnerHTML={{ __html: themePhotoFilters(tokens) }} />
    </svg>
  );
}
