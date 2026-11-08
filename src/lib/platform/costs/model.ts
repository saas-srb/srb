import { RAZORPAY } from "@/lib/platform/costs/catalog";
import { APP_BUILD, ELEVENLABS, FILE_SEARCH_TOKENS_PER_CALL, GITHUB_ACTIONS, IMAGE_PRICES, MONGODB, OPENAI_FILE_SEARCH, OPENAI_MODELS, RESEND, STORES, VERCEL, VERCEL_REGIONS } from "@/lib/platform/costs/catalog";

/**
 * The cost model behind the Platform Console's Costs & pricing calculator. Pure functions (no database), so the page recomputes
 * instantly as the operator changes an assumption. Money is in rupees here; a plan's stored price is in paise.
 *
 * What the platform really pays, per company per month:
 *   variable  = the providers' usage charges for what the company uses (AI tokens, files, emails, voice minutes)
 *   fixed     = the shared bills (hosting, database, app-store fees …) divided over the paying companies
 *   free      = the cost of the free companies, spread over the paying ones (optional)
 *   gateway   = the payment-gateway fee on the money the company pays
 * and the price that covers them with a small buffer is  (variable + fixed + free) ÷ (1 − gateway − buffer).
 */

export interface FixedItem { id: string; label: string; usdPerMonth: number; on: boolean; note: string }
export interface ModelShare { model: string; pct: number }

export interface CostSettings {
  /** Rupees per US dollar. */
  fxRate: number;
  /** Profit + maintenance buffer, as a percent of the price. Kept small on purpose. */
  marginPct: number;
  gstPct: number;
  gatewayPct: number;
  /** Razorpay's extra fee on recurring (subscription) payments. */
  subscriptionFeePct: number;
  gatewayGstPct: number;
  vercelRegion: string;
  /** How much of each limit a typical company uses (percent). */
  utilization: { ai: number; storage: number; emails: number; voice: number };
  /** Share of AI tokens that are input (prompt) tokens, and of those the share served from cache. */
  inputSharePct: number;
  cachedSharePct: number;
  aiMix: ModelShare[];
  /** Files are downloaded this many times their size each month (transfer cost). */
  egressFactor: number;
  /** Share of AI tokens that go through OpenAI file search (chatbot, AI Bots), which adds a per-search charge. */
  fileSearchSharePct: number;
  /** Total vector-store size across every company, GB (the first GB is free). */
  vectorStoreGb: number;
  /** Minutes one platform build job really runs (GitHub bills the minutes used; the workflow caps it at 75). */
  buildMinutesPerJob: number;
  /** Characters the voice assistant speaks per minute of conversation, and how much of the minute the visitor speaks. */
  speechCharsPerMinute: number;
  visitorSpeakPct: number;
  /** One AI website at sign-up: tokens used and photos made. */
  websiteTokens: number;
  websiteImages: number;
  websiteImageModel: string;
  fixedItems: FixedItem[];
  expectedPayingCompanies: number;
  expectedFreeCompanies: number;
  spreadFixedCost: boolean;
  spreadFreeCost: boolean;
  /** Suggested prices are rounded up to a multiple of this many rupees. */
  roundToInr: number;
}

export const DEFAULT_FIXED_ITEMS: FixedItem[] = [
  { id: "vercel-seat", label: "Vercel Pro (1 seat)", usdPerMonth: VERCEL.proSeatUsdPerMonth, on: true, note: "Official: $20 per seat per month. Includes a $20 usage credit." },
  { id: "vercel-usage", label: "Vercel usage beyond the $20 credit", usdPerMonth: 0, on: true, note: "Read it from your Vercel invoice once you have paying companies; $0 until the credit is used up." },
  { id: "mongodb", label: `MongoDB Atlas ${MONGODB.m10.label}`, usdPerMonth: MONGODB.m10.usdPerMonth, on: true, note: "Official 'starts at' price. Use Flex ($8–$30) while the data is small; check your region in the Atlas console." },
  { id: "mongodb-backup", label: "MongoDB Cloud Backup", usdPerMonth: 0, on: false, note: "$0.14–$0.19 per GB-month of your data. Switch on and enter the amount if you use it." },
  { id: "apple", label: "Apple Developer Program", usdPerMonth: Math.round((STORES.appleDeveloperUsdPerYear / 12) * 100) / 100, on: true, note: "Official: $99 a year, for the iOS / macOS apps." },
  { id: "google", label: "Google Play Console", usdPerMonth: Math.round((STORES.googlePlayUsdOnce / 36) * 100) / 100, on: true, note: "Official: $25 one-time, spread over 3 years." },
];

