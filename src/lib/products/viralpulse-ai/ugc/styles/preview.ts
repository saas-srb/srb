/**
 * Style previews: a pure scene composer. From a style and a variation it describes, as plain data, what a storyboard of that style looks
 * like: the room, the light, the props, the camera framing, where the (abstract, stylised) figures stand, and the caption and subtitle
 * of every beat. The UI draws this as an SVG illustration. Nothing here is a photo, a video or a real person, and no AI call is made.
 */
import { HOOK_FORMULAS } from "./catalogue-base";
import type { AspectRatio, BeatRole, UgcStyle, Variation } from "./types";

export type RoomKind =
  | "bedroom" | "living" | "balcony" | "kitchen" | "cafe" | "office" | "market" | "campus" | "gym" | "shop" | "car" | "park"
  | "rooftop" | "dining" | "study" | "mirror" | "doorway" | "festive" | "courtyard" | "generic"
  | "reception" | "salon" | "restaurant" | "workshop" | "showroom" | "warehouse" | "classroom" | "farm" | "jewellery" | "flat" | "travel"
  | "stage" | "studio" | "screen" | "factory" | "site" | "venue" | "rain" | "puja" | "temple" | "gaming";

const ROOM_BY_SETTING: Record<string, RoomKind> = {
  "bedroom-floor-cosy": "bedroom", "living-room-sofa": "living", "balcony-evening": "balcony", "home-kitchen": "kitchen", "cafe-corner": "cafe",
  "coworking-office": "office", "small-office-desk": "office", "street-market-lane": "market", "college-campus-steps": "campus", "gym-floor": "gym",
  "shop-counter": "shop", "parked-car": "car", "park-bench": "park", "rooftop-dusk": "rooftop", "dining-table": "dining", "study-desk-room": "study",
  "dressing-mirror": "mirror", "doorstep-entry": "doorway", "festive-living-room": "festive", "courtyard-home": "courtyard",
  "clinic-reception": "reception", "salon-chair": "salon", "restaurant-pass": "restaurant", "workshop-bench": "workshop", "showroom-floor": "showroom",
  "warehouse-aisle": "warehouse", "classroom-board": "classroom", "farm-field": "farm", "jewellery-counter": "jewellery", "flat-tour-room": "flat",
  "travel-viewpoint": "travel", "event-stage": "stage", "studio-desk-set": "studio", "screen-recording-frame": "screen", "factory-floor": "factory",
  "construction-site": "site", "wedding-decor-hall": "venue", "monsoon-window": "rain", "puja-corner": "puja", "temple-courtyard": "temple", "gaming-setup": "gaming",
};

const ROOM_KEYWORDS: Array<[RegExp, RoomKind]> = [
  [/bed/i, "bedroom"], [/sofa|living/i, "living"], [/balcon/i, "balcony"], [/kitchen/i, "kitchen"], [/caf[eé]|coffee/i, "cafe"], [/office|desk|cowork/i, "office"],
  [/market|street|lane/i, "market"], [/campus|college/i, "campus"], [/gym/i, "gym"], [/shop|store|counter/i, "shop"], [/car\b|vehicle/i, "car"], [/park|garden/i, "park"],
  [/roof|terrace/i, "rooftop"], [/dining|table/i, "dining"], [/mirror|dressing/i, "mirror"], [/door|entrance|entry/i, "doorway"], [/festiv|diwali|diya/i, "festive"], [/courtyard/i, "courtyard"],
  [/reception|clinic/i, "reception"], [/salon/i, "salon"], [/restaurant|kitchen pass/i, "restaurant"], [/workshop|workbench/i, "workshop"], [/showroom/i, "showroom"],
  [/warehouse/i, "warehouse"], [/classroom/i, "classroom"], [/farm|field/i, "farm"], [/jewel/i, "jewellery"], [/flat|apartment/i, "flat"], [/travel|viewpoint/i, "travel"],
  [/stage|event hall/i, "stage"], [/studio/i, "studio"], [/screen/i, "screen"], [/factory|plant floor/i, "factory"], [/contractor|construction|site/i, "site"],
  [/wedding|banquet/i, "venue"], [/rain|monsoon/i, "rain"], [/prayer|puja/i, "puja"], [/temple/i, "temple"], [/gaming/i, "gaming"],
];

export function roomKindFor(setting: Pick<Variation["setting"], "id" | "label">): RoomKind {
  const direct = ROOM_BY_SETTING[setting.id];
  if (direct) return direct;
  const hit = ROOM_KEYWORDS.find(([re]) => re.test(setting.label));
  return hit ? hit[1] : "generic";
}

