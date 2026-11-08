/**
 * Shared defaults for the style catalogue: speech guides, realism and negative cues, hook formulas.
 */
import type { HookFormula, HookFormulaId, SpeechGuide } from "./types";

export const HOOK_FORMULAS: Record<HookFormulaId, HookFormula> = {
  "curiosity-gap": { id: "curiosity-gap", label: "Curiosity gap", how: "Tease a surprising outcome or a thing that changed, without saying it yet.", example: "I did not expect {product} to change this one small thing." },
  "pattern-interrupt": { id: "pattern-interrupt", label: "Pattern interrupt", how: "Start mid-action or with an unexpected first word so the scroll stops.", example: "Wait, wait, stop. Look at this." },
  question: { id: "question", label: "Direct question", how: "Ask the viewer the exact question they already have in mind.", example: "Ever been stuck with {problem}?" },
  "bold-statement": { id: "bold-statement", label: "Bold statement", how: "A confident opinion that is honest and checkable, never a result claim.", example: "Honestly, this is the part most people skip." },
  "relatable-confession": { id: "relatable-confession", label: "Relatable confession", how: "Admit a small everyday struggle the audience shares.", example: "I kept putting this off for weeks, not proud of it." },
  "mid-conversation": { id: "mid-conversation", label: "Mid-conversation start", how: "Open as if the camera caught a chat already in progress.", example: "...and that is why I finally tried {product}." },
  "problem-agitate": { id: "problem-agitate", label: "Problem, then agitate", how: "Name the everyday problem, make the annoyance felt for one beat, then turn to the fix. Stay honest, no fear tactics.", example: "{problem} again? That small thing keeps eating your day." },
  "myth-bust": { id: "myth-bust", label: "Myth vs fact", how: "State a common belief as a belief, then say what is actually true using only brief facts.", example: "Everyone says {problem} cannot be sorted quickly. Here is what is actually true." },
  announcement: { id: "announcement", label: "Announcement", how: "Open with a clear, plain announcement in the first sentence: what is new, then why it matters.", example: "Here is what is new with {product}." },
  urgency: { id: "urgency", label: "Honest urgency", how: "Lead with a real deadline or limit that the brief states. If the brief has none, use a soft nudge, never invent a deadline.", example: "{offer} is on until {deadline}. Here is the short version." },
  "skit-open": { id: "skit-open", label: "Skit open", how: "Start inside a tiny funny situation with a clear role for each person, no setup.", example: "Me, when someone says they have no time for {problem}:" },
  "list-teaser": { id: "list-teaser", label: "List teaser", how: "Promise a short, countable set of things.", example: "Three things I wish I knew earlier about {problem}." },
};

