/**
 * Hand-written style "recipes" for a generated website. The AI chooses ONE option per group (buttons, headings, section bands, hero
 * decoration, card accent, header, texture, links); the CSS for each option lives here, so a generated site can look clearly its own
 * (not just a different colour) while the CSS stays safe: nothing the AI writes is ever put into a stylesheet. Colours always come from
 * the theme variables, so light and dark mode both work. Pure; no data access.
 */

export const STYLE_GROUPS = {
  buttons: ["pill", "soft", "sharp", "chunky", "outline"],
  headings: ["plain", "tight", "accent-bar", "uppercase", "underline"],
  bands: ["none", "banded", "hairline", "framed", "tinted-rows"],
  heroDecor: ["none", "grid", "dots", "stripes", "glow"],
  cardAccent: ["none", "top-bar", "left-bar", "tint", "corner"],
  headerStyle: ["plain", "accent-line", "tinted", "elevated", "underlined"],
  texture: ["plain", "paper", "mesh", "dotgrid"],
  links: ["plain", "underline", "highlight"],
} as const;
export type StyleChoice = { [K in keyof typeof STYLE_GROUPS]: (typeof STYLE_GROUPS)[K][number] };

/** Written at the start of a generated stylesheet, so a theme made before style recipes existed can be recognised and upgraded once. */
export const STYLE_MARKER = "/*ai-style*/";

const CARD = 'html main :is([class*="rounded-3xl"],[class*="rounded-2xl"])[class*="border"]:not([data-plain])';
const BTN = 'html main a[class*="rounded-full"][class*="px-"], html main button[class*="rounded-full"][class*="px-"], html header a[class*="rounded-full"][class*="px-"]';
const FIRST = "html main > section:first-of-type, html main > div > section:first-of-type, html main section:first-of-type";
const SECTION = "html main > section, html main > div > section";

