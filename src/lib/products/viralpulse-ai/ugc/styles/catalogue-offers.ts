/**
 * Offer styles. Every discount, price, date, coupon code and term comes from the brief's offer details and is shown as on-screen text exactly as
 * written; "Terms apply" is shown when the brief has terms; countdown or "last few" wording is used only when the brief states a real deadline or a
 * real stock limit (see offer.ts). The styles carry structure and tone only.
 */
import type { Def } from "./catalogue";
import { S, SOCIAL_WA, V, VERT } from "./catalogue-kit";
import type { AspectRatio, BeatRole, Goal, HookFormulaId, Platform } from "./types";
import type { SpeechKey } from "./catalogue-base";

const OFFER_IND = ["retail", "d2c", "ecommerce", "fashion", "food", "restaurant", "beauty", "salon", "fitness", "education", "services", "local", "home", "electronics", "apps", "saas", "travel", "jewellery"];
const SCREEN = "offer card on screen, text copied exactly from the brief";
const OFFER_REALISM = ["offer text on screen is copied exactly from the brief, large and steady", "the terms line is readable for a full second"];
const OFFER_NEG = ["invented discounts, prices, dates, coupon codes or terms", "false urgency or countdowns the brief does not state", "readable logos or invented store names"];

type B = [BeatRole, number, string];
interface O {
  speech: SpeechKey; actors?: 1 | 2; aspects?: AspectRatio[]; platforms?: Platform[]; goals?: Goal[]; needs?: "validity" | "stock";
  camera: [string, ...string[]]; settings: string[]; tag: string; hooks: HookFormulaId[]; roles: string[]; beats: B[]; ind?: string[]; extra?: Partial<Def>;
}

function offer(id: string, label: string, description: string, o: O): Def {
  return S(id, label, "offer-sale", description, o.ind ?? OFFER_IND, o.goals ?? ["sales", "footfall"], o.platforms ?? SOCIAL_WA, o.aspects ?? VERT, o.actors ?? 1,
    o.beats, o.roles, o.hooks, o.speech, o.camera, o.settings, o.tag,
    { offer: true, ...(o.needs ? { needs: o.needs } : {}), subs: true, realism: OFFER_REALISM, negatives: OFFER_NEG, ...o.extra });
}

const COUNTER = ["shop-counter", "showroom-floor", "street-market-lane"];
const HOMEISH = ["living-room-sofa", "dining-table", "study-desk-room", "cafe-corner"];

