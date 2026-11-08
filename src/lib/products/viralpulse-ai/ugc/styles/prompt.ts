/**
 * Prompt builders: the director brief that steers the script LLM, and the final per-scene video prompt.
 */
import { offerBriefLines } from "../offer";
import type { AspectRatio, ProductBrief, UgcActor, UgcScene } from "../types";
import { HOOK_FORMULAS } from "./catalogue-base";
import { LANGUAGE_LABEL, LANGUAGE_NOTES, WORDS_PER_SEC, maxWordsForDuration, normalizeLanguage } from "./language";
import type { SceneBeat, UgcStyle, Variation } from "./types";

const DEFAULT_CAP = 900;

/** Same actor string everywhere in a project: reused verbatim for continuity. */
export function actorDescription(a: UgcActor): string {
  return `${a.label} (${a.ageRange}, ${a.gender}; ${a.look}; wearing ${a.wardrobe})`;
}

/** Scale the style's beat template to a target total, keeping every beat inside the 4-12 s clip limit. */
export function planBeats(style: UgcStyle, targetSecs?: number): SceneBeat[] {
  const beats = style.beats.map((b) => ({ ...b }));
  const [lo, hi] = style.durationRange;
  const target = Math.round(Math.min(hi, Math.max(lo, targetSecs ?? beats.reduce((s, b) => s + b.durationSecs, 0))));
  let diff = target - beats.reduce((s, b) => s + b.durationSecs, 0);
  let guard = 400;
  while (diff !== 0 && guard-- > 0) {
    const step = diff > 0 ? 1 : -1;
    // Prefer growing/shrinking the body and proof beats first, then the rest.
    const order = [...beats.keys()].sort((a, b) => {
      const w = (i: number) => (beats[i]?.role === "body" || beats[i]?.role === "proof" ? 0 : 1);
      return w(a) - w(b) || (beats[a] as SceneBeat).durationSecs * step - (beats[b] as SceneBeat).durationSecs * step;
    });
    const i = order.find((k) => {
      const d = (beats[k] as SceneBeat).durationSecs + step;
      return d >= 4 && d <= 12;
    });
    if (i === undefined) break;
    (beats[i] as SceneBeat).durationSecs += step;
    diff -= step;
  }
  return beats;
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, Math.max(0, n - 1)).replace(/[\s,;:.-]+\S*$/, "")}…`;
}

const BRIEF_PLACEHOLDER = "{product}";

/** Technical styles: basic widely-known concepts may be explained, but never invented numbers or claims. */
export const isTechStyle = (style: UgcStyle): boolean => style.category === "tech-qa" || style.category === "tech-humour" || style.category === "tech-demo";
/** News-style output is always labelled as illustrative; it never reports a real event, person or place as news. */
export const NEWS_STYLE_NOTICE = "Illustrative AI-generated news-style content, not real reporting.";
export const isNewsStyle = (style: UgcStyle): boolean => style.category === "news-style";

export interface DirectorBrief {
  text: string;
  jsonSchemaHints: Record<string, unknown>;
  sceneBudgets: { index: number; role: string; purpose: string; durationSecs: number; maxWords: number }[];
  totalSecs: number;
  aspect: AspectRatio;
}

export function buildDirectorBrief(
  style: UgcStyle,
  brief: ProductBrief,
  variation: Variation,
  language: string,
  opts: { targetSecs?: number; aspect?: AspectRatio } = {},
): DirectorBrief {
  const lang = normalizeLanguage(language);
  const langLabel = LANGUAGE_LABEL[lang];
  const aspect = opts.aspect && style.aspects.includes(opts.aspect) ? opts.aspect : (opts.aspect ?? (style.aspects[0] as AspectRatio));
  const beats = planBeats(style, opts.targetSecs);
  const total = beats.reduce((s, b) => s + b.durationSecs, 0);
  const rate = WORDS_PER_SEC[lang];
  const budgets = beats.map((b, i) => ({
    index: i, role: b.role, purpose: b.purpose.replaceAll("{product}", brief.name), durationSecs: b.durationSecs,
    maxWords: maxWordsForDuration(b.durationSecs, language),
  }));

  const actorLines = variation.actors.map((a, i) => `  actor_${i + 1}: ${a.label}; ${a.ageRange} ${a.gender}; ${a.look}; wearing ${a.wardrobe}; ${a.personality}; accent: ${a.accent}`);
  const hooks = style.hookFormulas.map((id) => HOOK_FORMULAS[id]).map((h) => `  - ${h.label}: ${h.how} Shape: "${h.example}"`);
  const keyPoints = brief.keyPoints.length ? brief.keyPoints.map((k) => `  - ${k}`).join("\n") : "  (none given: stay generic, state no specifics)";

  const lines: string[] = [
    `You are directing a short, real-looking UGC video in the style "${style.label}" (${style.category}). ${style.description}`,
    "",
    "PRODUCT BRIEF (the ONLY facts you may use):",
    `  name: ${brief.name}`,
    `  description: ${brief.description}`,
    "  key points:",
    keyPoints,
    brief.audience ? `  audience: ${brief.audience}` : "",
    ...offerBriefLines(brief.offer),
    brief.callToAction ? `  call to action: ${brief.callToAction}` : "  call to action: (none given: end with a soft, generic invitation)",
    "",
    "HARD RULES:",
    "  1. Use only facts from the brief. Never invent claims, prices, discounts, offers, awards, statistics, results, timelines, certifications, addresses, phone numbers or customer names.",
    "  2. Never name real people, celebrities, competitors or other brands; never imitate a real person's face or voice.",
    "  3. Only adults appear on screen. No children or minors.",
    `  4. Keep spoken text within the speaking-rate limit: about ${WORDS_PER_SEC.en} words/sec in English, about ${rate} words/sec in ${langLabel}. Each scene's total spoken words (dialogue plus voice-over) must not exceed its maxWords.`,
    "  5. Dialogue must sound like real people talking, not advertising copy: no superlatives, no hype, no health or income promises.",
    "  6. Screen text and signage: short, simple words only; never invent logos or brand names.",
    isNewsStyle(style)
      ? `  7. This is NEWS-STYLE content. It is ILLUSTRATIVE, not real reporting. Put the on-screen text "${NEWS_STYLE_NOTICE}" in the first scene and the last scene. Never describe a real event, person, organisation or place as real news; every story is generic and comes only from the brief.`
      : style.illustrative
      ? "  7. This style is testimonial-like. It is an ILLUSTRATIVE portrayal, not a real customer. Put the on-screen text \"Illustrative\" in the first scene and the last scene, and never imply the speaker is a real customer or has real results."
      : "  7. Do not present actors as real customers or experts; they are illustrative performers.",
    ...(isTechStyle(style) ? ["  8. TECHNICAL CONTENT: you may explain widely-known basic concepts correctly in plain words, but every version number, benchmark, statistic, performance figure, date, price or comparison claim must come from the brief or the topic text. Never invent one. If unsure, keep it general or leave it out."] : []),
    ...(style.offer ? [`  9. OFFER STYLE: show the offer details and validity as on-screen text copied exactly from the brief (split across scenes, each at most 40 characters)${brief.offer?.terms ? ", and add the on-screen line \"Terms apply\"" : ""}. Never invent or change a figure, date, code or term. No countdown, 'ends tonight' or 'last few' unless the brief states a real deadline or a real stock limit.`] : []),
    "  10. Everyone on screen is an adult and is dressed fully and appropriately for the setting. Nothing sexualised, no suggestive wording, no body-focused shots. Never mock any faith, community or group.",
    "",
    `LANGUAGE: ${langLabel}. ${LANGUAGE_NOTES[lang]}`,
    `STYLE OF SPEECH: ${lang === "en" ? style.speech.en : lang === "hi" ? style.speech.hi : lang === "hinglish" ? style.speech.hinglish : style.speech.regional}`,
    `PACING: ${variation.pacing}`,
    "",
    `STRUCTURE (${beats.length} scenes, ${total}s total, aspect ${aspect}):`,
    ...budgets.map((b) => `  scene ${b.index} [${b.role}, ${b.durationSecs}s, max ${b.maxWords} words]: ${b.purpose}`),
    "",
    "LINE ROLES (in order, cycle if needed):",
    ...style.lineRoles.map((r, i) => `  ${i + 1}. ${r}`),
    "",
    "HOOK FORMULAS (use one for the first line; vary it):",
    ...hooks,
    "",
    "PEOPLE (use these ids exactly; do not change their looks):",
    ...actorLines,
    "",
    `LOCATION: ${variation.setting.description}; ${variation.setting.lighting}; ${variation.setting.timeOfDay}; props: ${variation.setting.props.join(", ")}. Keep the same location across scenes unless the structure demands a change.`,
    `CAMERA: ${variation.camera}; ${variation.cameraFlavour}.`,
    `REALISM: ${style.realismCues.join("; ")}.`,
    `AVOID: ${style.negativeCues.join("; ")}.`,
    "",
    "OUTPUT: valid JSON only, matching jsonSchemaHints. Each scene: index, durationSecs (exactly as in STRUCTURE), setting, visualPrompt (what we see, one or two sentences), cameraNotes, actorIds, dialogue[{speakerId,text,language}], optional onScreenText and voiceOver.",
  ];

  const jsonSchemaHints = {
    type: "object",
    required: ["title", "scenes"],
    properties: {
      title: { type: "string", maxLength: 80 },
      scenes: {
        type: "array", minItems: beats.length, maxItems: beats.length,
        items: {
          type: "object",
          required: ["index", "durationSecs", "setting", "visualPrompt", "cameraNotes", "actorIds", "dialogue"],
          properties: {
            index: { type: "integer" },
            durationSecs: { type: "integer", minimum: 4, maximum: 12, enum: [...new Set(beats.map((b) => b.durationSecs))] },
            setting: { type: "string" }, visualPrompt: { type: "string", maxLength: 400 }, cameraNotes: { type: "string", maxLength: 200 },
            actorIds: { type: "array", items: { type: "string", enum: variation.actors.map((_, i) => `actor_${i + 1}`) } },
            dialogue: { type: "array", items: { type: "object", required: ["speakerId", "text", "language"], properties: { speakerId: { type: "string" }, text: { type: "string" }, language: { type: "string", const: language } } } },
            onScreenText: { type: "string", maxLength: 40 }, voiceOver: { type: "string" },
          },
        },
      },
    },
    perSceneMaxWords: budgets.map((b) => b.maxWords),
    placeholderToken: BRIEF_PLACEHOLDER,
  };

  return { text: lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"), jsonSchemaHints, sceneBudgets: budgets, totalSecs: total, aspect };
}

