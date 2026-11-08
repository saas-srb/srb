import { minAge } from "./policy";
import type { UgcActor } from "./types";
import type { UgcStyle, Variation, VariationActor } from "./styles/types";

/**
 * The cast and look a person chose for a video (a style `Variation`, possibly edited). Pure: cleaned before it is stored, turned into plain
 * directions for the script writer, and used to make sure the written script keeps exactly these people. No names, photos or real people.
 */

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function sanitizeCast(style: UgcStyle, input: unknown): Variation {
  const v = (input && typeof input === "object" ? input : {}) as Partial<Variation>;
  if (v.styleId !== style.id) throw new Error("The cast belongs to a different style.");
  const rawActors = Array.isArray(v.actors) ? v.actors : [];
  if (rawActors.length !== style.actorCount) throw new Error(`This style needs exactly ${style.actorCount} ${style.actorCount === 1 ? "person" : "people"}.`);
  const actors: VariationActor[] = rawActors.map((a: Partial<VariationActor>, i) => {
    const out: VariationActor = {
      archetypeId: clip(a.archetypeId, 60) || `custom-${i + 1}`,
      label: clip(a.label, 60) || `Person ${i + 1}`,
      ageRange: clip(a.ageRange, 20),
      gender: clip(a.gender, 30),
      look: clip(a.look, 400),
      wardrobe: clip(a.wardrobe, 300),
      personality: clip(a.personality, 300),
      accent: clip(a.accent, 100),
    };
    const age = minAge(out.ageRange);
    if (age === null || age < 18) throw new Error(`"${out.label}" must be a clearly stated adult (18 or over).`);
    for (const f of ["gender", "look", "wardrobe", "personality"] as const) if (!out[f]) throw new Error(`"${out.label}" needs a ${f}.`);
    return out;
  });
  const s = (v.setting ?? {}) as Partial<Variation["setting"]>;
  if (!clip(s.label, 80) || !clip(s.description, 400)) throw new Error("Choose a setting.");
  return {
    styleId: style.id,
    seed: clip(v.seed, 60) || "custom",
    actors,
    setting: {
      id: clip(s.id, 60) || "custom",
      label: clip(s.label, 80),
      description: clip(s.description, 400),
      lighting: clip(s.lighting, 200),
      timeOfDay: clip(s.timeOfDay, 60),
      props: (Array.isArray(s.props) ? s.props : []).map((p) => clip(p, 80)).filter(Boolean).slice(0, 6),
    },
    camera: clip(v.camera, 300),
    cameraFlavour: clip(v.cameraFlavour, 200),
    pacing: clip(v.pacing, 200),
    ambience: clip(v.ambience, 200),
  };
}

/** Plain-text instructions for the script writer: who is on screen, where, how it is filmed and how it moves. */
export function castDirection(v: Variation): string {
  const people = v.actors.map((a, i) => `  ${i + 1}. ${a.label}: ${a.ageRange}, ${a.gender}; ${a.look}; wearing ${a.wardrobe}; ${a.personality}; accent: ${a.accent || "natural"}`);
  return [
    "CAST AND LOOK (chosen by the client; use exactly these fictional adults, in this order, and describe them the same way):",
    ...people,
    `Setting: ${v.setting.label} - ${v.setting.description}. Lighting: ${v.setting.lighting}. Time: ${v.setting.timeOfDay}. Props that may appear: ${v.setting.props.join(", ") || "none specified"}.`,
    `Camera: ${v.camera}; ${v.cameraFlavour}.`,
    `Pacing: ${v.pacing}.`,
    `Ambience: ${v.ambience}.`,
  ].join("\n");
}

/** Writes the chosen people onto the model's actors by position (keeping the ids the scenes already use). */
export function applyCastToActors(actors: UgcActor[], v: Variation): UgcActor[] {
  return actors.map((a, i) => {
    const c = v.actors[i];
    if (!c) return a;
    return { ...a, label: c.label, ageRange: c.ageRange, gender: c.gender, look: c.look, wardrobe: c.wardrobe, personality: c.personality, voice: { ...a.voice, accent: c.accent || a.voice.accent } };
  });
}
