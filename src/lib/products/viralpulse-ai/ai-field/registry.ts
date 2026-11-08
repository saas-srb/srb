import { AD_PLATFORMS, CAMPAIGN_OBJECTIVES, CTAS, INDUSTRIES, LANGUAGES, POST_OBJECTIVES, POST_PLATFORMS, TONES } from "@/lib/products/viralpulse-ai/constants";
import type { FieldKind } from "@/lib/products/viralpulse-ai/ai-field/types";

/**
 * Every field a person can press "AI" on, and how the server must treat it.
 *
 * Adding a field (later work packages): add one entry below, add its key to `scripts/test-viralpulse-wp1.ts` (the inventory
 * list), then render `<AiField fieldKey="…">` in the form. Nothing else is needed — the action, limits, metering, validation
 * and undo are shared.
 *
 *   • `readsFrom`   — the ONLY form-value names the server accepts as context for this field (everything else the browser
 *                     sends is dropped). Trusted data (brand, offer, client, company) is read from the database instead.
 *   • `factField`   — the field holds facts (price, offer, coupon, dates, claims, company details). The model may only
 *                     restructure / shorten / translate the person's own text, or draft from the stored brand and company
 *                     data; any figure, URL or claim that is not in those sources is rejected, never shown.
 *   • `resolver`    — filled without a language model, from real data (company address, website, offer dates, past posts).
 *   • `maxChars`    — hard limit per value (per item for lists). Output above it is rejected, not silently cut.
 */

export type ResolverId = "company_location" | "company_website" | "offer_end" | "start_today" | "best_time";

export interface FieldDef {
  label: string;
  /** Short, plain description of what the field is, for the model. */
  about: string;
  kind: FieldKind;
  /** What to write and how, in the imperative. Never mentions facts that may be invented. */
  instructions: string;
  readsFrom: readonly string[];
  factField: boolean;
  /** Fact fields only. `own`: tidy the person's own text (nothing to tidy = nothing to do). `stored`: may also draft from the stored brand and company data. `context`: may also write from the other fields' values (key points, offer). */
  factSource?: "own" | "stored" | "context";
  maxChars: number;
  /** Lists only. */
  maxItems?: number;
  /** Enum / multi-choice: the allowed values, `"client"` when the form supplies them, `"catalogue"` for the site's service list. */
  options?: readonly string[] | "client" | "catalogue";
  /** Free-text fields with a usual vocabulary: the model prefers one of these but may write another. */
  suggestions?: readonly string[];
  resolver?: ResolverId;
  /** The value is an estimate the person must confirm (a budget range). */
  estimate?: boolean;
  /** Hashtag list: every item is normalised to `#word`. */
  hashtags?: boolean;
  /** Whether a tone can steer the result. */
  usesTone?: boolean;
  /** Lowest sensible number (numbers only). */
  min?: number;
  max?: number;
}

const BRIEF = ["objective", "platforms", "industry", "targetAudience", "offerService", "location", "tone", "language", "brandInfo", "offerId", "clientId", "keywords"] as const;
const STRATEGY = ["campaign", "strategy", "item", "offerId", "clientId", "language", "tone"] as const;
const AD = ["platform", "format", "formatKey", "name", "headline", "primaryText", "description", "cta", "caption", "hashtags", "keywords", "landingPage", "campaign", "content", "item", "offerId", "clientId", "language", "tone"] as const;
const POST = ["keyMessage", "offerText", "cta", "contentFormat", "topic", "objective", "serviceProduct", "audience", "tone", "language", "contentType", "platforms", "platform", "link", "notes", "idea", "variant", "creative", "item", "campaign", "offerId", "clientId"] as const;
const UGC = ["name", "title", "description", "keyPoints", "offer", "validUntil", "coupon", "terms", "audience", "callToAction", "industry", "goal", "platform", "language", "targetSecs", "style", "scene", "cast"] as const;
const BRAND = ["about", "services", "products", "tone", "targetAudience", "messaging", "websiteInfo", "sellingPoints", "avoid", "brandHashtags"] as const;

type Partial2 = Partial<FieldDef>;
const mk = (kind: FieldKind, label: string, about: string, instructions: string, readsFrom: readonly string[], maxChars: number, o: Partial2 = {}): FieldDef => ({ kind, label, about, instructions, readsFrom, maxChars, factField: false, ...o });
const text = (label: string, about: string, instructions: string, readsFrom: readonly string[], maxChars = 120, o: Partial2 = {}) => mk("text", label, about, instructions, readsFrom, maxChars, o);
const long = (label: string, about: string, instructions: string, readsFrom: readonly string[], maxChars = 600, o: Partial2 = {}) => mk("longtext", label, about, instructions, readsFrom, maxChars, o);
const list = (label: string, about: string, instructions: string, readsFrom: readonly string[], maxItems = 10, maxChars = 120, o: Partial2 = {}) => mk("list", label, about, instructions, readsFrom, maxChars, { maxItems, ...o });
const pick = (label: string, about: string, instructions: string, readsFrom: readonly string[], options: FieldDef["options"], o: Partial2 = {}) => mk("enum", label, about, instructions, readsFrom, 80, { options, ...o });