export const DEFAULT_SETTINGS: CostSettings = {
  fxRate: 96.5,
  marginPct: 10,
  gstPct: 18,
  gatewayPct: 2,
  subscriptionFeePct: RAZORPAY.subscriptionFeePct,
  gatewayGstPct: 18,
  vercelRegion: "iad1",
  utilization: { ai: 25, storage: 40, emails: 25, voice: 15 },
  inputSharePct: 70,
  cachedSharePct: 20,
  aiMix: [{ model: "gpt-4.1", pct: 50 }, { model: "gpt-4.1-mini", pct: 40 }, { model: "gpt-4o-mini", pct: 10 }],
  egressFactor: 0.25,
  fileSearchSharePct: 100,
  vectorStoreGb: 0,
  buildMinutesPerJob: APP_BUILD.timeoutMinutes,
  speechCharsPerMinute: 900,
  visitorSpeakPct: 40,
  websiteTokens: 150_000,
  websiteImages: 3,
  websiteImageModel: "gpt-image-1",
  fixedItems: DEFAULT_FIXED_ITEMS,
  expectedPayingCompanies: 50,
  expectedFreeCompanies: 200,
  spreadFixedCost: true,
  spreadFreeCost: true,
  roundToInr: 10,
};

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback);

/** Brings anything stored or submitted back into range, so a bad value can never reach a calculation. */
export function sanitizeSettings(raw: Partial<CostSettings> | null | undefined): CostSettings {
  const d = DEFAULT_SETTINGS;
  const r = raw ?? {};
  const known = new Set(OPENAI_MODELS.map((m) => m.id));
  const mix = (Array.isArray(r.aiMix) ? r.aiMix : d.aiMix).filter((m) => m && known.has(m.model)).map((m) => ({ model: m.model, pct: clamp(m.pct, 0, 100, 0) }));
  const fixedById = new Map((Array.isArray(r.fixedItems) ? r.fixedItems : []).map((f) => [f?.id, f]));
  return {
    fxRate: clamp(r.fxRate, 1, 1000, d.fxRate),
    marginPct: clamp(r.marginPct, 0, 60, d.marginPct),
    gstPct: clamp(r.gstPct, 0, 40, d.gstPct),
    gatewayPct: clamp(r.gatewayPct, 0, 10, d.gatewayPct),
    subscriptionFeePct: clamp(r.subscriptionFeePct, 0, 5, d.subscriptionFeePct),
    vercelRegion: typeof r.vercelRegion === "string" && VERCEL_REGIONS[r.vercelRegion] ? r.vercelRegion : d.vercelRegion,
    gatewayGstPct: clamp(r.gatewayGstPct, 0, 40, d.gatewayGstPct),
    utilization: { ai: clamp(r.utilization?.ai, 0, 100, d.utilization.ai), storage: clamp(r.utilization?.storage, 0, 100, d.utilization.storage), emails: clamp(r.utilization?.emails, 0, 100, d.utilization.emails), voice: clamp(r.utilization?.voice, 0, 100, d.utilization.voice) },
    inputSharePct: clamp(r.inputSharePct, 0, 100, d.inputSharePct),
    cachedSharePct: clamp(r.cachedSharePct, 0, 100, d.cachedSharePct),
    aiMix: mix.length > 0 && mix.reduce((s, m) => s + m.pct, 0) > 0 ? mix : d.aiMix,
    egressFactor: clamp(r.egressFactor, 0, 50, d.egressFactor),
    fileSearchSharePct: clamp(r.fileSearchSharePct, 0, 100, d.fileSearchSharePct),
    vectorStoreGb: clamp(r.vectorStoreGb, 0, 100_000, d.vectorStoreGb),
    buildMinutesPerJob: clamp(r.buildMinutesPerJob, 1, APP_BUILD.timeoutMinutes, d.buildMinutesPerJob),
    speechCharsPerMinute: clamp(r.speechCharsPerMinute, 100, 3000, d.speechCharsPerMinute),
    visitorSpeakPct: clamp(r.visitorSpeakPct, 0, 100, d.visitorSpeakPct),
    websiteTokens: clamp(r.websiteTokens, 0, 5_000_000, d.websiteTokens),
    websiteImages: clamp(r.websiteImages, 0, 20, d.websiteImages),
    websiteImageModel: typeof r.websiteImageModel === "string" && IMAGE_PRICES[r.websiteImageModel] ? r.websiteImageModel : d.websiteImageModel,
    fixedItems: DEFAULT_FIXED_ITEMS.map((f) => {
      const s = fixedById.get(f.id);
      return { ...f, usdPerMonth: clamp(s?.usdPerMonth, 0, 100_000, f.usdPerMonth), on: typeof s?.on === "boolean" ? s.on : f.on };
    }),
    expectedPayingCompanies: Math.round(clamp(r.expectedPayingCompanies, 1, 1_000_000, d.expectedPayingCompanies)),
    expectedFreeCompanies: Math.round(clamp(r.expectedFreeCompanies, 0, 10_000_000, d.expectedFreeCompanies)),
    spreadFixedCost: typeof r.spreadFixedCost === "boolean" ? r.spreadFixedCost : d.spreadFixedCost,
    spreadFreeCost: typeof r.spreadFreeCost === "boolean" ? r.spreadFreeCost : d.spreadFreeCost,
    roundToInr: Math.round(clamp(r.roundToInr, 1, 1000, d.roundToInr)),
  };
}

