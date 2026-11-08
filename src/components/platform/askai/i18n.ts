export type UiLang = "english" | "hinglish" | "hindi";

export const UI_LANGS: { key: UiLang; label: string }[] = [
  { key: "english", label: "EN" },
  { key: "hinglish", label: "Hinglish" },
  { key: "hindi", label: "हिं" },
];

type Strings = {
  intro: string; tip: string; placeholder: string; working: string; couldntFinish: string; drop: string; newChat: string; close: string; attach: string; capture: string; send: string; message: string;
  needsApproval: string; confirmCheck: string; autoApprove: string; approve: string; confirmDo: string; notNow: string; approved: string; notApproved: string; remove: string; languageLabel: string;
};

export const STRINGS: Record<UiLang, Strings> = {
  english: {
    intro: "I can look up your real data, read screenshots and files you attach, and create or change records once you approve. Try:",
    tip: "Tip: paste a screenshot (Ctrl+V), drop a file here, or use the paperclip. I never change anything without showing you first.",
    placeholder: "Ask, attach a screenshot, or tell me what to do…", working: "Working…", couldntFinish: "Couldn't finish", drop: "Drop to attach", newChat: "New conversation", close: "Close",
    attach: "Attach image or file", capture: "Capture a screenshot", send: "Send", message: "Message", needsApproval: "Needs your approval",
    confirmCheck: "I understand this deletes or changes something that can't easily be undone.", autoApprove: "Don't ask again in this chat for ordinary changes (deletions always ask).",
    approve: "Approve", confirmDo: "Confirm & do it", notNow: "Not now", approved: "✓ You approved this.", notApproved: "You didn't approve this.", remove: "Remove", languageLabel: "Language",
  },
  hinglish: {
    intro: "Main aapka asli data dekh sakta hoon, aapke screenshot aur files padh sakta hoon, aur aapke approve karne ke baad records bana ya badal sakta hoon. Try kijiye:",
    tip: "Tip: screenshot paste kijiye (Ctrl+V), file yahan drop kijiye, ya paperclip use kijiye. Main aapko dikhaye bina kuch nahi badalta.",
    placeholder: "Poochhiye, screenshot lagaiye, ya batayiye kya karna hai…", working: "Kaam ho raha hai…", couldntFinish: "Poora nahi ho paya", drop: "Attach karne ke liye yahan chhodiye", newChat: "Nayi baatcheet", close: "Band karein",
    attach: "Image ya file jodiye", capture: "Screenshot lijiye", send: "Bhejiye", message: "Message", needsApproval: "Aapki approval chahiye",
    confirmCheck: "Main samajhta hoon ki isse kuch delete ya aisa change hoga jo aasani se wapas nahi ho sakta.", autoApprove: "Is chat mein normal changes ke liye dobara mat poochho (delete hamesha poochhega).",
    approve: "Approve karein", confirmDo: "Confirm karke karein", notNow: "Abhi nahi", approved: "✓ Aapne approve kiya.", notApproved: "Aapne approve nahi kiya.", remove: "Hatayein", languageLabel: "Bhasha",
  },
  hindi: {
    intro: "मैं आपका असली डेटा देख सकता हूँ, आपके स्क्रीनशॉट और फ़ाइलें पढ़ सकता हूँ, और आपकी मंज़ूरी के बाद रिकॉर्ड बना या बदल सकता हूँ। आज़माइए:",
    tip: "सुझाव: स्क्रीनशॉट पेस्ट कीजिए (Ctrl+V), फ़ाइल यहाँ छोड़िए, या पेपरक्लिप इस्तेमाल कीजिए। मैं आपको दिखाए बिना कुछ नहीं बदलता।",
    placeholder: "पूछिए, स्क्रीनशॉट लगाइए, या बताइए क्या करना है…", working: "काम हो रहा है…", couldntFinish: "पूरा नहीं हो पाया", drop: "जोड़ने के लिए यहाँ छोड़िए", newChat: "नई बातचीत", close: "बंद करें",
    attach: "इमेज या फ़ाइल जोड़िए", capture: "स्क्रीनशॉट लीजिए", send: "भेजिए", message: "संदेश", needsApproval: "आपकी मंज़ूरी चाहिए",
    confirmCheck: "मैं समझता हूँ कि इससे कुछ डिलीट या ऐसा बदलाव होगा जो आसानी से वापस नहीं हो सकता।", autoApprove: "इस चैट में सामान्य बदलावों के लिए दोबारा मत पूछो (डिलीट हमेशा पूछेगा)।",
    approve: "मंज़ूर करें", confirmDo: "पुष्टि करके करें", notNow: "अभी नहीं", approved: "✓ आपने मंज़ूर किया।", notApproved: "आपने मंज़ूर नहीं किया।", remove: "हटाएँ", languageLabel: "भाषा",
  },
};

