// Growth modules — Festival Offers (campaigns, offers, coupons, claims, analytics) and the Wallet & Credits system
// (rules, referral campaigns, referral network, per-user ledgers with consistent balances, streaks, notifications).
import { randomUUID } from "node:crypto";
import { personName, rng, rint, pick, chance, weighted, shuffle, ago, fromNow, audit, isoDay, NOW, insertAll } from "./lib.mjs";

const DAY = 86400000;
const CAT_AUDIENCES = { "software-development": ["CLIENT", "BUSINESS"], "ai-automations": ["BUSINESS", "CLIENT"], "industrial-training": ["STUDENT", "LEARNER"], "resource-augmentation": ["HIRING", "BUSINESS"], "internship-program": ["INTERN", "STUDENT"] };
const CAT_ELIGIBILITY = {
  "software-development": ["Registered companies, startups and founders", "Project scope shared before kickoff"],
  "ai-automations": ["Businesses with an existing process to automate", "Discovery call required"],
  "industrial-training": ["Students and fresh graduates", "Laptop with internet access"],
  "resource-augmentation": ["Companies hiring 1+ developers", "Minimum 3-month engagement"],
  "internship-program": ["Final-year and pre-final-year students", "Minimum 8 hours/week commitment"],
};
const CAT_AUD = { "software-development": "CLIENT", "ai-automations": "CLIENT", "industrial-training": "STUDENT", "resource-augmentation": "HIRING", "internship-program": "INTERN" };

const OFFER_TEMPLATES = [
  ["Custom Web App Development", "software-development", "web-app-development", "percentage", 450000, 15],
  ["Mobile App — MVP Package", "software-development", "mobile-app-development", "flat", 600000, 50000],
  ["SaaS Platform Build", "software-development", "all", "percentage", 1200000, 12],
  ["AI Chatbot for Support", "ai-automations", "conversational-ai", "percentage", 350000, 20],
  ["Workflow Automation Starter", "ai-automations", "all", "flat", 250000, 25000],
  ["Computer Vision Pilot", "ai-automations", "computer-vision", "custom_quote", null, null],
  ["Full-Stack MERN Bootcamp", "industrial-training", "all", "percentage", 48000, 25],
  ["Generative AI & Agents Program", "industrial-training", "all", "percentage", 55000, 20],
  ["Cloud & DevOps Engineering", "industrial-training", "all", "flat", 42000, 6000],
  ["Data Science Career Track", "industrial-training", "all", "percentage", 45000, 22],
  ["MERN Internship (8 weeks)", "internship-program", "mern-stack", "percentage", 12000, 30],
  ["Generative AI Internship", "internship-program", "generative-ai", "flat", 15000, 3000],
  ["Dedicated Developer (monthly)", "resource-augmentation", "single-resource", "percentage", 120000, 10],
  ["Managed Team Package", "resource-augmentation", "package-based-team", "custom_quote", null, null],
];