// ── unit costs ──────────────────────────────────────────────────────────────

export interface UnitCosts {
  /** Rupees per 1,000 AI tokens, blended over the model mix and the input / output split. */
  aiPerThousandTokens: number;
  /** Rupees to keep one MB for a month (storage + the downloads of it). */
  storagePerMbMonth: number;
  /** Rupees per email sent. */
  perEmail: number;
  /** Rupees per minute of voice conversation. */
  perVoiceMinute: number;
  /** One AI website at sign-up. */
  websiteOnce: number;
  /** One full app build (all five platforms) for a company, rupees; GitHub's free minutes come off first. */
  appBuildOnce: number;
  appBuildMinutes: number;
  /** The gateway's cut as a share of the ex-GST price. */
  gatewayShare: number;
  fixedMonthlyInr: number;
  usd: (n: number) => number;
}

export function unitCosts(s: CostSettings): UnitCosts {
  const fx = s.fxRate;
  const total = s.aiMix.reduce((a, m) => a + m.pct, 0) || 1;
  const i = s.inputSharePct / 100;
  const c = s.cachedSharePct / 100;
  let perMillionUsd = 0;
  for (const m of s.aiMix) {
    const model = OPENAI_MODELS.find((x) => x.id === m.model);
    if (!model) continue;
    const input = (1 - c) * model.input + c * model.cachedInput;
    perMillionUsd += (m.pct / total) * (i * input + (1 - i) * model.output);
  }
  // Chatbot / AI Bots answers use file search: each search is billed per call (its retrieved chunks are already inside the input tokens).
  perMillionUsd += (s.fileSearchSharePct / 100) * (1_000_000 / FILE_SEARCH_TOKENS_PER_CALL) * (OPENAI_FILE_SEARCH.perThousandCalls / 1000);
  const v = VERCEL_REGIONS[s.vercelRegion] ?? VERCEL_REGIONS.iad1;
  // A private file is delivered through a function: the function fetches it from Blob (Blob transfer + origin transfer), then sends it to the browser (data transfer + origin transfer).
  const deliveryUsdPerGb = v.blobTransferPerGb + v.fastOriginTransferPerGb + v.fastDataTransferPerGb + v.fastOriginTransferPerGb;
  const storageUsdPerGb = v.blobStoragePerGbMonth + s.egressFactor * deliveryUsdPerGb;
  const emailUsd = RESEND.pro.usdPerMonth / RESEND.pro.emails;
  const speakingMinuteUsd = (s.speechCharsPerMinute / 1000) * ELEVENLABS.ttsFlashTurboPerThousandChars;
  const listeningMinuteUsd = ((s.visitorSpeakPct / 100) * ELEVENLABS.scribePerHour) / 60;
  const img = IMAGE_PRICES[s.websiteImageModel] ?? IMAGE_PRICES["gpt-image-1"];
  const websiteUsd = (s.websiteTokens / 1_000_000) * perMillionUsd + s.websiteImages * img.low[2];
  const gatewayFee = ((s.gatewayPct + s.subscriptionFeePct) / 100) * (1 + s.gatewayGstPct / 100); // on the GST-inclusive payment
  const gatewayShare = gatewayFee * (1 + s.gstPct / 100); // as a share of the ex-GST price
  const vectorUsd = Math.max(0, s.vectorStoreGb - OPENAI_FILE_SEARCH.freeGb) * OPENAI_FILE_SEARCH.storagePerGbDay * 30;
  const fixedUsd = s.fixedItems.filter((f) => f.on).reduce((a, f) => a + f.usdPerMonth, 0) + vectorUsd;
  const rate = { windows: GITHUB_ACTIONS.windowsPerMin, macos: GITHUB_ACTIONS.macosPerMin, linux: GITHUB_ACTIONS.linuxPerMin } as const;
  const buildUsd = APP_BUILD.platforms.reduce((a, p) => a + s.buildMinutesPerJob * rate[p.runner], 0);
  return {
    aiPerThousandTokens: (perMillionUsd / 1000) * fx,
    storagePerMbMonth: (storageUsdPerGb / 1024) * fx,
    perEmail: emailUsd * fx,
    perVoiceMinute: (speakingMinuteUsd + listeningMinuteUsd) * fx,
    websiteOnce: websiteUsd * fx,
    appBuildOnce: buildUsd * fx,
    appBuildMinutes: s.buildMinutesPerJob * APP_BUILD.platforms.length,
    gatewayShare,
    fixedMonthlyInr: fixedUsd * fx,
    usd: (n) => n / fx,
  };
}