const SPEECH = {
  chat: {
    en: "Two friends talking: sentences of 4-9 words, interruptions, laughs, fillers (like, honestly, I mean, wait), occasional trailing-off. Never read like a script.",
    hi: "Dosti wali baat-cheet: chhote vakya (4-8 shabd), beech me tokna, 'arre', 'matlab', 'haan yaar', 'dekh na'. Kitabi Hindi nahi.",
    hinglish: "Hinglish friends: 'yaar', 'matlab', 'basically', 'sach me', 'ek minute'. Hindi grammar, English nouns. 4-9 words per sentence, a pause after each idea, fillers allowed, trail off sometimes.",
    regional: "Colloquial home dialect with English nouns for products; short clauses, friendly tags, overlaps between speakers.",
  },
  review: {
    en: "Speaking to the phone camera like a voice note: first person, concrete and sensory ('it feels', 'I noticed'), hedges ('for me', 'in my case'), balanced remarks. 6-12 words per sentence.",
    hi: "Phone par voice-note jaisa: 'mujhe lagaa', 'meri taraf se', seedhi aur imaandaar baat, chhote vakya.",
    hinglish: "Voice-note Hinglish: 'mujhe toh', 'honestly', 'matlab', 'ek cheez jo notice ki'. First person, honest hedges, no hype words, 6-11 words per sentence.",
    regional: "First-person conversational narration in the local dialect; honest hedges; product names stay in English.",
  },
  tutorial: {
    en: "Calm explainer: one instruction per sentence (6-10 words), imperative verbs, tiny confirmations ('see?', 'there you go'), step words (first, then, finally).",
    hi: "Samjhane wala andaaz: ek vakya me ek step, 'pehle', 'phir', 'dekho', 'ho gaya'.",
    hinglish: "Friendly teacher Hinglish: 'pehle', 'phir', 'dekho', 'bas', 'easy hai na'. One step per sentence, 6-10 words, small pause after each step.",
    regional: "Step-by-step spoken instructions in the local dialect, one step per sentence, English words for app/product terms.",
  },
  pitch: {
    en: "Direct to camera, composed but human: 8-12 word sentences, one idea per breath, plain words over jargon, a believable pause before the key point.",
    hi: "Seedha camera se, shaant aur bharosemand: saaf shabd, ek saans me ek baat, jargon kam.",
    hinglish: "Composed Hinglish: 'dekhiye', 'matlab', 'simple si baat hai'. 8-11 words per sentence, plain words, one idea per breath.",
    regional: "Respectful, composed local-language speech with English business terms where natural; one idea per sentence.",
  },
  interview: {
    en: "Quick Q&A rhythm: questions of 6-10 words, answers of 8-14 words, spontaneous reactions ('hmm', 'good question'), honest 'it depends' hedges.",
    hi: "Sawaal-jawab ki raftaar: chhote sawaal, seedhe jawab, 'hmm', 'achha sawaal hai', hichkichahat allowed.",
    hinglish: "Vox-pop Hinglish: 'umm', 'matlab', 'honestly bolu toh', 'depends karta hai'. Questions 6-9 words, answers 8-13 words, thinking pauses.",
    regional: "Street-natural local-language answers with hesitation, English words for modern terms; questions short and friendly.",
  },
  asmr: {
    en: "Barely any speech: a soft whisper of 3-6 words at most, long silences, the sound of materials carries the scene.",
    hi: "Bahut kam bolna: dheemi fusfusahat, 3-6 shabd, lambi khamoshi.",
    hinglish: "Whispered Hinglish, 3-6 words ('dekho... sunno... kitna smooth'), long silences between.",
    regional: "Soft whispered local-language phrases of 3-6 words, long pauses.",
  },
  story: {
    en: "Reflective storytelling: medium sentences (8-13 words), personal beats ('back then', 'what bothered me'), honest, not polished, one pause before the turn.",
    hi: "Apni kahani sunane ka andaaz: 'pehle aisa tha', 'mujhe khatakta tha', imaandaar aur dheemi raftaar.",
    hinglish: "Reflective Hinglish: 'pehle toh', 'matlab', 'tab realise hua'. 8-12 words per sentence, honest and unpolished, pause before the turning point.",
    regional: "Warm personal narration in the local language, English for business or product words; unhurried.",
  },
  ad: {
    en: "Punchy ad read to camera: sentences of 5-9 words, one benefit per line, a beat of silence after the problem line, warm and direct, never shouty or salesy.",
    hi: "Chhote, tez vakya (5-8 shabd): pehle problem, phir hal. Awaaz me bharosa, chillana nahi, 'dekhiye', 'suniye'.",
    hinglish: "Punchy Hinglish ad read: 'suno', 'ek minute', 'simple si baat'. 5-9 words per line, one idea per line, pause after the problem, calm confident close.",
    regional: "Direct, friendly spoken ad in the local language: short lines, one idea each, English for product and offer words, no shouting.",
  },
  announce: {
    en: "Clear announcer-style delivery: complete sentences of 8-12 words, even pace, headline first then detail, neutral warm tone, key words slightly stressed.",
    hi: "Saaf samachar-padhne jaisa andaaz: pehle headline, phir tafseel, barabar raftaar, saaf uchcharan.",
    hinglish: "Clean Hinglish announcement: 'aaj ki khaas khabar', 'ab aa gaya hai', headline first then detail, 8-11 words per sentence, steady pace.",
    regional: "Steady, clear announcement style in the local language, headline first, English for brand and product terms.",
  },
  voiceover: {
    en: "Calm voice-over over footage: 8-13 word sentences, descriptive and sensory, long pauses where the visual speaks, no on-camera lip-sync needed.",
    hi: "Dheemi, shaant voice-over: 8-12 shabd ke vakya, drishya ko bolne ka waqt dena, beech me lambi khamoshi.",
    hinglish: "Soft Hinglish voice-over: 'dekhiye', 'yahan', 'har cheez haath se'. Descriptive, 8-12 words, pauses to let the visual breathe.",
    regional: "Gentle narration in the local language over the footage, descriptive, with pauses; English words for product terms.",
  },
  voicenote: {
    en: "Like a WhatsApp voice note to one person: casual, 5-10 word sentences, 'hey', 'just so you know', slight laughs, trailing end like 'ok? bye'.",
    hi: "WhatsApp voice-note jaisa: 'suno', 'ek baat bolni thi', 'theek hai na', chhote vakya, ghar jaisa lehja.",
    hinglish: "Voice-note Hinglish: 'hey suno', 'btw', 'ek kaam tha', 'ok done?'. Casual, 5-10 words, friendly, ends like a chat.",
    regional: "Informal voice-note speech in the local dialect with English nouns, short, friendly, ending with a casual sign-off.",
  },
  festive: {
    en: "Warm festive greeting energy: smiles in the voice, 6-10 word sentences, one wish then one point, relaxed, never pushy.",
    hi: "Tyohaar wali garmajoshi: muskurahat bhari awaaz, pehle shubhkamna phir ek baat, 6-9 shabd ke vakya.",
    hinglish: "Festive Hinglish: 'Happy Diwali' style wishes then 'toh iss baar', warm and playful, 6-10 words per sentence, a laugh is fine.",
    regional: "Warm festival greeting in the local language, a wish first, then one clear point; English for brand words.",
  },
  skit: {
    en: "Quick comic skit timing: very short lines (3-7 words), deadpan reactions, a clean punchline on the last line before the call to action.",
    hi: "Chhoti comedy skit ka timing: 3-6 shabd ke dialogue, seedha chehra, antim line par punchline.",
    hinglish: "Skit Hinglish: crisp 3-7 word lines, 'bhai', 'seriously?', deadpan reaction beats, punchline then a calm call to action.",
    regional: "Crisp comic lines in the local dialect, deadpan reactions, English for modern words, punchline last.",
  },
  expert: {
    en: "Knowledgeable but plain: 9-13 word sentences, one concept at a time, 'in simple terms', 'it depends on', clear caveats, no jargon and no absolutes.",
    hi: "Jaankar par saral: 9-12 shabd ke vakya, ek baar me ek concept, 'seedhe shabdon me', 'yeh sthiti par nirbhar hai'.",
    hinglish: "Calm expert Hinglish: 'simple terms me', 'depend karta hai', 'ek cheez dhyan rakhiye'. 9-12 words, caveats stated, no absolutes.",
    regional: "Clear, respectful expert explanation in the local language; plain words, caveats stated, English for technical terms.",
  },
  qa: {
    en: "Two-person Q&A: Person 1 asks short plain questions (4-9 words), Person 2 answers in one or two simple sentences with an everyday comparison; 'so basically', 'in simple words', no jargon without a plain explanation.",
    hi: "Do logon ka sawaal-jawab: pehla chhota sawaal poochhta hai, doosra saral shabdon me roz ki misaal ke saath jawab deta hai. 'seedhe shabdon me', 'matlab yeh ki'. Technical shabd English me, samjhaakar.",
    hinglish: "Q&A Hinglish: 'yaar ye X kya hota hai?' 'simple words me, ...' Questions 4-9 words, answers 1-2 short sentences with a real-life comparison; tech terms stay in English and are explained once.",
    regional: "Friendly question-and-answer in the local language: short questions, one or two sentence answers with an everyday example, English for technical terms explained once.",
  },
  devout: {
    en: "Calm, respectful and unhurried: soft voice, short sentences (5-9 words), gentle pauses, simple heartfelt wishes. Never sales language, never humour about any faith.",
    hi: "Shaant, shraddha bhari aur dheemi awaaz: chhote vakya, thehraav, saaf aur saral shabd. Bechne wali bhasha nahi, kisi aastha ka mazaak nahi.",
    hinglish: "Gentle respectful Hinglish: soft voice, 5-9 word sentences, a pause after each line, simple wishes. No sales tone and nothing that jokes about faith.",
    regional: "Soft, respectful speech in the local language with traditional greetings; unhurried, no sales language, no humour about any faith.",
  },
  motivate: {
    en: "Energetic but sincere: short punchy sentences (4-8 words), rhythmic repetition, a pause before the key line, a direct 'you' address. No promises of results.",
    hi: "Josh bhara par imaandaar: chhote, taal wale vakya, ek line ko dohrana, saamne wale se seedha 'aap'. Natije ka vaada nahi.",
    hinglish: "Motivational Hinglish: 'chalo', 'ek kadam', short rhythmic lines, a pause before the key line, direct 'tum/aap'. No result promises.",
    regional: "Rhythmic, sincere motivation in the local language, short lines, a direct address, no result promises.",
  },
} satisfies Record<string, SpeechGuide>;

export type SpeechKey = keyof typeof SPEECH;
export const speechGuide = (k: SpeechKey): SpeechGuide => SPEECH[k];

export const BASE_REALISM: string[] = [
  "real lived-in room, ordinary clutter, nothing styled for the shot",
  "natural available light with uneven exposure, no studio lighting",
  "imperfect framing: head slightly off-centre, brief reframes",
  "small human movements: scratching an ear, adjusting hair, glancing at the phone",
  "visible skin texture, flyaway hairs, slightly creased clothes",
  "smartphone sensor look: mild noise in shadows, soft highlights, no cinematic colour grade",
];

export const BASE_NEGATIVES: string[] = [
  "plastic or airbrushed skin", "perfectly symmetrical faces", "floating or melting objects", "garbled or invented text and logos",
  "extra, missing or fused fingers", "stock-footage gloss", "robotic lip-sync", "cinematic colour grading", "random brand logos",
];