/* ---------------- light ---------------- */

export type DayPart = "morning" | "day" | "golden" | "dusk" | "night";

export function dayPartFor(timeOfDay: string): DayPart {
  const t = timeOfDay.toLowerCase();
  if (/night|late night|after hours|pre-party/.test(t)) return "night";
  if (/dusk|blue|evening/.test(t) && !/early evening/.test(t)) return "dusk";
  if (/golden|late afternoon|early evening/.test(t)) return "golden";
  if (/morning|breakfast|sunday/.test(t)) return "morning";
  return "day";
}

export interface ScenePalette {
  dayPart: DayPart;
  /** Sky or upper wall gradient [top, bottom]. */
  top: [string, string];
  wall: string;
  floor: string;
  /** Soft light colour and strength (0-1). */
  glow: string;
  glowStrength: number;
  /** Foreground ink for furniture silhouettes. */
  ink: string;
  dark: boolean;
}

const PALETTES: Record<DayPart, Omit<ScenePalette, "dayPart" | "glow" | "glowStrength">> = {
  morning: { top: ["hsl(200 70% 88%)", "hsl(40 90% 90%)"], wall: "hsl(38 40% 86%)", floor: "hsl(30 25% 62%)", ink: "hsl(28 22% 34%)", dark: false },
  day: { top: ["hsl(205 75% 84%)", "hsl(200 60% 92%)"], wall: "hsl(210 25% 88%)", floor: "hsl(28 20% 66%)", ink: "hsl(220 14% 34%)", dark: false },
  golden: { top: ["hsl(28 90% 72%)", "hsl(42 95% 86%)"], wall: "hsl(30 55% 80%)", floor: "hsl(24 35% 52%)", ink: "hsl(18 30% 28%)", dark: false },
  dusk: { top: ["hsl(250 40% 36%)", "hsl(18 80% 62%)"], wall: "hsl(262 24% 36%)", floor: "hsl(250 20% 24%)", ink: "hsl(250 25% 14%)", dark: true },
  night: { top: ["hsl(230 40% 14%)", "hsl(240 35% 24%)"], wall: "hsl(232 28% 22%)", floor: "hsl(232 24% 15%)", ink: "hsl(232 30% 9%)", dark: true },
};

export function paletteFor(timeOfDay: string, lighting: string): ScenePalette {
  const dayPart = dayPartFor(timeOfDay);
  const base = PALETTES[dayPart];
  const l = lighting.toLowerCase();
  let glow = "hsl(40 100% 70%)";
  let glowStrength = base.dark ? 0.55 : 0.3;
  if (/fairy|lamp|bulb|diya|warm|golden|pendant/.test(l)) { glow = "hsl(36 100% 66%)"; glowStrength += 0.15; }
  if (/led|cool|office|panel/.test(l)) { glow = "hsl(200 80% 88%)"; glowStrength = Math.max(glowStrength, 0.25); }
  if (/overcast|flat|soft/.test(l)) glowStrength -= 0.1;
  if (/harsh|midday|sun/.test(l) && !base.dark) { glow = "hsl(48 100% 84%)"; glowStrength += 0.1; }
  return { dayPart, ...base, glow, glowStrength: Math.min(0.85, Math.max(0.1, Math.round(glowStrength * 100) / 100)) };
}

/* ---------------- props and decor ---------------- */

export type Glyph = "plant" | "mug" | "lamp" | "books" | "laptop" | "lights" | "window" | "frame" | "blanket" | "bottle" | "bag" | "plate" | "phone" | "diya" | "flowers" | "sign" | "clock" | "box" | "dumbbell" | "board"
  | "tools" | "gem" | "mic" | "crate" | "chair" | "keys" | "umbrella" | "bell" | "controller";