/** Final visual + audio prompt for a video model. Trimmed by priority to stay within the style's cap. */
export function buildScenePrompt(
  scene: UgcScene,
  actors: UgcActor[],
  variation: Variation,
  style: UgcStyle,
  opts: { aspect?: AspectRatio } = {},
): string {
  const cap = style.promptCharCap ?? DEFAULT_CAP;
  const aspect = opts.aspect ?? (style.aspects[0] as AspectRatio);
  const inScene = actors.filter((a) => scene.actorIds.includes(a.id));
  const byId = new Map(actors.map((a) => [a.id, a]));
  const langs = new Set(scene.dialogue.map((l) => l.language));
  const singleLang = langs.size === 1 ? [...langs][0] : undefined;

  const spoken = scene.dialogue.map((l) => {
    const who = byId.get(l.speakerId);
    const name = who?.label ?? l.speakerId;
    const lang = singleLang ? "" : ` in ${LANGUAGE_LABEL[normalizeLanguage(l.language)]}`;
    return `${name}${lang} says: "${l.text.trim()}"`;
  });
  const accents = [...new Set(inScene.map((a) => a.voice.accent).filter(Boolean))];
  const langNote = singleLang ? `${LANGUAGE_LABEL[normalizeLanguage(singleLang)]}${accents.length ? `, ${accents.join(" / ")} accent` : ""}, natural spoken delivery` : "";

  const build = (level: number, vp: string): string => {
    const parts: string[] = [];
    parts.push(`${aspect} ${style.promptTag}, ${variation.camera}${level < 3 ? `, ${variation.cameraFlavour}` : ""}.`);
    parts.push(`Setting: ${scene.setting || variation.setting.description}${level < 4 ? `, ${variation.setting.lighting}, ${variation.setting.timeOfDay}` : ""}.`);
    if (inScene.length) parts.push(`People: ${inScene.map(actorDescription).join("; ")}.`);
    parts.push(`Action: ${vp}`);
    if (scene.cameraNotes && level < 5) parts.push(`Camera: ${scene.cameraNotes}.`);
    if (spoken.length) parts.push(`${spoken.join(" ")}${langNote ? ` (${langNote})` : ""}.`);
    if (scene.voiceOver) parts.push(`Voice-over: "${scene.voiceOver.trim()}".`);
    if (scene.onScreenText && level < 6) parts.push(`On-screen text: "${scene.onScreenText}".`);
    if (level < 2) parts.push(`Audio: ${variation.ambience}.`);
    const cues = style.realismCues.slice(0, level < 1 ? 4 : level < 3 ? 2 : level < 7 ? 1 : 0);
    if (cues.length) parts.push(`Look: ${cues.join("; ")}.`);
    const neg = style.negativeCues.slice(0, level < 1 ? style.negativeCues.length : level < 3 ? 6 : level < 7 ? 4 : 3);
    parts.push(`Avoid: ${neg.join(", ")}.`);
    return parts.join(" ").replace(/\.\.+/g, ".").replace(/\s+/g, " ").trim();
  };

  const vp0 = scene.visualPrompt.trim().replace(/[.\s]+$/, "") + ".";
  for (let level = 0; level <= 7; level++) {
    const out = build(level, vp0);
    if (out.length <= cap) return out;
  }
  // Last resort: shorten the action sentence to fit.
  const base = build(7, "X.");
  const room = cap - base.length + 2;
  return build(7, clip(vp0, Math.max(room, 12)));
}
