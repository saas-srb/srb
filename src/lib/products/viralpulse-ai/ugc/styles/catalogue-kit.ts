/**
 * Compact positional builder and shared constants for the ads, marketing, business and platform style files.
 * Same data conventions as catalogue.ts: no company facts, prices or claims; the brief fills those in.
 */
import type { Def } from "./catalogue";
import type { AspectRatio, Goal, Platform, StyleCategory } from "./types";
import type { SpeechKey } from "./catalogue-base";
import type { HookFormulaId } from "./types";
import type { B } from "./catalogue";

export const HOME = ["bedroom-floor-cosy", "living-room-sofa", "balcony-evening", "dining-table", "courtyard-home"];
export const SOCIAL: Platform[] = ["instagram", "youtube", "facebook"];
export const SOCIAL_WA: Platform[] = ["instagram", "facebook", "whatsapp", "youtube"];
export const V: AspectRatio[] = ["9:16", "1:1"];
export const VERT: AspectRatio[] = ["9:16"];
export const WIDE: AspectRatio[] = ["16:9", "9:16"];
export const ANY = ["any"];

/** Positional Def builder: keeps ~100 style definitions readable. */
export function S(
  id: string, label: string, category: StyleCategory, description: string,
  industries: string[], goals: Goal[], platforms: Platform[], aspects: AspectRatio[], actors: 1 | 2 | 3,
  beats: B[], roles: string[], hooks: HookFormulaId[], speech: SpeechKey,
  camera: [string, ...string[]], settings: string[], tag: string, x: Partial<Def> = {},
): Def {
  return { id, label, category, description, industries, goals, platforms, aspects, actors, beats, roles, hooks, speech, camera, settings, tag, ...x };
}