export const OFFER_DEFS: Def[] = [
  offer("offer-flat-discount", "Flat discount reveal", "Presenter reveals the discount exactly as the brief states it, shows what it applies to and where, with the terms line on screen.", {
    speech: "ad", hooks: ["announcement", "curiosity-gap"], roles: ["Reveal hook", "What it applies to", "The discount card", "Terms line", "Where to go"],
    beats: [["hook", 4, "Hold up the item: 'here is the offer', hands covering the card"], ["body", 6, "What the offer applies to, from the brief"], ["proof", 6, `Reveal the ${SCREEN}, plus a 'Terms apply' line if the brief has terms`], ["cta", 5, "Where and how to get it; call to action"]],
    camera: ["handheld close-up with a held pause before the card reveal", "tripod medium shot, cut to a large text card", "handheld over-shoulder into the item"], settings: [...COUNTER, ...HOMEISH], tag: "discount announcement smartphone ad" }),
  offer("offer-diwali-sale", "Diwali sale announcement", "Warm Diwali sale announcement among diyas and sweets: the dated offer is read plainly from the brief, then a festive sign-off.", {
    speech: "festive", aspects: V, hooks: ["announcement", "relatable-confession"], roles: ["Festive greeting", "The sale", "Offer card", "Terms line", "Festive sign-off"],
    beats: [["hook", 5, "Diwali greeting among diyas"], ["body", 6, "Announce the sale in the brief's words"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "Where to find it; festive sign-off; 'Terms apply' if the brief has terms"]],
    camera: ["handheld warm bokeh with a slow push to the offer card", "tripod medium shot beside the diyas", "gentle drift across the decor then the presenter"], settings: ["festive-living-room", "shop-counter"], tag: "Diwali sale smartphone video", extra: { tone: "traditional", realism: [...OFFER_REALISM, "diya flicker and marigold colour"], negatives: [...OFFER_NEG, "idols or religious figures"] } }),
  offer("offer-holi-sale", "Holi sale announcement", "Bright, light-hearted Holi sale announcement with dry colours in the air; the offer and dates come only from the brief.", {
    speech: "festive", hooks: ["announcement", "pattern-interrupt"], roles: ["Holi greeting", "The sale", "Offer card", "Terms line", "Sign-off"],
    beats: [["hook", 4, "Colour on the cheeks: 'Happy Holi' and a quick laugh"], ["body", 6, "Announce the sale, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "Where to find it; 'Terms apply' if the brief has terms"]],
    camera: ["handheld with quick pans and light powder in the air", "tripod medium shot in the courtyard", "close handheld on the presenter, cut to the card"], settings: ["courtyard-home", "balcony-evening", "shop-counter"], tag: "Holi sale smartphone video", extra: { tone: "traditional", realism: [...OFFER_REALISM, "dry colour only, nothing thrown at anyone"], negatives: [...OFFER_NEG, "minors", "colour thrown at unwilling people"] } }),
  offer("offer-eid-sale", "Eid sale announcement", "Gracious Eid Mubarak greeting followed by a plain announcement of the brief's offer and its validity, warm evening light.", {
    speech: "festive", aspects: V, hooks: ["announcement", "relatable-confession"], roles: ["Eid greeting", "The offer", "Offer card", "Terms line", "Warm sign-off"],
    beats: [["hook", 5, "Eid Mubarak greeting with a smile"], ["body", 6, "Announce the offer, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "Where to find it; warm sign-off; 'Terms apply' if the brief has terms"]],
    camera: ["handheld at the table, soft evening light, small drifts", "tripod medium shot with a sweets plate in front", "gentle push-in to the offer card"], settings: ["dining-table", "living-room-sofa", "festive-living-room"], tag: "Eid sale smartphone video", extra: { tone: "traditional", negatives: [...OFFER_NEG, "religious iconography beyond simple decor"] } }),
  offer("offer-christmas-new-year-sale", "Christmas and New Year sale", "Season's-greetings sale announcement with fairy lights: the offer, validity and code are read exactly from the brief.", {
    speech: "festive", aspects: V, hooks: ["announcement", "relatable-confession"], roles: ["Season greeting", "The sale", "Offer card", "Terms line", "Sign-off"],
    beats: [["hook", 5, "Season's greeting over fairy lights"], ["body", 6, "Announce the sale, from the brief"], ["proof", 6, `Show the ${SCREEN}, including any code`], ["cta", 5, "Where to find it; 'Terms apply' if the brief has terms"]],
    camera: ["handheld in warm fairy-light bokeh with a push to the card", "tripod two-shot by the window", "close-up on gift wrapping then the presenter"], settings: ["festive-living-room", "living-room-sofa", "shop-counter"], tag: "season's sale smartphone video" }),
  offer("offer-independence-day-sale", "Independence Day sale", "Respectful Independence Day greeting with tricolour accents, then a plain read of the brief's offer; no politics, no military imagery.", {
    speech: "festive", aspects: V, hooks: ["announcement", "bold-statement"], roles: ["Respectful greeting", "The offer", "Offer card", "Terms line", "Sign-off"],
    beats: [["hook", 5, "Simple greeting with tricolour accents"], ["body", 6, "Announce the offer, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "Where to find it; 'Terms apply' if the brief has terms"]],
    camera: ["tripod medium close-up in soft morning light", "handheld at the counter, steady", "locked shot with a small flag accent"], settings: [...COUNTER, "balcony-evening"], tag: "national-day sale smartphone video", extra: { tone: "traditional", negatives: [...OFFER_NEG, "political parties, leaders or slogans", "military imagery"] } }),
  offer("offer-flash-countdown", "Flash sale with real countdown", "A flash sale that counts down to the end time written in the brief, with a steady countdown card. Needs a real validity in the brief.", {
    speech: "ad", needs: "validity", hooks: ["urgency", "pattern-interrupt"], roles: ["Energetic opener", "The sale", "Countdown card", "Terms line", "Call to action"],
    beats: [["hook", 4, "Burst of energy: 'flash sale', then the real end time from the brief"], ["body", 5, "What is on sale, from the brief"], ["proof", 6, "Steady countdown card to the brief's end time, plus the offer card"], ["cta", 5, "Where to go; 'Terms apply' if the brief has terms"]],
    camera: ["handheld with quick whip-pans between presenter and items", "locked tripod shot with a clean countdown card", "handheld selfie with item cut-ins"], settings: COUNTER, tag: "flash-sale countdown video" }),
  offer("offer-buy-one-get-one", "Buy one, get one", "Presenter holds two items and explains the buy-one-get-one offer in the brief's exact words, with the terms on screen.", {
    speech: "ad", hooks: ["announcement", "question"], roles: ["Two-item hook", "How it works", "Offer card", "Terms line", "Call to action"],
    beats: [["hook", 4, "Hold up two items: 'this is how the offer works'"], ["body", 6, "Explain the pairing, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "Where to get it; 'Terms apply' if the brief has terms"]],
    camera: ["handheld medium shot with both items in frame, cut to the card", "top-down propped phone over the two items", "tripod at the counter"], settings: [...COUNTER, "dining-table"], tag: "buy-one-get-one smartphone ad" }),
  offer("offer-combo-bundle", "Combo and bundle deal", "A tidy walk through what is in the bundle, item by item, ending on the combined offer as the brief states it.", {
    speech: "ad", hooks: ["list-teaser", "curiosity-gap"], roles: ["Bundle hook", "Item one", "Item two", "Offer card", "Call to action"],
    beats: [["hook", 4, "Items laid out in a row: 'what is in this bundle'"], ["body", 7, "Name each item, one line each, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "Where to get it; 'Terms apply' if the brief has terms"]],
    camera: ["top-down propped phone, items laid out, hands entering", "handheld close-ups item by item", "tripod medium shot"], settings: ["dining-table", "study-desk-room", "shop-counter"], tag: "bundle deal video" }),
  offer("offer-free-trial-consult-demo", "Free trial, consultation or demo", "Calm invitation to a free first step (trial, consultation or demo) exactly as the brief describes it, with what to expect.", {
    speech: "pitch", aspects: V, platforms: ["facebook", "instagram", "youtube", "linkedin"], goals: ["leads", "installs"], hooks: ["question", "announcement"], roles: ["Invitation hook", "What it is", "What to expect", "Offer card", "How to book"],
    beats: [["hook", 5, "'Want to try it first?'"], ["body", 7, "What the free step is, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "How to book; 'Terms apply' if the brief has terms"]],
    camera: ["tripod medium close-up at eye level, small push on the card", "handheld shoulder-height steady shot", "propped phone at the desk"], settings: ["small-office-desk", "coworking-office", "cafe-corner", "studio-desk-set"], tag: "free first-step invitation video", extra: { negatives: [...OFFER_NEG, "results or outcome promises"] } }),
  offer("offer-early-bird", "Early-bird or pre-launch offer", "Invites people to join early on the brief's terms: what early joiners get and until when, exactly as written, never invented.", {
    speech: "ad", goals: ["leads", "sales", "installs"], hooks: ["announcement", "curiosity-gap"], roles: ["Early-bird hook", "What early joiners get", "Offer card", "Terms line", "How to join"],
    beats: [["hook", 4, "'Before it opens to everyone...'"], ["body", 6, "What early joiners get, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "How to join; 'Terms apply' if the brief has terms"]],
    camera: ["close selfie with a conspiratorial lean-in, cut to the card", "tripod medium shot", "handheld close-up"], settings: [...HOMEISH, "studio-desk-set"], tag: "early-bird offer video" }),
  offer("offer-cashback-coupon-reveal", "Coupon code reveal", "The coupon code is revealed at the end and shown large, exactly as written in the brief, with how to apply it.", {
    speech: "ad", hooks: ["curiosity-gap", "pattern-interrupt"], roles: ["Secret hook", "How the offer works", "Code reveal", "How to apply", "Call to action"],
    beats: [["hook", 4, "'There is a code, and I will show it at the end'"], ["body", 6, "What the offer gives, from the brief"], ["proof", 6, "Code reveal on a large steady card, exactly as in the brief"], ["cta", 5, "How to apply it; 'Terms apply' if the brief has terms"]],
    camera: ["handheld selfie with a held pause before the code card", "tripod shot, cut to a large code card", "screen-recording of a generic checkout with a picture-in-picture presenter"], settings: [...HOMEISH, "screen-recording-frame"], tag: "coupon code reveal video", extra: { cap: 950 } }),
  offer("offer-last-few", "Last-few reminder", "A quiet reminder that only a few are left. Used only when the brief says stock or places are really limited.", {
    speech: "ad", needs: "stock", hooks: ["urgency", "announcement"], roles: ["Quiet opener", "What is left", "Offer card", "Terms line", "Call to action"],
    beats: [["hook", 4, "A calm 'a quick heads-up'"], ["body", 6, "What is limited, exactly as the brief says"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "How to get one; 'Terms apply' if the brief has terms"]],
    camera: ["tripod medium shot at the shelf, no rush", "handheld close-up on the shelf then the face", "locked wide with a card cut-in"], settings: COUNTER, tag: "limited-quantity reminder video" }),
  offer("offer-membership-subscription", "Membership or subscription offer", "Explains a membership or subscription offer as the brief gives it: what is included, the price or discount and the terms.", {
    speech: "pitch", aspects: V, goals: ["sales", "leads", "retention"], hooks: ["question", "announcement"], roles: ["Member hook", "What is included", "Offer card", "Terms line", "How to join"],
    beats: [["hook", 5, "'Thinking of becoming a member?'"], ["body", 7, "What membership includes, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "How to join; 'Terms apply' if the brief has terms"]],
    camera: ["tripod medium shot at the desk with a card cut-in", "handheld walk-through of the space", "propped phone at the counter"], settings: ["gym-floor", "salon-chair", "cafe-corner", "small-office-desk"], tag: "membership offer video" }),
  offer("offer-student-first-time", "Student or first-time customer offer", "Friendly invitation for students or first-time customers using only the eligibility and offer written in the brief. Adult students only.", {
    speech: "chat", actors: 2, aspects: V, hooks: ["question", "relatable-confession"], roles: ["Who it is for", "The offer", "Offer card", "Eligibility and terms", "Call to action"],
    beats: [["hook", 4, "One asks: 'is there anything for first-timers?'"], ["body", 6, "The other explains the offer, from the brief"], ["proof", 6, `Show the ${SCREEN} and who is eligible`], ["cta", 5, "How to claim; 'Terms apply' if the brief has terms"]],
    camera: ["handheld two-shot on campus steps, light and friendly", "tripod two-shot at the cafe table", "close-ups cut by speaker"], settings: ["college-campus-steps", "cafe-corner", "study-desk-room"], tag: "first-time customer offer video", extra: { negatives: [...OFFER_NEG, "children or minors on screen", "school uniforms"] } }),
  offer("offer-loyalty-thank-you", "Loyalty thank-you offer", "A sincere thank-you to existing customers, followed by the loyalty offer exactly as the brief states it.", {
    speech: "story", hooks: ["relatable-confession", "announcement"], roles: ["Thank-you opener", "The loyalty offer", "Offer card", "Terms line", "Warm close"],
    beats: [["hook", 5, "'Thank you for being with us'"], ["body", 6, "The loyalty offer, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "How to claim; 'Terms apply' if the brief has terms"]],
    camera: ["tripod medium close-up, warm light, still", "handheld slow drift at the counter", "propped phone"], settings: [...COUNTER, "cafe-corner", "salon-chair"], tag: "loyalty thank-you video", goals: ["retention", "sales"] }),
  offer("offer-upgrade-exchange", "Upgrade or exchange offer", "Shows an old item next to a new one and explains the exchange or upgrade offer exactly as the brief words it.", {
    speech: "pitch", hooks: ["question", "curiosity-gap"], roles: ["Old-vs-new hook", "How the exchange works", "Offer card", "Terms line", "Call to action"],
    beats: [["hook", 4, "Old item and new item side by side: 'ready for an upgrade?'"], ["body", 6, "How the exchange works, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "Where to exchange; 'Terms apply' if the brief has terms"]],
    camera: ["tripod medium shot with both items on the counter", "handheld close-ups of old then new", "top-down over the two"], settings: ["shop-counter", "showroom-floor", "study-desk-room"], tag: "exchange offer video", extra: { negatives: [...OFFER_NEG, "named competitor brands"] } }),
  offer("offer-ends-tonight", "Final-day offer reminder", "A friendly last-day reminder, used only when the brief gives the real end date or time, with the deadline shown steadily.", {
    speech: "voicenote", needs: "validity", hooks: ["urgency", "mid-conversation"], roles: ["Friendly reminder", "What it is", "Deadline card", "Terms line", "Call to action"],
    beats: [["hook", 4, "'Quick reminder before it ends', then the real end time"], ["body", 5, "What the offer is, from the brief"], ["proof", 6, "Offer card with the brief's end time, steady"], ["cta", 5, "How to claim; 'Terms apply' if the brief has terms"]],
    camera: ["front-camera selfie, relaxed, steady", "propped phone at the counter, one cut to the card", "handheld selfie while walking"], settings: [...HOMEISH, ...COUNTER], tag: "last-day reminder selfie video" }),
  offer("offer-owner-at-counter", "Owner announces the offer", "The shop owner, at the counter, tells regulars about the offer in warm, plain speech, with the terms shown on a card.", {
    speech: "pitch", hooks: ["mid-conversation", "announcement"], roles: ["Owner's greeting", "The offer", "Offer card", "Terms line", "Invitation"],
    beats: [["hook", 4, "Wave from behind the counter: 'I have news for you'"], ["body", 6, "The offer, in the owner's own plain words, from the brief"], ["proof", 6, `Show the ${SCREEN}`], ["cta", 5, "Invitation to visit; 'Terms apply' if the brief has terms"]],
    camera: ["handheld at the counter, close and personal", "propped phone on the glass counter", "tripod medium shot"], settings: ["shop-counter", "street-market-lane", "jewellery-counter"], tag: "shop owner offer announcement", goals: ["footfall", "sales"], platforms: ["facebook", "whatsapp", "instagram"] }),
  offer("offer-whats-the-catch", "What's the catch? Offer explained", "Two people: one asks 'what is the catch?', the other answers with the terms from the brief, one by one, nothing hidden.", {
    speech: "chat", actors: 2, aspects: V, hooks: ["question", "mid-conversation"], roles: ["The catch question", "Term one", "Term two", "Offer card", "Call to action"],
    beats: [["hook", 4, "'Okay, but what is the catch?'"], ["body", 7, "Answer with the terms, from the brief, one by one"], ["proof", 6, `Show the ${SCREEN} with the terms`], ["cta", 5, "Relieved reaction; how to claim"]],
    camera: ["handheld two-shot, close to the faces, quick pans to the speaker", "tripod two-shot with a card cut-in", "close-ups cut by speaker"], settings: [...HOMEISH, ...COUNTER], tag: "offer terms explained video", extra: { realism: [...OFFER_REALISM, "the terms are read exactly as the brief has them"], negatives: [...OFFER_NEG, "hiding or softening a term"] } }),
];
