import "server-only";
import { getOpenAI, isUnsupportedParamError } from "@/lib/openai";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { getPrompt } from "@/lib/prompts/store";

/**
 * The rules every AI feature in the product follows, in one place so none of them can drift:
 *   1. LANGUAGE — exactly three: Hindi (Devanagari), English, and Hinglish (Hindi in Roman letters). The reply mirrors the person.
 *   2. SCOPE — the AI answers only about this product and this company's own work. Everything else is declined politely.
 *   3. ONE COMPANY — nothing about any other company, customer or tenant is ever discussed.
 *   4. PERMISSIONS — answers come only from what the person's role may see.
 * The prompt blocks tell the model; `checkScope` is a second, independent gate that runs before the model sees a request.
 */

export type Lang = "hindi" | "english" | "hinglish";


// Roman-script Hindi words that are not ordinary English words (so a plain English sentence is never mistaken for Hinglish).
const HINGLISH = new Set(
  ("hai hain hoon hu tha thi the hoga hogi kya kyu kyun kaise kaisa kaun kahan kab kitna kitne kitni kisne kisko kisi mujhe mera meri mere hum humara hamara hamare aap aapka aapki apna apni apne tum tumhara " +
    "ko ka ki ke se mein ne nhi nahi nahin haan bhi aur ya lekin magar toh isse isko iska iski uska uski unka unki yeh ye woh wo yahan wahan " +
    "kar karo karna karke kare karein kro krna krdo kardo kijiye kijie dikhao dikha dikhaye batao bata batana bataye bhejo bhej dekho dekh dekhna banao bana banaye hatao hata " +
    "chahiye chahie chaiye chahta chahti wala wali wale abhi pehle pahle baad kal aaj parso sab sabhi kuch koi jo jis jab tab agar toh " +
    "rha rhi rhe raha rahi rahe gaya gayi gaye diya diye liya liye mila mili milega " +
    "paisa paise rupaye rupya kharcha kamai karmchari karamchari naya nayi naye purana purani mahine mahina hafte saal din ghanta " +
    "samjhao samjha madad sahayata jankari jaankari puchna pucho poochho likho likh bolo bol sunao ek do teen char paanch " +
    "accha acha theek thik sahi galat zaroor zarur bahut bahot thoda zyada jyada kam").split(/\s+/),
);

const DEVANAGARI = /[ऀ-ॿ]/g;
const LETTER = /\p{L}/gu;

/** The language of one message, or null when it is too short to tell (a lone "ok", a number …). */
export function languageOf(text: string): Lang | null {
  const t = text.trim();
  if (!t) return null;
  const letters = (t.match(LETTER) ?? []).length;
  if (letters < 2) return null;
  const dev = (t.match(DEVANAGARI) ?? []).length;
  if (dev / letters >= 0.3) return "hindi";
  const words = t.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return null;
  const hits = words.filter((w) => HINGLISH.has(w)).length;
  if (hits >= 2 || (hits >= 1 && hits / words.length >= 0.25)) return "hinglish";
  if (words.length < 2 && hits === 0) return null;
  return "english";
}

/** The language to answer in: the latest message that is long enough to tell, looking back through the person's earlier ones. */
export function detectLanguage(userTexts: readonly string[]): Lang {
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const l = languageOf(userTexts[i] ?? "");
    if (l) return l;
  }
  return "english";
}

/** Prompt block: language. `lang` is what the person's latest message was detected as. The wording is the "Language rules" prompts (Platform Console → AI prompts). */
export async function languageBlock(lang: Lang | null): Promise<string> {
  const reply = lang ? await getPrompt("policy.language.detected", { language: await getPrompt(`policy.language.labels.${lang}`) }) : await getPrompt("policy.language.unknown");
  return getPrompt("policy.language", { reply_rule: reply });
}

export type ScopeKind = "workspace" | "website" | "portal" | "support" | "platform";

/** What the assistant is for in `kind`: the "Scope:" prompts. */
export const scopeWhat = (kind: ScopeKind): Promise<string> => getPrompt(`policy.scope.what.${kind}`);

/** Prompt block: scope, one company, permissions, untrusted content: the "Scope rules" prompt. */
export async function scopeBlock(kind: ScopeKind): Promise<string> {
  return getPrompt("policy.scope", { what: await scopeWhat(kind) });
}