const GLYPH_RULES: Array<[RegExp, Glyph]> = [
  [/hammer|spanner|tools|measuring tape|scissors|comb|pegboard|ladder|sickle|sawdust|half-finished/i, "tools"], [/velvet|loupe|showcase|weighing scale/i, "gem"],
  [/microphone|podium/i, "mic"], [/pallet|crate|conveyor|machine|finished parts|produce/i, "crate"], [/chairs?\b|stool|waiting bench/i, "chair"],
  [/\bkeys?\b|key tray|car-key/i, "keys"], [/umbrella/i, "umbrella"], [/register|brochure(?! stand)|clipboard|label printer|\bmap\b/i, "books"],
  [/notification|toggle|progress bar/i, "phone"], [/floral arch/i, "flowers"], [/dispenser|ladle/i, "bottle"], [/order slips|banner backdrop|display stand|brochure stand|reception desk|safety markings/i, "sign"],
  [/\bbell\b/i, "bell"], [/controller|headset|mouse pad|second monitor/i, "controller"], [/prasad|incense/i, "plate"], [/stone pillar|cloth bag/i, "bag"],
  [/towel/i, "blanket"], [/balcony door|curtains/i, "window"], [/sun hat|straw hat|gamchha|gift pouch|camera strap/i, "bag"], [/green board|chalk/i, "board"], [/desk bell|water can/i, "bottle"],
  [/plant|tulsi|potted/i, "plant"], [/mug|cup|tea|tumbler|coffee|chai|thermos|glass/i, "mug"], [/lamp|bulb|diya/i, "lamp"], [/book|files|folders|notepad|notebook|ledger|highlighter|planner/i, "books"],
  [/laptop|monitor|computer/i, "laptop"], [/string|fairy|festoon|lights/i, "lights"], [/window/i, "window"], [/photo|polaroid|frame|picture/i, "frame"], [/blanket|cushion|mat\b|rug/i, "blanket"],
  [/bottle|shaker|jug|bucket|pot\b/i, "bottle"], [/bag|backpack|tote|carton|box|cartons/i, "bag"], [/plate|bowl|biscuit|snack|fries|sweets|fruit|dish|steel plates/i, "plate"], [/phone|speaker|earphone|headphone|charger/i, "phone"],
  [/marigold|garland|flower|rangoli|toran/i, "flowers"], [/sign|banner|board|notice|menu|calendar/i, "sign"], [/clock/i, "clock"], [/dumbbell|band|towel|gym/i, "dumbbell"], [/whiteboard|sticky/i, "board"],
];

export function propGlyphs(props: string[]): Glyph[] {
  const out: Glyph[] = [];
  for (const p of props) {
    const hit = GLYPH_RULES.find(([re]) => re.test(p));
    const g: Glyph = hit ? hit[1] : "box";
    if (!out.includes(g)) out.push(g);
  }
  return out.slice(0, 3);
}

/** Background decor the setting text itself calls for (fairy lights, plants, a window...). */
export function decorFor(setting: Variation["setting"]): Glyph[] {
  const text = `${setting.description} ${setting.lighting}`.toLowerCase();
  const out: Glyph[] = [];
  if (/fairy|string lights|festoon|strings of lights|diya/.test(text)) out.push("lights");
  if (/plant|tulsi/.test(text)) out.push("plant");
  if (/window|daylight/.test(text)) out.push("window");
  if (/photo|polaroid|family photos|frame/.test(text)) out.push("frame");
  return out;
}

/* ---------------- camera framing and figures ---------------- */

export type Framing = "selfie" | "mirror" | "tripod" | "over-shoulder" | "two-shot" | "split" | "pov" | "topdown" | "wide" | "handheld" | "screen-rec" | "anchor" | "carousel";