const NO_INVENTING = "Use only what is in the other fields and the brand data. If something is missing, leave it out; never invent figures, prices, dates, names, awards, results or testimonials.";

export const REGISTRY = {
  // ───────────────────────── Campaign brief ─────────────────────────
  "campaign.name": text("Campaign name", "the internal name of an advertising campaign", `Write a short, memorable campaign name (2-6 words). ${NO_INVENTING}`, BRIEF, 120, { usesTone: true }),
  "campaign.platforms": mk("multienum", "Platforms", "the ad platforms the campaign runs on", "Recommend the platforms that suit the objective, audience and offer. Choose only from the allowed list; prefer 2-3.", ["objective", "industry", "targetAudience", "offerService", "budget", "currency", "location"], 40, { options: AD_PLATFORMS, maxItems: 5 }),
  "campaign.objective": text("Objective", "what the campaign should achieve", "Name the single main objective. Prefer one of the suggested objectives; write another short one only if none fits.", ["offerService", "industry", "targetAudience", "offerId", "platforms"], 120, { suggestions: CAMPAIGN_OBJECTIVES }),
  "campaign.industry": text("Industry", "the industry the campaign sells into", "Name the industry of the audience or the offer. Prefer a suggested industry; otherwise a short plain label.", ["offerService", "targetAudience", "objective", "clientId"], 120, { suggestions: INDUSTRIES }),
  "campaign.targetAudience": long("Target audience", "who should see the ads", `Describe the audience in 2-3 plain sentences: who they are, what they need, where they are. ${NO_INVENTING} Do not state audience sizes or statistics.`, ["industry", "objective", "offerService", "location", "platforms", "offerId", "clientId", "brandInfo"], 600),
  "campaign.location": text("Location", "where the campaign targets", "Use the company's own address data only.", [], 120, { resolver: "company_location" }),
  "campaign.budget": mk("number", "Budget", "the campaign budget", "Suggest ONE realistic total budget for the duration, as a plain number in the stated currency. State every assumption (duration, platforms, goal) in the notes, and say it is an estimate. Never present it as a guarantee.", ["objective", "platforms", "startDate", "endDate", "location", "currency", "industry"], 12, { estimate: true, min: 0 }),
  "campaign.startDate": mk("date", "Start date", "the campaign start date", "Start today.", [], 10, { resolver: "start_today" }),
  "campaign.endDate": mk("date", "End date", "the campaign end date", "Use the end date of the chosen live offer.", ["offerId"], 10, { resolver: "offer_end" }),
  "campaign.cta": text("Call to action", "the button/action the ads ask for", "Pick the call to action that matches the objective and platforms. Prefer one of the suggestions.", ["objective", "platforms", "offerService", "landingPage"], 60, { suggestions: CTAS }),
  "campaign.landingPage": mk("url", "Landing page", "the page the ads send people to", "Use the company's own website address.", [], 500, { resolver: "company_website", factField: true }),
  "campaign.offerService": pick("Offer / service", "the service or offer being promoted", "Choose the service from the site's catalogue that best matches the objective and audience.", ["objective", "industry", "targetAudience", "offerId"], "catalogue"),
  "campaign.keywords": list("Keywords", "search/targeting keywords", "Suggest keywords people would really search for this offer. No competitor brand names. Lowercase, no hashtags, no duplicates.", ["offerService", "targetAudience", "industry", "location", "objective", "keywords"], 30, 60),
  "campaign.tone": text("Tone", "the voice of the campaign", "Name the tone in 1-3 words. Prefer a suggestion; consider the audience and the brand tone.", ["objective", "targetAudience", "industry", "clientId"], 60, { suggestions: TONES }),
  "campaign.language": pick("Language", "the language the ads are written in", "Pick the language the audience most likely reads, given the location and audience.", ["location", "targetAudience", "industry"], LANGUAGES),
  "campaign.brandInfo": long("Brand information for this campaign", "extra brand facts for the AI", "Summarise, in 3-5 plain sentences, what the brand is and offers, using only the stored brand and company data and the person's own text.", ["offerService", "clientId", "offerId", "industry"], 1500, { factField: true, factSource: "stored" }),

  // ───────────────────────── Campaign strategy (per field) ─────────────────────────
  "campaign.strategy.summary": long("Campaign strategy", "the strategy summary", `Write the strategy in 3-5 sentences. ${NO_INVENTING}`, STRATEGY, 1200, { usesTone: true }),
  "campaign.strategy.positioning": long("Positioning", "how the campaign positions the offer", "Write a positioning statement in 1-2 sentences.", STRATEGY, 500, { usesTone: true }),
  "campaign.strategy.keyMessages": list("Key messages", "the main messages", "Write distinct key messages, each one sentence, benefit-led.", STRATEGY, 8, 220, { usesTone: true }),
  "campaign.strategy.channelPlan.role": long("Role in the funnel", "what a platform does in the funnel", "Say in 1-2 sentences what this platform does for the campaign (awareness, consideration, conversion).", STRATEGY, 300),
  "campaign.strategy.timeline": long("Timeline", "the phases of the campaign", "Describe the phases across the campaign dates in a few short lines. Use the start and end dates if given; do not invent dates.", STRATEGY, 800),
  "campaign.strategy.kpis": list("KPIs", "how success is measured", "List measurable KPIs (names of metrics only, e.g. click-through rate, cost per lead). Do not invent target numbers.", STRATEGY, 8, 160),
  "campaign.strategy.ideas.title": text("Idea title", "a campaign idea title", "Write a short idea title.", STRATEGY, 120, { usesTone: true }),
  "campaign.strategy.ideas.description": long("Idea description", "a campaign idea", `Explain the idea in 1-3 sentences. ${NO_INVENTING}`, STRATEGY, 500, { usesTone: true }),
  "campaign.strategy.audiences.name": text("Audience name", "a named audience segment", "Name the audience segment in 2-5 words.", STRATEGY, 100),
  "campaign.strategy.audiences.description": long("Audience description", "who an audience segment is", "Describe the segment in 1-2 sentences without statistics.", STRATEGY, 400),
  "campaign.strategy.audiences.interests": list("Interests", "audience interests for targeting", "List targeting interests that real ad platforms offer. No duplicates.", STRATEGY, 12, 60),
  "campaign.strategy.keywords": list("Keywords", "campaign keywords", "Suggest keywords people would search. Lowercase, no hashtags, no duplicates.", STRATEGY, 30, 60),
  "campaign.strategy.hashtags": list("Hashtag suggestions", "hashtags", "Suggest relevant hashtags, each a single word after #. No duplicates.", STRATEGY, 15, 40, { hashtags: true }),
  "campaign.strategy.adConcepts.title": text("Concept title", "an ad concept title", "Write a short concept title.", STRATEGY, 120, { usesTone: true }),
  "campaign.strategy.adConcepts.angle": long("Angle / creative idea", "the angle of an ad concept", "Describe the angle in 1-2 sentences.", STRATEGY, 400, { usesTone: true }),
  "campaign.strategy.adConcepts.headline": text("Headline", "an ad headline", "Write one headline that fits the platform's headline limit.", STRATEGY, 120, { usesTone: true }),
  "campaign.strategy.adConcepts.primaryText": long("Primary text", "ad body copy", `Write the ad body copy. ${NO_INVENTING}`, STRATEGY, 1200, { usesTone: true }),
  "campaign.strategy.adConcepts.description": long("Description", "an ad description line", "Write a short supporting description.", STRATEGY, 300, { usesTone: true }),
  "campaign.strategy.adConcepts.cta": text("CTA", "the ad button text", "Pick one call to action. Prefer a suggestion.", STRATEGY, 60, { suggestions: CTAS }),

  // ───────────────────────── Ad (editor + new ad form) ─────────────────────────
  "ad.name": text("Ad name", "the internal name of an ad", "Write a short internal ad name that says platform, angle and format.", AD, 120),
  "ad.platform": pick("Platform", "the ad platform", "Recommend the platform from the campaign's platforms that best suits the objective and format.", ["campaign", "format", "platforms"], "client"),
  "ad.format": pick("Format", "image or video", "Recommend image or video for this platform and objective.", ["campaign", "platform"], ["image", "video"]),
  "ad.formatKey": pick("Size / placement", "the ad size", "Choose the placement that suits the platform, format and objective.", ["platform", "format", "campaign"], "client"),
  "ad.headline": text("Headline", "the ad headline", `Write one headline within the platform's headline limit. ${NO_INVENTING}`, AD, 120, { usesTone: true }),
  "ad.primaryText": long("Primary text / ad copy", "the ad body", `Write the ad copy within the platform's limit. ${NO_INVENTING}`, AD, 2200, { usesTone: true }),
  "ad.description": long("Description", "the short ad description", "Write one short supporting line.", AD, 300, { usesTone: true }),
  "ad.cta": text("CTA", "the call-to-action button text", "Pick one call to action. Prefer a suggestion.", AD, 60, { suggestions: CTAS }),
  "ad.caption": long("Caption", "the ad caption", `Write a short caption. ${NO_INVENTING}`, AD, 2200, { usesTone: true }),
  "ad.hashtags": list("Hashtags", "ad hashtags", "Suggest hashtags that suit the platform's hashtag advice. No duplicates.", AD, 15, 40, { hashtags: true }),
  "ad.keywords": list("Keywords", "ad keywords", "Suggest keywords people search. Lowercase, no duplicates.", AD, 30, 60),
  "ad.audienceSuggestions": list("Audience suggestions", "audiences to target", "Suggest audience segments, each one short line. No statistics.", AD, 10, 160),
  "ad.image.concept": long("Ad image concept", "what the ad image shows", "Describe what the image shows and why it works, in 2-3 sentences.", AD, 600),
  "ad.image.prompt": long("Creative prompt (for AI image generation)", "a prompt for an image model", "Write a detailed, ready-to-use prompt for an AI image model: subject, setting, style, lighting, composition. No text in the image unless overlay text is given. No real people's names or logos.", AD, 1500),
  "ad.image.overlayText": text("Overlay text", "text placed on the ad image", `Write short overlay text (max 6 words). ${NO_INVENTING}`, AD, 80, { usesTone: true }),
  "ad.image.designNotes": long("Overlay / design guidance", "layout and colour guidance", "Give layout, colour, typography and safe-zone guidance for the chosen format.", AD, 600),
  "ad.video.concept": long("Video concept", "the idea of the ad video", "Describe the video in 2-3 sentences.", AD, 600),
  "ad.video.hook": long("Hook (first 1-3 s)", "the opening of the video", "Write the opening 1-3 seconds: what is seen and said.", AD, 300, { usesTone: true }),
  "ad.video.scenes.scene": text("Scene", "a scene label", "Label the scene, e.g. 'Scene 2 - Problem'.", AD, 80),
  "ad.video.scenes.duration": text("Duration", "a scene duration", "Give the time range, e.g. '3-8s'.", AD, 20),
  "ad.video.scenes.visual": long("Visual", "what is seen in a scene", "Describe what is seen in this scene in 1-2 sentences.", AD, 400),
  "ad.video.scenes.onScreenText": text("On-screen text", "text shown in a scene", `Write short on-screen text. ${NO_INVENTING}`, AD, 100, { usesTone: true }),
  "ad.video.scenes.voiceover": long("Voiceover", "spoken words in a scene", `Write the spoken words for this scene. ${NO_INVENTING}`, AD, 400, { usesTone: true }),
  "ad.video.voiceoverScript": long("Voiceover script", "the full voiceover", `Write the full voiceover script. ${NO_INVENTING}`, AD, 2000, { usesTone: true }),
  "ad.video.onScreenText": list("On-screen text", "text overlays across the video", `Write short on-screen text lines. ${NO_INVENTING}`, AD, 10, 100, { usesTone: true }),
  "ad.video.thumbnailConcept": long("Thumbnail concept", "the video thumbnail idea", "Describe a thumbnail that is bold and legible at small size.", AD, 400),
  "ad.video.durationSec": mk("number", "Length (seconds)", "the video length", "Suggest a length in seconds that suits the platform and the script. Whole number.", ["platform", "format", "formatKey", "content", "campaign"], 4, { estimate: true, min: 5, max: 180 }),
  "ad.variations.label": text("Angle", "the angle name of a variation", "Name the angle in 1-3 words, e.g. 'Pain point'.", AD, 60),
  "ad.variations.cta": text("CTA", "a variation's call to action", "Pick one call to action. Prefer a suggestion.", AD, 60, { suggestions: CTAS }),
  "ad.variations.headline": text("Headline", "a variation's headline", `Write a headline that takes this variation's angle. ${NO_INVENTING}`, AD, 120, { usesTone: true }),
  "ad.variations.primaryText": long("Primary text", "a variation's body", `Write body copy that takes this variation's angle. ${NO_INVENTING}`, AD, 2200, { usesTone: true }),
  "ad.variations.description": long("Description", "a variation's description", "Write one short supporting line.", AD, 300, { usesTone: true }),

  // ───────────────────────── Post brief and editor ─────────────────────────
  "post.topic": long("Topic", "what the post is about", `Write the topic as one clear idea in 1-2 sentences. ${NO_INVENTING}`, ["objective", "serviceProduct", "audience", "platforms", "offerId", "campaign", "notes", "clientId", "language"], 500),
  "post.platforms": mk("multienum", "Platforms", "the platforms the post is published on", "Recommend the platforms that suit the topic, objective and media type. Choose only from the allowed list.", ["topic", "objective", "contentType", "audience", "serviceProduct"], 40, { options: POST_PLATFORMS, maxItems: 5 }),
  "post.contentType": pick("Media type", "image or video", "Recommend image or video for this topic and these platforms.", ["topic", "objective", "platforms"], ["image", "video"]),
  "post.objective": text("Content objective", "what the post should achieve", "Name the main objective. Prefer a suggestion.", ["topic", "serviceProduct", "audience", "offerId"], 100, { suggestions: POST_OBJECTIVES }),
  "post.serviceProduct": pick("Service / product", "the service the post is about", "Choose the service from the site's catalogue that best matches the topic.", ["topic", "objective", "audience"], "catalogue"),
  "post.audience": text("Audience", "who the post is for", `Describe the audience in one short phrase. ${NO_INVENTING}`, ["topic", "serviceProduct", "objective", "clientId", "platforms"], 200),
  "post.tone": text("Tone", "the voice of the post", "Name the tone in 1-3 words. Prefer a suggestion.", ["topic", "objective", "audience", "platforms", "clientId"], 60, { suggestions: TONES }),
  "post.language": pick("Language", "the language of the post", "Pick the language the audience most likely reads.", ["topic", "audience", "platforms"], LANGUAGES),
  "post.plannedAt": mk("datetime", "Planned publish date & time", "when to publish", "Use the best time from the company's own published posts.", ["platforms"], 16, { resolver: "best_time", estimate: true }),
  "post.link": mk("url", "Link", "the landing page link", "Use the company's own website address.", [], 500, { resolver: "company_website", factField: true }),
  "post.title": text("Internal title", "the internal title of the post", "Write a short internal title that says what the post is.", ["topic", "platforms", "objective"], 120),
  "post.notes": long("Notes for the AI", "extra guidance for the writer", "Turn the topic into a short list of points to include and things to avoid, using only the person's own topic and brand rules. Do not add facts.", ["topic", "objective", "audience", "serviceProduct", "offerId"], 1000, { factField: true, factSource: "own" }),
  "post.idea": long("Core idea", "the single idea behind the post", `State the core idea in 1-2 sentences. ${NO_INVENTING}`, POST, 500, { usesTone: true }),
  "post.variant.title": text("Headline / title", "a platform version's title", `Write the title within the platform's limit. ${NO_INVENTING}`, POST, 120, { usesTone: true }),
  "post.variant.content": long("Post content", "a platform version's body", `Write the post body in the platform's style and within its character limit. ${NO_INVENTING}`, POST, 5000, { usesTone: true }),
  "post.variant.caption": long("Caption / first-line hook", "a platform version's caption", `Write a short caption or first-line hook. ${NO_INVENTING}`, POST, 2200, { usesTone: true }),
  "post.variant.cta": text("CTA", "a platform version's call to action", "Pick one call to action. Prefer a suggestion.", POST, 60, { suggestions: CTAS }),
  "post.variant.hashtags": list("Hashtags", "a platform version's hashtags", "Suggest hashtags that follow the platform's hashtag advice. No duplicates.", POST, 15, 40, { hashtags: true }),
  "post.variant.keywords": list("Keywords", "a platform version's keywords or tags", "Suggest keywords or tags. Lowercase, no duplicates.", POST, 20, 60),
  "post.creative.imageConcept": long("Image creative concept", "what the post image shows", "Describe what the image shows and why it works, in 2-3 sentences.", POST, 600),
  "post.creative.imagePrompt": long("Creative prompt (for AI image generation)", "a prompt for an image model", "Write a detailed, ready-to-use prompt for an AI image model: subject, setting, style, lighting, composition. No text in the image. No real people's names or logos.", POST, 1500),
  "post.creative.videoConcept": long("Video concept", "the idea of the post video", "Describe the video in 2-3 sentences.", POST, 600),
  "post.creative.hook": long("Hook", "the opening of the video", "Write the opening 1-3 seconds: what is seen and said.", POST, 300, { usesTone: true }),
  "post.creative.videoScript": long("Video script", "the video script", `Write the script. ${NO_INVENTING}`, POST, 3000, { usesTone: true }),
  "post.creative.scenes.scene": text("Scene", "a scene label", "Label the scene, e.g. 'Scene 2 - Problem'.", POST, 80),
  "post.creative.scenes.duration": text("Duration", "a scene duration", "Give the time range, e.g. '3-8s'.", POST, 20),
  "post.creative.scenes.visual": long("Visual", "what is seen in a scene", "Describe what is seen in this scene in 1-2 sentences.", POST, 400),
  "post.creative.scenes.onScreenText": text("On-screen text", "text shown in a scene", `Write short on-screen text. ${NO_INVENTING}`, POST, 100, { usesTone: true }),
  "post.creative.scenes.voiceover": long("Voiceover", "spoken words in a scene", `Write the spoken words for this scene. ${NO_INVENTING}`, POST, 400, { usesTone: true }),
  "post.creative.thumbnailConcept": long("Thumbnail concept", "the video thumbnail idea", "Describe a thumbnail that is bold and legible at small size.", POST, 400),
  "post.keyMessage": long("Key message", "the one thing the post must get across", `State the single key message in one or two plain sentences. ${NO_INVENTING}`, POST, 500, { usesTone: true }),
  "post.offer": long("Offer", "the offer the post mentions", "Tidy the offer exactly as the person wrote it. Never add or change a price, discount, date or condition.", POST, 600, { factField: true, factSource: "own" }),
  "post.contentFormat": pick("Post type", "the kind of post on a platform", "Recommend the post type that suits the topic, media and platform. Choose only from the allowed list.", ["topic", "objective", "platform", "contentType"], "client"),
  "post.utm.campaign": text("utm_campaign", "the campaign name in the link's tracking tag", "Write a short lowercase tracking name with underscores instead of spaces (for example diwali_sale_2026). Use the campaign or topic only.", POST, 60),
  "post.utm.content": text("utm_content", "the content name in the link's tracking tag", "Write a short lowercase tracking name with underscores that tells this post apart (for example reel_offer_hook). Use the topic only.", POST, 60),
  "post.utm.term": text("utm_term", "the keyword in the link's tracking tag", "Write one short lowercase keyword or phrase with underscores that the post targets. Use the topic only.", POST, 60),
  "post.youtube.category": pick("YouTube category", "the YouTube video category", "Choose the YouTube category that best fits the video topic. Choose only from the allowed list.", ["topic", "objective", "contentType"], "client"),
  "post.scheduledAt": mk("datetime", "Schedule time", "when the post goes out", "Use the best time from the company's own published posts.", ["platforms"], 16, { resolver: "best_time", estimate: true }),

  // ───────────────────────── Content generator workspace ─────────────────────────
  "workspace.brief": long("Brief", "what to generate", `Rewrite the brief so it is specific: goal, subject, audience, must-include points. Keep every fact the person wrote and add none.`, ["type", "platform", "audience", "tone", "language", "offerId", "clientId"], 2000, { factField: true, factSource: "own" }),
  "workspace.audience": text("Audience", "who the content is for", `Describe the audience in one short phrase. ${NO_INVENTING}`, ["type", "brief", "platform", "clientId"], 200),
  "workspace.tone": text("Tone", "the voice", "Name the tone in 1-3 words. Prefer a suggestion.", ["type", "brief", "platform", "audience"], 60, { suggestions: TONES }),
  "workspace.language": pick("Language", "the output language", "Pick the language the audience most likely reads.", ["brief", "audience"], LANGUAGES),
  "workspace.platform": pick("Platform", "where the content goes", "Recommend the platform that suits the brief.", ["type", "brief", "audience"], "client"),
  "workspace.offer": text("Offer", "the offer to mention", "Restate the offer exactly as the person wrote it, tidied. Never add a price, discount or date.", ["brief"], 400, { factField: true, factSource: "own" }),

  // ───────────────────────── Media library ─────────────────────────
  "media.name": text("Name", "the library name of a file", `Write a short descriptive file name from the details given (no extension). ${NO_INVENTING}`, ["kind", "description", "caption", "creativePrompt", "platform", "tags"], 120),
  "media.altText": text("Alt text", "alternative text for screen readers", "Describe what the image shows in one plain sentence, using only the details given (generation prompt, caption, description). If the details do not say what is shown, say so in the notes instead of guessing.", ["name", "kind", "description", "caption", "creativePrompt"], 300),
  "media.description": long("Description", "what the media is", "Describe the media in 1-2 sentences using only the details given.", ["name", "kind", "caption", "creativePrompt", "altText", "platform"], 500),
  "media.tags": list("Tags", "search tags", "Suggest short lowercase tags for finding the file. No duplicates.", ["name", "kind", "description", "caption", "creativePrompt", "platform"], 12, 30),
  "media.caption": long("Caption", "a caption for the media", `Write a short caption. ${NO_INVENTING}`, ["name", "kind", "description", "creativePrompt", "platform", "altText"], 1000, { usesTone: true }),
  "media.script": long("Script", "the spoken script of a video", `Tidy and structure the script. Do not add claims. ${NO_INVENTING}`, ["name", "description", "caption"], 3000, { usesTone: true }),
  "media.creativePrompt": long("Creative prompt", "a reusable image prompt", "Write a detailed prompt for an AI image model: subject, setting, style, lighting, composition. No text in the image. No real people's names or logos.", ["name", "description", "caption", "altText", "platform"], 1500),

  // ───────────────────────── Settings: brand context ─────────────────────────
  "brand.about": long("About the company", "what the company does", "Write 2-4 sentences about the company using only the company data, services and products already stored, and the person's own text. Never add history, size, awards or clients.", BRAND, 1500, { factField: true, factSource: "stored" }),
  "brand.services": list("Services", "the services the company offers", "List the services, one per item, using the site's catalogue and the person's own list. Add none that are not there.", BRAND, 40, 120, { factField: true, factSource: "stored" }),
  "brand.products": list("Products", "the products the company sells", "Tidy the list of products from the person's own list. Add none.", BRAND, 40, 160, { factField: true, factSource: "own" }),
  "brand.tone": text("Brand tone", "the brand's voice", "Describe the brand voice in a short phrase (3-8 words) that fits the company description and audience.", BRAND, 300),
  "brand.brandHashtags": list("Branded hashtags", "hashtags the brand uses", "Suggest brand hashtags built from the company name and services: single words after #, no duplicates.", BRAND, 10, 60, { hashtags: true }),
  "brand.targetAudience": long("Target audience", "who the brand serves", `Describe who the brand serves in 2-3 sentences from the company and service data. ${NO_INVENTING}`, BRAND, 1000, { factField: true, factSource: "stored" }),
  "brand.messaging": long("Brand messaging", "core message and proof points", "Write the core message in a few lines from the stored company data and the person's own text. Never add proof points, numbers or claims that are not already there.", BRAND, 2000, { factField: true, factSource: "stored" }),
  "brand.websiteInfo": long("Website information", "key pages and their purpose", "Tidy the description of the key pages and what visitors should do. Add no pages or URLs that are not given.", BRAND, 2000, { factField: true, factSource: "own" }),
  "brand.sellingPoints": list("Key selling points", "reasons to choose the brand", "Tidy and sharpen the selling points the person wrote. Never add a selling point, number or claim that is not in their text or the stored data.", BRAND, 20, 240, { factField: true, factSource: "own" }),
  "brand.avoid": list("Never say / claim", "words and claims the AI must avoid", "Suggest cautious wording rules the brand should avoid in advertising (for example unprovable guarantees and superlatives). Short phrases.", BRAND, 30, 120),

  // ───────────────────────── Image studio ─────────────────────────
  "image.prompt": long("Prompt", "a prompt for the AI image model", "Write a detailed, ready-to-use prompt for an AI image model: subject, setting, style, lighting, composition. No text in the image unless asked. No real people's names or logos.", ["name", "platform", "formatKey", "campaign", "topic", "tone", "offerId", "clientId"], 1800),
  "image.name": text("Image name", "the library name of a generated image", "Write a short descriptive name from the prompt.", ["prompt", "platform"], 120),
  "image.goal": text("What the picture is for", "the purpose of an Image Studio picture", "Say in one short line what the picture is for and where it will be used.", ["goal","product","platform","subject"], 160),
  "image.subject": long("Subject", "what an Image Studio picture shows", "Describe what the picture shows in 2-3 plain sentences: subject, setting, composition. Use fictional people only; no real person's name, no brand names or logos; no text in the picture.", ["goal","product","subject","style","colours","platform","tone","language","kitVoice","overlayText","textPosition"], 700),
  "image.product": text("Product or service", "what the picture is about", "Name the product or service in a few words, from the other fields and stored brand data only.", ["goal","subject","clientId"], 160, { factField: true, factSource: "stored" }),
  "image.style": text("Style and mood", "the look of an Image Studio picture", "Describe style and mood in a short phrase (for example: warm, natural light, minimal studio, flat illustration). Suit the goal and the brand voice.", ["goal","product","subject","style","colours","platform","tone","language","kitVoice","overlayText","textPosition"], 200),
  "image.colours": text("Colours", "the colour palette of the picture", "Name 2-4 colours (words or hex codes) that suit the brand and goal. Prefer the brand kit colours when given.", ["goal","product","subject","style","colours","platform","tone","language","kitVoice","overlayText","textPosition"], 120),
  "image.overlayText": long("Text on the picture", "the exact words printed on the picture", "Only tidy or shorten the person's own words, keeping every figure, price, date and name exactly as written. Never add claims, prices or guarantees.", ["goal","product","subject","style","colours","platform","tone","language","kitVoice","overlayText","textPosition"], 160, { factField: true, factSource: "own" }),
  "image.negative": text("Leave out", "what the picture must not contain", "List things to keep out of the picture, comma separated (for example: text, logos, crowds, clutter).", ["goal","product","subject","style","colours","platform","tone","language","kitVoice","overlayText","textPosition"], 200),
  "image.instruction": text("Change to make", "an edit instruction for one picture", "Write one clear edit instruction in the imperative (for example: make the background warmer). Change one thing; do not mention people's identities.", ["subject","style","prompt"], 200),
  "image.kitVoice": long("Brand voice for images", "how the brand's pictures should feel", "Describe in 1-2 sentences how the brand's pictures should feel (mood, energy, level of polish), from the stored brand tone and about text only.", ["voice","tone","clientId"], 400, { factField: true, factSource: "stored" }),
  "image.kitDos": list("Always do", "rules every generated picture follows", "List short visual rules to always follow (for example: natural light, plenty of white space). No claims, no facts.", ["voice","donts","dos"], 8, 120),
  "image.kitDonts": list("Never do", "things generated pictures must avoid", "List short things to never show (for example: stock-photo handshakes, neon colours, crowded layouts).", ["voice","dos","donts"], 8, 120),

  // ───────────────────────── AI UGC Studio ─────────────────────────
  "ugc.name": text("Product or business name", "the product or business name", "Use the company name or service the person has already stored; do not coin a product name.", UGC, 120, { factField: true, factSource: "stored" }),
  "ugc.title": text("Video name", "the internal video name", "Write a short internal name for finding the video later.", UGC, 120),
  "ugc.description": long("What it is", "what the product is and who it is for", "Write one or two sentences on what it is and who it is for, from the person's own text and the stored company data only.", UGC, 600, { factField: true, factSource: "stored" }),
  "ugc.keyPoints": list("Key points the video may state", "the only facts the video may state", "Tidy and split the person's own text into separate key points. Never add a price, number, offer, guarantee or claim that is not in their text.", UGC, 10, 200, { factField: true, factSource: "own" }),
  "ugc.offer": long("The offer", "the offer shown in the video", "Tidy the offer exactly as the person wrote it. Never add or change a price, discount, product or condition.", UGC, 400, { factField: true, factSource: "own" }),
  "ugc.validUntil": text("Valid until or dates", "the offer's dates", "Tidy the dates exactly as the person wrote them. Never add or change a date.", UGC, 160, { factField: true, factSource: "own" }),
  "ugc.coupon": text("Coupon code", "the coupon code", "Tidy the code exactly as written (uppercase, no spaces). Never make up a code.", UGC, 40, { factField: true, factSource: "own" }),
  "ugc.terms": long("Terms", "the offer's terms", "Tidy the terms exactly as the person wrote them into short plain lines. Never add a condition.", UGC, 400, { factField: true, factSource: "own" }),
  "ugc.audience": text("Audience", "who the video is for", `Describe the audience in one short phrase. ${NO_INVENTING}`, UGC, 300),
  "ugc.callToAction": text("Call to action", "what viewers should do", "Write a short call to action that matches the goal and platform. Do not mention a price, offer or date.", UGC, 200),
  "ugc.industry": text("Industry", "the industry", "Name the industry in 1-3 words. Prefer a standard label.", UGC, 60, { suggestions: INDUSTRIES }),
  "ugc.goal": pick("Goal", "what the video should do", "Choose the goal that fits the product and platform.", ["description", "offer", "platform", "industry", "callToAction"], "client"),
  "ugc.platform": pick("Where it will be posted", "the platform", "Choose the platform that suits the goal and audience.", ["description", "goal", "audience", "industry"], "client"),
  "ugc.language": pick("Language people speak", "the spoken language", "Choose the language the audience speaks.", ["audience", "industry", "description"], "client"),
  "ugc.length": mk("number", "Length (seconds)", "the target video length", "Suggest a length in seconds that suits the platform and the amount of content. Whole number.", ["platform", "goal", "keyPoints", "offer"], 3, { estimate: true, min: 15, max: 60 }),
  "ugc.cast.people": text("People", "who appears", "Describe the on-screen person in a short phrase that fits the product and audience. No real or famous people.", UGC, 200),
  "ugc.cast.wardrobe": text("Wardrobe", "what the person wears", "Describe the outfit in a short phrase that fits the setting.", UGC, 160),
  "ugc.cast.personality": text("Personality", "how the person comes across", "Describe the manner in a short phrase.", UGC, 120),
  "ugc.cast.accent": text("Accent", "the way the person speaks", "Describe the speaking style in a short phrase that fits the language and audience.", UGC, 80),
  "ugc.cast.place": text("Place", "where it is filmed", "Describe a believable place for the product in a short phrase.", UGC, 160),
  "ugc.cast.lighting": text("Lighting", "the lighting", "Describe the lighting in a short phrase.", UGC, 100),
  "ugc.cast.timeOfDay": text("Time of day", "when it is filmed", "Give a time of day that fits the place.", UGC, 60),
  "ugc.cast.camera": text("Camera", "how it is filmed", "Describe the camera style (handheld selfie, tripod, etc.) in a short phrase.", UGC, 100),
  "ugc.cast.pacing": text("Pacing", "how fast it moves", "Describe the pacing in a short phrase.", UGC, 80),
  "ugc.cast.ambientSound": text("Ambient sound", "background sound", "Describe the background sound in a short phrase.", UGC, 100),
  "ugc.scene.setting": text("Setting", "where a scene happens", "Describe the setting in a short phrase.", UGC, 200),
  "ugc.scene.camera": text("Camera", "how a scene is filmed", "Describe the camera in a short phrase.", UGC, 120),
  "ugc.scene.onScreenText": text("On-screen text", "text shown in a scene", "Write short on-screen text that uses only the stated key points and offer. Never add a figure.", UGC, 100, { factField: true, factSource: "context" }),
  "ugc.scene.dialogue": long("Dialogue", "what the person says", "Write the spoken lines that fit the scene and length. Use only the stated key points and offer; never add a price, number or claim.", UGC, 400, { factField: true, factSource: "context" }),
  "ugc.review.caption": long("Caption", "the post caption for the video", "Write a caption for the target platform that uses only the stated key points and offer. Never add a figure or claim.", UGC, 2200, { factField: true, factSource: "context" }),
  "ugc.review.hashtags": list("Hashtags", "hashtags for the video post", "Suggest hashtags for the target platform: single words after #, no duplicates.", UGC, 15, 40, { hashtags: true }),
} as const satisfies Record<string, FieldDef>;

export type FieldKey = keyof typeof REGISTRY;
export const FIELD_KEYS = Object.keys(REGISTRY) as FieldKey[];

export function isFieldKey(k: unknown): k is FieldKey {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(REGISTRY, k);
}

export function fieldDef(k: FieldKey): FieldDef {
  return REGISTRY[k];
}

/** Modes that make sense for a field. Fact fields never get plain "generate/expand" unless the server can draft from stored data. */
export function modesFor(def: FieldDef): readonly import("./types").FieldMode[] {
  if (def.resolver) return ["generate"];
  if (def.kind === "enum" || def.kind === "multienum") return ["generate"];
  if (def.kind === "number" || def.kind === "date" || def.kind === "datetime" || def.kind === "url") return ["generate"];
  const base: import("./types").FieldMode[] = def.factField && (def.factSource ?? "own") === "own" ? ["improve", "shorten", "translate"] : ["generate", "improve", "shorten", "translate"];
  if (!def.factField) base.push("expand");
  if (def.kind === "text" || def.kind === "longtext") base.push("options");
  return base;
}