const REFUSALS: Record<Lang, Record<ScopeKind, string>> = {
  english: {
    workspace: "I can only help with your company's work in this workspace — your records, reports, settings and how to use the products. Please ask me something about that.",
    website: "I can only answer questions about this company, its products and services. Please ask me something about that.",
    portal: "I can only help with your own request, progress, documents and messages with this company. Please ask me about that.",
    support: "I can only help with using this product and your support requests. Please ask me about that.",
    platform: "I can only help with running the platform — companies, plans, billing, support and settings. Please ask me about that.",
  },
  hinglish: {
    workspace: "Main sirf aapki company ke kaam mein madad kar sakta hoon — aapke records, reports, settings aur products kaise use karne hain. Kripya usi se related kuch poochhiye.",
    website: "Main sirf is company, uske products aur services ke baare mein jawab de sakta hoon. Kripya usi se related kuch poochhiye.",
    portal: "Main sirf aapki apni request, progress, documents aur is company ke saath messages mein madad kar sakta hoon. Kripya usi ke baare mein poochhiye.",
    support: "Main sirf is product ko use karne aur aapki support requests mein madad kar sakta hoon. Kripya usi ke baare mein poochhiye.",
    platform: "Main sirf platform chalane mein madad kar sakta hoon — companies, plans, billing, support aur settings. Kripya usi ke baare mein poochhiye.",
  },
  hindi: {
    workspace: "मैं केवल आपकी कंपनी के काम में मदद कर सकता हूँ — आपके रिकॉर्ड, रिपोर्ट, सेटिंग्स और पैनल कैसे इस्तेमाल करें। कृपया इसी से जुड़ा कुछ पूछिए।",
    website: "मैं केवल इस कंपनी, उसके प्रोडक्ट और सेवाओं के बारे में जवाब दे सकता हूँ। कृपया इसी से जुड़ा कुछ पूछिए।",
    portal: "मैं केवल आपकी अपनी रिक्वेस्ट, प्रगति, दस्तावेज़ और इस कंपनी के साथ संदेशों में मदद कर सकता हूँ। कृपया इसी के बारे में पूछिए।",
    support: "मैं केवल इस प्रोडक्ट को इस्तेमाल करने और आपकी सपोर्ट रिक्वेस्ट में मदद कर सकता हूँ। कृपया इसी के बारे में पूछिए।",
    platform: "मैं केवल प्लेटफ़ॉर्म चलाने में मदद कर सकता हूँ — कंपनियाँ, प्लान, बिलिंग, सपोर्ट और सेटिंग्स। कृपया इसी के बारे में पूछिए।",
  },
};
export const refusalText = (lang: Lang, kind: ScopeKind) => REFUSALS[lang][kind];