export function framingFor(camera: string, actorCount: number): Framing {
  const c = camera.toLowerCase();
  if (/screen-record|screen record|picture-in-picture/.test(c)) return "screen-rec";
  if (/swipe-card|slide cards|cards sliding/.test(c)) return "carousel";
  if (/anchor/.test(c)) return "anchor";
  if (/split-screen|split screen/.test(c)) return "split";
  if (/over[- ](?:one |the )?(?:\w+'s |\w+ )?shoulder/.test(c)) return "over-shoulder";
  if (/mirror/.test(c)) return "mirror";
  if (/first-person|\bpov\b/.test(c)) return "pov";
  if (/top-down|overhead|macro|flat ?lay/.test(c)) return "topdown";
  if (/selfie|front[- ]camera|dashboard mount/.test(c)) return "selfie";
  if (/two-shot|two phones|both|between the two/.test(c)) return "two-shot";
  if (/tripod|propped|static|locked|on a shelf|against/.test(c)) return actorCount > 1 ? "two-shot" : "tripod";
  if (/\bwide\b/.test(c)) return "wide";
  return actorCount > 1 ? "two-shot" : "handheld";
}

export interface FigureSpec {
  /** Centre x as a fraction of the frame width; feet y as a fraction of frame height. */
  x: number;
  y: number;
  /** Head-to-feet height as a fraction of frame height. */
  size: number;
  /** -1 faces left, 1 faces right, 0 faces the camera. */
  facing: -1 | 0 | 1;
  /** Seen from behind (over-the-shoulder foreground). */
  back: boolean;
  /** Wardrobe tint (an HSL string) so two people never look the same. */
  tint: string;
  /** Index of the cast member this stands for. */
  actor: number;
}

const SHOT_SCALE: Record<BeatRole, number> = { hook: 1.18, body: 1, proof: 0.82, cta: 0.9 };
export const SHOT_LABEL: Record<BeatRole, string> = { hook: "Close-up", body: "Medium shot", proof: "Detail cut-in", cta: "Wider shot" };

function fnv(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const WARDROBE_HUES: Array<[RegExp, number]> = [
  [/mustard|yellow|gold|turmeric/i, 44], [/olive|sage|green|mint|teal/i, 150], [/blue|navy|indigo|denim/i, 214], [/red|maroon|rust|coral|magenta|pink/i, 8],
  [/purple|lilac|violet/i, 270], [/brown|beige|cream|khaki/i, 30], [/grey|gray|black|charcoal/i, 220],
];

export function tintFor(archetypeId: string, wardrobe: string): string {
  const hit = WARDROBE_HUES.find(([re]) => re.test(wardrobe));
  const hue = hit ? hit[1] : fnv(archetypeId) % 360;
  const neutral = /grey|gray|black|charcoal|white/i.test(wardrobe);
  return `hsl(${hue} ${neutral ? 8 : 42}% ${/white|cream|beige/i.test(wardrobe) ? 78 : 46}%)`;
}

/** Where the figures stand for one beat. Pure and deterministic: the same inputs give the same layout. */
export function layoutFigures(framing: Framing, role: BeatRole, actors: Array<{ archetypeId: string; wardrobe: string }>): { figures: FigureSpec[]; split: boolean; prominentProp: boolean } {
  const n = actors.length;
  const k = SHOT_SCALE[role];
  const mk = (i: number, x: number, y: number, size: number, facing: FigureSpec["facing"], back = false): FigureSpec => ({
    x, y, size: Math.round(size * 1000) / 1000, facing, back, actor: i, tint: tintFor(actors[i]?.archetypeId ?? "x", actors[i]?.wardrobe ?? ""),
  });
  const prominentProp = role === "proof";
  const spread = (size: number, yBase: number, facings: FigureSpec["facing"][] = []) => {
    const xs = n === 1 ? [0.5] : n === 2 ? [0.32, 0.68] : [0.2, 0.5, 0.8];
    return xs.map((x, i) => mk(i, x, yBase, size, facings[i] ?? (x < 0.5 ? 1 : x > 0.5 ? -1 : 0)));
  };
  switch (framing) {
    case "selfie":
    case "mirror":
      return { figures: n === 1 ? [mk(0, 0.5, 1.02, 0.9 * k, 0)] : spread(0.7 * k, 1.02, [0, 0, 0]), split: false, prominentProp };
    case "split":
      return { figures: actors.map((_, i) => mk(i, n === 1 ? 0.27 : i === 0 ? 0.27 : 0.73, 0.98, 0.5 * k, 0)).slice(0, 2), split: true, prominentProp };
    case "over-shoulder":
      return { figures: n === 1 ? [mk(0, 0.2, 1.05, 0.85, 1, true)] : [mk(0, 0.2, 1.08, 0.95 * k, 1, true), ...actors.slice(1).map((_, j) => mk(j + 1, 0.64 + j * 0.2, 0.96, 0.62 * k, -1))], split: false, prominentProp };
    case "pov":
    case "topdown":
      return { figures: n === 0 ? [] : [mk(0, 0.5, 1.1, 0.5, 0, true)], split: false, prominentProp: true };
    case "wide":
      return { figures: spread(0.5 * k, 0.94), split: false, prominentProp };
    case "screen-rec":
      // The creator sits small in the corner; the screen is the subject.
      return { figures: actors.slice(0, 2).map((_, i) => mk(i, 0.84 - i * 0.16, 1.02, 0.3, -1)), split: false, prominentProp: true };
    case "carousel":
      return { figures: actors.slice(0, 1).map((_, i) => mk(i, 0.84, 1.02, 0.3, -1)), split: false, prominentProp: true };
    case "anchor":
      return { figures: spread((n === 1 ? 0.72 : 0.6) * k, 0.92, [0]), split: false, prominentProp: false };
    case "tripod":
      return { figures: spread(0.66 * k, 0.98, [0]), split: false, prominentProp };
    case "two-shot":
      return { figures: spread((n === 3 ? 0.56 : 0.7) * k, 0.99), split: false, prominentProp };
    default:
      return { figures: spread((n === 1 ? 0.8 : n === 2 ? 0.7 : 0.54) * k, 1.0, [0]), split: false, prominentProp };
  }
}

/* ---------------- storyboard ---------------- */

export interface StoryboardScene {
  index: number;
  role: BeatRole;
  roleLabel: string;
  durationSecs: number;
  /** What happens in this beat, in the catalogue's words, with the brand as a placeholder. */
  caption: string;
  /** An example subtitle built from the style's dialogue scaffold, with obvious placeholders. */
  subtitle: string;
  /** Who "speaks": a stand-in label, never a name, and the index of that person in the cast. */
  speaker: string;
  lead: number;
  shot: string;
  cameraNote: string;
  framing: Framing;
  figures: FigureSpec[];
  split: boolean;
  prominentProp: boolean;
  props: Glyph[];
}

export interface Storyboard {
  styleId: string;
  seed: string;
  aspect: AspectRatio;
  room: RoomKind;
  palette: ScenePalette;
  decor: Glyph[];
  settingLabel: string;
  lightingLabel: string;
  timeOfDay: string;
  cast: string[];
  scenes: StoryboardScene[];
  totalSecs: number;
}

const ROLE_LABEL: Record<BeatRole, string> = { hook: "Hook", body: "Body", proof: "Proof", cta: "Call to action" };
export const BEAT_LABELS = ROLE_LABEL;

const shorten = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 12)).replace(/[,;:\s]+$/, "")}...`;
};

/** Placeholders only: the storyboard never states a claim, a price or a brand. */
export function fillPlaceholders(text: string): string {
  return text.replaceAll("{product}", "[your product]").replaceAll("{problem}", "[the problem]").replace(/\{[a-z_]+\}/gi, "[...]");
}

export function subtitleFor(style: UgcStyle, role: BeatRole): string {
  if (role === "hook") {
    const f = style.hookFormulas[0] ? HOOK_FORMULAS[style.hookFormulas[0]] : null;
    return f ? `"${fillPlaceholders(f.example)}"` : '"[hook line]"';
  }
  return role === "cta" ? '"[call to action]"' : `"[${role} line]"`;
}

export function previewAspect(style: UgcStyle): AspectRatio {
  return style.aspects[0] ?? "9:16";
}

/** Seeds for the preview "Variation" button: seed 1 is the default look, each press moves to the next. */
export const previewSeed = (n: number) => `preview-${Math.max(1, Math.floor(n))}`;

/** How long autoplay stays on a beat: roughly the beat's real length, sped up, never too fast to read. */
export function stepMs(durationSecs: number): number {
  return Math.min(4200, Math.max(2400, Math.round(durationSecs * 380)));
}

export function composeStoryboard(style: UgcStyle, variation: Variation, beats: Array<{ role: BeatRole; durationSecs: number; purpose: string }> = style.beats): Storyboard {
  const room = roomKindFor(variation.setting);
  const framing = framingFor(variation.camera, style.actorCount);
  const palette = paletteFor(variation.setting.timeOfDay, variation.setting.lighting);
  const props = propGlyphs(variation.setting.props);
  const cast = variation.actors.map((a, i) => `${style.actorCount === 1 ? "Person" : `Person ${String.fromCharCode(65 + i)}`}: ${a.label}`);
  const scenes = beats.map((b, i): StoryboardScene => {
    const lay = layoutFigures(framing, b.role, variation.actors);
    const lead = variation.actors.length ? i % variation.actors.length : 0;
    return {
      index: i,
      role: b.role,
      roleLabel: ROLE_LABEL[b.role],
      durationSecs: b.durationSecs,
      caption: fillPlaceholders(b.purpose),
      subtitle: subtitleFor(style, b.role),
      lead,
      speaker: variation.actors.length > 1 ? `Person ${String.fromCharCode(65 + lead)}` : "Person",
      shot: SHOT_LABEL[b.role],
      cameraNote: `${SHOT_LABEL[b.role]} · ${shorten(variation.camera, 64)}`,
      framing,
      figures: lay.figures,
      split: lay.split,
      prominentProp: lay.prominentProp,
      props: b.role === "proof" ? props : props.slice(0, 2),
    };
  });
  return {
    styleId: style.id, seed: variation.seed, aspect: previewAspect(style), room, palette, decor: decorFor(variation.setting),
    settingLabel: variation.setting.label, lightingLabel: shorten(variation.setting.lighting, 60), timeOfDay: variation.setting.timeOfDay, cast, scenes,
    totalSecs: scenes.reduce((s, x) => s + x.durationSecs, 0),
  };
}
