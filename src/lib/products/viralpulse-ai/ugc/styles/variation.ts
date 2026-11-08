/**
 * Deterministic variation picker. Same (styleId, seed) always gives the same people, place, camera, pacing.
 * Each facet has its own random stream, so a regenerate can keep some facets and change others.
 */
import type { UgcActor } from "../types";
import { ACTOR_ARCHETYPES, AMBIENCE, BOLD_WOMAN_PERSONALITIES, CAMERA_FLAVOURS, MODEST_WARDROBES, PACING, SETTINGS, TRADITIONAL_WARDROBES, TRENDY_WARDROBES, type ActorArchetype } from "./pools";
import { getStyle } from "./catalogue";
import type { UgcStyle, Variation, VariationActor, VariationPart } from "./types";

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

function shuffle<T>(rng: () => number, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

const ALL_PARTS: VariationPart[] = ["actors", "setting", "camera", "pacing", "ambience"];

/** Women in the default cast are 22-32 (never under 21). */
function isCastableWoman(a: ActorArchetype): boolean {
  const [lo, hi] = a.ageRange.split("-").map(Number);
  return a.gender === "woman" && (lo ?? 0) >= 22 && (hi ?? 99) <= 32;
}

function actorFrom(a: ActorArchetype, rng: () => number, tone: UgcStyle["wardrobeTone"] = "trendy"): VariationActor {
  const label = `${a.gender === "woman" ? "Woman" : "Man"}, ${a.ageRange}`;
  const g = a.gender;
  // Context-appropriate wardrobe: all outfits are fully covered and non-provocative (see the policy note in pools.ts).
  const wardrobes = tone === "modest" ? MODEST_WARDROBES[g] : tone === "traditional" ? TRADITIONAL_WARDROBES[g] : [...a.wardrobes, ...TRENDY_WARDROBES[g]];
  const personality = g === "woman" ? `${pick(rng, BOLD_WOMAN_PERSONALITIES)}; ${pick(rng, a.personalities)}` : pick(rng, a.personalities);
  return {
    archetypeId: a.id, label, ageRange: a.ageRange, gender: a.gender, look: a.look,
    wardrobe: pick(rng, wardrobes), personality, accent: pick(rng, a.accents),
  };
}

/** Female-led casting: a woman is always present and always speaks first; two-person styles are one woman and one man by default. */
function pickActors(style: UgcStyle, rng: () => number): VariationActor[] {
  const women = shuffle(rng, ACTOR_ARCHETYPES.filter(isCastableWoman));
  const men = shuffle(rng, ACTOR_ARCHETYPES.filter((a) => a.gender === "man"));
  const n = style.actorCount;
  const mode = style.castMode ?? (n === 1 ? "solo-female" : "female-male");
  const chosen: ActorArchetype[] = [];
  if (n === 1 || mode === "solo-female") chosen.push(women[0] as ActorArchetype);
  else if (mode === "female-female") for (let i = 0; i < n; i++) chosen.push(women[i] as ActorArchetype);
  else {
    // female-male: woman first; a third person is a second woman.
    chosen.push(women[0] as ActorArchetype, men[0] as ActorArchetype);
    if (n === 3) chosen.push(women[1] as ActorArchetype);
  }
  const acts = chosen.slice(0, n).map((a) => actorFrom(a, rng, style.wardrobeTone));
  // Disambiguate labels when two actors share gender and age band.
  const seen = new Map<string, number>();
  return acts.map((a) => {
    const k = (seen.get(a.label) ?? 0) + 1;
    seen.set(a.label, k);
    return k > 1 || acts.filter((x) => x.label === a.label).length > 1 ? { ...a, label: `${a.label} (${k === 1 ? "first" : "second"})` } : a;
  });
}

export function pickVariation(
  styleOrId: string | UgcStyle,
  seed: string | number,
  opts: { keep?: Variation; change?: VariationPart[] } = {},
): Variation {
  const style = typeof styleOrId === "string" ? getStyle(styleOrId) : styleOrId;
  if (!style) throw new Error(`Unknown UGC style: ${String(styleOrId)}`);
  const s = String(seed);
  const stream = (facet: string) => mulberry32(fnv1a(`${style.id}|${s}|${facet}`));
  const keep = opts.keep && opts.keep.styleId === style.id ? opts.keep : undefined;
  const changing = new Set<VariationPart>(keep ? (opts.change ?? []) : ALL_PARTS);

  const fresh = (part: VariationPart): boolean => !keep || changing.has(part);

  const actors = !fresh("actors") && keep ? keep.actors : pickActors(style, stream("actors"));

  let setting = keep?.setting;
  if (fresh("setting") || !setting) {
    const rng = stream("setting");
    const ids = style.settingIds.length ? style.settingIds : SETTINGS.map((x) => x.id);
    const def = SETTINGS.find((x) => x.id === pick(rng, ids)) ?? (SETTINGS[0] as (typeof SETTINGS)[number]);
    setting = {
      id: def.id, label: def.label, description: def.description,
      lighting: pick(rng, def.lighting), timeOfDay: pick(rng, def.timeOfDay),
      props: shuffle(rng, def.props).slice(0, 3),
    };
  }

  const camera = !fresh("camera") && keep
    ? keep.camera
    : pick(stream("camera"), [style.camera.primary, style.camera.primary, ...style.camera.alternates]);
  const cameraFlavour = !fresh("camera") && keep ? keep.cameraFlavour : pick(stream("flavour"), CAMERA_FLAVOURS);
  const pacing = !fresh("pacing") && keep ? keep.pacing : pick(stream("pacing"), PACING);
  const ambience = !fresh("ambience") && keep ? keep.ambience : pick(stream("ambience"), AMBIENCE);

  return { styleId: style.id, seed: s, actors, setting, camera, cameraFlavour, pacing, ambience };
}

/** Stable key of the visible choices, handy for variety checks and caching. */
export function variationKey(v: Variation): string {
  return [v.actors.map((a) => `${a.archetypeId}:${a.wardrobe}`).join("+"), v.setting.id, v.setting.timeOfDay, v.camera].join("|");
}

/** Convert a variation into the actor records the script engine and video prompts use. */
export function variationToActors(v: Variation): UgcActor[] {
  return v.actors.map((a, i) => ({
    id: `actor_${i + 1}`, label: a.label, ageRange: a.ageRange, gender: a.gender, look: a.look,
    wardrobe: a.wardrobe, personality: a.personality, voice: { mode: "native" as const, accent: a.accent },
  }));
}
