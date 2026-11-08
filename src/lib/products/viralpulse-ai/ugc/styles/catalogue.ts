/**
 * The UGC style catalogue. Pure data; no company facts, prices or claims. Every style works with any
 * brief: brief variables are filled in by the script engine, never baked in here.
 */
import { BASE_NEGATIVES, BASE_REALISM, speechGuide, type SpeechKey } from "./catalogue-base";
import { MODEST_CATEGORIES, TRADITIONAL_CATEGORIES, type AspectRatio, type BeatRole, type CastMode, type Goal, type HookFormulaId, type Platform, type SceneBeat, type StyleCategory, type UgcStyle } from "./types";

import { ADS_DEFS } from "./catalogue-ads";
import { BIZ_DEFS } from "./catalogue-biz";
import { PLATFORM_DEFS } from "./catalogue-platform";
import { TECH_DEFS } from "./catalogue-tech";
import { UGC_DEFS } from "./catalogue-ugc";
import { COMPANY_DEFS } from "./catalogue-company";
import { OFFER_DEFS } from "./catalogue-offers";

export type B = [BeatRole, number, string];

export interface Def {
  id: string; label: string; description: string; category: StyleCategory;
  industries: string[]; goals: Goal[]; platforms: Platform[]; aspects: AspectRatio[];
  actors: 1 | 2 | 3; beats: B[]; roles: string[]; hooks: HookFormulaId[]; speech: SpeechKey;
  camera: [string, ...string[]]; settings: string[]; tag: string; realism?: string[]; negatives?: string[]; ill?: boolean; cap?: number;
  native?: Platform; subs?: boolean; cast?: CastMode; offer?: boolean; needs?: "validity" | "stock"; tone?: "trendy" | "modest" | "traditional";
}

const HOME = ["bedroom-floor-cosy", "living-room-sofa", "balcony-evening", "dining-table", "courtyard-home"];
const ANY = ["any"];
const SOCIAL: Platform[] = ["instagram", "youtube", "facebook"];
const V: AspectRatio[] = ["9:16", "1:1"];

export function mk(d: Def): UgcStyle {
  const beats: SceneBeat[] = d.beats.map(([role, durationSecs, purpose]) => ({ role, durationSecs, purpose }));
  const n = beats.length;
  return {
    id: d.id, label: d.label, description: d.description, category: d.category, industries: d.industries, goals: d.goals,
    platforms: d.platforms, aspects: d.aspects, durationRange: [Math.max(15, n * 4), Math.min(60, n * 12)], actorCount: d.actors,
    beats, lineRoles: d.roles, hookFormulas: d.hooks, speech: speechGuide(d.speech),
    camera: { primary: d.camera[0], alternates: d.camera.slice(1) },
    realismCues: [...BASE_REALISM, ...(d.realism ?? [])], negativeCues: [...BASE_NEGATIVES, ...(d.negatives ?? [])],
    settingIds: d.settings, promptTag: d.tag, illustrative: d.ill ?? false, promptCharCap: d.cap ?? (d.actors === 3 ? 1100 : undefined), adultsOnly: true,
    castMode: d.cast ?? (d.actors === 1 ? "solo-female" : "female-male"),
    wardrobeTone: d.tone ?? TRADITIONAL_CATEGORIES.includes(d.category) ? "traditional" : MODEST_CATEGORIES.includes(d.category) ? "modest" : "trendy",
    ...(d.native ? { nativePlatform: d.native } : {}), ...(d.offer ? { offer: true, ...(d.needs ? { offerNeeds: d.needs } : {}) } : {}), ...(d.subs !== undefined ? { subtitlesDefault: d.subs } : {}),
  };
}