/** Short, fixed messages the product itself shows (sign-in, limits, errors), in the person's language. */
const MESSAGES = {
  signIn: { english: "Please sign in again.", hinglish: "Kripya dobara sign in kijiye.", hindi: "कृपया दोबारा साइन इन कीजिए।" },
  noAccess: { english: "You don't have access to this product.", hinglish: "Aapko is product ka access nahi hai.", hindi: "आपके पास इस पैनल का एक्सेस नहीं है।" },
  tooMany: { english: "Too many requests. Please wait a moment and try again.", hinglish: "Bahut zyada requests ho gayi. Thodi der ruk kar dobara koshish kijiye.", hindi: "बहुत ज़्यादा रिक्वेस्ट हो गईं। थोड़ी देर रुककर दोबारा कोशिश कीजिए।" },
  failed: { english: "The assistant could not answer. Please try again.", hinglish: "Assistant jawab nahi de paya. Kripya dobara koshish kijiye.", hindi: "असिस्टेंट जवाब नहीं दे पाया। कृपया दोबारा कोशिश कीजिए।" },
  noCredit: { english: "The AI service is temporarily unavailable. Please contact support.", hinglish: "AI service abhi available nahi hai. Kripya support se baat kijiye.", hindi: "AI सेवा अभी उपलब्ध नहीं है। कृपया सपोर्ट से संपर्क कीजिए।" },
  analystNoAnswer: { english: "I couldn't put together an answer to that. Please try rephrasing the question.", hinglish: "Main iska jawab nahi bana paya. Kripya sawaal ko doosre tareeke se poochhiye.", hindi: "मैं इसका जवाब नहीं बना पाया। कृपया सवाल को दूसरे तरीके से पूछिए।" },
  analystIncomplete: { english: "I couldn't complete that analysis. Please try a simpler question.", hinglish: "Main yeh analysis poora nahi kar paya. Kripya thoda aasaan sawaal poochhiye.", hindi: "मैं यह विश्लेषण पूरा नहीं कर पाया। कृपया थोड़ा आसान सवाल पूछिए।" },
  analystSlow: { english: "This question is taking too long to answer. Try a narrower question, for example a shorter date range.", hinglish: "Is sawaal ka jawab dene mein bahut time lag raha hai. Chhota sawaal poochhiye, jaise kam dino ki date range.", hindi: "इस सवाल का जवाब देने में बहुत समय लग रहा है। छोटा सवाल पूछिए, जैसे कम दिनों की तारीख़ सीमा।" },
  analystDown: { english: "The analyst is unavailable right now. Please try again in a moment.", hinglish: "Analyst abhi available nahi hai. Thodi der baad dobara koshish kijiye.", hindi: "एनालिस्ट अभी उपलब्ध नहीं है। थोड़ी देर बाद दोबारा कोशिश कीजिए।" },
  analystNotSetUp: { english: "The AI assistant isn't set up for this workspace yet. Ask your admin to add the OpenAI key in Settings → Integrations.", hinglish: "AI assistant is workspace ke liye abhi set up nahi hai. Apne admin se Settings → Integrations mein OpenAI key jodne ko kahiye.", hindi: "इस वर्कस्पेस के लिए AI असिस्टेंट अभी सेट अप नहीं है। अपने एडमिन से Settings → Integrations में OpenAI कुंजी जोड़ने को कहिए।" },
  helpNoInfo: { english: "I couldn't find this in the workspace help content, so I won't guess. You can create a support request for help.", hinglish: "Yeh workspace ke help content mein nahi mila, isliye main andaza nahi lagaunga. Aap madad ke liye support request bana sakte hain.", hindi: "यह वर्कस्पेस की सहायता सामग्री में नहीं मिला, इसलिए मैं अंदाज़ा नहीं लगाऊँगा। मदद के लिए आप सपोर्ट अनुरोध बना सकते हैं।" },
  helpAiLimit: { english: "Your workspace has used its AI allowance for this month, so the help assistant is paused until it resets (or you upgrade your plan). You can still create a support request — our team will reply.", hinglish: "Aapke workspace ka is mahine ka AI allowance khatam ho gaya hai, isliye help assistant reset hone tak (ya plan upgrade tak) band hai. Aap abhi bhi support request bana sakte hain — hamari team reply karegi.", hindi: "आपके वर्कस्पेस का इस महीने का AI अलाउंस खत्म हो गया है, इसलिए हेल्प असिस्टेंट रीसेट होने तक (या प्लान अपग्रेड तक) बंद है। आप अभी भी सपोर्ट रिक्वेस्ट बना सकते हैं — हमारी टीम जवाब देगी।" },
  helpBusy: { english: "The help assistant is busy right now. Please try again shortly, or create a support request.", hinglish: "Help assistant abhi busy hai. Thodi der baad koshish kijiye, ya support request bana dijiye.", hindi: "हेल्प असिस्टेंट अभी व्यस्त है। थोड़ी देर बाद कोशिश कीजिए, या सपोर्ट रिक्वेस्ट बना दीजिए।" },
  helpDown: { english: "The help assistant is unavailable right now. You can still browse the Help Center or create a support request.", hinglish: "Help assistant abhi available nahi hai. Aap Help Center dekh sakte hain ya support request bana sakte hain.", hindi: "हेल्प असिस्टेंट अभी उपलब्ध नहीं है। आप हेल्प सेंटर देख सकते हैं या सपोर्ट रिक्वेस्ट बना सकते हैं।" },
  helpFound: { english: "Here is what I found in the help content: {titles}. Open one for the full steps, or create a support request if it doesn't solve this.", hinglish: "Help content mein mujhe yeh mila: {titles}. Poore steps ke liye inme se koi kholiye, ya agar isse hal na ho to support request bana dijiye.", hindi: "हेल्प कंटेंट में मुझे यह मिला: {titles}। पूरे चरणों के लिए इनमें से कोई खोलिए, या अगर इससे हल न हो तो सपोर्ट रिक्वेस्ट बना दीजिए।" },
  done: { english: "Done.", hinglish: "Ho gaya.", hindi: "हो गया।" },
  readyOne: { english: "I'm ready to make this change. Please review and approve.", hinglish: "Main yeh change karne ke liye taiyaar hoon. Kripya dekhkar approve kijiye.", hindi: "मैं यह बदलाव करने के लिए तैयार हूँ। कृपया देखकर मंज़ूर कीजिए।" },
  readyMany: { english: "I'm ready to make these changes. Please review and approve.", hinglish: "Main yeh changes karne ke liye taiyaar hoon. Kripya dekhkar approve kijiye.", hindi: "मैं ये बदलाव करने के लिए तैयार हूँ। कृपया देखकर मंज़ूर कीजिए।" },
  ranOut: { english: "I made progress but ran out of steps. Tell me to continue and I'll pick up from here.", hinglish: "Kaafi kaam ho gaya par steps khatam ho gaye. 'Continue' bol dijiye, main wahin se aage badhta hoon.", hindi: "काफ़ी काम हो गया पर चरण खत्म हो गए। 'जारी रखो' कह दीजिए, मैं वहीं से आगे बढ़ूँगा।" },
  needsConfirm: { english: "This includes a deletion or something hard to undo, so it needs your explicit confirmation. Tick the confirmation box on the card and approve again.", hinglish: "Isme delete ya aisi cheez hai jo wapas nahi ho sakti, isliye aapki confirmation chahiye. Card par confirmation box tick karke dobara approve kijiye.", hindi: "इसमें डिलीट या ऐसा बदलाव है जो वापस नहीं हो सकता, इसलिए आपकी पुष्टि ज़रूरी है। कार्ड पर पुष्टि वाला बॉक्स टिक करके दोबारा मंज़ूर कीजिए।" },
  expired: { english: "That request has expired or was already handled. Ask me again and I'll prepare it afresh.", hinglish: "Woh request expire ho gayi ya pehle hi ho chuki hai. Mujhse dobara kahiye, main naye sire se taiyaar kar dunga.", hindi: "वह रिक्वेस्ट समाप्त हो गई या पहले ही हो चुकी है। मुझसे दोबारा कहिए, मैं नए सिरे से तैयार कर दूँगा।" },
  wrongPanel: { english: "That request belongs to a different product.", hinglish: "Yeh request kisi aur product ki hai.", hindi: "यह रिक्वेस्ट किसी और पैनल की है।" },
  sendFirst: { english: "Send a message first.", hinglish: "Pehle ek message bhejiye.", hindi: "पहले एक संदेश भेजिए।" },
} as const;
export const say = (key: keyof typeof MESSAGES, lang: Lang) => MESSAGES[key][lang];

