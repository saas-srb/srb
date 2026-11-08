/**
 * The catalogue of component variants a theme can choose between, per slot
 * (header, footer, and each section type that has alternates). Metadata only
 * — no components — so it's safe to import from server code, client code and
 * the admin UI alike. The components behind each key live in
 * `theme-components.ts` (sections) and `(site)/layout.tsx` (header/footer).
 *
 * A variant is code (it's a component), but which variant each theme uses is
 * CMS data (`cms_theme.components`), chosen in the theme editor. Every slot's
 * first entry is "default" — the site's standard component — and anything
 * unselected or unknown falls back to it.
 */

export interface VariantOption {
  key: string;
  label: string;
  description: string;
}

export interface ThemeComponentSelections {
  header?: string;
  footer?: string;
  /** Section type -> variant key. */
  sections?: Record<string, string>;
  /** Page content width (WIDTH_VARIANTS). */
  width?: string;
  /** Vertical spacing between sections (DENSITY_VARIANTS). */
  density?: string;
  /** Photo treatment (IMAGE_VARIANTS). */
  images?: string;
  /** Card look (CARD_VARIANTS). */
  cards?: string;
  /** Header dropdown style (MENU_VARIANTS). */
  menu?: string;
}

export const HEADER_VARIANTS: VariantOption[] = [
  { key: "default", label: "Standard", description: "Full navigation bar with dropdown menus on desktop." },
  { key: "menu", label: "Menu only", description: "Logo and a menu button at every screen size; navigation opens in a side product." },
  { key: "centered", label: "Centered", description: "Logo centered on top with the navigation on its own row underneath." },
  { key: "floating", label: "Floating pill", description: "A rounded bar that floats above the page with space around it." },
];

/** Header height per variant at desktop width — the page content is pushed down by this much. */
export const HEADER_HEIGHT_DESKTOP: Record<string, number> = { default: 88, menu: 88, centered: 128, floating: 88 };

export const FOOTER_VARIANTS: VariantOption[] = [
  { key: "default", label: "Standard", description: "Call-to-action band, company details, social links and link columns." },
  { key: "compact", label: "Compact", description: "Slim footer: logo, contact, link columns and a small bottom bar." },
  { key: "centered", label: "Centered", description: "Everything stacked and centered: logo, links, social icons and copyright." },
  { key: "split", label: "Split (dark)", description: "Inverted dark footer: large call-to-action on the left, link columns on the right." },
  { key: "minimal", label: "Minimal", description: "A single slim row — logo, a few links, social icons and copyright." },
];

export const WIDTH_VARIANTS: VariantOption[] = [
  { key: "standard", label: "Standard", description: "The usual page width." },
  { key: "narrow", label: "Narrow", description: "A slightly tighter page width — calm and focused." },
  { key: "wide", label: "Wide", description: "Extra-wide pages that use more of large screens." },
];

export const DENSITY_VARIANTS: VariantOption[] = [
  { key: "comfortable", label: "Comfortable", description: "The usual spacing between sections." },
  { key: "compact", label: "Compact", description: "Tighter sections — more content per screen." },
  { key: "spacious", label: "Spacious", description: "Generous breathing room around every section." },
];

export const MENU_VARIANTS: VariantOption[] = [
  { key: "default", label: "Mega product", description: "A large product with a featured card and a grid of links." },
  { key: "list", label: "Compact list", description: "A small popover with an icon row for each link." },
  { key: "tiles", label: "Tile bar", description: "A full-width bar of icon tiles with descriptions." },
  { key: "minimal", label: "Minimal", description: "A slim text-only list with an accent line." },
];

export const IMAGE_VARIANTS: VariantOption[] = [
  { key: "natural", label: "Natural", description: "Photos exactly as uploaded." },
  { key: "themed", label: "Themed", description: "Photos are toned with the theme's colours so every image sits naturally in the design." },
];

export const CARD_VARIANTS: VariantOption[] = [
  { key: "classic", label: "Classic", description: "The standard soft cards with a subtle border and shadow." },
  { key: "outline", label: "Outline", description: "Flat, transparent cards with a crisp outline — editorial and light." },
  { key: "elevated", label: "Elevated", description: "Borderless cards lifted with a deep soft shadow." },
  { key: "glass", label: "Glass", description: "Translucent frosted cards that let the background show through." },
];

