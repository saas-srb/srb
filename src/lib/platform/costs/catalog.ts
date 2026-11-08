/**
 * What the platform pays its providers, in the providers' own currency and unit — copied from their official pricing pages on the date
 * shown. Pure data (no server imports), so the calculator can use it in the browser. Prices change: every row carries its source link and the
 * date it was read, and `verified: false` marks a figure the page didn't state outright (derived, or from a secondary source) so it is
 * checked before anyone relies on it. Edit this file when a provider changes a price; the calculator and the plan suggestions follow.
 */

export const PRICES_AS_OF = "14 Oct 2026";

export interface OpenAiModel {
  id: string;
  label: string;
  /** USD per 1M tokens. */
  input: number;
  cachedInput: number;
  output: number;
}

/** https://developers.openai.com/api/docs/pricing — standard (non-batch) processing. */
export const OPENAI_MODELS: OpenAiModel[] = [
  { id: "gpt-4.1", label: "GPT-4.1", input: 2.0, cachedInput: 0.5, output: 8.0 },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", input: 0.4, cachedInput: 0.1, output: 1.6 },
  { id: "gpt-4.1-nano", label: "GPT-4.1 nano", input: 0.1, cachedInput: 0.025, output: 0.4 },
  { id: "gpt-4o", label: "GPT-4o", input: 2.5, cachedInput: 1.25, output: 10.0 },
  { id: "gpt-4o-mini", label: "GPT-4o mini", input: 0.15, cachedInput: 0.075, output: 0.6 },
  { id: "gpt-5-mini", label: "GPT-5 mini", input: 0.25, cachedInput: 0.025, output: 2.0 },
];

/** Embeddings, USD per 1M tokens. */
export const OPENAI_EMBEDDINGS = [
  { id: "text-embedding-3-small", label: "Embeddings small", perMillion: 0.02 },
  { id: "text-embedding-3-large", label: "Embeddings large", perMillion: 0.13 },
];

/** https://developers.openai.com/api/docs/guides/image-generation — USD per image, by quality and size. */
export const IMAGE_PRICES: Record<string, { label: string; low: [number, number, number]; medium: [number, number, number]; high: [number, number, number] }> = {
  // [1024x1024, 1024x1536, 1536x1024]
  "gpt-image-1": { label: "GPT Image 1", low: [0.011, 0.016, 0.016], medium: [0.042, 0.063, 0.063], high: [0.167, 0.25, 0.25] },
  "gpt-image-1-mini": { label: "GPT Image 1 mini", low: [0.005, 0.006, 0.006], medium: [0.011, 0.015, 0.015], high: [0.036, 0.052, 0.052] },
};

/** Vector-store ("file search") — https://developers.openai.com/api/docs/pricing */
export const OPENAI_FILE_SEARCH = { storagePerGbDay: 0.1, freeGb: 1, perThousandCalls: 2.5 };

/** https://elevenlabs.io/pricing/api */
export const ELEVENLABS = {
  ttsFlashTurboPerThousandChars: 0.04,
  ttsMultilingualV2PerThousandChars: 0.08,
  scribePerHour: 0.22,
  plans: [
    { name: "Free", usdPerMonth: 0, flashChars: 20_000, scribeHours: 4.5 },
    { name: "Starter", usdPerMonth: 6, flashChars: 150_000, scribeHours: 27 },
    { name: "Creator", usdPerMonth: 22, flashChars: 550_000, scribeHours: 100 },
    { name: "Pro", usdPerMonth: 99, flashChars: 2_475_000, scribeHours: 450 },
    { name: "Scale", usdPerMonth: 299, flashChars: 7_475_000, scribeHours: 1_359 },
    { name: "Business", usdPerMonth: 990, flashChars: 24_750_000, scribeHours: 4_500 },
  ],
};

/** https://resend.com/pricing */
export const RESEND = {
  free: { usdPerMonth: 0, emails: 3_000, perDay: 100 },
  pro: { usdPerMonth: 20, emails: 50_000 },
  pro100k: { usdPerMonth: 35, emails: 100_000 },
  scale: { usdPerMonth: 90, emails: 100_000 },
  overagePerThousand: 0.9,
};

