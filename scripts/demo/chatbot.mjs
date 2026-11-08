// Website AI chatbot + voice assistant — visitor sessions, messages, voice conversations (LMS → AI Chatbot analytics & conversation logs).
import { ObjectId } from "mongodb";
import { rint, pick, chance, weighted, ago, insertAll } from "./lib.mjs";

const QUESTIONS = [
  ["What services does Demo Company offer?", "We build custom software, AI & automation solutions, run industrial training and internship programs, and provide dedicated developers (resource augmentation)."],
  ["How much does a mobile app cost?", "It depends on scope — an MVP typically starts around ₹6 lakh. Share your requirements and we'll send a detailed quote within 24 hours."],
  ["Do you offer internships for students?", "Yes — 6–8 week live-project internships in MERN, Generative AI, Computer Vision and QA. Fees start at ₹9,000 and include a certificate."],
  ["Is there any festival offer running?", "Yes! Check the Offers page for the live campaign — you can also stack a coupon code and use your YO credits."],
  ["How do I hire dedicated developers?", "Choose single resource, package-based team, hourly or project-based engagement from the Resource Augmentation page and we'll shortlist profiles in 48 hours."],
  ["What is the duration of the MERN training?", "The Full-Stack MERN program runs 16 weeks with two live projects, mentor support and placement assistance."],
  ["How can I earn credits?", "Sign up for free and earn credits for completing your profile, every journey stage, daily visits, referrals and more — see the Rewards page."],
  ["Can I get a refund if I cancel?", "Refunds follow our Refund & Cancellation Policy — milestone-based for projects and pro-rata for training programs."],
  ["Do you build AI chatbots?", "Yes — RAG chatbots, voice assistants and workflow automation. We can scope a pilot in 2 weeks."],
  ["Where is your office?", "Our HQ is in Ghaziabad, Uttar Pradesh, and the team works remote-first."],
];
const PAGES = ["/", "/services", "/software-development", "/industrial-training", "/internship-program", "/offers", "/contact", "/careers", "/resource-augmentation", "/about"];

export async function seedChatbot(db) {
  await db.collection("chat_sessions").deleteMany({ visitorId: { $exists: false } });
  await db.collection("voice_conversations").deleteMany({ visitorId: { $exists: false } });
  await db.collection("chat_sessions").deleteMany({ _demo: true });
  await db.collection("chat_messages").deleteMany({ _demo: true });
  await db.collection("voice_conversations").deleteMany({ _demo: true });
  await db.collection("voice_messages").deleteMany({ _demo: true });

  const sessions = [];
  const messages = [];
  for (let i = 0; i < 160; i++) {
    const startedAt = ago(weighted([[rint(0, 7), 5], [rint(8, 30), 3], [rint(31, 75), 2]]));
    const turns = rint(1, 4);
    const sessionId = `demo-sess-${i + 1}`;
    let t = startedAt.getTime();
    let count = 0;
    for (let k = 0; k < turns; k++) {
      const [q, a] = pick(QUESTIONS);
      messages.push({ _id: new ObjectId(), sessionId, role: "user", content: q, createdAt: new Date(t), _demo: true });
      t += rint(2, 9) * 1000;
      messages.push({ _id: new ObjectId(), sessionId, role: "assistant", content: a, citations: [], model: "gpt-4o-mini", responseTimeMs: rint(700, 3200), promptTokens: rint(300, 900), completionTokens: rint(60, 220), voice: false, createdAt: new Date(t), _demo: true });
      t += rint(15, 90) * 1000;
      count += 2;
    }
    sessions.push({ _id: new ObjectId(), sessionId, visitorId: `demo-visitor-${rint(1, 120)}`, ipHash: `demoip${rint(1, 99)}`, userAgent: "Mozilla/5.0 (demo)", device: weighted([["mobile", 6], ["desktop", 4]]), browser: pick(["Chrome", "Safari", "Edge", "Firefox"]), os: pick(["Android", "iOS", "Windows", "macOS"]), sourcePage: pick(PAGES), title: messages[messages.length - count].content.slice(0, 60), startedAt, lastActivityAt: new Date(t), messageCount: count, status: chance(0.85) ? "ended" : "active", createdAt: startedAt, updatedAt: new Date(t), _demo: true });
  }
  const voice = [];
  const voiceMsgs = [];
  for (let i = 0; i < 40; i++) {
    const startedAt = ago(rint(0, 45));
    const id = new ObjectId();
    const n = rint(2, 6);
    voice.push({ _id: id, sessionId: `demo-vsess-${i + 1}`, visitorId: `demo-visitor-${rint(1, 120)}`, device: pick(["mobile", "desktop"]), browser: pick(["Chrome", "Safari"]), os: pick(["Android", "iOS", "Windows"]), sourcePage: pick(PAGES), voiceId: pick(["Bella", "Adam", "Nova"]), startedAt, lastActivityAt: new Date(startedAt.getTime() + n * 20000), durationMs: n * 20000, voiceMessageCount: n, status: "ended", _demo: true });
    for (let k = 0; k < n; k++) { const [q, a] = pick(QUESTIONS); voiceMsgs.push({ _id: new ObjectId(), sessionId: `demo-vsess-${i + 1}`, conversationId: id, chatMessageId: null, role: k % 2 === 0 ? "user" : "assistant", text: k % 2 === 0 ? q : a, audioDurationMs: rint(2000, 9000), sttMs: rint(200, 700), ttsMs: rint(300, 900), voiceId: "Bella", createdAt: new Date(startedAt.getTime() + k * 20000), _demo: true }); }
  }
  await insertAll(db.collection("chat_sessions"), sessions);
  await insertAll(db.collection("chat_messages"), messages);
  await insertAll(db.collection("voice_conversations"), voice);
  await insertAll(db.collection("voice_messages"), voiceMsgs);
  console.log(`  ✓ AI chatbot: ${sessions.length} sessions / ${messages.length} messages, ${voice.length} voice conversations / ${voiceMsgs.length} voice messages`);
}
