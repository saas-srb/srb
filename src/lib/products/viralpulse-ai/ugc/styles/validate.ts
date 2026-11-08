/**
 * Style validation and banned-phrase screening.
 */
import { PLATFORMS, STYLE_CATEGORIES, type UgcStyle, type ValidationResult } from "./types";
import { SETTINGS } from "./pools";

const BANNED_PATTERNS: RegExp[] = [
  /\b(shah\s*rukh|srk|salman\s*khan|amitabh|aamir\s*khan|virat|kohli|dhoni|sachin|ranveer|deepika|alia\s*bhatt|priyanka\s*chopra|katrina|hrithik|akshay\s*kumar|modi|rahul\s*gandhi|kejriwal|elon|musk|taylor\s*swift|beyonc|kardashian|trump|obama|messi|ronaldo)\b/i,
  /\b(celebrity|celeb|lookalike|look-alike|doppelg|deepfake|real\s+person|resembl\w+|famous)\b/i,
  /\b(guarantee[ds]?|100\s*%|clinically\s+proven|doctor[- ]recommended|award[- ]winning|number\s*one|#1|best\s+in\s+(class|india|the\s+world)|risk[- ]free|cure[sd]?)\b/i,
  /(₹|\brs\.?\s*\d|\binr\b|\$\s*\d|\d+\s*%\s*off|\bpercent\s+off\b)/i,
];

export function containsBannedPhrase(text: string): string | null {
  for (const re of BANNED_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

function styleTexts(s: UgcStyle): string[] {
  return [
    s.label, s.description, s.promptTag, s.camera.primary, ...s.camera.alternates, ...s.beats.map((b) => b.purpose), ...s.lineRoles,
    ...Object.values(s.speech), ...s.realismCues,
  ];
}

export function validateStyle(style: UgcStyle): ValidationResult {
  const e: string[] = [];
  const need = (cond: unknown, msg: string) => { if (!cond) e.push(msg); };

  need(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(style.id), "id must be kebab-case");
  need(style.label.trim().length >= 3, "label missing");
  need(style.description.trim().length >= 20 && style.description.length <= 240, "description must be 20-240 chars");
  need(STYLE_CATEGORIES.includes(style.category), "unknown category");
  need(style.industries.length > 0, "industries empty");
  need(style.goals.length > 0, "goals empty");
  need(style.platforms.length > 0, "platforms empty");
  need(style.aspects.length > 0 && style.aspects.every((a) => a === "9:16" || a === "16:9" || a === "1:1"), "aspects must be 9:16, 16:9 or 1:1 (4:5 is produced by cropping 9:16)");
  need(style.platforms.every((p) => PLATFORMS.includes(p)), "unknown platform");
  if (style.nativePlatform) {
    need(PLATFORMS.includes(style.nativePlatform), "unknown nativePlatform");
    need(style.platforms.includes(style.nativePlatform), "nativePlatform must be listed in platforms");
  }
  need(style.actorCount >= 1 && style.actorCount <= 3, "actorCount must be 1-3");
  need(style.adultsOnly === true, "adultsOnly must be true");

  const beats = style.beats;
  need(beats.length >= 3 && beats.length <= 8, "3-8 beats");
  need(beats[0]?.role === "hook", "first beat must be a hook");
  need(beats[beats.length - 1]?.role === "cta", "last beat must be a cta");
  need(beats.filter((b) => b.role === "hook").length === 1, "exactly one hook beat");
  need(beats.some((b) => b.role === "proof"), "needs a proof/demo beat");
  for (const b of beats) {
    need(b.durationSecs >= 4 && b.durationSecs <= 12, `beat ${b.role} duration ${b.durationSecs}s outside 4-12`);
    need(b.purpose.trim().length > 5, `beat ${b.role} purpose missing`);
  }
  const total = beats.reduce((s, b) => s + b.durationSecs, 0);
  need(total >= 15 && total <= 60, `template total ${total}s outside 15-60`);
  need(total >= style.durationRange[0] && total <= style.durationRange[1], "template total outside durationRange");
  need(style.durationRange[0] >= 15 && style.durationRange[1] <= 60 && style.durationRange[0] <= style.durationRange[1], "durationRange must sit inside 15-60");

  need(style.lineRoles.length >= 3, "lineRoles need at least 3");
  need(style.hookFormulas.length >= 2, "at least 2 hook formulas");
  for (const k of ["en", "hi", "hinglish", "regional"] as const) need(style.speech[k].trim().length > 20, `speech.${k} missing`);
  need(style.camera.primary.length > 10, "camera.primary missing");
  need(style.realismCues.length >= 4, "at least 4 realism cues");
  need(style.negativeCues.length >= 4, "at least 4 negative cues");
  need(style.settingIds.length > 0 && style.settingIds.every((id) => SETTINGS.some((x) => x.id === id)), "settingIds must exist in pool");
  need(style.promptTag.length > 5, "promptTag missing");
  if (/testimonial|review|update|first impression|unboxing|vox|interview|try-on/i.test(style.label + " " + style.category)) {
    need(style.illustrative, "testimonial/review/interview-like styles must be marked illustrative");
  }
  if (style.category === "news-style") need(style.illustrative, "news-style styles must be marked illustrative (mandatory notice)");
  if (style.category === "kids-parenting") need(style.negativeCues.some((c) => /children|minors/i.test(c)), "kids-topic styles must forbid children on screen");
  need(["solo-female", "female-male", "female-female"].includes(style.castMode), "castMode must include a woman: solo-female, female-male or female-female");
  need((style.actorCount === 1) === (style.castMode === "solo-female"), "castMode must match actorCount (solo-female only for one person)");
  need(["trendy", "modest", "traditional"].includes(style.wardrobeTone), "wardrobeTone missing");
  if (style.promptCharCap !== undefined) need(style.promptCharCap >= 500 && style.promptCharCap <= 1600, "promptCharCap must be 500-1600");

  for (const t of styleTexts(style)) {
    const hit = containsBannedPhrase(t);
    if (hit) e.push(`banned phrase "${hit}" in: ${t.slice(0, 60)}`);
  }
  return { ok: e.length === 0, errors: e };
}