/** Vercel Pro: https://vercel.com/pricing. The regional rates are the ones on each region's own page, https://vercel.com/docs/pricing/regional-pricing/<region>. */
export const VERCEL = {
  proSeatUsdPerMonth: 20,
  includedUsageCreditUsd: 20,
  buildPerMinute: 0.007,
  /** Soft limit of custom domains per project on Pro (Vercel docs, Limits). */
  proDomainsPerProject: 100_000,
};

export interface VercelRegionRates {
  id: string;
  label: string;
  fastDataTransferPerGb: number;
  fastOriginTransferPerGb: number;
  activeCpuPerHour: number;
  provisionedMemoryPerGbHour: number;
  invocationsPerMillion: number;
  blobStoragePerGbMonth: number;
  blobSimpleOpsPerMillion: number;
  blobAdvancedOpsPerMillion: number;
  blobTransferPerGb: number;
}

export const VERCEL_REGIONS: Record<string, VercelRegionRates> = {
  iad1: { id: "iad1", label: "Washington D.C. (iad1)", fastDataTransferPerGb: 0.15, fastOriginTransferPerGb: 0.06, activeCpuPerHour: 0.128, provisionedMemoryPerGbHour: 0.0106, invocationsPerMillion: 0.6, blobStoragePerGbMonth: 0.023, blobSimpleOpsPerMillion: 0.4, blobAdvancedOpsPerMillion: 5, blobTransferPerGb: 0.05 },
  bom1: { id: "bom1", label: "Mumbai (bom1)", fastDataTransferPerGb: 0.2, fastOriginTransferPerGb: 0.25, activeCpuPerHour: 0.14, provisionedMemoryPerGbHour: 0.0116, invocationsPerMillion: 0.6, blobStoragePerGbMonth: 0.025, blobSimpleOpsPerMillion: 0.4, blobAdvancedOpsPerMillion: 5, blobTransferPerGb: 0.067 },
};

/** https://www.mongodb.com/pricing — USD. */
/** Cloud Backup per GB-month (AWS), https://www.mongodb.com/docs/atlas/billing/cluster-configuration-costs/ */
export const MONGODB_BACKUP_PER_GB_MONTH = { low: 0.14, high: 0.19 };

/** File search: default 800-token chunks and 10 results per search (OpenAI Retrieval guide) = about 8,000 retrieved tokens billed as input per search. */
export const FILE_SEARCH_TOKENS_PER_CALL = 800 * 10;

export const MONGODB = {
  m0: { label: "M0 (free, 512 MB)", usdPerMonth: 0 },
  flash: { label: "Flex (up to 5 GB)", usdPerMonthMin: 8, usdPerMonthMax: 30 },
  m10: { label: "M10 dedicated (2 GB RAM)", usdPerHour: 0.08, usdPerMonth: 56.94 },
  m20: { label: "M20 dedicated (4 GB RAM)", usdPerHour: 0.2, usdPerMonth: 146 },
  m30: { label: "M30 dedicated (8 GB RAM)", usdPerHour: 0.54, usdPerMonth: 394 },
};

/** https://razorpay.com/pricing/ — percent of the amount paid; GST at 18% is charged on the fee. */
export const RAZORPAY = { domesticPct: 2, internationalPct: 3, gstOnFeePct: 18, /** Recurring (subscription) payments carry this on top of the method's fee. */ subscriptionFeePct: 0.99 };

/** https://razorpay.com/x/payouts_x/ — the COMPANY's own payout cost (not the platform's); shown for reference. */
export const RAZORPAYX_PAYOUT_INR = { impsUpiBelow1k: 4, impsUpi1kTo25k: 6, impsUpiAbove25k: 9, neftRtgs: 5 };