export const SECTION_VARIANTS: Record<string, VariantOption[]> = {
  "page-hero": [
    { key: "default", label: "Standard", description: "Split hero with photo card and floating badges." },
    { key: "terminal", label: "Terminal", description: "Centered dark hero on a grid, with code-style breadcrumbs and badge." },
    { key: "minimal", label: "Minimal", description: "Left-aligned heading with a soft gradient — no photo, lots of whitespace." },
    { key: "banner", label: "Photo banner", description: "Full-width photo banner with the heading laid over it." },
  ],
  "listing-hero": [
    { key: "default", label: "Standard", description: "Photo background with a left-aligned title." },
    { key: "centered", label: "Centered", description: "Centered title on a soft gradient — no photo." },
    { key: "split", label: "Split", description: "Title on the left, a rounded photo on the right." },
    { key: "banner", label: "Photo banner", description: "Full-width photo with the title laid over it." },
  ],
  "faq-accordion": [
    { key: "default", label: "Standard", description: "A centered accordion list." },
    { key: "cards", label: "Cards", description: "Questions as a two-column grid of open cards." },
    { key: "split", label: "Split", description: "Heading pinned on the left, questions on the right." },
  ],
  "detail-cta": [
    { key: "default", label: "Standard", description: "Rounded call-to-action card." },
    { key: "banner", label: "Banner", description: "A bold full-width colour band." },
    { key: "split", label: "Split", description: "Heading and button on one side, checklist on the other." },
  ],
  "home-hero": [
    { key: "default", label: "Standard", description: "Split hero with an animated product mock-up." },
    { key: "centered", label: "Centered", description: "Large centered headline, buttons and a row of highlights." },
    { key: "spotlight", label: "Spotlight", description: "Left-aligned giant headline on a gradient product with status cards." },
  ],
  "listing-grid": [
    { key: "default", label: "Standard", description: "A featured card followed by a three-column grid." },
    { key: "list", label: "Rows", description: "Alternating image-and-text rows, one item per row." },
    { key: "compact", label: "Icon cards", description: "A tidy grid of compact icon cards without photos." },
  ],
  "home-why-choose-us": [
    { key: "default", label: "Standard", description: "Four numbered cards in a row." },
    { key: "list", label: "Numbered list", description: "Large numbered rows with a divider between each reason." },
    { key: "split", label: "Split", description: "Heading pinned on the left, reasons stacked on the right." },
  ],
  "home-how-we-work": [
    { key: "default", label: "Standard", description: "Numbered step cards in a row." },
    { key: "timeline", label: "Timeline", description: "A vertical timeline with a connecting line." },
    { key: "numbered", label: "Big numbers", description: "Oversized step numbers across a horizontal strip." },
  ],
};

const knownOr = (options: VariantOption[], key: string | undefined, fallback: string) => (key && options.some((o) => o.key === key) ? key : fallback);
const known = (options: VariantOption[], key: string | undefined) => (key && options.some((o) => o.key === key) ? key : "default");

/** Drops unknown keys so a stale or hand-edited selection can never reference a variant that doesn't exist. */
export function normalizeSelections(raw: ThemeComponentSelections | undefined | null): Required<ThemeComponentSelections> {
  const sections: Record<string, string> = {};
  for (const [type, options] of Object.entries(SECTION_VARIANTS)) {
    const key = known(options, raw?.sections?.[type]);
    if (key !== "default") sections[type] = key;
  }
  return {
    header: known(HEADER_VARIANTS, raw?.header),
    footer: known(FOOTER_VARIANTS, raw?.footer),
    sections,
    menu: knownOr(MENU_VARIANTS, raw?.menu, "default"),
    images: knownOr(IMAGE_VARIANTS, raw?.images, "natural"),
    cards: knownOr(CARD_VARIANTS, raw?.cards, "classic"),
    width: knownOr(WIDTH_VARIANTS, raw?.width, "standard"),
    density: knownOr(DENSITY_VARIANTS, raw?.density, "comfortable"),
  };
}

/**
 * CSS for a theme's layout choices — page width, section spacing and the
 * header height the page content has to clear. Appended to the theme's own
 * CSS in the site layout (and by the customizer's live preview).
 */
export function layoutCss(sel: Required<ThemeComponentSelections>): string {
  let css = `:root{--site-header-h:88px;}`;
  const header = HEADER_HEIGHT_DESKTOP[sel.header] ?? 88;
  if (header !== 88) css += `@media (min-width:1280px){:root{--site-header-h:${header}px;}}`;
  // Relative to the standard page width, which itself grows on large screens: a narrow theme is a little tighter, never a thin column
  // with wide empty sides, and a wide theme uses more of the screen.
  const width = { narrow: "calc(var(--container-7xl) * 0.92)", wide: "calc(var(--container-7xl) * 1.15)" }[sel.width as "narrow" | "wide"];
  if (width) css += `html .max-w-7xl{max-width:${width};}`;
  const y = { compact: ["3.5rem", "4.5rem"], spacious: ["7rem", "10rem"] }[sel.density as "compact" | "spacious"];
  if (y) css += `html main .py-24{padding-block:${y[0]};}@media (min-width:40rem){html main .sm\\:py-32{padding-block:${y[1]};}}`;
  // Card look. Non-classic looks also take their corner radius from the theme, so a sharp theme has sharp cards.
  const card = 'html main :is([class*="rounded-3xl"],[class*="rounded-2xl"])[class*="border"]:not([data-plain])';
  if (sel.cards !== "classic") {
    css += `html main .rounded-3xl{border-radius:calc(var(--radius)*2.2);}html main .rounded-2xl{border-radius:calc(var(--radius)*1.7);}html main .rounded-xl{border-radius:calc(var(--radius)*1.2);}`;
  }
  if (sel.cards === "outline") css += `${card}{box-shadow:none!important;background-image:none!important;background-color:transparent!important;border-width:1.5px;border-color:color-mix(in srgb,var(--foreground) 22%,transparent)!important;}`;
  if (sel.cards === "elevated") css += `${card}{border-color:transparent!important;box-shadow:0 22px 44px -20px color-mix(in srgb,var(--foreground) 38%,transparent)!important;}`;
  if (sel.cards === "glass") css += `${card}{background-color:color-mix(in srgb,var(--background) 55%,transparent)!important;backdrop-filter:blur(14px);border-color:color-mix(in srgb,var(--foreground) 14%,transparent)!important;}`;
  // Photo treatment: duotone-toned via the SVG filters `ThemeImageFilters` renders (decorative / card photos; opt out with data-natural).
  if (sel.images === "themed") {
    const img = 'html body img[class*="object-cover"]:not([data-natural]):not([class*="rounded-full"])';
    css += `${img}{filter:url(#theme-photo);}html.dark ${img}{filter:url(#theme-photo-dark);}`;
  }
  return css;
}
