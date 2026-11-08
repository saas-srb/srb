import type { ScenePlan, UgcActor, UgcScene } from "./types";

/**
 * Turns a planned scene into the text the video model receives. Actor descriptions are rebuilt by ONE function and pasted verbatim into
 * every scene they appear in: that is the character-consistency mechanism for providers without a "character" feature.
 */

export function actorPrompt(a: UgcActor): string {
  return `${a.label}: ${a.gender}, ${a.ageRange}, ${a.look}; wearing ${a.wardrobe}; ${a.personality}${a.voice.accent ? `; speaks with ${a.voice.accent}` : ""}`;
}

export const NO_OVERLAY_CLAUSE = "Realistic smartphone-quality footage. No on-screen text, captions, subtitles, logos, watermarks or brand marks inside the video frame.";

export interface PromptOptions {
  promptTag?: string;
  negativeCues?: string[];
  realismCues?: string[];
  cap?: number;
}

export function buildScenePrompt(plan: ScenePlan, scene: UgcScene, opts: PromptOptions = {}): string {
  const actors = scene.actorIds.map((id) => plan.actors.find((a) => a.id === id)).filter((a): a is UgcActor => Boolean(a));
  const byId = new Map(plan.actors.map((a) => [a.id, a]));
  const lines = scene.dialogue.map((l) => `${byId.get(l.speakerId)?.label ?? "Speaker"} says in ${l.language || plan.language}: "${l.text}"`);
  if (scene.voiceOver) lines.push(`Off-screen voice-over in ${plan.language}: "${scene.voiceOver}"`);

  // The pieces that may be shortened when the prompt is over the cap, least important first; the dialogue and actor descriptions never are.
  const optional = [
    opts.negativeCues?.length ? `Avoid: ${opts.negativeCues.join("; ")}.` : "",
    opts.realismCues?.length ? `Realism: ${opts.realismCues.join("; ")}.` : "",
    scene.cameraNotes ? `Camera: ${scene.cameraNotes}.` : "",
  ];
  const core = [
    opts.promptTag ? `${opts.promptTag}.` : "",
    `Vertical-first social video, ${plan.aspect}, about ${scene.durationSecs} seconds, one continuous shot.`,
    `Setting: ${scene.setting}.`,
    actors.length ? `People (the same on-screen people throughout the video): ${actors.map(actorPrompt).join(" | ")}.` : "",
    `Action: ${scene.visualPrompt}`,
    lines.length ? `Audio: natural room sound plus the spoken lines, each spoken in sync with the speaker's lips. ${lines.join(" ")}` : "Audio: natural room sound, no speech.",
    NO_OVERLAY_CLAUSE,
  ].filter(Boolean);
  const cap = opts.cap ?? 4000;
  let prompt = [...core, ...optional.filter(Boolean)].join("\n");
  for (let drop = optional.length; drop > 0 && prompt.length > cap; drop--) prompt = [...core, ...optional.filter(Boolean).slice(0, drop - 1)].join("\n");
  return prompt;
}