/** https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions — USD per minute beyond the free minutes. */
/**
 * The Apps workflow (.github/workflows/desktop.yml) builds Windows, macOS, Linux, Android and iOS for every company, each job with a
 * `timeout-minutes: 75`. GitHub bills the minutes a job really runs; the timeout is the most it can ever bill, so it is used as the upper bound.
 */
export const APP_BUILD = { timeoutMinutes: 75, platforms: [{ id: "win", runner: "windows" }, { id: "mac", runner: "macos" }, { id: "linux", runner: "linux" }, { id: "android", runner: "linux" }, { id: "ios", runner: "macos" }] as const };

export const GITHUB_ACTIONS = { linuxPerMin: 0.006, windowsPerMin: 0.01, macosPerMin: 0.062, freeMinutes: { free: 2_000, pro: 3_000, team: 3_000 } };

/** Apple: developer.apple.com/programs/enroll. Google: Play Console Help (support.google.com/googleplay/android-developer/answer/6112435). */
export const STORES = { appleDeveloperUsdPerYear: 99, googlePlayUsdOnce: 25 };

export interface PriceRow {
  provider: string;
  item: string;
  price: string;
  note?: string;
  source: string;
  /** false = not stated outright on the page (derived from other figures, or from a secondary source): check before relying on it. */
  verified: boolean;
}

