/**
 * UGC style catalogue: public API.
 *
 *   listStyles(), getStyle(id), suggestStyles({industry, goal, platform, language}),
 *   pickVariation(styleId, seed), buildDirectorBrief(style, brief, variation, language),
 *   buildScenePrompt(scene, actors, variation, style), estimateSpeakingSecs(text, language), validateStyle(style)
 */
export { getStyle, listStyles } from "./catalogue";
export { HOOK_FORMULAS } from "./catalogue-base";
export { suggestStyles } from "./suggest";
export { containsBannedPhrase, validateStyle } from "./validate";
export { pickVariation, variationKey, variationToActors } from "./variation";
export { actorDescription, buildDirectorBrief, buildScenePrompt, planBeats, type DirectorBrief } from "./prompt";
export { countWords, estimateSpeakingSecs, fitsDuration, maxWordsForDuration, normalizeLanguage, WORDS_PER_SEC, type LangKey } from "./language";
export { ACTOR_ARCHETYPES, AMBIENCE, CAMERA_FLAVOURS, PACING, SETTINGS } from "./pools";
export { postGuidance, PLATFORM_LABEL, type PostGuidance } from "./post-guidance";
export * from "./types";
export { composeStoryboard, previewSeed, stepMs, roomKindFor, framingFor, layoutFigures, paletteFor, propGlyphs, decorFor, subtitleFor, fillPlaceholders, type Storyboard, type StoryboardScene } from "./preview";