// ── per plan ────────────────────────────────────────────────────────────────

export interface PlanInputForCost {
  id: string;
  name: string;
  /** Monthly price in paise, before GST (0 for free / contact-sales). */
  priceMonthlyPaise: number;
  limits: { aiTokensPerMonth: number | null; storageMb: number | null; emailsPerMonth: number | null; voiceMinutesPerMonth: number | null; seats: number | null };
  lifetimeFree: boolean;
  contactSales: boolean;
  companies: number;
}

export interface CostParts { ai: number; storage: number; emails: number; voice: number; total: number }

export type Health = "loss" | "thin" | "healthy" | "free" | "custom";

export interface PlanCostRow {
  plan: PlanInputForCost;
  /** Rupees, per company per month. */
  typical: CostParts;
  worst: CostParts;
  /** Unlimited limits can't be costed: those meters are listed here. */
  unlimited: string[];
  fixedShare: number;
  freeShare: number;
  gatewayAtCurrent: number;
  currentPrice: number;
  /** Money left per company per month at the current price (rupees). */
  leftTypical: number;
  leftWorst: number;
  marginTypicalPct: number | null;
  /** Rupees, before GST. */
  breakEven: number;
  recommended: number;
  safe: number;
  /** Limits that keep a company using EVERYTHING profitable at today's price (null when today's limits already are). */
  safeLimits: { scale: number; ai: number | null; storageMb: number | null; emails: number | null; voice: number | null } | null;
  health: Health;
}

const parts = (ai: number, storage: number, emails: number, voice: number): CostParts => ({ ai, storage, emails, voice, total: ai + storage + emails + voice });

/** What one company on this plan costs when it uses `util` (0–1) of every limit (1 = every limit used to the full). */
function usageCost(limits: PlanInputForCost["limits"], u: { ai: number; storage: number; emails: number; voice: number }, unit: UnitCosts, unlimited: string[]): CostParts {
  const pick = (v: number | null, label: string) => { if (v === null) { if (!unlimited.includes(label)) unlimited.push(label); return 0; } return v; };
  return parts(
    (pick(limits.aiTokensPerMonth, "AI tokens") / 1000) * unit.aiPerThousandTokens * u.ai,
    pick(limits.storageMb, "Storage") * unit.storagePerMbMonth * u.storage,
    pick(limits.emailsPerMonth, "Emails") * unit.perEmail * u.emails,
    pick(limits.voiceMinutesPerMonth, "Voice minutes") * unit.perVoiceMinute * u.voice,
  );
}

