// Social Media (SMMS) demo data: five logins (one per role), brand context, three campaigns with ads, a dozen posts across
// every lifecycle status (with recorded performance on the published ones), version history and an activity log.
//
// No OpenAI calls and no media files (Blob) — content is hand-written demo copy, so the product is explorable without keys.
// If LMS ad-platform data exists (`campaigns` collection), the launched demo campaign links to the first imported one.
//
// Idempotent: every row it creates has a `demo-smms-` id and is replaced on each run. Brand settings are only created when
// none exist yet (admin-owned).
import { ObjectId } from "mongodb";
import { hashPassword } from "./lib.mjs";
import { assertDemoTarget } from "./guard.mjs";

const PASSWORD = "Demo@12345";
const D = "demo-smms-";
const DAY = 86400000;
const NOW = Date.now();
const at = (days, hour = 10) => {
  const d = new Date(NOW - days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

export const SMMS_DEMO_ACCOUNTS = [
  { email: "demo.smms.admin@example.com", label: "Social Media Admin (everything)", roles: ["smms_admin"] },
  { email: "demo.smms.manager@example.com", label: "Social Media Manager (publish/approve)", roles: ["smms_manager"] },
  { email: "demo.smms.specialist@example.com", label: "Social Media Specialist (campaigns)", roles: ["smms_specialist"] },
  { email: "demo.smms.employee@example.com", label: "Social Media Employee (posts)", roles: ["smms_employee"] },
];

const EMPTY_PUBLISH = { state: "pending", method: null, externalId: null, url: null, error: null, at: null, by: null };
const EMPTY_IMAGE = { concept: "", prompt: "", overlayText: "", designNotes: "" };
const EMPTY_VIDEO = { concept: "", hook: "", scenes: [], voiceoverScript: "", onScreenText: [], thumbnailConcept: "", durationSec: 0 };
const EMPTY_CREATIVE = { imageConcept: "", imagePrompt: "", videoConcept: "", hook: "", videoScript: "", scenes: [], thumbnailConcept: "" };
const stamp = (d, by) => ({ createdAt: d, updatedAt: d, createdBy: by, updatedBy: by, deletedAt: null });

const CAMPAIGN_AI = {
  summary: "Position Demo Company as the practical AI-automation partner for mid-size Indian businesses. Lead with a pain most operations teams feel (manual document and data entry), prove it with a concrete before/after, and convert through a free 30-minute automation audit. LinkedIn carries decision-maker reach, Meta retargets site visitors with short proof videos, and Google Ads captures active search intent.",
  positioning: "Automation that pays for itself in a quarter — built around your existing tools, not a platform migration.",
  keyMessages: ["Cut manual data entry by automating the documents you already process", "Works with the tools you already use", "Free 30-minute automation audit — a concrete plan, no obligation"],
  channelPlan: [
    { platform: "linkedin", budgetPercent: 45, role: "Top and middle funnel: reach operations heads and CXOs with proof-led single-image and video ads." },
    { platform: "facebook", budgetPercent: 20, role: "Retarget site visitors and video viewers with the audit offer." },
    { platform: "instagram", budgetPercent: 10, role: "Short Reels showing a before/after workflow to warm audiences." },
    { platform: "google_ads", budgetPercent: 25, role: "Capture high-intent searches for document automation and RPA." },
  ],
  timeline: "Week 1–2: awareness on LinkedIn + search. Week 3–4: retargeting on Meta with proof videos. Week 5–6: push the audit offer and scale the best-performing ad set.",
  kpis: ["Cost per audit booking under ₹2,500", "LinkedIn CTR above 0.6%", "30 audit bookings in 6 weeks"],
  ideas: [
    { title: "The 9-to-5 of a spreadsheet", description: "Show a day of manual invoice entry compressed into 20 seconds by automation." },
    { title: "Audit, don't guess", description: "Lead with the free audit and three example automations we'd recommend." },
  ],
  audiences: [
    { name: "Operations leaders", description: "Heads of operations/finance at 50–500 employee companies in India.", interests: ["Process improvement", "ERP", "Business automation"] },
    { name: "Website retargeting", description: "Visitors to AI & Automations pages in the last 30 days.", interests: [] },
  ],
  keywords: ["document automation", "invoice processing automation", "rpa services india", "ai workflow automation"],
  hashtags: ["#AIAutomation", "#DigitalTransformation", "#Demo Company", "#Productivity"],
  adConcepts: [
    { title: "Before / after invoice flow", platform: "linkedin", format: "image", angle: "Split-screen: stack of invoices vs. a clean dashboard.", headline: "4 hours of invoice entry → 10 minutes", primaryText: "Your team shouldn't be retyping PDFs. We automate document-heavy workflows around the tools you already use.", description: "Free 30-minute automation audit", cta: "Book Now" },
    { title: "20-second Reel", platform: "instagram", format: "video", angle: "Time-lapse of a manual process replaced by a bot.", headline: "Watch a week of data entry disappear", primaryText: "Automation that pays for itself in a quarter.", description: "", cta: "Learn More" },
  ],
};

const AD_LINKEDIN = {
  headline: "4 hours of invoice entry → 10 minutes",
  primaryText: "Your finance team shouldn't be retyping PDFs.\n\nWe build AI document automation around the tools you already use — ERP, email, spreadsheets — so invoices, POs and forms flow in without manual entry.\n\nBook a free 30-minute automation audit and leave with a concrete plan.",
  description: "Free 30-minute automation audit",
  cta: "Book Now",
  caption: "",
  hashtags: ["#AIAutomation", "#FinanceOps"],
  keywords: ["invoice automation", "document intelligence"],
  audienceSuggestions: ["Job function: Finance, Operations", "Company size: 51–500", "Location: India"],
  image: {
    concept: "Split-screen: left, a desk buried in paper invoices; right, the same desk clear with a laptop showing a tidy approvals dashboard.",
    prompt: "Clean, modern split-screen photo illustration. Left half: cluttered office desk piled with paper invoices under warm fluorescent light. Right half: the same desk, clear and bright, laptop showing a simple approvals dashboard with green check marks. Corporate, optimistic, soft depth of field, brand colours indigo and coral accents, no text.",
    overlayText: "4 hrs → 10 min",
    designNotes: "1200×1200. Keep overlay text in the top third, large and bold; logo bottom-right with 60px margin; avoid text over the laptop screen.",
  },
  video: EMPTY_VIDEO,
  variations: [
    { label: "Pain-point", headline: "Still retyping invoices?", primaryText: "Automate document-heavy work without replacing your tools.", description: "Free audit", cta: "Book Now" },
    { label: "Proof", headline: "90% less manual entry", primaryText: "See how AI document automation works with your ERP.", description: "Free audit", cta: "Learn More" },
  ],
};

const AD_REEL = {
  headline: "Watch a week of data entry disappear",
  primaryText: "Automation that pays for itself in a quarter. Free audit — link in bio.",
  description: "",
  cta: "Learn More",
  caption: "A week of data entry, gone in 20 seconds ⚡️",
  hashtags: ["#AIAutomation", "#WorkSmarter", "#Demo Company"],
  keywords: [],
  audienceSuggestions: ["Retarget: video viewers 50%+", "Lookalike: site visitors"],
  image: EMPTY_IMAGE,
  video: {
    concept: "Fast time-lapse of an employee's week of manual entry, then a single click and the bot does it all.",
    hook: "“This is 40 hours of data entry.” (stack of files slams on desk)",
    scenes: [
      { scene: "Scene 1 — Hook", duration: "0–3s", visual: "Files slam on desk, clock spinning", onScreenText: "40 hours of data entry", voiceover: "This is a week of data entry." },
      { scene: "Scene 2 — Problem", duration: "3–8s", visual: "Time-lapse of typing, coffee cups piling up", onScreenText: "Every. Single. Week.", voiceover: "Every single week." },
      { scene: "Scene 3 — Turn", duration: "8–15s", visual: "One click — invoices fly into a dashboard", onScreenText: "Automated in minutes", voiceover: "Or… automate it." },
      { scene: "Scene 4 — CTA", duration: "15–20s", visual: "Logo + audit offer", onScreenText: "Free automation audit", voiceover: "Book your free automation audit." },
    ],
    voiceoverScript: "This is a week of data entry. Every single week. Or… automate it. Book your free automation audit with Demo Company.",
    onScreenText: ["40 hours of data entry", "Every. Single. Week.", "Automated in minutes", "Free automation audit"],
    thumbnailConcept: "Surprised employee behind a tower of files, bold text “40 HRS”.",
    durationSec: 20,
  },
  variations: [],
};

function variant(platform, c, publish = EMPTY_PUBLISH, metrics = null) {
  return { platform, title: c.title ?? "", content: c.content ?? "", caption: c.caption ?? "", cta: c.cta ?? "", hashtags: c.hashtags ?? [], keywords: c.keywords ?? [], publish, metrics };
}
const published = (days, by, url = null, method = "manual") => ({ state: "published", method, externalId: null, url, error: null, at: at(days, 11), by });
const metrics = (m, by, days) => ({ impressions: 0, reach: 0, clicks: 0, engagements: 0, likes: 0, comments: 0, shares: 0, saves: 0, videoViews: 0, conversions: 0, ...m, updatedAt: at(days, 18), updatedBy: by });

/**
 * @param {import("mongodb").Db} db
 */
export async function seedSmms(db, target) {
  // Writes invented copy and metrics and logins with a known password: only ever into a company flagged as the demo company.
  assertDemoTarget(target?.company, process.env, "Social media (SMMS) demo data");
  const passwordHash = hashPassword(PASSWORD);
  const users = {};
  for (const a of SMMS_DEMO_ACCOUNTS) {
    const key = a.email.split("@")[0].replace("demo.smms.", "");
    const userId = (await db.collection("admin_users").findOne({ email: a.email }, { projection: { _id: 1 } }))?._id ?? new ObjectId();
    await db.collection("admin_users").updateOne(
      { email: a.email },
      { $set: { email: a.email, passwordHash, roles: a.roles, permissionOverrides: {}, userType: "employee", employeeId: null, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null }, $setOnInsert: { _id: userId, createdAt: new Date() } },
      { upsert: true }
    );
    users[key] = { id: userId.toString(), email: a.email };
  }

  const rows = { _id: new RegExp(`^${D}`) };
  for (const c of ["smms_campaigns", "smms_ads", "smms_posts", "smms_generations", "smms_activity_logs"]) await db.collection(c).deleteMany(rows);

  await db.collection("smms_settings").updateOne(
    { _id: "main" },
    {
      $setOnInsert: {
        brand: {
          about: "Demo Company builds custom software and practical AI automation for growing businesses, and trains developers in modern stacks and applied AI.",
          services: ["Software Development", "AI & Automations", "Industrial Training", "Resource Augmentation"],
          products: [],
          tone: "Confident, practical and friendly — plain language, no hype",
          targetAudience: "Founders, CXOs and operations/IT heads at Indian SMBs and mid-size companies; engineering students and early-career developers for training",
          messaging: "Tech solutions built around your business — delivered by a team that ships.",
          websiteInfo: "example.com — service pages, case studies, free consultation form, training batches and offers.",
          sellingPoints: ["Built around your existing tools", "Fixed-scope pilots before big commitments", "Hands-on, project-based training"],
          avoid: ["guaranteed results", "#1 in India"],
          brandHashtags: ["#Demo Company"],
          includeOffers: true,
        },
        updatedAt: at(30),
        updatedBy: users.admin.id,
      },
    },
    { upsert: true }
  );

  const lms = await db.collection("campaigns").findOne({}, { projection: { nameKey: 1 } }).catch(() => null);

  const campaigns = [
    {
      _id: `${D}c1`, name: "AI Automation Audit — Q4", objective: "Lead generation", platforms: ["linkedin", "facebook", "instagram", "google_ads"],
      targetAudience: "Operations and finance heads at 50–500 employee companies", industry: "Professional Services", location: "India — Delhi NCR, Bengaluru, Mumbai, Pune",
      budget: 300000, currency: "INR", startDate: at(-3, 0), endDate: at(-45, 0), cta: "Book Now", landingPage: "https://example.com/services/ai-automations", offerService: "AI & Automations — Document Intelligence",
      offerId: null, clientId: null, brandInfo: "", keywords: ["document automation", "rpa", "ai workflow"], tone: "Confident", language: "English",
      status: "scheduled", ai: CAMPAIGN_AI, lmsCampaignKeys: [], launchedAt: null, launchedBy: null, archivedFrom: null, ...stamp(at(6), users.specialist.id),
    },
    {
      _id: `${D}c2`, name: "Agentic AI Training — October batch", objective: "Event registrations", platforms: ["instagram", "youtube", "linkedin"],
      targetAudience: "Final-year engineering students and developers with 0–3 years' experience", industry: "Education & Training", location: "India",
      budget: 80000, currency: "INR", startDate: at(20, 0), endDate: at(-10, 0), cta: "Register", landingPage: "https://example.com/industrial-training/agentic-ai", offerService: "Industrial Training — Agentic AI",
      offerId: null, clientId: null, brandInfo: "Weekend batch, live projects, placement support.", keywords: ["agentic ai course", "ai training india"], tone: "Inspirational", language: "English",
      status: "published", ai: { ...CAMPAIGN_AI, summary: "Drive registrations for the weekend Agentic AI batch with project showcases on Instagram/YouTube and credibility on LinkedIn.", adConcepts: [] },
      lmsCampaignKeys: lms ? [lms.nameKey] : [], launchedAt: at(19), launchedBy: users.manager.id, archivedFrom: null, ...stamp(at(25), users.specialist.id),
    },
    {
      _id: `${D}c3`, name: "Resource Augmentation — Diwali push", objective: "Lead generation", platforms: ["linkedin", "google_ads"],
      targetAudience: "CTOs needing extra developers for Q4 deliveries", industry: "IT & Software", location: "India, UAE",
      budget: null, currency: "INR", startDate: null, endDate: null, cta: "Get Quote", landingPage: "", offerService: "Resource Augmentation",
      offerId: null, clientId: null, brandInfo: "", keywords: [], tone: "", language: "English",
      status: "draft", ai: { summary: "", positioning: "", keyMessages: [], channelPlan: [], timeline: "", kpis: [], ideas: [], audiences: [], keywords: [], hashtags: [], adConcepts: [] },
      lmsCampaignKeys: [], launchedAt: null, launchedBy: null, archivedFrom: null, ...stamp(at(1), users.specialist.id),
    },
  ];
  await db.collection("smms_campaigns").insertMany(campaigns);

  const ad = (id, campaignId, name, platform, format, formatKey, status, content, extra = {}) => ({
    _id: `${D}${id}`, campaignId, name, platform, format, formatKey, status, content, mediaIds: [], thumbnailId: null,
    scheduledAt: null, scheduledBy: null, approvedBy: null, approvedAt: null, externalRef: null, launchedAt: null, launchedBy: null, archivedFrom: null, ...stamp(at(5), users.specialist.id), ...extra,
  });
  const ads = [
    ad("a1", `${D}c1`, "Before / after invoice flow", "linkedin", "image", "li_square", "edited", AD_LINKEDIN),
    ad("a2", `${D}c1`, "20-second Reel", "instagram", "video", "ig_story", "scheduled", AD_REEL, { scheduledAt: at(-3, 9), scheduledBy: users.specialist.id }),
    ad("a3", `${D}c1`, "Search — document automation", "google_ads", "image", "gads_landscape", "generated", { ...AD_LINKEDIN, headline: "Document Automation Experts", primaryText: "Automate invoices, POs & forms. Free 30-min audit.", description: "Works with your ERP. Book a free audit today.", hashtags: [], variations: [] }),
    ad("a4", `${D}c2`, "Project showcase Reel", "instagram", "video", "ig_story", "published", { ...AD_REEL, headline: "Build an AI agent in 8 weekends", caption: "Your first production AI agent — built live with mentors 🚀" }, { externalRef: "https://www.instagram.com/p/demo", launchedAt: at(19), launchedBy: users.manager.id }),
    ad("a5", `${D}c2`, "YouTube pre-roll", "youtube", "video", "yt_video", "published", { ...AD_REEL, headline: "Agentic AI — weekend batch", caption: "" }, { launchedAt: at(19), launchedBy: users.manager.id }),
  ];
  await db.collection("smms_ads").insertMany(ads);

  const P = (id, title, platforms, contentType, status, variants, extra = {}) => ({
    _id: `${D}${id}`, title, topic: title, serviceProduct: "", audience: "", tone: "", language: "English", objective: "Engagement", contentType, platforms,
    link: "https://example.com", plannedAt: null, campaignId: null, offerId: null, clientId: null, notes: "",
    status, idea: variants.length ? `${title} — one idea adapted per platform.` : "", creative: EMPTY_CREATIVE, variants, mediaIds: [], thumbnailId: null,
    scheduledAt: null, scheduledBy: null, approvedBy: null, approvedAt: null, publishedAt: null, archivedFrom: null, ...stamp(at(3), users.employee.id), ...extra,
  });
  const liBody = (t) => ({ title: t, content: `${t}\n\nMost teams lose hours every week to work a small automation could handle. Here's the 3-step approach we use with clients:\n1. Map the repetitive steps\n2. Automate the highest-volume one first\n3. Measure hours saved, then scale.\n\nWhat's the most repetitive task in your week?`, cta: "Learn More", hashtags: ["#AIAutomation", "#Productivity", "#Demo Company"], keywords: ["automation"] });
  const igBody = (t) => ({ content: `${t} ⚡️\n\nSave this for your next planning session.`, caption: `${t} ⚡️`, cta: "Link in bio", hashtags: ["#AIAutomation", "#WorkSmarter", "#TechTips", "#Demo Company"] });
  const fbBody = (t) => ({ title: t, content: `${t} — here's how we approach it, step by step.`, cta: "Learn More", hashtags: ["#Demo Company"] });
  const posts = [
    P("p1", "3 automations every finance team should try", ["linkedin", "instagram", "facebook"], "image", "published",
      [variant("linkedin", liBody("3 automations every finance team should try"), published(12, users.manager.id, "https://www.linkedin.com/feed/update/demo1"), metrics({ impressions: 8420, reach: 6130, engagements: 412, likes: 318, comments: 41, shares: 53, clicks: 187, conversions: 6 }, users.manager.id, 5)),
       variant("instagram", igBody("3 automations every finance team should try"), published(12, users.manager.id), metrics({ impressions: 5210, reach: 4020, engagements: 388, likes: 301, comments: 22, shares: 18, saves: 47, clicks: 34 }, users.manager.id, 5)),
       variant("facebook", fbBody("3 automations every finance team should try"), published(12, users.manager.id), metrics({ impressions: 2310, reach: 1904, engagements: 96, likes: 71, comments: 9, shares: 16, clicks: 58, conversions: 2 }, users.manager.id, 5))],
      { publishedAt: at(12, 11), campaignId: `${D}c1` }),
    P("p2", "Behind the scenes: shipping an AI agent in a weekend", ["youtube", "instagram"], "video", "published",
      [variant("youtube", { title: "We built an AI agent in one weekend (behind the scenes)", content: "What it takes to go from idea to a working AI agent in 48 hours — tools, trade-offs and the bugs we hit.", cta: "Subscribe", keywords: ["ai agent", "agentic ai", "build ai agent"], hashtags: ["#AgenticAI"] }, published(8, users.manager.id, "https://www.youtube.com/watch?v=demo"), metrics({ impressions: 15400, reach: 9800, engagements: 640, likes: 520, comments: 64, shares: 56, videoViews: 4210, clicks: 212 }, users.manager.id, 2)),
       variant("instagram", igBody("We built an AI agent in one weekend"), published(8, users.manager.id), metrics({ impressions: 11200, reach: 8700, engagements: 910, likes: 760, comments: 58, shares: 44, saves: 48, videoViews: 6900 }, users.manager.id, 2))],
      { publishedAt: at(8, 11), campaignId: `${D}c2` }),
    P("p3", "Diwali greetings + automation offer", ["instagram", "facebook", "linkedin", "google_business"], "image", "scheduled",
      [variant("instagram", igBody("Wishing you a bright, automated Diwali 🪔")), variant("facebook", fbBody("Wishing you a bright Diwali")), variant("linkedin", liBody("This Diwali, give your team back their weekends")), variant("google_business", { title: "Diwali automation audit", content: "Free 30-minute automation audit this festive season. Book now.", cta: "Book Now" })],
      { scheduledAt: at(-4, 10), scheduledBy: users.specialist.id, approvedBy: users.manager.id, approvedAt: at(1) }),
    P("p4", "Case study: 70% faster onboarding", ["linkedin"], "image", "scheduled",
      [variant("linkedin", liBody("Case study: how a logistics client made onboarding 70% faster"))],
      { scheduledAt: at(-2, 15), scheduledBy: users.specialist.id }),
    P("p5", "Hiring: React developers", ["linkedin", "facebook"], "image", "edited",
      [variant("linkedin", liBody("We're hiring React developers in Noida")), variant("facebook", fbBody("We're hiring React developers"))]),
    P("p6", "What is agentic AI? (explainer Short)", ["youtube", "instagram"], "video", "generated",
      [variant("youtube", { title: "Agentic AI explained in 60 seconds", content: "Agents plan, use tools and act — here's the difference from a chatbot.", cta: "Subscribe", keywords: ["agentic ai"] }), variant("instagram", igBody("Agentic AI in 60 seconds"))],
      { creative: { ...EMPTY_CREATIVE, videoConcept: "Whiteboard-style explainer", hook: "Chatbots answer. Agents act.", videoScript: "Chatbots answer questions. Agents get things done…", thumbnailConcept: "Robot hand pressing an ‘Act’ button" } }),
    P("p7", "Weekend batch countdown", ["instagram"], "image", "draft", [variant("instagram", {})], { plannedAt: at(-6, 18) }),
    P("p8", "Google Business update — new office hours", ["google_business"], "image", "failed",
      [variant("google_business", { title: "New office hours", content: "We're now open Saturdays 10am–2pm for consultations.", cta: "Call Now" }, { ...EMPTY_PUBLISH, state: "failed", error: "Google Business Profile isn't connected — publish it in the app and use “Mark as published”.", at: at(2), by: users.manager.id })]),
    P("p9", "Old launch teaser", ["facebook"], "image", "archived", [variant("facebook", fbBody("Something new is coming"))], { archivedFrom: "edited" }),
  ];
  await db.collection("smms_posts").insertMany(posts);

  const gen = (n, targetType, targetId, kind, label, source, days, user, snapshot, platform = null) => ({
    _id: `${D}g${n}`, targetType, targetId, version: 1, source, kind, instruction: null, label, platform, snapshot,
    model: source === "ai" ? "gpt-4.1-mini" : null, inputTokens: source === "ai" ? 2200 : 0, outputTokens: source === "ai" ? 1800 : 0, costUsd: source === "ai" ? 0.0038 : 0, durationMs: source === "ai" ? 14000 : 0,
    userId: user.id, userEmail: user.email, createdAt: at(days, 12),
  });
  const gens = [
    gen(1, "campaign", `${D}c1`, "campaign_strategy", campaigns[0].name, "ai", 6, users.specialist, CAMPAIGN_AI),
    { ...gen(2, "campaign", `${D}c1`, "campaign_strategy", campaigns[0].name, "edit", 5, users.specialist, CAMPAIGN_AI), version: 2 },
    gen(3, "ad", `${D}a1`, "image_ad", "Before / after invoice flow · LinkedIn", "ai", 5, users.specialist, AD_LINKEDIN, "linkedin"),
    gen(4, "ad", `${D}a2`, "video_ad", "20-second Reel · Instagram", "ai", 5, users.specialist, AD_REEL, "instagram"),
    gen(5, "post", `${D}p1`, "post", posts[0].title, "ai", 14, users.employee, { idea: posts[0].idea }),
    gen(6, "post", `${D}p6`, "post", posts[5].title, "ai", 1, users.employee, { idea: posts[5].idea }),
    gen(7, "workspace", `${D}w1`, "captions", "Captions for the Diwali automation audit", "ai", 2, users.employee, { input: { type: "captions", platform: "instagram", brief: "Diwali automation audit" }, output: { summary: "Festive, light captions that lead to the audit.", items: [{ heading: "Festive", platform: "instagram", body: "Light up Diwali, not your inbox 🪔 Free automation audit — link in bio.", cta: "Book Now", hashtags: ["#Diwali", "#Demo Company"] }] } }, "instagram"),
  ];
  await db.collection("smms_generations").insertMany(gens);

  const log = (n, actor, action, entity, entityId, entityLabel, days, summary = null) => ({ _id: `${D}l${n}`, actorId: actor.id, actorEmail: actor.email, action, entity, entityId, entityLabel, recordId: entityId, summary, metadata: null, createdAt: at(days, 13) });
  await db.collection("smms_activity_logs").insertMany([
    log(1, users.specialist, "create", "campaign", `${D}c1`, campaigns[0].name, 6),
    log(2, users.specialist, "generate", "campaign", `${D}c1`, campaigns[0].name, 6, "Strategy v1"),
    log(3, users.specialist, "schedule", "campaign", `${D}c1`, campaigns[0].name, 4),
    log(4, users.manager, "publish", "campaign", `${D}c2`, campaigns[1].name, 19, "Marked launched"),
    log(5, users.employee, "generate", "post", `${D}p1`, posts[0].title, 14, "Post + platform versions"),
    log(6, users.manager, "publish", "post", `${D}p1`, posts[0].title, 12, "LinkedIn marked published"),
    log(7, users.manager, "approve", "post", `${D}p3`, posts[2].title, 1, "Approved to auto-publish"),
    log(8, users.manager, "publish_failed", "post", `${D}p8`, posts[7].title, 2, "Google Business Profile isn't connected"),
  ]);

  return { campaigns: campaigns.length, ads: ads.length, posts: posts.length, generations: gens.length, linkedLms: Boolean(lms) };
}