/** The list shown on the page, so everyone can see exactly which price each number comes from. */
export const PRICE_LIST: PriceRow[] = [
  ...OPENAI_MODELS.map<PriceRow>((m) => ({ provider: "OpenAI", item: `${m.label} — text tokens`, price: `$${m.input} in · $${m.cachedInput} cached · $${m.output} out`, note: "per 1M tokens", source: "https://developers.openai.com/api/docs/pricing", verified: true })),
  ...OPENAI_EMBEDDINGS.map<PriceRow>((m) => ({ provider: "OpenAI", item: m.label, price: `$${m.perMillion}`, note: "per 1M tokens", source: "https://developers.openai.com/api/docs/pricing", verified: true })),
  { provider: "OpenAI", item: "GPT Image 1 — image per 1536×1024", price: "$0.016 low · $0.063 medium · $0.25 high", note: "per image", source: "https://developers.openai.com/api/docs/guides/image-generation", verified: true },
  { provider: "OpenAI", item: "GPT Image 1 mini — image per 1536×1024", price: "$0.006 low · $0.015 medium · $0.052 high", note: "per image", source: "https://developers.openai.com/api/docs/guides/image-generation", verified: true },
  { provider: "ElevenLabs", item: "Text to speech — Flash / Turbo", price: "$0.04 per 1,000 characters", source: "https://elevenlabs.io/pricing/api", verified: true },
  { provider: "ElevenLabs", item: "Text to speech — Multilingual v2", price: "$0.08 per 1,000 characters", source: "https://elevenlabs.io/pricing/api", verified: true },
  { provider: "ElevenLabs", item: "Speech to text — Scribe v2 (realtime $0.39)", price: "$0.22 per hour", note: "the app calls scribe_v1, which the page no longer lists — Scribe v2 is used as its price", source: "https://elevenlabs.io/pricing/api", verified: false },
  { provider: "ElevenLabs", item: "Subscription plans (not needed: API usage is billed in dollars)", price: "Free $0 · Starter $6 · Creator $22 · Pro $99 · Scale $299 · Business $990 per month", note: "plan-to-allowance matching read by row order on the page", source: "https://elevenlabs.io/pricing/api", verified: false },
  { provider: "Resend", item: "Email", price: "Free 3,000/mo (100/day) · Pro $20 for 50,000 · Scale $90 for 100,000", note: "overage $0.90 per 1,000", source: "https://resend.com/pricing", verified: true },
  { provider: "Vercel", item: "Pro plan", price: "$20 per month per seat, includes $20 usage credit", source: "https://vercel.com/pricing", verified: true },
      { provider: "Vercel Blob", item: "Washington D.C. (iad1)", price: "storage $0.023/GB-mo · transfer $0.05/GB · simple ops $0.40/1M · advanced ops $5/1M", source: "https://vercel.com/docs/pricing/regional-pricing/iad1", verified: true },
  { provider: "Vercel Blob", item: "Mumbai (bom1)", price: "storage $0.025/GB-mo · transfer $0.067/GB · simple ops $0.40/1M · advanced ops $5/1M", source: "https://vercel.com/docs/pricing/regional-pricing/bom1", verified: true },
  { provider: "Vercel", item: "Functions & data transfer — Washington D.C.", price: "Active CPU $0.128/hr · memory $0.0106/GB-hr · Fast Data Transfer $0.15/GB · Fast Origin Transfer $0.06/GB", source: "https://vercel.com/docs/pricing/regional-pricing/iad1", verified: true },
  { provider: "Vercel", item: "Functions & data transfer — Mumbai", price: "Active CPU $0.14/hr · memory $0.0116/GB-hr · Fast Data Transfer $0.20/GB · Fast Origin Transfer $0.25/GB", source: "https://vercel.com/docs/pricing/regional-pricing/bom1", verified: true },
  { provider: "Vercel", item: "Custom domains per project (Pro)", price: "unlimited (soft limit 100,000)", note: "customer domains cost nothing extra", source: "https://vercel.com/docs/limits", verified: true },
  { provider: "Vercel", item: "Builds", price: "$0.007 per build minute (paid teams)", source: "https://vercel.com/docs/pricing", verified: true },
  { provider: "MongoDB Atlas", item: "Dedicated clusters", price: "M10 $0.08/hr (starts at $56.94/mo) · M20 $0.20/hr · M30 $0.54/hr", note: "regional prices are shown in the Atlas console; M20/M30 monthly = hourly × 730 (not published)", source: "https://www.mongodb.com/pricing", verified: false },
  { provider: "MongoDB Atlas", item: "Cloud Backup (AWS)", price: "$0.14–$0.19 per GB-month", source: "https://www.mongodb.com/docs/atlas/billing/cluster-configuration-costs/", verified: true },
  { provider: "MongoDB Atlas", item: "Flex / Free", price: "Flex $8–$30 per month (5 GB) · M0 free (512 MB)", source: "https://www.mongodb.com/pricing", verified: true },
  { provider: "Razorpay", item: "Payment gateway", price: "2% domestic (cards, UPI platform fee, netbanking) · 3% international · +18% GST on the fee", source: "https://razorpay.com/pricing/", verified: true },
  { provider: "Razorpay", item: "Recurring (subscription) payments", price: "+0.99% subscription fee on top of the method fee; e-mandate / NACH on request", note: "no setup fee, no annual fee", source: "https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/", verified: true },
  { provider: "RazorpayX", item: "Payouts (company's own cost)", price: "IMPS/UPI ₹4 (<₹1k) · ₹6 (₹1k–25k) · ₹9 (>₹25k) · NEFT/RTGS ₹5 + GST", source: "https://razorpay.com/x/payouts_x/", verified: true },
  { provider: "GitHub Actions", item: "App builds (private repos)", price: "Linux $0.006 · Windows $0.010 · macOS $0.062 per minute; 2,000 free minutes on the Free plan", source: "https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions", verified: true },
  { provider: "Apple", item: "Developer Program (iOS / macOS apps)", price: "$99 per year", source: "https://developer.apple.com/programs/enroll/", verified: true },
  { provider: "Google", item: "Play Console (Android apps)", price: "$25 one-time registration", source: "https://support.google.com/googleplay/android-developer/answer/6112435", verified: true },
  { provider: "OpenAI", item: "File search per search / vector storage", price: "$2.50 per 1,000 searches · $0.10 per GB per day beyond 1 GB free", note: "a search retrieves 10 × 800-token chunks by default, billed as input tokens", source: "https://developers.openai.com/api/docs/guides/retrieval", verified: true },
  { provider: "GitHub Actions", item: "Apps workflow (5 platforms per company)", price: "each job is capped at 75 minutes: Windows $0.010 · macOS $0.062 · Linux $0.006 per minute", note: "upper bound; free minutes first", source: "https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions", verified: true },
];