const ceilTo = (n: number, step: number) => Math.ceil(Math.max(0, n) / step) * step;

export function computePlans(plans: PlanInputForCost[], s: CostSettings): { rows: PlanCostRow[]; unit: UnitCosts; free: { typical: number; worst: number; companies: number; subsidyPerPaying: number } } {
  const unit = unitCosts(s);
  const u = { ai: s.utilization.ai / 100, storage: s.utilization.storage / 100, emails: s.utilization.emails / 100, voice: s.utilization.voice / 100 };
  const full = { ai: 1, storage: 1, emails: 1, voice: 1 };
  const costOf = (p: PlanInputForCost) => {
    const unlimited: string[] = [];
    return { typical: usageCost(p.limits, u, unit, unlimited), worst: usageCost(p.limits, full, unit, unlimited), unlimited };
  };
  const freePlan = plans.find((p) => p.lifetimeFree) ?? plans.find((p) => p.priceMonthlyPaise === 0 && !p.contactSales);
  const freeCost = freePlan ? costOf(freePlan) : null;
  const payingN = Math.max(1, s.expectedPayingCompanies);
  const freeTotal = (freeCost?.typical.total ?? 0) * s.expectedFreeCompanies;
  const subsidyPerPaying = s.spreadFreeCost ? freeTotal / payingN : 0;
  const fixedShare = s.spreadFixedCost ? unit.fixedMonthlyInr / payingN : 0;
  const keep = 1 - unit.gatewayShare - s.marginPct / 100;

  const rows = plans.map<PlanCostRow>((plan) => {
    const { typical, worst, unlimited } = costOf(plan);
    const isFree = plan === freePlan || (plan.priceMonthlyPaise === 0 && !plan.contactSales);
    const price = plan.priceMonthlyPaise / 100;
    const gateway = price * unit.gatewayShare;
    const shares = isFree ? 0 : fixedShare + subsidyPerPaying;
    const breakEven = isFree ? 0 : (typical.total + shares) / (1 - unit.gatewayShare);
    const recommended = isFree || plan.contactSales ? 0 : ceilTo((typical.total + shares) / Math.max(0.05, keep), s.roundToInr);
    const safe = isFree || plan.contactSales ? 0 : ceilTo((worst.total + shares) / Math.max(0.05, keep), s.roundToInr);
    const leftTypical = price - gateway - typical.total - shares;
    const leftWorst = price - gateway - worst.total - shares;
    const budget = price * (1 - unit.gatewayShare - s.marginPct / 100) - shares;
    const scale = worst.total > 0 && !isFree && !plan.contactSales && price > 0 ? Math.max(0, budget) / worst.total : 1;
    const roundDown = (v: number | null, step: number) => (v === null ? null : Math.max(0, Math.floor((v * scale) / step) * step));
    const safeLimits = scale >= 1 || isFree || plan.contactSales || price === 0 ? null : { scale, ai: roundDown(plan.limits.aiTokensPerMonth, 10_000), storageMb: roundDown(plan.limits.storageMb, 100), emails: roundDown(plan.limits.emailsPerMonth, 100), voice: roundDown(plan.limits.voiceMinutesPerMonth, 5) };
    const health: Health = plan.contactSales ? "custom" : isFree ? "free" : leftWorst < 0 ? (leftTypical < 0 ? "loss" : "thin") : leftTypical / Math.max(price, 1) < s.marginPct / 200 ? "thin" : "healthy";
    return { plan, typical, worst, unlimited, fixedShare: shares === 0 ? 0 : fixedShare, freeShare: isFree ? 0 : subsidyPerPaying, gatewayAtCurrent: gateway, currentPrice: price, leftTypical, leftWorst, marginTypicalPct: price > 0 ? (leftTypical / price) * 100 : null, breakEven, recommended, safe, safeLimits, health };
  });
  return { rows, unit, free: { typical: freeCost?.typical.total ?? 0, worst: freeCost?.worst.total ?? 0, companies: s.expectedFreeCompanies, subsidyPerPaying } };
}

export const inr = (n: number, dp = 0) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