type Q = Record<UiLang, string[]>;
const q = (english: string[], hinglish: string[], hindi: string[]): Q => ({ english, hinglish, hindi });

export const QUICK: Record<string, Q> = {
  pms: q(["Which tasks are overdue?", "Create a task in a project", "Show projects by status", "Add a new client"], ["Kaun se tasks overdue hain?", "Project mein ek task banao", "Projects ko status ke hisaab se dikhao", "Naya client add karo"], ["कौन से टास्क ओवरड्यू हैं?", "किसी प्रोजेक्ट में एक टास्क बनाओ", "प्रोजेक्ट स्टेटस के अनुसार दिखाओ", "नया क्लाइंट जोड़ो"]),
  hrms: q(["Who is on leave this week?", "Show pending leave requests", "Add a company holiday", "How many employees per department?"], ["Is hafte kaun leave par hai?", "Pending leave requests dikhao", "Company holiday add karo", "Har department mein kitne employees hain?"], ["इस हफ़्ते कौन छुट्टी पर है?", "पेंडिंग लीव रिक्वेस्ट दिखाओ", "कंपनी की छुट्टी जोड़ो", "हर विभाग में कितने कर्मचारी हैं?"]),
  fms: q(["Show unpaid invoices", "Create an invoice for a client", "What is overdue this month?", "Record a payment received"], ["Unpaid invoices dikhao", "Client ke liye invoice banao", "Is mahine kya overdue hai?", "Mila hua payment record karo"], ["अनपेड इनवॉइस दिखाओ", "क्लाइंट के लिए इनवॉइस बनाओ", "इस महीने क्या ओवरड्यू है?", "मिला हुआ पेमेंट दर्ज करो"]),
  lms: q(["Show new leads", "Add a lead", "How many leads per status?", "Mark a lead as completed"], ["Nayi leads dikhao", "Ek lead add karo", "Status ke hisaab se kitni leads hain?", "Lead ko completed mark karo"], ["नई लीड दिखाओ", "एक लीड जोड़ो", "स्टेटस के अनुसार कितनी लीड हैं?", "लीड को पूरी हुई चिह्नित करो"]),
  cms: q(["Rewrite my home page headline", "Add an FAQ section", "Change my phone number in the footer", "Make the colours calmer"], ["Home page ki headline dobara likho", "FAQ section add karo", "Footer mein mera phone number badlo", "Colours thode shaant kar do"], ["होम पेज की हेडलाइन दोबारा लिखो", "FAQ सेक्शन जोड़ो", "फ़ुटर में मेरा फ़ोन नंबर बदलो", "रंग थोड़े शांत कर दो"]),
  hub: q(["What needs my attention across products?", "Show overdue tasks and unpaid invoices", "Add a lead", "Create a project task"], ["Sab products mein mujhe kis par dhyan dena hai?", "Overdue tasks aur unpaid invoices dikhao", "Ek lead add karo", "Project task banao"], ["सभी पैनलों में मुझे किस पर ध्यान देना है?", "ओवरड्यू टास्क और अनपेड इनवॉइस दिखाओ", "एक लीड जोड़ो", "प्रोजेक्ट टास्क बनाओ"]),
  tms: q(["Show active batches", "Which students have low attendance?", "Add a student to a batch", "How do I issue a certificate?"], ["Active batches dikhao", "Kin students ki attendance kam hai?", "Student ko batch mein add karo", "Certificate kaise issue karte hain?"], ["चालू बैच दिखाओ", "किन छात्रों की उपस्थिति कम है?", "छात्र को बैच में जोड़ो", "सर्टिफ़िकेट कैसे जारी करते हैं?"]),
  prms: q(["Show pending requisitions", "Create a vendor", "Which purchase orders are open?", "Show assets by status"], ["Pending requisitions dikhao", "Vendor banao", "Kaun se purchase orders open hain?", "Assets ko status ke hisaab se dikhao"], ["पेंडिंग रिक्विज़िशन दिखाओ", "वेंडर बनाओ", "कौन से परचेज़ ऑर्डर खुले हैं?", "एसेट स्टेटस के अनुसार दिखाओ"]),
  smms: q(["Show scheduled posts", "Draft a post for next week", "How are my accounts performing?", "How do I connect a social account?"], ["Scheduled posts dikhao", "Agle hafte ke liye post draft karo", "Mere accounts ka performance kaisa hai?", "Social account kaise connect karte hain?"], ["शेड्यूल की हुई पोस्ट दिखाओ", "अगले हफ़्ते के लिए पोस्ट का ड्राफ़्ट बनाओ", "मेरे अकाउंट का प्रदर्शन कैसा है?", "सोशल अकाउंट कैसे जोड़ते हैं?"]),
  sop: q(["List my SOPs", "Create a SOP for onboarding", "Which SOPs need review?", "Summarise this SOP"], ["Mere SOPs ki list dikhao", "Onboarding ke liye SOP banao", "Kin SOPs ka review baaki hai?", "Is SOP ka saar batao"], ["मेरे SOP की सूची दिखाओ", "ऑनबोर्डिंग के लिए SOP बनाओ", "किन SOP की समीक्षा बाकी है?", "इस SOP का सार बताओ"]),
  dlms: q(["What is stored in the vault?", "Show documents shared with me", "Which documents expire soon?", "How do I upload a document?"], ["Vault mein kya rakha hai?", "Mere saath share kiye documents dikhao", "Kaun se documents jaldi expire honge?", "Document kaise upload karte hain?"], ["वॉल्ट में क्या रखा है?", "मेरे साथ साझा किए दस्तावेज़ दिखाओ", "कौन से दस्तावेज़ जल्दी समाप्त होंगे?", "दस्तावेज़ कैसे अपलोड करते हैं?"]),
  seo: q(["Show my SEO projects", "Run an audit for a site", "Which keywords dropped?", "How do I add a keyword?"], ["Mere SEO projects dikhao", "Site ka audit chalao", "Kaun se keywords gire hain?", "Keyword kaise add karte hain?"], ["मेरे SEO प्रोजेक्ट दिखाओ", "साइट का ऑडिट चलाओ", "कौन से कीवर्ड गिरे हैं?", "कीवर्ड कैसे जोड़ते हैं?"]),
  ots: q(["Show upcoming tests", "Create a test", "Who has attempted the latest test?", "How do I evaluate an attempt?"], ["Aane wale tests dikhao", "Test banao", "Latest test kisne diya hai?", "Attempt ko evaluate kaise karte hain?"], ["आने वाले टेस्ट दिखाओ", "टेस्ट बनाओ", "ताज़ा टेस्ट किसने दिया है?", "प्रयास का मूल्यांकन कैसे करते हैं?"]),
  lpms: q(["List my documents", "Summarise a document", "Which documents are shared with me?", "How do I upload a document?"], ["Mere documents ki list dikhao", "Ek document ka saar batao", "Mere saath kaun se documents share hain?", "Document kaise upload karte hain?"], ["मेरे दस्तावेज़ों की सूची दिखाओ", "एक दस्तावेज़ का सार बताओ", "मेरे साथ कौन से दस्तावेज़ साझा हैं?", "दस्तावेज़ कैसे अपलोड करते हैं?"]),
  aibots: q(["List my bots", "How do I create a bot?", "Show recent chats", "Which bot is used most?"], ["Mere bots dikhao", "Bot kaise banate hain?", "Haal ki chats dikhao", "Sabse zyada kaun sa bot use hota hai?"], ["मेरे बॉट दिखाओ", "बॉट कैसे बनाते हैं?", "हाल की चैट दिखाओ", "सबसे ज़्यादा कौन सा बॉट इस्तेमाल होता है?"]),
  messenger: q(["Show unread messages", "Send a message to a teammate", "Who is in this channel?", "Show upcoming meetings"], ["Unread messages dikhao", "Teammate ko message bhejo", "Is channel mein kaun hai?", "Aane wali meetings dikhao"], ["अनपढ़े संदेश दिखाओ", "टीम के साथी को संदेश भेजो", "इस चैनल में कौन है?", "आने वाली मीटिंग दिखाओ"]),
  intelligence: q(["Give me a business summary", "How are sales this month?", "Which projects are at risk?", "What changed since last week?"], ["Business ka summary do", "Is mahine sales kaisi hai?", "Kaun se projects risk mein hain?", "Pichhle hafte se kya badla?"], ["व्यापार का सारांश दो", "इस महीने बिक्री कैसी है?", "कौन से प्रोजेक्ट जोखिम में हैं?", "पिछले हफ़्ते से क्या बदला?"]),
  workspace: q(["What needs my attention across products?", "Show overdue tasks and unpaid invoices", "Add a lead", "Create a project task"], ["Sab products mein mujhe kis par dhyan dena hai?", "Overdue tasks aur unpaid invoices dikhao", "Ek lead add karo", "Project task banao"], ["सभी पैनलों में मुझे किस पर ध्यान देना है?", "ओवरड्यू टास्क और अनपेड इनवॉइस दिखाओ", "एक लीड जोड़ो", "प्रोजेक्ट टास्क बनाओ"]),
  support: q(["How do I invite a teammate?", "Show my support requests", "Raise a support request", "Search the help articles"], ["Teammate ko invite kaise karte hain?", "Meri support requests dikhao", "Support request banao", "Help articles search karo"], ["साथी को आमंत्रित कैसे करते हैं?", "मेरी सपोर्ट रिक्वेस्ट दिखाओ", "सपोर्ट रिक्वेस्ट बनाओ", "हेल्प आर्टिकल खोजो"]),
  portal: q(["Where does my application stand?", "Show my notifications", "Message the team", "Show my documents"], ["Meri application kahan tak pahunchi?", "Meri notifications dikhao", "Team ko message bhejo", "Mere documents dikhao"], ["मेरा आवेदन कहाँ तक पहुँचा?", "मेरी सूचनाएँ दिखाओ", "टीम को संदेश भेजो", "मेरे दस्तावेज़ दिखाओ"]),
  platform: q(["How many companies are active?", "Which trials end this week?", "Show unpaid invoices", "Who is over their plan limits?"], ["Kitni companies active hain?", "Is hafte kaun se trials khatam ho rahe hain?", "Unpaid invoices dikhao", "Kaun plan limit se upar hai?"], ["कितनी कंपनियाँ सक्रिय हैं?", "इस हफ़्ते कौन से ट्रायल खत्म हो रहे हैं?", "अनपेड इनवॉइस दिखाओ", "कौन प्लान सीमा से ऊपर है?"]),
};

export const FALLBACK: Q = q(
  ["What can you do here?", "Summarise what needs attention", "Read this screenshot and explain it", "Find a record"],
  ["Yahan aap kya kar sakte ho?", "Dhyan dene wali cheezein batao", "Is screenshot ko padho aur samjhao", "Ek record dhundo"],
  ["आप यहाँ क्या कर सकते हैं?", "ध्यान देने वाली बातें बताइए", "इस स्क्रीनशॉट को पढ़कर समझाइए", "एक रिकॉर्ड खोजिए"],
);

/** The language the screen starts in: what the person last chose, else their browser's. */
export function initialUiLang(): UiLang {
  if (typeof window === "undefined") return "english";
  try {
    const s = localStorage.getItem("askai:lang");
    if (s === "english" || s === "hinglish" || s === "hindi") return s;
  } catch { /* storage unavailable */ }
  return typeof navigator !== "undefined" && /^hi\b/i.test(navigator.language) ? "hindi" : "english";
}
export function saveUiLang(l: UiLang) {
  try { localStorage.setItem("askai:lang", l); } catch { /* storage unavailable */ }
}