// ── The independent gate ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Opening words and one-word replies that are always fine — no model call needed. */
const ALWAYS_OK = /^(hi|hii+|hello|hey|namaste|namaskar|thanks?|thank you|shukriya|dhanyavad|ok(ay)?|yes|no|haan|nahi|nhi|han|ji|theek hai|thik hai|accha|acha|stop|cancel|help|menu|\p{P}|\p{N})+$/iu;


const MODEL = "gpt-4.1-mini";

/**
 * Second gate in front of the model. Cheap, independent of the main prompt, and fails open (an outage must not lock people out; the
 * prompt rules still apply). Returns true when the message may proceed.
 */
export async function checkScope(input: { text: string; previousAssistant?: string; kind: ScopeKind; hasAttachment?: boolean }): Promise<boolean> {
  const text = input.text.trim();
  if (!text) return true;
  if (input.hasAttachment && text.length < 60) return true;
  if (text.length <= 24 && ALWAYS_OK.test(text.replace(/\s+/g, " "))) return true;
  try {
    setAiFeature("Scope check");
    const openai = await getOpenAI();
    const user = await getPrompt("policy.gate.input", { what: await scopeWhat(input.kind), previous_line: input.previousAssistant ? await getPrompt("policy.gate.previous", { previous: input.previousAssistant.slice(0, 400) }) : "", message: text.slice(0, 1200) });
    const params = { model: MODEL, input: [{ role: "system" as const, content: await getPrompt("policy.gate") }, { role: "user" as const, content: user }], max_output_tokens: 30, store: false };
    let res;
    try {
      res = await openai.responses.create({ ...params, temperature: 0 }, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
      if (!isUnsupportedParamError(err, "temperature")) throw err;
      res = await openai.responses.create(params, { signal: AbortSignal.timeout(8000) });
    }
    const out = res.output_text ?? "";
    return !/"in_scope"\s*:\s*false/i.test(out);
  } catch (err) {
    console.error("[ai] scope check unavailable, allowing", err instanceof Error ? err.message : err);
    return true;
  }
}

/**
 * Help articles, guides and screens are written in English. A Hindi or Hinglish question is turned into short English search
 * keywords first so the same material is found whichever of the three languages the person asked in. English passes through untouched.
 */
export async function englishSearchQuery(text: string, lang: Lang): Promise<string> {
  const t = text.trim().slice(0, 600);
  if (!t || lang === "english") return t;
  try {
    setAiFeature("Search translation");
    const openai = await getOpenAI();
    const params = { model: MODEL, input: [{ role: "system" as const, content: await getPrompt("policy.keywords") }, { role: "user" as const, content: t }], max_output_tokens: 60, store: false };
    let res;
    try {
      res = await openai.responses.create({ ...params, temperature: 0 }, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
      if (!isUnsupportedParamError(err, "temperature")) throw err;
      res = await openai.responses.create(params, { signal: AbortSignal.timeout(8000) });
    }
    const out = (res.output_text ?? "").trim();
    return out ? `${out} ${t}`.slice(0, 700) : t;
  } catch {
    return t;
  }
}