export async function seedGrowth(db, tms, pms, people) {
  const { users, interviews } = people;
  const notifications = people.notifications;
  const wipe = (name) => db.collection(name).deleteMany({ _id: /^demo-/ });

  // ===================================================================================== OFFERS
  const stripCfg = (msg, disc, on) => ({ enabled: on, message: msg, discountText: disc, ctaText: "Claim Offer", ctaActionType: "url", ctaActionValue: "/offers", showCountdown: true, allowClose: true });
  const popupCfg = (on, tpl) => ({ enabled: on, template: tpl, ctaText: "Claim Offer", ctaActionType: "url", ctaActionValue: "/offers", showCountdown: true, triggerType: "delay", triggerValue: 8, frequency: "daily" });
  const campaignDefs = [
    { key: "diwali", name: "Diwali Dhamaka 2026", preset: "diwali", type: "festival", start: -10, end: 20, status: "active", priority: 100, featured: true, head: "Light up your career & business", sub: "Up to 30% off on training, internships, AI and software projects" },
    { key: "summer", name: "Summer Skills Sale", preset: "summer-sale", type: "seasonal", start: -140, end: -85, status: "expired", priority: 50, featured: false, head: "Beat the summer — upskill now", sub: "Bootcamps & internships at special prices" },
    { key: "newyear", name: "New Year Kickstart 2027", preset: "new-year", type: "festival", start: 70, end: 100, status: "scheduled", priority: 80, featured: true, head: "Start 2027 with a bang", sub: "Early-bird pricing across all services" },
    { key: "republic", name: "Republic Day Tech Fest", preset: "independence-day", type: "festival", start: 2.5, end: 16, status: "scheduled", priority: 90, featured: true, head: "Build. Learn. Launch.", sub: "Republic Day pricing on developers, courses and AI projects" },
    { key: "college", name: "Back to College Bonanza", preset: "back-to-college", type: "seasonal", start: -60, end: -35, status: "expired", priority: 40, featured: false, head: "Campus season offers", sub: "Student-first pricing on training programs" },
    { key: "flash", name: "Flash Friday Deals", preset: "custom", type: "flash-sale", start: -3, end: 2, status: "paused", priority: 60, featured: false, head: "48-hour flash deals", sub: "Limited seats, limited time" },
  ];
  const campaigns = campaignDefs.map((c, i) => ({
    _id: `demo-camp-${c.key}`, name: c.name, slug: `demo-${c.key}`, campaignType: c.type, themePreset: c.preset, theme: { primaryColor: "#E56043", accentColor: "#1D428A", bannerHeadline: c.head, bannerSubheadline: c.sub },
    startDate: fromNow(c.start), endDate: fromNow(c.end), status: c.status, priority: c.priority, targetAudience: ["ALL"], isFeatured: c.featured,
    faqs: [{ question: "Can I combine a coupon with the offer?", answer: "Yes — coupon discounts stack with the offer discount, capped at the original price." }, { question: "How do I use my Demo Company credits?", answer: "Sign in with the same email and tick 'Use my credits' in the claim form." }, { question: "Until when is the offer valid?", answer: "Until the campaign end date shown in the countdown." }],
    display: { strip: stripCfg(`${c.name} is live`, i === 0 ? "UP TO 30% OFF" : "", c.status === "active"), popup: popupCfg(c.status === "active", pick(["festival", "student", "client"])), pageTargeting: { mode: "all", pages: [] } }, ...audit(fromNow(c.start - 5)),
  }));

  const offers = [];
  for (const c of campaignDefs) {
    const tpl = c.key === "diwali" ? OFFER_TEMPLATES : shuffle(OFFER_TEMPLATES).slice(0, 7);
    tpl.forEach(([title, category, sub, mode, price, val], i) => {
      const pricing = { mode, currency: "INR" };
      if (mode !== "custom_quote") pricing.originalPrice = price;
      if (mode === "percentage") { pricing.percentage = val; pricing.maxDiscountCap = Math.round(price * 0.3); }
      if (mode === "flat") pricing.flatDiscountAmount = val;
      if (mode === "custom_quote") pricing.startingPriceLabel = "Custom Quote";
      offers.push({
        _id: `demo-offer-${c.key}-${i + 1}`, campaignId: `demo-camp-${c.key}`, title, description: `${title} — limited-period pricing with expert delivery and support.`, category, subService: sub, audience: i === 5 ? ["ALL"] : CAT_AUDIENCES[category], eligibility: CAT_ELIGIBILITY[category], offerTypes: ["seasonal", category === "industrial-training" || category === "internship-program" ? "student" : category === "resource-augmentation" ? "hiring" : "service", ...(i < 2 ? ["limited_time"] : [])], segment: "any", limitKind: "slots", pricing,
        benefits: ["Senior-led delivery", "Dedicated support", "Certificate / documentation included"], validFrom: fromNow(c.start), validUntil: c.key === "diwali" && i % 5 === 1 ? new Date(NOW + 46 * 3600000) : c.key === "diwali" && i === 3 ? new Date(NOW + 9 * 3600000) : fromNow(c.end), priority: 100 - i, isFeatured: i < 2, isDealOfTheDay: i === 0 && c.key === "diwali", isFlashDeal: c.key === "flash",
        status: c.status === "active" || c.status === "scheduled" ? "active" : c.status === "paused" ? "paused" : "expired", ...audit(fromNow(c.start - 3)),
      });
    });
  }

  // ---- Offer marketplace: a wide variety of typed offers on the live Diwali campaign ----
  // [title, category, mode, price, value, types, unit, segment, audience, cta, linked, endsInHours|null, slots|null, limitKind]
  const M = (t, cat, mode, price, val, types, o = {}) => ({ t, cat, mode, price, val, types, unit: "fixed", segment: "any", aud: CAT_AUDIENCES[cat], cta: null, linked: null, hours: null, slots: null, kind: "slots", ...o });
  const MARKET = [
    M("Full-Stack + DevOps Career Combo", "industrial-training", "percentage", 64000, 30, ["combo", "course", "student", "seasonal"], { linked: { kind: "course", label: "Full-Stack + DevOps Combo Program", href: "/industrial-training" }, slots: 40 }),
    M("Website + SEO + Hosting Launch Combo", "software-development", "percentage", 120000, 25, ["combo", "service", "business", "limited_time"], { linked: { kind: "service", label: "Website Development", href: "/software-development" }, hours: 70 }),
    M("Senior Developer — Hourly Rate", "resource-augmentation", "flat", 1500, 300, ["hourly", "hiring", "limited_time"], { unit: "hour", hours: 100, linked: { kind: "service", label: "Hire a senior developer", href: "/resource-augmentation" } }),
    M("AI Engineer — Hourly Rate", "resource-augmentation", "percentage", 2500, 20, ["hourly", "hiring", "business", "flash"], { unit: "hour", hours: 30, slots: 12 }),
    M("QA & Automation Engineer — Hourly Rate", "resource-augmentation", "percentage", 1100, 15, ["hourly", "hiring", "client"], { unit: "hour" }),
    M("Flash: 48-Hour Landing Page Sprint", "software-development", "flat", 25000, 5000, ["flash", "project", "limited_time"], { hours: 5, slots: 8, cta: "Book my sprint" }),
    M("Flash: Interview Bootcamp Weekend", "industrial-training", "flat", 2500, 700, ["flash", "student", "course"], { hours: 7, slots: 30, cta: "Reserve my seat" }),
    M("Python for Data Science — Enrol", "industrial-training", "percentage", 18000, 35, ["course", "student", "first_time"], { segment: "new_user", cta: "Enrol now", linked: { kind: "course", label: "Python for Data Science", href: "/industrial-training" } }),
    M("Advanced Track Upgrade — Loyalty Price", "industrial-training", "percentage", 22000, 15, ["renewal", "course", "student"], { segment: "existing_user", cta: "Upgrade my plan", linked: { kind: "program", label: "Advanced Placement Track", href: "/industrial-training" } }),
    M("Mobile App Development", "software-development", "percentage", 300000, 18, ["service", "client", "project"], { linked: { kind: "service", label: "Mobile App Development", href: "/services" } }),
    M("Fixed-Price MVP in 6 Weeks", "software-development", "flat", 350000, 40000, ["project", "client", "business", "limited_time"], { hours: 22, slots: 6, kind: "slots" }),
    M("Managed Support Plan", "software-development", "percentage", 20000, 25, ["subscription", "business", "client"], { unit: "month", cta: "Start my plan" }),
    M("Annual Cloud Care Plan", "software-development", "percentage", 240000, 30, ["subscription", "business", "limited_time"], { unit: "year", hours: 60 }),
    M("Refer & Earn — 500 Credits Each", "software-development", "custom_quote", null, null, ["referral"], { aud: ["ALL"], cta: "Get my referral link", label: "500 credits per referral", linked: { kind: "product", label: "Demo Company Rewards", href: "/rewards" } }),
    M("Welcome Offer — 10% Off Your First Project", "software-development", "percentage", 50000, 10, ["first_time", "client"], { segment: "new_user" }),
    M("Your First Course — ₹1,000 Off", "industrial-training", "flat", 3999, 1000, ["first_time", "student", "course"], { segment: "new_user", cta: "Claim welcome offer" }),
    M("Loyalty Upgrade — 20% Off Dedicated Team", "resource-augmentation", "percentage", 480000, 20, ["renewal", "hiring", "business"], { segment: "existing_user", unit: "month" }),
    M("Founders Pack: AI + App Bundle", "ai-automations", "percentage", 260000, 22, ["personalized", "combo", "business"], { linked: { kind: "service", label: "AI & App Bundle", href: "/ai-automations" } }),
    M("Dedicated Team of 4 — Monthly", "resource-augmentation", "percentage", 480000, 15, ["hiring", "business", "subscription"], { unit: "month" }),
    M("Diwali Special: Full Website Redesign", "software-development", "percentage", 150000, 28, ["seasonal", "service", "limited_time"], { hours: 46 }),
    M("Internship Fast-Track + Certificate", "internship-program", "flat", 6000, 1500, ["student", "course", "limited_time"], { hours: 18, slots: 25, cta: "Apply now" }),
    M("Free AI Audit + 10% Off Automation", "ai-automations", "percentage", 80000, 10, ["client", "service", "first_time"], { segment: "new_user", cta: "Book my audit" }),
    M("Enterprise Data Platform Package", "software-development", "custom_quote", null, null, ["business", "project"], { label: "Custom Quote", cta: "Request a quote" }),
    M("Chatbot Starter Kit — 25 Licences", "ai-automations", "percentage", 45000, 22, ["service", "limited_time"], { slots: 25, kind: "quantity", hours: 80 }),
  ];
  MARKET.forEach((m, k) => {
    const pricing = { mode: m.mode, currency: "INR", unit: m.unit };
    if (m.mode !== "custom_quote") pricing.originalPrice = m.price;
    if (m.mode === "percentage") pricing.percentage = m.val;
    if (m.mode === "flat") pricing.flatDiscountAmount = m.val;
    if (m.mode === "custom_quote") pricing.startingPriceLabel = m.label ?? "Custom Quote";
    offers.push({
      _id: `demo-offer-diwali-m${k + 1}`, campaignId: "demo-camp-diwali", title: m.t, description: `${m.t} — limited-period pricing with expert delivery and support.`, category: m.cat, subService: "all", audience: m.aud,
      eligibility: CAT_ELIGIBILITY[m.cat], offerTypes: m.types, segment: m.segment, limitKind: m.kind, linked: m.linked, ctaText: m.cta ?? undefined, _slots: m.slots, pricing,
      benefits: ["Senior-led delivery", "Dedicated support", "Documentation & handover included"], validFrom: fromNow(-10), validUntil: m.hours ? new Date(NOW + m.hours * 3600000) : fromNow(18 + (k % 6)),
      priority: 60 - k, isFeatured: k % 6 === 0, isDealOfTheDay: false, isFlashDeal: m.types.includes("flash"), status: "active", ...audit(fromNow(-13)),
    });
  });
  const activeOffers = offers.filter((o) => o.campaignId === "demo-camp-diwali");

  const couponDefs = [
    ["DIWALI10", "percentage", 10, 15000, 5000, "demo-camp-diwali", 500, 1], ["FESTIVE500", "flat", 500, null, null, "demo-camp-diwali", 300, 1], ["STUDENT15", "percentage", 15, 10000, 8000, "demo-camp-diwali", 250, 1],
    ["AIBOOST", "percentage", 8, 100000, 25000, "demo-camp-diwali", 100, 2], ["HIREFAST", "flat", 10000, 100000, null, "demo-camp-diwali", 60, 1], ["INTERN20", "percentage", 20, 8000, 3000, "demo-camp-diwali", 200, 1],
    ["SUMMER25", "percentage", 25, null, 6000, "demo-camp-summer", 400, 1], ["COLLEGE12", "percentage", 12, null, 4000, "demo-camp-college", 350, 1], ["FLASH100", "flat", 100, null, null, "demo-camp-flash", 1000, 3],
    ["NEWYEAR30", "percentage", 30, 20000, 10000, "demo-camp-newyear", 200, 1], ["WELCOME5", "percentage", 5, null, 2500, undefined, null, 1], ["VIP1000", "flat", 1000, 25000, null, undefined, 50, 2],
  ];
  const campWindow = Object.fromEntries(campaignDefs.map((c) => [`demo-camp-${c.key}`, c]));
  const coupons = couponDefs.map(([code, type, amt, min, cap, campaignId, limit, perUser], i) => {
    const w = campaignId ? campWindow[campaignId] : { start: -30, end: 200 };
    const doc = {
      _id: `demo-coupon-${i + 1}`, code, discountType: type, discountAmount: amt, applicableServices: [],
      applicableAudience: code === "STUDENT15" ? ["STUDENT"] : code === "INTERN20" ? ["INTERN"] : code === "HIREFAST" ? ["HIRING"] : ["ALL"], startDate: fromNow(w.start), endDate: fromNow(w.end), usageCount: 0, perUserLimit: perUser, isActive: true, ...audit(fromNow(w.start - 2)),
    };
    if (limit) doc.usageLimit = limit;
    if (campaignId) doc.campaignId = campaignId;
    if (min) doc.minOrderValue = min;
    if (cap) doc.maxDiscountCap = cap;
    return doc;
  });

  // ---- claims ----
  const claims = [];
  const claimsByUser = new Map();
  const calc = (offer, coupon) => {
    const price = offer.pricing.originalPrice;
    if (!price) return {};
    const offerOff = offer.pricing.mode === "percentage" ? Math.min(price * (offer.pricing.percentage / 100), offer.pricing.maxDiscountCap ?? Infinity) : offer.pricing.mode === "flat" ? offer.pricing.flatDiscountAmount : 0;
    let couponOff = 0;
    if (coupon && (!coupon.minOrderValue || price >= coupon.minOrderValue)) {
      const raw = coupon.discountType === "percentage" ? price * (coupon.discountAmount / 100) : coupon.discountAmount;
      couponOff = coupon.maxDiscountCap ? Math.min(raw, coupon.maxDiscountCap) : raw;
    }
    const total = Math.min(offerOff + couponOff, price);
    return { originalPrice: price, offerDiscountAmount: Math.round(offerOff), couponDiscountAmount: Math.round(couponOff), totalDiscountApplied: Math.round(total), finalPrice: Math.round(price - total), currency: "INR" };
  };
  const portalUsers = shuffle(users.filter((u) => u._leads.length));
  for (let i = 0; i < 320; i++) {
    const camp = weighted([["demo-camp-diwali", 6], ["demo-camp-summer", 2], ["demo-camp-college", 1.5], ["demo-camp-flash", 0.5]]);
    const pool = offers.filter((o) => o.campaignId === camp && o.pricing.mode !== "custom_quote");
    const offer = pick(pool.length ? pool : activeOffers.filter((o) => o.pricing.mode !== "custom_quote"));
    const aud = CAT_AUD[offer.category]; // claim audiences are the 4 real claimant types
    const asPortal = chance(0.35) ? pick(portalUsers) : null;
    const email = asPortal ? asPortal.email : `enquiry.${i + 1}@prospect.demo.in`;
    const coupon = chance(0.4) ? pick(coupons.filter((c) => !c.campaignId || c.campaignId === camp)) : null;
    const pricing = calc(offer, coupon);
    const createdAt = camp === "demo-camp-diwali" ? ago(rint(0, 9)) : ago(rint(40, 140));
    const claim = {
      _id: `demo-claim-${i + 1}`, leadId: `demo-catlead-${i + 1}`, category: offer.category, leadEmail: email, campaignId: camp, offerId: offer._id, audience: aud,
      audienceFields: aud === "STUDENT" || aud === "INTERN" ? { college: "Demo Institute of Technology", program: offer.title } : { company: "Prospect Pvt Ltd", budgetRange: "₹5L–10L" }, pricing, createdAt,
    };
    if (coupon && pricing.couponDiscountAmount) {
      claim.couponCode = coupon.code;
      coupon.usageCount++;
    }
    claims.push(claim);
    if (asPortal) (claimsByUser.get(asPortal._id) ?? claimsByUser.set(asPortal._id, []).get(asPortal._id)).push(claim);
  }

  // ---- analytics events ----
  const evtDocs = [];
  const EVT = [["campaign_view", 30], ["offer_view", 28], ["offer_click", 14], ["form_start", 7], ["coupon_apply", 3], ["whatsapp_click", 3], ["call_click", 1.5], ["strip_view", 12], ["strip_click", 2], ["popup_view", 9], ["popup_click", 2], ["popup_close", 4], ["exit_intent_shown", 1.5], ["scroll_cta_click", 1], ["offer_detail_open", 6], ["personalized_view", 3], ["share_click", 1], ["countdown_expired", 0.5]];
  for (let i = 0; i < 4200; i++) {
    const camp = weighted([["demo-camp-diwali", 7], ["demo-camp-summer", 2], ["demo-camp-college", 1]]);
    const c = campWindow[camp];
    const dayOffset = rint(Math.max(c.start, -150), Math.min(c.end, -1));
    const offer = chance(0.7) ? pick(offers.filter((o) => o.campaignId === camp)) : null;
    evtDocs.push({ _id: `demo-evt-${i + 1}`, type: weighted(EVT), campaignId: camp, offerId: offer?._id, category: offer?.category, audience: offer ? offer.audience[0] : undefined, device: weighted([["mobile", 6], ["desktop", 3.5], ["tablet", 0.5]]), source: weighted([["direct", 3], ["google", 3], ["instagram", 2], ["whatsapp", 1.5], ["linkedin", 1]]), sessionId: `sess-${rint(1, 1400)}`, createdAt: new Date(NOW + dayOffset * DAY - rint(0, 86000) * 1000) });
  }

  // ===================================================================================== WALLET
  const ruleDefs = [
    ["signup", "ALL", 100, 90], ["signup", "client", 200, 120], ["signup", "trainee", 150, 90], ["referral_referrer", "ALL", 250, 180], ["referral_referee", "ALL", 150, 90],
    ["stage_complete", "ALL", 20, 120], ["stage_complete", "ALL", 100, 180, "certificate_issued"], ["stage_complete", "ALL", 100, 180, "joined"], ["stage_complete", "client", 60, 180, "project_started"],
    ["daily_visit", "ALL", 2, 30], ["streak_7", "ALL", 25, 60], ["profile_complete", "ALL", 30, 90], ["first_offer_claim", "ALL", 50, 90], ["first_payment", "ALL", 100, 120],
    ["interview_completed", "ALL", 25, 90], ["assignment_submit", "ALL", 10, 60], ["assignment_approved", "ALL", 20, 60], ["referral_milestone", "ALL", 100, 180, "3"], ["referral_milestone", "ALL", 250, 180, "5"], ["referral_milestone", "ALL", 600, 365, "10"],
  ];
  const rulesCol = db.collection("wallet_reward_rules");
  for (const [type, role, amount, days, subKey] of ruleDefs) {
    const exists = await rulesCol.findOne({ type, appliesToRole: role, subKey: subKey ?? null, deletedAt: null });
    if (!exists) await rulesCol.insertOne({ _id: `demo-rule-${type}-${role}-${subKey ?? "any"}`, type, appliesToRole: role, amount, expiresInDays: days, isActive: true, subKey: subKey ?? null, ...audit(ago(60)) });
  }
  // The amount a user of `role` would be paid for `type` (mirrors the payout engine's specificity order).
  const rule = (type, role, subKey = null) => {
    const list = ruleDefs.filter(([t]) => t === type);
    const hit = (subKey && list.find(([, r, , , k]) => r === role && k === subKey)) || (subKey && list.find(([, r, , , k]) => r === "ALL" && k === subKey)) || list.find(([, r, , , k]) => r === role && !k) || list.find(([, r, , , k]) => r === "ALL" && !k);
    return hit ? { amount: hit[2], days: hit[3] } : null;
  };
  const usageCol = db.collection("wallet_usage_rules");
  for (const [module, role, pct, cap, min] of [["offers", "ALL", 30, null, null], ["training", "ALL", 50, null, null], ["projects", "ALL", 50, null, 10000], ["hiring", "ALL", 25, 5000, null], ["offers", "client", 20, 10000, 20000]]) {
    if (!(await usageCol.findOne({ module, appliesToRole: role, deletedAt: null }))) await usageCol.insertOne({ _id: `demo-usage-${module}-${role}`, module, appliesToRole: role, isEnabled: true, maxPercentOfPrice: pct, maxCreditsPerTransaction: cap, minOrderValue: min, ...audit(ago(50)) });
  }
  await wipe("wallet_referral_campaigns");
  await insertAll(db.collection("wallet_referral_campaigns"), [
    { _id: "demo-rcamp-1", name: "Refer & Earn — Always On", isActive: true, qualifyingEvent: "account_created", referrerAudience: "ALL", maxReferralsPerReferrer: 50, startsAt: null, endsAt: null, ...audit(ago(90)) },
    { _id: "demo-rcamp-2", name: "Client Referral Program", isActive: true, qualifyingEvent: "first_payment", referrerAudience: "client", maxReferralsPerReferrer: 20, startsAt: null, endsAt: null, ...audit(ago(60)) },
    { _id: "demo-rcamp-3", name: "New Year Referral Push", isActive: false, qualifyingEvent: "first_offer_claim", referrerAudience: "ALL", maxReferralsPerReferrer: 100, startsAt: fromNow(70), endsAt: fromNow(100), ...audit(ago(5)) },
    { _id: "demo-rcamp-4", name: "Summer Referral 2026", isActive: false, qualifyingEvent: "account_created", referrerAudience: "ALL", maxReferralsPerReferrer: 30, startsAt: fromNow(-140), endsAt: fromNow(-85), ...audit(ago(150)) },
  ]);

  // ---- referral network: later signups referred by earlier ones ----
  const sorted = [...users].sort((a, b) => a.createdAt - b.createdAt);
  const referrals = [];
  const referrerPool = [...users.filter((u) => u._fixed), ...sorted.filter((u) => !u._fixed && (u._leads.length > 1 || chance(0.35)))].slice(0, 36);
  const ledgerEvents = new Map();
  // idempotency keys are globally unique in the ledger (the real app makes a repeat award a no-op), so drop repeats here too
  const usedKeys = new Set();
  const addEv = (uid, ev) => {
    if (ev.key) {
      if (usedKeys.has(ev.key)) return;
      usedKeys.add(ev.key);
    }
    (ledgerEvents.get(uid) ?? ledgerEvents.set(uid, []).get(uid)).push(ev);
  };

  let rn = 0;
  for (const referrer of referrerPool) {
    const nRef = referrer._fixed ? 5 : weighted([[1, 4], [2, 3], [3, 2], [5, 0.7]]);
    const candidates = sorted.filter((u) => u.createdAt > referrer.createdAt && u._id !== referrer._id && !u.referredByCode);
    for (const referee of shuffle(candidates).slice(0, nRef)) {
      rn++;
      const status = weighted([["REWARDED", 6], ["REGISTERED", 1.6], ["FRAUD_HOLD", 0.7], ["REJECTED", 1.2]]);
      const rid = `demo-referral-${rn}`;
      const rewA = rule("referral_referrer", referrer.role)?.amount ?? 250;
      const rewB = rule("referral_referee", referee.role)?.amount ?? 150;
      const createdAt = new Date(referee.createdAt.getTime() + 1000);
      const doc = {
        _id: rid, referrerUserId: referrer._id, referralCode: referrer.referralCode, refereeUserId: referee._id, status, qualifyingEvent: referrer.role === "client" ? "first_payment" : "account_created", campaignId: referrer.role === "client" ? "demo-rcamp-2" : "demo-rcamp-1",
        rewardTransactionId: { referrer: null, referee: null }, rewardAmounts: { referrer: 0, referee: 0 }, qualifiedAt: null, rewardedAt: null, statusReason: null, flags: [], ipHash: `demoip${rint(1, 60)}`, deviceHash: `demodev${rn}`, reviewedBy: null, reviewedAt: null, ...audit(createdAt),
      };
      referee.referredByCode = referrer.referralCode;
      if (status === "REWARDED") {
        doc.qualifiedAt = createdAt;
        doc.rewardedAt = new Date(createdAt.getTime() + 2000);
        doc.rewardAmounts = { referrer: rewA, referee: rewB };
        addEv(referrer._id, { ts: doc.rewardedAt, type: "referral_bonus_referrer", direction: "credit", amount: rewA, days: rule("referral_referrer", referrer.role)?.days ?? 180, key: `referral_referrer:${rid}`, refType: "referral", refId: rid, txSlot: [doc, "referrer"] });
        addEv(referee._id, { ts: doc.rewardedAt, type: "referral_bonus_referee", direction: "credit", amount: rewB, days: rule("referral_referee", referee.role)?.days ?? 90, key: `referral_referee:${rid}`, refType: "referral", refId: rid, txSlot: [doc, "referee"] });
      } else if (status === "FRAUD_HOLD") {
        doc.flags = [pick(["shared_ip", "shared_device", "velocity"])];
        doc.statusReason = `Held for review: ${doc.flags[0]}.`;
      } else if (status === "REJECTED") {
        doc.statusReason = pick(["Referred person shares the referrer's email or phone (self-referral).", "Referrer reached the campaign limit of 50 referrals."]);
      }
      referrals.push(doc);
    }
  }

  // ---- per-user event assembly ----
  const planByStudent = new Map(tms.plans.map((p) => [p.studentId, p]));
  const subsByStudent = new Map();
  for (const s of tms.submissions) (subsByStudent.get(s.studentId) ?? subsByStudent.set(s.studentId, []).get(s.studentId)).push(s);
  const ivByApp = new Map();
  for (const iv of interviews) (ivByApp.get(iv.applicationId) ?? ivByApp.set(iv.applicationId, []).get(iv.applicationId)).push(iv);
  const streakDocs = [];
  const planUpdates = [];

  const act = (uid, u, activity, ts, key, label, subKey = null) => {
    const r = rule(activity, u.role, subKey);
    if (r) addEv(uid, { ts, type: "activity_reward", activity, subKey, direction: "credit", amount: r.amount, days: r.days, key: `activity:${activity}:${key}`, label, refType: "activity" });
  };

  for (const u of users) {
    const uid = u._id;
    const sign = rule("signup", u.role);
    if (sign) addEv(uid, { ts: u.createdAt, type: "signup_bonus", direction: "credit", amount: sign.amount, days: sign.days, key: `signup_bonus:${uid}`, refType: "signup", refId: null });

    // daily visits + streak
    const span = Math.min(u._rich ? 75 : rint(6, 28), Math.floor((NOW - u.createdAt) / DAY));
    const p = u._rich ? 0.9 : rint(3, 7) / 10;
    let streak = 0;
    let best = 0;
    let lastDay = null;
    for (let d = span; d >= 0; d--) {
      const ts = new Date(NOW - d * DAY);
      ts.setHours(rint(8, 21), rint(0, 59));
      if (chance(p) || (d === 0 && u._rich)) {
        streak++;
        best = Math.max(best, streak);
        lastDay = isoDay(new Date(NOW - d * DAY + 5.5 * 3600000));
        act(uid, u, "daily_visit", ts, `${uid}:${isoDay(ts)}`, "Daily Visit");
        if (streak % 7 === 0) act(uid, u, "streak_7", new Date(ts.getTime() + 60000), `${uid}:${isoDay(ts)}`, "7-Day Visit Streak");
      } else streak = 0;
    }
    if (lastDay) streakDocs.push({ _id: uid, lastDay, streak, best });

    if (chance(0.8) || u._rich) act(uid, u, "profile_complete", new Date(u.createdAt.getTime() + DAY), uid, "Profile Completed");
    for (const se of u._stageEvents) act(uid, u, "stage_complete", se.ts, `${uid}:${se.key}`, `Stage completed: ${se.label}`, se.key);

    const myClaims = (claimsByUser.get(uid) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    if (myClaims.length) act(uid, u, "first_offer_claim", myClaims[0].createdAt, uid, "First Offer Claimed");

    if (u.studentId) {
      const plan = planByStudent.get(u.studentId);
      if (plan?.installments.length) act(uid, u, "first_payment", new Date(plan.installments[0].paidOn), uid, "First Payment Made");
      const subs = (subsByStudent.get(u.studentId) ?? []).sort((a, b) => a.submittedAt - b.submittedAt);
      subs.slice(0, 3).forEach((s) => act(uid, u, "assignment_submit", s.submittedAt, `${s.assignmentId}:${u.studentId}`, "Assignment Submitted"));
      subs.filter((s) => s.status === "reviewed").slice(0, 2).forEach((s) => act(uid, u, "assignment_approved", s.reviewedAt, `${s.assignmentId}:${u.studentId}`, "Assignment Approved"));
      if (plan && chance(u._rich ? 1 : 0.3)) planUpdates.push({ planId: plan._id, amount: pick([50, 100, 150, 200]), uid, ts: new Date(NOW - rint(2, 30) * DAY) });
    }
    if (u.applicationId) for (const iv of ivByApp.get(u.applicationId) ?? []) if (iv.status === "completed") act(uid, u, "interview_completed", new Date(iv.scheduledAt.getTime() + 3600000), iv._id, "Interview Completed");

    const rewarded = referrals.filter((r) => r.referrerUserId === uid && r.status === "REWARDED").sort((a, b) => a.rewardedAt - b.rewardedAt);
    rewarded.forEach((r, i) => { if ([3, 5, 10].includes(i + 1)) act(uid, u, "referral_milestone", new Date(r.rewardedAt.getTime() + 3000), `${uid}:${i + 1}`, `Referral milestone: ${i + 1} rewarded referrals`, String(i + 1)); });

    // claims that used wallet credits
    for (const c of myClaims) {
      if (chance(0.3) && c.pricing.finalPrice) {
        const amt = pick([100, 150, 200, 250]);
        c.pricing.walletAmountApplied = amt;
        c.pricing.finalPrice = Math.max(0, c.pricing.finalPrice - amt);
        addEv(uid, { ts: c.createdAt, type: "redemption_confirmed", direction: "debit", amount: amt, key: `offer_claim_wallet:${c._id}:confirmed`, refType: "offer_claim", refId: c._id, metadata: { module: "offers" } });
      }
    }
    if (u._fixed || chance(0.06)) addEv(uid, { ts: ago(rint(3, 25)), type: "manual_adjustment", direction: "credit", amount: pick([50, 100]), days: 60, key: `manual_adjustment:${randomUUID()}`, refType: "admin_adjustment", reason: pick(["Goodwill credit for delayed response", "Contest winner reward", "Compensation for scheduling change"]) });
  }
  for (const pu of planUpdates) addEv(pu.uid, { ts: pu.ts, type: "redemption_confirmed", direction: "debit", amount: pu.amount, key: `product:training:${pu.planId}:${pu.uid}`, refType: "module_charge", refId: pu.planId, metadata: { module: "training", price: 20000 }, plan: pu });

  // client credit redemptions on invoices (spend recorded first so it lands in the ledger)
  const invoiceCredits = [];
  for (const u of users.filter((x) => x.clientId).slice(0, 8)) {
    const inv = pms.invoices.find((i) => i.customerId === u.clientId && i.totalAmount - i.amountPaid - i.amountCredited > 500);
    if (!inv) continue;
    const amt = pick([200, 300, 500]);
    invoiceCredits.push({ inv, amt, uid: u._id });
    addEv(u._id, { ts: ago(rint(2, 25)), type: "redemption_confirmed", direction: "debit", amount: amt, key: `product:projects:${inv._id}:${u._id}`, refType: "module_charge", refId: inv._id, metadata: { module: "projects", price: inv.totalAmount }, invoice: { inv, amt } });
    addEv(u._id, { ts: ago(rint(30, 60)), type: "manual_adjustment", direction: "credit", amount: 600, days: 90, key: `manual_adjustment:${randomUUID()}`, refType: "admin_adjustment", reason: "Loyalty credit" });
  }

  // ---- build ledgers: FIFO lots, expiry, consistent before/after balances ----
  const ledger = [];
  const wallets = [];
  const locks = [];
  const frozen = new Set(referrals.filter((r) => r.status === "FRAUD_HOLD").slice(0, 2).map((r) => r.refereeUserId));
  const appliedPlans = [];
  const appliedInvoices = [];
  for (const u of users) {
    const evs = (ledgerEvents.get(u._id) ?? []).sort((a, b) => a.ts - b.ts);
    let bal = 0, earned = 0, redeemed = 0, expired = 0;
    const lots = [];
    let lastTs = 0; // keeps every row's timestamp ≥ the previous row's, so balanceBefore/After chain reads correctly in date order
    const push = (row) => { row.createdAt = new Date(Math.max(row.createdAt.getTime(), lastTs)); lastTs = row.createdAt.getTime(); ledger.push(row); return row; };
    const expireDue = (ts) => {
      for (const lot of lots) {
        if (lot.remaining > 0 && lot.expiresAt && lot.expiresAt <= ts) {
          const amt = lot.remaining;
          lot.remaining = 0;
          bal -= amt;
          expired += amt;
          if (amt === lot.row.amount) lot.row.status = "expired";
          push({ _id: `demo-tx-${ledger.length + 1}`, userId: u._id, type: "expiry", direction: "debit", bucket: "available", amount: amt, balanceBefore: bal + amt, balanceAfter: bal, status: "active", expiresAt: null, idempotencyKey: `expiry:${lot.row._id}`, referenceType: null, referenceId: lot.row._id, reason: null, metadata: { expiredLotId: lot.row._id }, createdAt: lot.expiresAt, createdBy: null });
        }
      }
    };
    for (const ev of evs) {
      expireDue(ev.ts);
      if (ev.direction === "credit") {
        const row = push({ _id: `demo-tx-${ledger.length + 1}`, userId: u._id, type: ev.type, direction: "credit", bucket: "available", amount: ev.amount, balanceBefore: bal, balanceAfter: bal + ev.amount, status: "active", expiresAt: ev.days ? new Date(ev.ts.getTime() + ev.days * DAY) : null, idempotencyKey: ev.key, referenceType: ev.refType ?? null, referenceId: ev.refId ?? null, reason: ev.reason ?? ev.label ?? null, metadata: ev.activity ? { activity: ev.activity, label: ev.label, subKey: ev.subKey ?? null } : {}, createdAt: ev.ts, createdBy: null });
        bal += ev.amount;
        earned += ev.amount;
        lots.push({ row, remaining: ev.amount, expiresAt: row.expiresAt });
        if (ev.txSlot) ev.txSlot[0].rewardTransactionId[ev.txSlot[1]] = row._id;
      } else {
        if (bal < ev.amount) continue; // never overdraw
        let need = ev.amount;
        for (const lot of lots) {
          if (need <= 0) break;
          const take = Math.min(lot.remaining, need);
          lot.remaining -= take;
          need -= take;
        }
        push({ _id: `demo-tx-${ledger.length + 1}`, userId: u._id, type: ev.type, direction: "debit", bucket: "available", amount: ev.amount, balanceBefore: bal, balanceAfter: bal - ev.amount, status: "active", expiresAt: null, idempotencyKey: ev.key, referenceType: ev.refType ?? null, referenceId: ev.refId ?? null, reason: null, metadata: ev.metadata ?? {}, createdAt: ev.ts, createdBy: null });
        bal -= ev.amount;
        redeemed += ev.amount;
        if (ev.plan) appliedPlans.push(ev.plan);
        if (ev.invoice) appliedInvoices.push(ev.invoice);
      }
      locks.push({ _id: ev.key, claimedAt: ev.ts });
    }
    expireDue(new Date());
    wallets.push({ _id: u._id, role: u.role, balances: { available: bal, pending: 0, locked: 0, lifetimeEarned: earned, lifetimeRedeemed: redeemed, lifetimeExpired: expired, lifetimeReversed: 0 }, currency: "INR", status: frozen.has(u._id) ? "frozen" : "active", ...audit(u.createdAt) });

    for (const t of ledger.filter((x) => x.userId === u._id && x.direction === "credit").slice(-3)) {
      notifications.push({ _id: `demo-nt-${notifications.length + 1}`, recipientUserId: u._id, type: "wallet.credit_earned", title: `🪙 +${t.amount.toLocaleString("en-IN")} credits`, body: `${t.reason ?? "Credits added"} — you earned ${t.amount} YO Credits.`, link: "/clientos/wallet", read: chance(0.6), dedupeKey: null, createdAt: t.createdAt });
    }
  }

  // credits actually redeemed on fee plans / invoices flow through to the real records
  for (const pu of appliedPlans) await db.collection("payments").updateOne({ _id: pu.planId }, { $inc: { discount: pu.amount } });
  for (const { inv, amt } of appliedInvoices) {
    await db.collection("fms_invoices").updateOne({ _id: inv._id }, { $inc: { amountCredited: amt } });
    await db.collection("fms_credit_notes").insertOne({ _id: `demo-cn-w-${inv._id}`, creditNoteNumber: `CRN-2026-W${inv._id.slice(-4)}`, invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, customerId: inv.customerId, customerName: inv.customerName, amount: amt, reason: "Paid with YO Credits", status: "issued", issuedAt: ago(rint(1, 20)), ...audit(ago(5)) });
  }

  // ---- write everything ----
  // ---- "Notify me" subscribers for the upcoming campaigns ----
  const subInterests = ["CLIENT", "STUDENT", "INTERN", "HIRING", null];
  const subscriptions = Array.from({ length: 46 }, (_, i) => {
    const campaignId = weighted([["demo-camp-republic", 5], ["demo-camp-newyear", 3], [null, 2]]);
    const u = i % 3 === 0 ? pick(users) : null;
    const created = ago(rint(0, 12));
    return {
      _id: `demo-sub-${i + 1}`, email: u ? u.email : `subscriber.${i + 1}@prospect.demo.in`, name: u ? u.displayName : chance(0.7) ? personName() : undefined,
      phone: chance(0.5) ? `+91 ${rint(70000, 99999)}${rint(10000, 99999)}` : undefined, interest: pick(subInterests), message: chance(0.15) ? "Looking for a dedicated team for a 3-month build." : undefined,
      campaignId, source: campaignId === "demo-camp-republic" ? "coming_soon" : campaignId ? "future" : "none", notifiedCampaignIds: [], createdAt: created, updatedAt: created,
    };
  }).filter((x, i, a) => a.findIndex((y) => y.email === x.email && y.campaignId === x.campaignId) === i);

  // A real claim cap on some Diwali offers so the public progress bars / sold-out / expiry alerts have true data to show.
  const claimedByOffer = new Map();
  for (const cl of claims) claimedByOffer.set(cl.offerId, (claimedByOffer.get(cl.offerId) ?? 0) + 1);
  activeOffers.forEach((o, i) => {
    const claimed = claimedByOffer.get(o._id) ?? 0;
    if (o._slots) { o.claimLimit = Math.max(o._slots, claimed + 3); return; }
    if (claimed < 3) return;
    if (i === 2) o.claimLimit = claimed; // fully claimed
    else if (i === 4) o.claimLimit = Math.ceil(claimed / 0.88); // almost gone
    else if (i % 3 === 0) o.claimLimit = Math.ceil(claimed / (0.35 + (i % 5) * 0.1));
  });

  for (const c of ["offer_campaigns", "offers", "coupons", "offer_claims", "offer_analytics_events", "offer_subscriptions", "wallets", "wallet_transactions", "referrals"]) await wipe(c);
  // The live app also writes rows for demo users under random UUID ids (expiry sweep, wallet views, referral/notification hooks).
  // Those don't match the demo- id prefix but collide with our idempotency keys, so clear everything that belongs to a demo user too.
  await db.collection("wallet_transactions").deleteMany({ userId: /^demo-/ });
  await db.collection("wallets").deleteMany({ _id: /^demo-/ });
  await db.collection("referrals").deleteMany({ $or: [{ referrerUserId: /^demo-/ }, { refereeUserId: /^demo-/ }] });
  await db.collection("wallet_idempotency_locks").deleteMany({ _id: /demo-/ });
  await db.collection("wallet_streaks").deleteMany({ _id: /^demo-/ });
  await db.collection("wallet_idempotency_locks").deleteMany({ _id: /demo-/ });
  await db.collection("wallet_streaks").deleteMany({ _id: /^demo-/ });
  // remove the generic-shaped promo docs the legacy seeder used to write (wrong schema for this module)
  await db.collection("coupons").deleteMany({ code: /^PROMO2026-/ });
  await db.collection("offers").deleteMany({ offerCode: { $exists: true } });
  await insertAll(db.collection("offer_campaigns"), campaigns);
  for (const o of offers) delete o._slots;
  await insertAll(db.collection("offers"), offers);
  await insertAll(db.collection("coupons"), coupons);
  await insertAll(db.collection("offer_claims"), claims);
  await insertAll(db.collection("offer_subscriptions"), subscriptions);
  await insertAll(db.collection("offer_analytics_events"), evtDocs);
  await insertAll(db.collection("wallets"), wallets);
  await insertAll(db.collection("wallet_transactions"), ledger);
  await insertAll(db.collection("referrals"), referrals);
  await insertAll(db.collection("wallet_idempotency_locks"), locks.filter((l, i, a) => a.findIndex((x) => x._id === l._id) === i));
  await insertAll(db.collection("wallet_streaks"), streakDocs);
  for (const u of users) await db.collection("external_users").updateOne({ _id: u._id }, { $set: { referredByCode: u.referredByCode ?? null, referralCode: u.referralCode } });
  await db.collection("external_notifications").insertMany(notifications, { ordered: false });
  console.log(`  ✓ Offers: ${campaigns.length} campaigns, ${offers.length} offers, ${coupons.length} coupons, ${claims.length} claims, ${evtDocs.length} analytics events`);
  console.log(`  ✓ Wallet: ${wallets.length} wallets, ${ledger.length} ledger rows, ${referrals.length} referrals, ${streakDocs.length} streaks, ${appliedPlans.length} fee-credit redemptions, ${appliedInvoices.length} invoice-credit redemptions, ${notifications.length} portal notifications`);
}