const RECIPES: { [K in keyof StyleChoice]: Record<string, string> } = {
  buttons: {
    pill: "",
    soft: `${BTN}{border-radius:0.9rem !important;}`,
    sharp: `${BTN}{border-radius:0.2rem !important;text-transform:uppercase;letter-spacing:.06em;font-size:.8em;}`,
    chunky: `${BTN}{border-radius:1rem !important;box-shadow:0 5px 0 0 color-mix(in srgb,var(--foreground) 22%,transparent);transition:transform .12s,box-shadow .12s;}${BTN.replaceAll(",", ":active,")}:active{transform:translateY(3px);box-shadow:0 2px 0 0 color-mix(in srgb,var(--foreground) 22%,transparent);}`,
    outline: `${BTN}{background-color:transparent !important;border:2px solid currentColor;}`,
  },
  headings: {
    plain: "",
    tight: "html main h1,html main h2{letter-spacing:-0.035em;line-height:1.04;font-weight:800;}",
    "accent-bar": 'html main h2{position:relative;padding-bottom:.55em;}html main h2::after{content:"";position:absolute;left:0;bottom:0;width:3.2rem;height:4px;border-radius:4px;background:var(--primary);}html main .text-center h2::after,html main h2.text-center::after{left:50%;transform:translateX(-50%);}',
    uppercase: "html main h2{text-transform:uppercase;letter-spacing:.08em;font-weight:800;font-size:0.92em;}",
    underline: "html main h2 span,html main h1 span{text-decoration:underline;text-decoration-thickness:.12em;text-underline-offset:.16em;text-decoration-color:color-mix(in srgb,var(--primary) 55%,transparent);}",
  },
  bands: {
    none: "",
    banded: `${SECTION}:nth-of-type(even){background-color:color-mix(in srgb,var(--primary) 6%,var(--background));}`,
    hairline: `${SECTION}+section,html main > section+section{border-top:1px solid var(--border);}`,
    framed: `${SECTION}{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--border) 70%,transparent);}`,
    "tinted-rows": `${SECTION}:nth-of-type(3n+2){background-color:color-mix(in srgb,var(--secondary) 55%,var(--background));}${SECTION}:nth-of-type(3n){background-color:color-mix(in srgb,var(--accent) 45%,var(--background));}`,
  },
  heroDecor: {
    none: "",
    grid: `${FIRST}{background-image:linear-gradient(color-mix(in srgb,var(--foreground) 6%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--foreground) 6%,transparent) 1px,transparent 1px);background-size:36px 36px;}`,
    dots: `${FIRST}{background-image:radial-gradient(color-mix(in srgb,var(--primary) 22%,transparent) 1.4px,transparent 1.4px);background-size:22px 22px;}`,
    stripes: `${FIRST}{background-image:repeating-linear-gradient(135deg,color-mix(in srgb,var(--primary) 7%,transparent) 0 14px,transparent 14px 28px);}`,
    glow: `${FIRST}{background-image:radial-gradient(60rem 28rem at 85% -10%,color-mix(in srgb,var(--primary) 22%,transparent),transparent 60%),radial-gradient(40rem 24rem at 0% 110%,color-mix(in srgb,var(--accent) 60%,transparent),transparent 60%);}`,
  },
  cardAccent: {
    none: "",
    "top-bar": `${CARD}{border-top:4px solid var(--primary) !important;}`,
    "left-bar": `${CARD}{border-left:5px solid var(--primary) !important;}`,
    tint: `${CARD}{background-color:color-mix(in srgb,var(--primary) 5%,var(--card)) !important;}`,
    corner: `${CARD}{position:relative;overflow:hidden;}${CARD}::after{content:"";position:absolute;top:0;right:0;width:3.4rem;height:3.4rem;background:linear-gradient(225deg,color-mix(in srgb,var(--primary) 30%,transparent) 0 50%,transparent 50%);pointer-events:none;}`,
  },
  headerStyle: {
    plain: "",
    "accent-line": "html header{box-shadow:inset 0 -3px 0 0 var(--primary);}",
    tinted: "html header{background-color:color-mix(in srgb,var(--primary) 8%,var(--background)) !important;}",
    elevated: "html header{box-shadow:0 10px 30px -18px color-mix(in srgb,var(--foreground) 45%,transparent);border-bottom-color:transparent !important;}",
    underlined: "html header nav>div>div>a:hover,html header nav a[aria-current]{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:8px;text-decoration-color:var(--primary);}",
  },
  texture: {
    plain: "",
    paper: "html body{background-image:radial-gradient(color-mix(in srgb,var(--foreground) 5%,transparent) 0.6px,transparent 0.6px);background-size:5px 5px;}",
    mesh: "html body{background-image:radial-gradient(50rem 30rem at 0% 0%,color-mix(in srgb,var(--primary) 9%,transparent),transparent 70%),radial-gradient(45rem 28rem at 100% 100%,color-mix(in srgb,var(--accent) 40%,transparent),transparent 70%);background-attachment:fixed;}",
    dotgrid: "html body{background-image:radial-gradient(color-mix(in srgb,var(--foreground) 9%,transparent) 1px,transparent 1px);background-size:26px 26px;}",
  },
  links: {
    plain: "",
    underline: "html main p a,html footer a:hover{text-decoration:underline;text-underline-offset:4px;text-decoration-color:color-mix(in srgb,var(--primary) 60%,transparent);}",
    highlight: "html main p a{background:linear-gradient(transparent 62%,color-mix(in srgb,var(--primary) 28%,transparent) 62%);text-decoration:none;}",
  },
};

/** A stable pick from `options` that depends on the seed (the business) and a salt (which setting it is), so two businesses rarely share a combination. */
export function seededPick<T>(options: readonly T[], seed: string, salt: string): T {
  let h = 5381;
  for (const ch of `${seed}|${salt}`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return options[((h ^ (h >>> 16)) >>> 0) % options.length];
}

/** A stable, valid choice for every group: the AI's pick when it is one of the options, otherwise one derived from the business's name. */
export function resolveStyle(raw: Partial<Record<keyof StyleChoice, string>> | undefined, seed: string): StyleChoice {
  const out = {} as Record<string, string>;
  for (const g of Object.keys(STYLE_GROUPS) as (keyof StyleChoice)[]) {
    const options = STYLE_GROUPS[g] as readonly string[];
    const picked = raw?.[g];
    // The AI's taste decides the buttons, the hero decoration and the texture (they carry the mood); everything else is spread across the
    // options by the business itself, because left to itself the AI picks the same few combinations for everyone.
    const aiDecides = g === "buttons" || g === "heroDecor" || g === "texture";
    out[g] = aiDecides && picked && options.includes(picked) ? picked : seededPick(options, seed, g);
  }
  return out as unknown as StyleChoice;
}

/** The stylesheet for a choice (empty options add nothing). */
export function buildStyleCss(style: StyleChoice): string {
  return `${STYLE_MARKER}\n${(Object.keys(STYLE_GROUPS) as (keyof StyleChoice)[]).map((g) => RECIPES[g][style[g]] ?? "").filter(Boolean).join("\n")}`;
}
