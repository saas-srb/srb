/**
 * Language handling for UGC dialogue: normalisation, speaking-rate estimates, per-language guidance.
 */

export type LangKey = "en" | "hi" | "hinglish" | "ta" | "te" | "bn" | "mr" | "gu" | "kn" | "ml" | "pa" | "other";

const ALIASES: Record<string, LangKey> = {
  en: "en", english: "en", "en-in": "en", "en-us": "en", "en-gb": "en",
  hi: "hi", hindi: "hi", "hi-in": "hi",
  hinglish: "hinglish", "hi-en": "hinglish", "hi-latn": "hinglish", "hi-en-in": "hinglish",
  ta: "ta", tamil: "ta", te: "te", telugu: "te", bn: "bn", bengali: "bn", bangla: "bn",
  mr: "mr", marathi: "mr", gu: "gu", gujarati: "gu", kn: "kn", kannada: "kn",
  ml: "ml", malayalam: "ml", pa: "pa", punjabi: "pa",
};

export function normalizeLanguage(language: string | undefined | null): LangKey {
  const k = String(language ?? "").trim().toLowerCase();
  return ALIASES[k] ?? ALIASES[k.split(/[-_]/)[0] ?? ""] ?? "other";
}

/** Comfortable spoken words per second for natural (not rushed) UGC delivery. */
export const WORDS_PER_SEC: Record<LangKey, number> = {
  en: 2.2, hinglish: 2.4, hi: 2.5, ta: 1.7, te: 1.8, bn: 2.0, mr: 2.0, gu: 2.1, kn: 1.8, ml: 1.6, pa: 2.2, other: 2.0,
};

export const LANGUAGE_LABEL: Record<LangKey, string> = {
  en: "English", hi: "Hindi", hinglish: "Hinglish (Hindi-English mix)", ta: "Tamil", te: "Telugu", bn: "Bengali",
  mr: "Marathi", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi", other: "the requested language",
};

/** Seconds of silence before speech starts in a clip (breath, settling). */
export const LEAD_IN_SECS = 0.6;

export function countWords(text: string): number {
  const t = String(text ?? "").trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

/** Estimated speaking time, including small pauses for punctuation. */
export function estimateSpeakingSecs(text: string, language: string): number {
  const words = countWords(text);
  if (!words) return 0;
  const rate = WORDS_PER_SEC[normalizeLanguage(language)];
  const sentences = (String(text).match(/[.!?।…]+/g) ?? []).length;
  const commas = (String(text).match(/[,;:—-]\s/g) ?? []).length;
  return Math.round((words / rate + sentences * 0.2 + commas * 0.1) * 100) / 100;
}

/** Max words that fit a clip of `durationSecs` (after lead-in and a 0.4s tail). */
export function maxWordsForDuration(durationSecs: number, language: string): number {
  const rate = WORDS_PER_SEC[normalizeLanguage(language)];
  return Math.max(0, Math.floor((durationSecs - LEAD_IN_SECS - 0.4) * rate));
}

/** True when all dialogue + voice-over of a scene fits its duration. */
export function fitsDuration(texts: string[], durationSecs: number, language: string): boolean {
  const total = texts.reduce((s, t) => s + estimateSpeakingSecs(t, language), 0);
  return total + LEAD_IN_SECS <= durationSecs;
}

export const LANGUAGE_NOTES: Record<LangKey, string> = {
  en: "Indian-English cadence, contractions, short sentences, light fillers (like, honestly, so, I mean). No ad-copy phrasing.",
  hi: "Spoken Hindi, not textbook Hindi: everyday words, short clauses, fillers (matlab, yaar, haan, arre, dekho, na). Devanagari script; English nouns only where people really use them.",
  hinglish: "Hindi grammar with English nouns and tags, Roman script, how city friends actually talk: yaar, matlab, basically, seriously, ek minute, na. Sentences under 10 words, a natural pause between ideas.",
  ta: "Colloquial Tamil (pechu tamil), not literary; English product nouns are fine; short clauses with natural fillers.",
  te: "Colloquial Telugu with common English nouns; short clauses, friendly fillers.",
  bn: "Conversational Bengali with everyday English nouns; short clauses, warm fillers.",
  mr: "Conversational Marathi with everyday English nouns; short clauses, natural fillers.",
  gu: "Conversational Gujarati with everyday English nouns; short, friendly clauses.",
  kn: "Colloquial Kannada with common English nouns; short clauses.",
  ml: "Colloquial Malayalam with common English nouns; short clauses, allow longer words so keep lines shorter.",
  pa: "Conversational Punjabi with easy warmth; short clauses; English nouns where natural.",
  other: "Natural spoken register of the language, short sentences, everyday vocabulary.",
};