const DEFS: Def[] = [
  /* ---------------- conversation ---------------- */
  { id: "cosy-floor-chat", label: "Cosy floor chat", category: "conversation", description: "Two people sitting on the floor of a lived-in bedroom, chatting naturally about a thing they use. Candid, warm, handheld.",
    industries: ["d2c", "lifestyle", "beauty", "food", "apps", "home", "fashion", "wellness"], goals: ["awareness", "engagement", "trust"], platforms: SOCIAL, aspects: ["9:16", "1:1"],
    actors: 2, beats: [["hook", 6, "Mid-conversation start: one friend brings up the topic out of the blue"], ["body", 8, "The other asks a natural question; first friend explains how they use it, from the brief"], ["proof", 8, "A small real moment: shows it or describes a brief key point with a reaction"], ["cta", 6, "Casual nudge to check it out, in the brief's call to action"]],
    roles: ["Opens mid-thought with a casual remark", "Friend reacts and asks an honest question", "Explains one key point from the brief simply", "Adds a relatable detail or small laugh", "Gentle, no-pressure call to action"],
    hooks: ["mid-conversation", "relatable-confession", "curiosity-gap"], speech: "chat",
    camera: ["handheld phone at floor level from a slight angle, candid, small drifts and reframes", "phone propped on a pile of books, static, slightly wide", "handheld over one friend's shoulder"],
    settings: ["bedroom-floor-cosy", "living-room-sofa", "balcony-evening"], tag: "candid vertical smartphone video", realism: ["fairy lights, plants and personal clutter visible", "people sit relaxed, one shifts position mid-scene"] },
  { id: "balcony-chai-chat", label: "Balcony chai chat", category: "conversation", description: "Two people chatting over chai on a balcony in soft light, one recommending something they have been using.",
    industries: ["d2c", "food", "lifestyle", "apps", "home", "wellness", "retail"], goals: ["awareness", "engagement"], platforms: SOCIAL, aspects: V,
    actors: 2, beats: [["hook", 5, "Casual question across the chai cups"], ["body", 9, "One shares a habit or find tied to the brief"], ["proof", 8, "Specific detail from the brief key points, spoken naturally"], ["cta", 6, "Friendly suggestion to try or look it up"]],
    roles: ["Casual opener", "Curious follow-up", "Plain explanation of a key point", "Reaction", "Soft call to action"],
    hooks: ["question", "relatable-confession", "mid-conversation"], speech: "chat",
    camera: ["handheld medium two-shot, gentle sway", "tripod-style static two-shot on the railing", "slow handheld drift between the two"],
    settings: ["balcony-evening", "rooftop-dusk", "courtyard-home"], tag: "candid smartphone video", realism: ["steam from the cups", "ambient neighbourhood sounds"] },
  { id: "sofa-recommendation", label: "Sofa recommendation", category: "conversation", description: "Three friends or family adults on a sofa; one is asked 'what do you use for this?' and everyone chips in.",
    industries: ANY, goals: ["awareness", "engagement", "trust"], platforms: ["instagram", "facebook", "youtube", "whatsapp"], aspects: V,
    actors: 3, beats: [["hook", 5, "Someone asks the group for a recommendation"], ["body", 9, "First answer: the product, one honest reason from the brief"], ["proof", 9, "Another adds a second brief point; third agrees with a small joke"], ["cta", 6, "Wrap up with where to find it"]],
    roles: ["Asks the group", "Answers with the product name", "Adds a reason", "Chimes in with agreement or a joke", "Points to the call to action"],
    hooks: ["question", "mid-conversation"], speech: "chat",
    camera: ["handheld wide shot from the sofa's opposite side, small pans to whoever speaks", "propped phone at a slight angle"], settings: ["living-room-sofa", "dining-table"], tag: "candid smartphone video",
    realism: ["people talk over each other briefly", "a cushion gets adjusted"] },

  /* ---------------- review ---------------- */
  { id: "honest-first-impression", label: "Honest first impression", category: "review", description: "One person to the front camera sharing a candid first impression, balanced and unscripted in feel.",
    industries: ["d2c", "beauty", "electronics", "apps", "food", "fashion", "fitness", "home"], goals: ["trust", "sales", "awareness"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Honest opener about what they expected"], ["body", 9, "What they noticed first, using only brief facts"], ["proof", 8, "One thing they liked and one honest 'for me' hedge"], ["cta", 5, "Who it might suit, then the call to action"]],
    roles: ["Hook with an honest expectation", "First observation", "Second observation with a hedge", "Who it suits", "Call to action"],
    hooks: ["relatable-confession", "bold-statement", "curiosity-gap"], speech: "review",
    camera: ["front-camera selfie, arm's length, slight wobble", "propped selfie with a cut-in of the product in hand"], settings: [...HOME, "study-desk-room", "parked-car"], tag: "front-camera selfie video",
    ill: true, realism: ["eye contact drifts to the screen now and then"] },
  { id: "two-week-update", label: "Two-week update (dramatised)", category: "review", description: "A selfie check-in as if a few weeks after starting; explicitly illustrative, never a real customer.",
    industries: ["d2c", "beauty", "fitness", "apps", "wellness", "education"], goals: ["trust", "sales"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Check-in opener: 'quick update'"], ["body", 9, "What the routine looks like, brief facts only"], ["proof", 9, "Describes feeling and habit change without quantified or health claims"], ["cta", 5, "Soft close with the call to action"]],
    roles: ["Update opener", "What changed in routine", "What stayed the same", "Honest caveat", "Call to action"],
    hooks: ["relatable-confession", "curiosity-gap"], speech: "review",
    camera: ["handheld selfie while walking inside the home", "propped selfie, lean-in at the end"], settings: [...HOME, "dressing-mirror"], tag: "front-camera selfie video",
    ill: true, realism: ["different lighting from clip to clip as if recorded across days"], negatives: ["any number, percentage or timeline result"] },
  { id: "dramatised-testimonial", label: "Dramatised testimonial", category: "review", description: "Calm to-camera 'my experience' in the user's own words; an illustrative portrayal, labelled as such.",
    industries: ["services", "education", "fitness", "finance", "healthcare-info", "real-estate", "local"], goals: ["trust", "leads"], platforms: ["instagram", "facebook", "youtube", "whatsapp"], aspects: ["9:16", "16:9"],
    actors: 1, beats: [["hook", 6, "Sets the situation before they found it"], ["body", 10, "What the experience was like, from brief facts"], ["proof", 8, "How it felt, no results or numbers"], ["cta", 6, "Who might want to know more; call to action"]],
    roles: ["Sets the scene", "What they tried", "How the experience felt", "Advice to others", "Call to action"],
    hooks: ["relatable-confession", "bold-statement"], speech: "story",
    camera: ["tripod medium close-up, slightly off-centre, still", "handheld close-up with a slow push-in"], settings: ["living-room-sofa", "small-office-desk", "dining-table", "shop-counter"], tag: "documentary-style smartphone testimonial video",
    ill: true, realism: ["a pause to collect thoughts"] },

  /* ---------------- unboxing ---------------- */
  { id: "doorstep-unboxing", label: "Doorstep unboxing", category: "unboxing", description: "Package arrives; opening it at the door with genuine curiosity and first reactions.",
    industries: ["d2c", "ecommerce", "fashion", "beauty", "electronics", "gifting", "home"], goals: ["sales", "awareness", "trust"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Package in hand: 'it came!'"], ["body", 9, "Opening the box, first look at items from the brief"], ["proof", 8, "Handles and describes a detail, honest first thoughts"], ["cta", 5, "Where to get it; call to action"]],
    roles: ["Excited hook", "Narrates opening", "Describes item detail", "First honest reaction", "Call to action"],
    hooks: ["pattern-interrupt", "curiosity-gap"], speech: "review",
    camera: ["handheld first-person with hands visible, quick tilts to the item", "propped phone at the door with a cut to a close-up"], settings: ["doorstep-entry", "living-room-sofa", "bedroom-floor-cosy"], tag: "handheld unboxing video",
    ill: true, realism: ["plain unbranded cardboard and generic packing paper", "scissors or fingernail used to open tape"], negatives: ["readable logos on packaging"] },
  { id: "desk-unboxing-flatlay", label: "Desk unboxing over-shoulder", category: "unboxing", description: "Over-shoulder view of a desk as items come out of a box one by one.",
    industries: ["d2c", "electronics", "stationery", "fashion", "beauty", "gifting"], goals: ["awareness", "sales"], platforms: SOCIAL, aspects: V,
    actors: 1, beats: [["hook", 5, "Hands hover over a sealed box, teasing"], ["body", 9, "Items revealed in order, short remarks"], ["proof", 8, "Close-up of a detail mentioned in the brief"], ["cta", 6, "Wrap and call to action"]],
    roles: ["Teasing opener", "Narrates reveal", "Points out a detail", "Verdict-style remark", "Call to action"],
    hooks: ["curiosity-gap", "list-teaser"], speech: "review",
    camera: ["over-shoulder handheld looking down at the desk", "top-down propped phone with hands in frame"], settings: ["study-desk-room", "small-office-desk", "dining-table"], tag: "over-shoulder unboxing video",
    ill: true, realism: ["packing paper rustle", "cardboard edges slightly bent"] },

  /* ---------------- tutorial ---------------- */
  { id: "quick-how-to", label: "Quick how-to", category: "tutorial", description: "One person shows a simple task step by step in a real space.",
    industries: ["apps", "d2c", "home", "beauty", "education", "services", "electronics"], goals: ["education", "engagement", "installs"], platforms: SOCIAL, aspects: ["9:16", "1:1"],
    actors: 1, beats: [["hook", 5, "Name the small task and promise it is quick"], ["body", 10, "Step one and two with hands in frame"], ["proof", 8, "Step three and the finished result, no exaggeration"], ["cta", 5, "Save-for-later style nudge plus call to action"]],
    roles: ["Promise the task", "First step", "Second step", "Final step", "Call to action"],
    hooks: ["question", "list-teaser", "bold-statement"], speech: "tutorial",
    camera: ["propped phone at chest height facing the person, cut-ins to hands", "handheld over-shoulder on the task"], settings: ["home-kitchen", "study-desk-room", "dining-table", "dressing-mirror"], tag: "casual how-to smartphone video" },
  { id: "three-tips-listicle", label: "Three tips listicle", category: "tutorial", description: "Quick spoken list of three practical tips tied to the product, with quick cut-ins.",
    industries: ANY, goals: ["education", "engagement", "awareness"], platforms: SOCIAL, aspects: V,
    actors: 1, beats: [["hook", 5, "Name the problem and the number of tips"], ["body", 8, "Tip one with a fast cut-in"], ["proof", 8, "Tip two and three, one tied to the product's brief facts"], ["cta", 5, "Invite to follow or check out; call to action"]],
    roles: ["Teaser", "Tip one", "Tip two", "Tip three involving the product", "Call to action"],
    hooks: ["list-teaser", "bold-statement"], speech: "tutorial",
    camera: ["handheld selfie with jump cuts between tips", "propped phone with punch-in crops"], settings: [...HOME, "coworking-office", "park-bench"], tag: "jump-cut selfie video" },

  /* ---------------- problem-solution ---------------- */
  { id: "relatable-problem-fix", label: "Relatable problem, simple fix", category: "problem-solution", description: "Two people: one vents about an everyday annoyance, the other suggests the product.",
    industries: ["d2c", "apps", "home", "services", "electronics", "food", "fintech", "education"], goals: ["sales", "awareness", "installs"], platforms: SOCIAL, aspects: V,
    actors: 2, beats: [["hook", 5, "Venting about {problem} mid-annoyance"], ["body", 8, "Other friend asks what happened, empathises"], ["proof", 9, "Suggests the product and a key brief point, shown briefly"], ["cta", 6, "Vent person reacts; call to action"]],
    roles: ["Complaint hook", "Empathetic question", "Suggests the product", "Skeptical then curious reaction", "Call to action"],
    hooks: ["pattern-interrupt", "relatable-confession", "question"], speech: "chat",
    camera: ["handheld, quick pans between the two", "static propped phone with one cut-in on the product"], settings: [...HOME, "cafe-corner", "coworking-office"], tag: "candid smartphone video" },
  { id: "frustration-to-relief", label: "Frustration to relief", category: "problem-solution", description: "A solo person shows the daily hassle, then a calmer way, in two contrasting moods.",
    industries: ["apps", "d2c", "home", "services", "fintech", "healthcare-info"], goals: ["sales", "installs", "leads"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Mid-frustration in real setting"], ["body", 8, "Explains why it is annoying, relatable detail"], ["proof", 9, "Switch: shows the product from the brief, calmer tone"], ["cta", 5, "Closing remark and call to action"]],
    roles: ["Frustrated opener", "Explains the hassle", "Introduces the product", "Describes what is easier, no claims", "Call to action"],
    hooks: ["pattern-interrupt", "relatable-confession"], speech: "review",
    camera: ["handheld selfie, shakier in the frustrated part, steadier after", "propped phone with a cut-in of hands"], settings: [...HOME, "small-office-desk"], tag: "front-camera selfie video" },

  /* ---------------- day in the life ---------------- */
  { id: "day-in-the-life", label: "Day in the life", category: "day-in-life", description: "A person's ordinary day, with the product woven in naturally as a small, real moment.",
    industries: ["apps", "d2c", "fitness", "food", "education", "services", "wellness"], goals: ["awareness", "engagement"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Morning start with a quick voice-over"], ["body", 9, "Routine moments on the way to the day"], ["proof", 9, "Product used naturally in one moment"], ["cta", 5, "Evening reflection; call to action"]],
    roles: ["Morning voice-over", "Routine commentary", "Product moment", "Wind-down remark", "Call to action"],
    hooks: ["mid-conversation", "relatable-confession"], speech: "story",
    camera: ["handheld following, first-person glimpses and selfie bits", "propped phone time-lapse feel with real-time cut-ins"], settings: ["home-kitchen", "balcony-evening", "coworking-office", "park-bench", "cafe-corner"], tag: "vlog-style smartphone video", realism: ["time-of-day changes across scenes"] },

  /* ---------------- GRWM ---------------- */
  { id: "grwm-mirror", label: "Get ready with me", category: "grwm", description: "Chatting to the mirror while getting ready for the day or an outing, product in the routine.",
    industries: ["beauty", "fashion", "d2c", "jewellery", "wellness", "apps"], goals: ["awareness", "sales", "engagement"], platforms: ["instagram", "youtube", "facebook"], aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Where they are headed and the time pressure"], ["body", 9, "Routine steps while chatting"], ["proof", 8, "Uses the product, says why from the brief"], ["cta", 5, "Final look check and call to action"]],
    roles: ["Where they are going", "Routine chat", "Product mention", "Mirror verdict", "Call to action"],
    hooks: ["mid-conversation", "relatable-confession", "question"], speech: "chat",
    camera: ["mirror shot from a propped phone", "handheld close-ups of hands doing the routine"], settings: ["dressing-mirror", "bedroom-floor-cosy"], tag: "mirror-selfie smartphone video", realism: ["mirror with fingerprints and slight reflections"] },
  { id: "evening-wind-down", label: "Evening wind-down routine", category: "grwm", description: "A calm night routine, quiet voice, soft lamp light.",
    industries: ["wellness", "beauty", "d2c", "food", "apps", "home"], goals: ["engagement", "awareness", "sales"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Day is over, soft opener"], ["body", 9, "Steps of the routine"], ["proof", 8, "Product moment, sensory description"], ["cta", 5, "Goodnight remark and call to action"]],
    roles: ["Soft opener", "Routine step", "Product in routine", "Reflection", "Call to action"],
    hooks: ["relatable-confession", "mid-conversation"], speech: "story",
    camera: ["propped phone on bedside, static, low light", "handheld close-ups with lamp glow"], settings: ["bedroom-floor-cosy", "dressing-mirror", "study-desk-room"], tag: "quiet night-time smartphone video", realism: ["noisy low-light grain"] },

  /* ---------------- street interview ---------------- */
  { id: "street-vox-pop", label: "Street vox pop", category: "street-interview", description: "An interviewer with a mic asks a passer-by a quick question; honest, spontaneous answers.",
    industries: ["d2c", "food", "retail", "apps", "education", "local", "fashion"], goals: ["awareness", "engagement", "trust"], platforms: SOCIAL, aspects: V,
    actors: 2, beats: [["hook", 5, "Interviewer stops someone with a surprising question"], ["body", 8, "Passer-by thinks aloud and answers"], ["proof", 9, "Follow-up that brings in a brief point; light reaction"], ["cta", 5, "Interviewer closes and points to the call to action"]],
    roles: ["Interviewer's catchy question", "Surprised answer", "Follow-up question", "Honest opinion", "Interviewer's wrap with call to action"],
    hooks: ["question", "pattern-interrupt"], speech: "interview",
    camera: ["handheld following the interviewer, mic at chest height", "tripod-less shoulder-height two-shot with pedestrians crossing"], settings: ["street-market-lane", "college-campus-steps", "park-bench"], tag: "street-interview smartphone video", ill: true, realism: ["passers-by walk behind", "a vehicle passes with traffic noise"] },
  { id: "campus-quick-poll", label: "Campus quick poll", category: "street-interview", description: "Students are asked a quick this-or-that question near the campus steps.",
    industries: ["education", "edtech", "apps", "food", "fashion", "d2c", "electronics"], goals: ["awareness", "installs", "engagement"], platforms: ["instagram", "youtube"], aspects: ["9:16"],
    actors: 2, beats: [["hook", 5, "Quick-fire this-or-that question"], ["body", 8, "Student picks and explains with humour"], ["proof", 8, "Interviewer brings in the product point"], ["cta", 5, "Wrap-up and call to action"]],
    roles: ["Question", "Pick and reason", "Follow-up", "Reaction", "Call to action"],
    hooks: ["question", "pattern-interrupt"], speech: "interview",
    camera: ["handheld selfie-stick-free reverse shot, jump cuts", "handheld two-shot on the steps"], settings: ["college-campus-steps"], tag: "campus vox pop smartphone video", ill: true },

  /* ---------------- reaction ---------------- */
  { id: "first-reaction", label: "First reaction", category: "reaction", description: "Genuine-looking first reaction when seeing or trying something from the brief.",
    industries: ["d2c", "food", "electronics", "apps", "beauty", "fashion", "gifting"], goals: ["awareness", "engagement"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Spots the thing and reacts audibly"], ["body", 8, "Tries or inspects, narrates"], ["proof", 8, "Reaction to a brief key point"], ["cta", 5, "Tells viewers where to look"]],
    roles: ["Immediate reaction", "Narrates trying", "Notices a detail", "Honest summing-up", "Call to action"],
    hooks: ["pattern-interrupt", "curiosity-gap"], speech: "chat",
    camera: ["handheld selfie with sudden tilt-down to the item", "propped phone, lean in and out"], settings: HOME, tag: "handheld reaction video", ill: true },
  { id: "friends-react-together", label: "Friends react together", category: "reaction", description: "Two friends see something on a phone or table and react in real time, teasing each other.",
    industries: ANY, goals: ["engagement", "awareness"], platforms: SOCIAL, aspects: V,
    actors: 2, beats: [["hook", 5, "One shows the other something"], ["body", 8, "Both react, tease, ask questions"], ["proof", 8, "Read or point at a brief key point aloud"], ["cta", 5, "Agree to try it; call to action"]],
    roles: ["Shows it", "First reaction", "Question", "Teasing reply", "Call to action"],
    hooks: ["pattern-interrupt", "mid-conversation"], speech: "chat",
    camera: ["handheld two-shot, jostled", "propped phone, laughing close to the lens"], settings: [...HOME, "cafe-corner", "college-campus-steps"], tag: "candid smartphone video" },

  /* ---------------- POV ---------------- */
  { id: "pov-situation", label: "POV situation", category: "pov", description: "First-person POV in a relatable situation; the product becomes the quiet solution.",
    industries: ["apps", "d2c", "food", "home", "services", "fitness", "education"], goals: ["awareness", "engagement", "installs"], platforms: ["instagram", "youtube", "facebook"], aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "On-screen 'POV:' situation set up, person off-camera speaks"], ["body", 8, "Situation escalates mildly"], ["proof", 8, "POV hands bring in the product"], ["cta", 5, "Closing line and call to action"]],
    roles: ["Off-camera remark", "Situation line", "Product line", "Resolution line", "Call to action"],
    hooks: ["pattern-interrupt", "relatable-confession"], speech: "chat",
    camera: ["first-person phone POV with hands visible", "POV that turns to a selfie in the last beat"], settings: [...HOME, "cafe-corner", "coworking-office", "parked-car"], tag: "first-person POV smartphone video", realism: ["hands visible with natural nails"] },

  /* ---------------- comparison ---------------- */
  { id: "split-screen-comparison", label: "Split-screen: old way vs new way", category: "comparison", description: "Split-screen contrast of the usual way and the product's way; no named competitors, no numbers.",
    industries: ["apps", "d2c", "home", "services", "fintech", "electronics"], goals: ["sales", "installs", "leads"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 2, beats: [["hook", 5, "Both sides start the same task at once"], ["body", 9, "Left struggles a bit, right goes easier"], ["proof", 9, "Right explains one brief key point; left reacts"], ["cta", 5, "Both look at camera; call to action"]],
    roles: ["Starting line", "Old way remark", "New way remark", "Key point", "Call to action"],
    hooks: ["pattern-interrupt", "question"], speech: "chat",
    camera: ["split-screen of two propped phone frames, identical framing", "split-screen with a punch-in on one side"], settings: [...HOME, "home-kitchen", "small-office-desk"], tag: "split-screen smartphone video", ill: true, negatives: ["competitor names or logos"] },
  { id: "which-would-you-pick", label: "Which would you pick", category: "comparison", description: "Two options held side by side in hand, talked through honestly (generic options, no rival brands).",
    industries: ["d2c", "food", "fashion", "electronics", "home", "beauty"], goals: ["engagement", "sales"], platforms: SOCIAL, aspects: V,
    actors: 1, beats: [["hook", 5, "Holds up two options and asks the viewer"], ["body", 9, "Talks through differences calmly"], ["proof", 8, "Chooses the brief's product and explains from brief facts"], ["cta", 5, "Asks viewers to comment; call to action"]],
    roles: ["Pose the choice", "Option one", "Option two", "Pick and reason", "Call to action"],
    hooks: ["question", "bold-statement"], speech: "review",
    camera: ["handheld selfie with both items in each hand, cut-ins on details", "propped phone, desk surface view"], settings: ["study-desk-room", "dining-table", "home-kitchen"], tag: "handheld product comparison video", negatives: ["competitor logos or names"] },

  /* ---------------- founder / story ---------------- */
  { id: "founder-story-office", label: "Founder story at the desk", category: "founder-story", description: "A founder-style person tells the origin of the product at a small desk, honest and unpolished. Fictional presenter.",
    industries: ["b2b", "saas", "d2c", "services", "education", "local", "fintech"], goals: ["trust", "leads", "awareness"], platforms: ["linkedin", "instagram", "youtube", "facebook"], aspects: ["9:16", "16:9"],
    actors: 1, beats: [["hook", 6, "The problem they kept running into"], ["body", 10, "What they set out to build, from the brief"], ["proof", 9, "What it does today using only brief facts"], ["cta", 6, "Invitation and call to action"]],
    roles: ["The itch", "What they tried", "What it became", "What it does for people", "Call to action"],
    hooks: ["relatable-confession", "bold-statement", "curiosity-gap"], speech: "story",
    camera: ["tripod medium shot at an angle, slow push-in", "handheld close-up with cut-ins of the workspace"], settings: ["small-office-desk", "coworking-office", "study-desk-room"], tag: "documentary-style smartphone video", ill: true },
  { id: "why-we-started", label: "Why we started (small team)", category: "founder-story", description: "Two co-workers recall why the idea began, in a relaxed chat.",
    industries: ["b2b", "saas", "d2c", "services", "local", "education"], goals: ["trust", "awareness"], platforms: ["linkedin", "instagram", "youtube"], aspects: ["9:16", "16:9"],
    actors: 2, beats: [["hook", 5, "'Remember when we...' opening"], ["body", 9, "Shared story of the problem"], ["proof", 9, "What they made, brief facts only"], ["cta", 5, "Warm invite and call to action"]],
    roles: ["Recall", "Add detail", "The turning point", "What it is now", "Call to action"],
    hooks: ["mid-conversation", "relatable-confession"], speech: "story",
    camera: ["handheld two-shot over a table", "propped phone, wide, with occasional cut-ins"], settings: ["coworking-office", "small-office-desk", "cafe-corner"], tag: "candid smartphone video", ill: true },

  /* ---------------- podcast / interview ---------------- */
  { id: "podcast-two-chair", label: "Two-chair podcast clip", category: "podcast", description: "A host and guest in a small podcast corner, the clip captured from a phone.",
    industries: ["b2b", "saas", "education", "services", "fintech", "d2c", "healthcare-info"], goals: ["trust", "awareness", "leads"], platforms: ["youtube", "linkedin", "instagram"], aspects: ["9:16", "16:9"],
    actors: 2, beats: [["hook", 6, "Host teases the topic"], ["body", 10, "Guest explains how it works, brief facts"], ["proof", 9, "Host asks a practical question; guest answers"], ["cta", 6, "Host closes and points to the call to action"]],
    roles: ["Host teaser", "Guest answer", "Host follow-up", "Guest example", "Host wrap with call to action"],
    hooks: ["question", "curiosity-gap", "bold-statement"], speech: "interview",
    camera: ["two phones cut between host and guest", "single wide handheld with slow drift"], settings: ["small-office-desk", "coworking-office", "living-room-sofa"], tag: "podcast clip smartphone video", realism: ["two mics on desk arms but without logos", "headphones on one side"], negatives: ["readable podcast logos"] },
  { id: "cafe-interview-chat", label: "Cafe interview chat", category: "podcast", ill: true, description: "A relaxed interview over coffee; interviewer asks, interviewee explains from experience.",
    industries: ["education", "services", "d2c", "apps", "b2b", "food"], goals: ["trust", "engagement"], platforms: SOCIAL, aspects: V,
    actors: 2, beats: [["hook", 5, "Interviewer's intriguing question"], ["body", 9, "Interviewee's story"], ["proof", 9, "A practical detail from the brief"], ["cta", 5, "Wrap-up and call to action"]],
    roles: ["Interviewer's question", "Answer", "Follow-up", "Detail", "Call to action"],
    hooks: ["question", "curiosity-gap"], speech: "interview",
    camera: ["propped phone over the table, slightly angled", "handheld over-shoulder shot"], settings: ["cafe-corner"], tag: "casual interview smartphone video" },

  /* ---------------- ASMR ---------------- */
  { id: "asmr-sensory-closeup", label: "ASMR sensory close-up", category: "asmr", description: "Slow macro hands and sounds: taps, pours, textures; a whispered line or two.",
    industries: ["food", "beauty", "d2c", "home", "stationery", "fashion", "wellness"], goals: ["awareness", "engagement"], platforms: ["instagram", "youtube"], aspects: ["9:16", "1:1"],
    actors: 1, beats: [["hook", 5, "Soft sound opener on the item"], ["body", 8, "Slow hands, textures, pours or taps"], ["proof", 8, "Close-up of a detail from the brief"], ["cta", 5, "Whispered call to action"]],
    roles: ["Whispered cue", "Quiet description", "Detail whisper", "Call to action in a whisper"],
    hooks: ["curiosity-gap", "pattern-interrupt"], speech: "asmr",
    camera: ["static macro close-up with shallow depth, hands only", "slow handheld glide across the surface"], settings: ["dining-table", "study-desk-room", "home-kitchen", "dressing-mirror"], tag: "close-up sensory video", realism: ["natural skin and nails", "audible small sounds"], cap: 700 },

  /* ---------------- food / cooking ---------------- */
  { id: "kitchen-recipe-demo", label: "Kitchen recipe demo", category: "food", description: "A home cook makes something simple with the product while chatting to the camera.",
    industries: ["food", "restaurant", "d2c", "home", "retail"], goals: ["awareness", "sales", "education"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "What they're making today"], ["body", 10, "Prep and cook with steps"], ["proof", 8, "The product's role; a taste and a reaction"], ["cta", 5, "Plate shot and call to action"]],
    roles: ["Today's dish", "Prep step", "Cooking step", "Taste reaction", "Call to action"],
    hooks: ["question", "list-teaser", "curiosity-gap"], speech: "tutorial",
    camera: ["propped phone on a shelf with cut-ins from handheld", "overhead pan across the counter"], settings: ["home-kitchen", "dining-table"], tag: "home-cooking smartphone video", realism: ["steam and small splatters", "a towel on the shoulder"], negatives: ["perfect restaurant plating"] },
  { id: "taste-test-two", label: "Taste test together", category: "food", description: "Two people taste something and give honest, funny first reactions.",
    industries: ["food", "restaurant", "d2c", "retail", "local"], goals: ["awareness", "engagement", "footfall"], platforms: SOCIAL, aspects: V,
    actors: 2, beats: [["hook", 5, "Challenge: guess what this is"], ["body", 8, "First taste, comments"], ["proof", 8, "Reveal; mention a brief point"], ["cta", 5, "Verdict and call to action"]],
    roles: ["Challenge", "First reaction", "Guess", "Reveal reaction", "Call to action"],
    hooks: ["pattern-interrupt", "question"], speech: "chat",
    camera: ["handheld two-shot, close to faces", "propped phone with food cut-ins"], settings: ["dining-table", "home-kitchen", "cafe-corner"], tag: "candid food smartphone video", ill: true, realism: ["mouth full while talking"] },

  /* ---------------- fitness ---------------- */
  { id: "gym-floor-tip", label: "Gym floor tip", category: "fitness", description: "A quick, practical tip between sets, slightly out of breath.",
    industries: ["fitness", "wellness", "apps", "food", "d2c"], goals: ["education", "awareness", "installs"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Between sets, tip teaser"], ["body", 9, "Demonstrates the tip"], ["proof", 8, "Ties product or app point from the brief, no health claims"], ["cta", 5, "Wrap and call to action"]],
    roles: ["Tip teaser", "Demonstration", "Product tie-in", "Closing remark", "Call to action"],
    hooks: ["bold-statement", "list-teaser", "question"], speech: "tutorial",
    camera: ["propped phone against a dumbbell rack", "handheld selfie between sets"], settings: ["gym-floor"], tag: "gym smartphone video", negatives: ["before-and-after body claims"] },
  { id: "morning-park-routine", label: "Morning park routine", category: "fitness", description: "A casual morning walk or stretch in the park with a talk-through of the routine.",
    industries: ["fitness", "wellness", "apps", "food", "d2c"], goals: ["engagement", "awareness", "installs"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Early morning hello"], ["body", 9, "Routine narration"], ["proof", 8, "Product moment from the brief"], ["cta", 5, "Cool-down remark and call to action"]],
    roles: ["Morning hello", "Routine", "Product moment", "Reflection", "Call to action"],
    hooks: ["mid-conversation", "relatable-confession"], speech: "story",
    camera: ["handheld selfie while walking", "propped on a bench for a stretch segment"], settings: ["park-bench", "rooftop-dusk"], tag: "morning-walk smartphone video" },

  /* ---------------- tech/app demo ---------------- */
  { id: "app-screen-walkthrough", label: "App screen walkthrough", category: "tech-demo", description: "A person walks through an app on their phone while talking; the screen is kept abstract and legible.",
    industries: ["apps", "saas", "fintech", "education", "services", "edtech"], goals: ["installs", "leads", "education"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "The task they want done"], ["body", 10, "Taps through two steps, narrating"], ["proof", 8, "A brief key point shown on screen as large simple UI"], ["cta", 5, "How to try it; call to action"]],
    roles: ["The task", "First tap", "Second tap", "What they see", "Call to action"],
    hooks: ["question", "curiosity-gap"], speech: "tutorial",
    camera: ["over-shoulder handheld with the phone screen in frame", "propped overhead on the desk with hand taps"], settings: ["study-desk-room", "cafe-corner", "coworking-office", "living-room-sofa"], tag: "screen walkthrough smartphone video",
    realism: ["screen shows large, simple generic UI with short words only"], negatives: ["tiny unreadable screen text", "real app store logos"], cap: 950 },
  { id: "in-car-quick-take", label: "In-car quick take", category: "tech-demo", description: "A parked-car selfie giving a quick take on a tool or product, as if between errands.",
    industries: ["apps", "automotive", "d2c", "services", "fintech", "electronics"], goals: ["awareness", "installs", "leads"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Car parked, 'quick thing before I go'"], ["body", 9, "Explains the point"], ["proof", 8, "Shows the product on phone or in hand"], ["cta", 5, "Pulls away remark and call to action"]],
    roles: ["Quick opener", "Explanation", "Showing it", "Verdict", "Call to action"],
    hooks: ["pattern-interrupt", "bold-statement"], speech: "review",
    camera: ["phone on a dashboard mount, front camera", "handheld selfie with the windshield behind"], settings: ["parked-car"], tag: "in-car selfie video", realism: ["seat belt on, car parked"] },

  /* ---------------- home / decor ---------------- */
  { id: "room-makeover-reveal", label: "Small room refresh reveal", category: "home-decor", description: "Walk through a small refresh of a room using the product, ending on the lived-in result.",
    industries: ["home", "d2c", "decor", "furniture", "retail", "real-estate"], goals: ["awareness", "sales", "engagement"], platforms: ["instagram", "youtube", "facebook"], aspects: ["9:16", "16:9"],
    actors: 1, beats: [["hook", 5, "Tease 'before' corner"], ["body", 9, "Working on it, narration"], ["proof", 9, "Product detail in place, from the brief"], ["cta", 5, "Reveal and call to action"]],
    roles: ["Tease", "Working commentary", "Product detail", "Reveal", "Call to action"],
    hooks: ["curiosity-gap", "bold-statement"], speech: "story",
    camera: ["handheld walk-and-talk", "propped wide shot, then close-ups"], settings: ["bedroom-floor-cosy", "living-room-sofa", "dining-table", "balcony-evening"], tag: "room-tour smartphone video", realism: ["not staged, a bit of everyday clutter remains"] },

  /* ---------------- fashion / haul ---------------- */
  { id: "try-on-haul", label: "Try-on haul", category: "fashion", description: "Quick try-ons in front of a mirror with honest comments on fit and feel, from the brief only.",
    industries: ["fashion", "jewellery", "d2c", "beauty", "retail", "ecommerce"], goals: ["sales", "awareness"], platforms: ["instagram", "youtube", "facebook"], aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Shopping bags on the bed, 'let me show you'"], ["body", 9, "Try-on one with comments"], ["proof", 9, "Try-on two, detail close-up"], ["cta", 5, "Favourite pick and call to action"]],
    roles: ["Teaser", "First try-on", "Second try-on", "Favourite pick", "Call to action"],
    hooks: ["list-teaser", "curiosity-gap"], speech: "chat",
    camera: ["mirror shot with propped phone", "handheld full-length video with quick jump cuts"], settings: ["dressing-mirror", "bedroom-floor-cosy"], tag: "mirror try-on video", ill: true, realism: ["clothes hang half out of an open wardrobe"] },

  /* ---------------- family (adults only) ---------------- */
  { id: "parents-recommend", label: "Parents' honest take", category: "family", description: "Two adult parents at home talk about the product in a grown-up context; no children on screen.",
    industries: ["home", "food", "d2c", "apps", "education", "finance", "retail"], goals: ["trust", "awareness"], platforms: ["facebook", "instagram", "youtube", "whatsapp"], aspects: V,
    actors: 2, beats: [["hook", 5, "Casual remark after a busy day"], ["body", 9, "Practical reason it fits their routine (brief)"], ["proof", 8, "A specific brief point stated simply"], ["cta", 6, "Passing the tip on; call to action"]],
    roles: ["Remark", "Partner's question", "Answer", "Joke", "Call to action"],
    hooks: ["relatable-confession", "mid-conversation"], speech: "chat",
    camera: ["handheld, slow movement", "propped phone on the dining table"], settings: ["living-room-sofa", "dining-table", "home-kitchen"], tag: "candid family-home video", ill: true, negatives: ["children or minors on screen"] },
  { id: "grandparent-tech-help", label: "Grandparent and grown grandchild", category: "family", description: "An adult grandchild helps an older adult with something; warm, funny, and patient.",
    industries: ["apps", "fintech", "electronics", "services", "healthcare-info", "education"], goals: ["installs", "trust", "awareness"], platforms: ["facebook", "instagram", "youtube", "whatsapp"], aspects: V,
    actors: 2, beats: [["hook", 5, "Older adult confused by a small step"], ["body", 9, "Grandchild shows the steps patiently"], ["proof", 9, "It works; a warm reaction from the older adult"], ["cta", 5, "Wrap and call to action"]],
    roles: ["Confusion", "Patient explanation", "Next step", "Delighted reaction", "Call to action"],
    hooks: ["pattern-interrupt", "relatable-confession"], speech: "chat",
    camera: ["handheld over-shoulder at the phone", "propped phone on a table"], settings: ["living-room-sofa", "courtyard-home", "dining-table"], tag: "candid home smartphone video", ill: true, negatives: ["children or minors on screen"] },

  /* ---------------- B2B ---------------- */
  { id: "whiteboard-explainer", label: "Whiteboard explainer", category: "b2b", description: "A colleague sketches the workflow on a whiteboard and explains how the product fits.",
    industries: ["b2b", "saas", "services", "fintech", "education", "agency"], goals: ["leads", "education", "trust"], platforms: ["linkedin", "youtube", "instagram"], aspects: ["16:9", "9:16"],
    actors: 1, beats: [["hook", 6, "A common team headache"], ["body", 10, "Sketch the old workflow"], ["proof", 9, "Sketch the product's role using brief facts"], ["cta", 6, "Next step and call to action"]],
    roles: ["Headache", "Old workflow", "Where product fits", "Takeaway", "Call to action"],
    hooks: ["question", "bold-statement"], speech: "pitch",
    camera: ["tripod wide shot with slow push to the whiteboard", "handheld close-ups of the marker drawing"], settings: ["coworking-office", "small-office-desk"], tag: "office explainer smartphone video", negatives: ["readable text on the whiteboard beyond a few simple words"] },
  { id: "team-standup-problem", label: "Team stand-up moment", category: "b2b", description: "Two or three colleagues at a desk talk through a real-feeling work problem and a fix.",
    industries: ["b2b", "saas", "services", "agency", "fintech", "education"], goals: ["leads", "awareness", "trust"], platforms: ["linkedin", "instagram", "youtube"], aspects: ["9:16", "16:9"],
    actors: 3, beats: [["hook", 5, "A colleague raises a recurring problem"], ["body", 9, "Others add their view"], ["proof", 9, "One suggests the product, one brief point"], ["cta", 6, "Agree and point to the call to action"]],
    roles: ["Raises the problem", "Adds context", "Suggests the fix", "Asks a question", "Call to action"],
    hooks: ["relatable-confession", "question"], speech: "chat",
    camera: ["handheld wide shot, pans to speakers", "propped phone on a stack of files"], settings: ["coworking-office", "small-office-desk"], tag: "candid office smartphone video" },

  /* ---------------- local business ---------------- */
  { id: "shop-counter-walkthrough", label: "Shop counter walkthrough", category: "local-business", description: "The shopkeeper-type presenter shows around the shop and what is on offer; no prices or addresses.",
    industries: ["retail", "local", "food", "fashion", "jewellery", "services", "home"], goals: ["footfall", "awareness", "trust"], platforms: ["instagram", "facebook", "whatsapp", "youtube"], aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Greets viewers from behind the counter"], ["body", 10, "Walks past shelves, picks up two items"], ["proof", 8, "Shows what the brief highlights"], ["cta", 5, "Invites them to visit; call to action"]],
    roles: ["Greeting", "Showing shelves", "Pick-up of an item", "Invitation", "Call to action"],
    hooks: ["mid-conversation", "bold-statement"], speech: "pitch",
    camera: ["handheld walk-through, first-person to selfie", "propped phone on the counter"], settings: ["shop-counter", "street-market-lane"], tag: "local shop smartphone video", realism: ["a customer passes behind"], negatives: ["readable shop names, phone numbers, prices"] },
  { id: "neighbourhood-owner-invite", label: "Neighbourhood owner invite", category: "local-business", description: "Owner and a helper chat in the shop doorway, inviting locals warmly.",
    industries: ["retail", "local", "food", "services", "fitness", "education"], goals: ["footfall", "trust"], platforms: ["facebook", "whatsapp", "instagram"], aspects: V,
    actors: 2, beats: [["hook", 5, "Doorway greeting"], ["body", 9, "What they do, simple words"], ["proof", 8, "A brief detail only"], ["cta", 6, "Invitation; call to action"]],
    roles: ["Greeting", "What we do", "Helper's addition", "Invitation", "Call to action"],
    hooks: ["mid-conversation", "question"], speech: "pitch",
    camera: ["handheld at the doorway", "propped phone outside the entrance"], settings: ["shop-counter", "street-market-lane"], tag: "local business smartphone video", negatives: ["readable shop names, phone numbers, prices"] },

  /* ---------------- festival / seasonal ---------------- */
  { id: "festive-gifting-chat", label: "Festive gifting chat", category: "festival", description: "Family adults in a festive living room talking about gift ideas; diyas, marigold, sweets.",
    industries: ["d2c", "gifting", "food", "fashion", "jewellery", "retail", "home", "ecommerce"], goals: ["sales", "awareness", "engagement"], platforms: ["instagram", "facebook", "whatsapp", "youtube"], aspects: V,
    actors: 2, beats: [["hook", 5, "Festival prep chaos remark"], ["body", 9, "Talk about gift ideas"], ["proof", 8, "Product suggested with a brief point"], ["cta", 6, "Festive greeting and call to action"]],
    roles: ["Festival remark", "Question about gifts", "Suggests the product", "Joke", "Greeting and call to action"],
    hooks: ["relatable-confession", "question"], speech: "chat",
    camera: ["handheld with warm light", "propped phone near the rangoli"], settings: ["festive-living-room", "courtyard-home"], tag: "festive home smartphone video", realism: ["diya flicker", "marigold petals on the floor"], negatives: ["religious figures depicted as people", "readable greeting-card text"] },
  { id: "festive-prep-vlog", label: "Festive prep vlog", category: "festival", description: "One person getting the house ready for a festival, talking while cleaning and decorating.",
    industries: ["home", "d2c", "food", "retail", "decor", "gifting", "services"], goals: ["awareness", "engagement", "sales"], platforms: SOCIAL, aspects: ["9:16"],
    actors: 1, beats: [["hook", 5, "Festival is near, rushing"], ["body", 9, "Cleaning and decorating chat"], ["proof", 8, "Product used in prep, brief fact"], ["cta", 5, "Festive wish and call to action"]],
    roles: ["Rush remark", "Prep commentary", "Product moment", "Satisfied remark", "Festive wish and call to action"],
    hooks: ["relatable-confession", "mid-conversation"], speech: "story",
    camera: ["handheld walk-and-talk", "propped phone with jump cuts"], settings: ["festive-living-room", "home-kitchen", "courtyard-home"], tag: "festive vlog smartphone video", realism: ["doormat, toran and rangoli partly done"] },
];

/** Existing styles that are offer styles: they need offer details in the brief (see offer.ts). */
const OFFER_PATCH: Record<string, "validity" | "stock" | true> = {
  "flash-sale-announcement": true, "festive-offer-announcement": true, "end-of-season-clearance": true, "countdown-limited-stock": "validity",
  "price-reveal-teaser": true, "referral-loyalty-promo": true, "fb-local-offer-spot": true,
};
const STYLES: UgcStyle[] = [...DEFS, ...ADS_DEFS, ...BIZ_DEFS, ...PLATFORM_DEFS, ...TECH_DEFS, ...UGC_DEFS, ...COMPANY_DEFS, ...OFFER_DEFS]
  .map((d) => { const p = OFFER_PATCH[d.id]; return mk(p ? { ...d, offer: true, ...(p === true ? {} : { needs: p }) } : d); });
const BY_ID = new Map(STYLES.map((s) => [s.id, s]));

export function listStyles(): UgcStyle[] {
  return STYLES.slice();
}

export function getStyle(id: string): UgcStyle | undefined {
  return BY_ID.get(id);
}
