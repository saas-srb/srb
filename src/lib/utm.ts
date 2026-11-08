/**
 * UTM capture + ad-platform inference. Plain module (no `server-only`) — imported
 * by the client-side capture hook AND by server-side lead validation, so it must
 * stay free of both browser and Node APIs.
 *
 * The public marketing forms don't ask "where did you come from"; instead we read
 * the `utm_*` query params the ad platforms append to landing-page URLs, persist
 * them first-touch in the browser, and attach them to the lead on submit. When
 * `utm_source` names a known ad platform, that becomes the lead's `source`
 * ("meta" | "google" | "linkedin") and `utm_campaign` becomes its `campaign` —
 * which is what the Campaign Analytics module joins against.
 */

export type CampaignPlatform = "meta" | "google" | "linkedin";

export interface Utm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

/** Query-param name -> Utm key. */
export const UTM_QUERY_KEYS: Record<string, keyof Utm> = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_content: "content",
  utm_term: "term",
};

/** FormData field name <-> Utm key, used on both the submit and validate sides. */
export const UTM_FORM_FIELDS: Record<string, keyof Utm> = {
  utmSource: "source",
  utmMedium: "medium",
  utmCampaign: "campaign",
  utmContent: "content",
  utmTerm: "term",
};

const MAX_UTM_LEN = 200;

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_UTM_LEN);
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Normalize a raw utm-ish object, dropping empty values. Returns `undefined` when nothing survives. */
export function normalizeUtm(raw: Partial<Record<keyof Utm, unknown>> | null | undefined): Utm | undefined {
  if (!raw) return undefined;
  const out: Utm = {};
  for (const key of ["source", "medium", "campaign", "content", "term"] as const) {
    const v = clean(raw[key]);
    if (v) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Parse `utm_*` params out of a URL query string (`location.search` or similar). */
export function parseUtmFromSearch(search: string): Utm | undefined {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return undefined;
  }
  const raw: Partial<Record<keyof Utm, unknown>> = {};
  for (const [queryKey, utmKey] of Object.entries(UTM_QUERY_KEYS)) {
    const value = params.get(queryKey);
    if (value) raw[utmKey] = value;
  }
  return normalizeUtm(raw);
}

/** Read utm values from a FormData-like getter (`name => value | null`). */
export function utmFromFormLike(get: (name: string) => unknown): Utm | undefined {
  const raw: Partial<Record<keyof Utm, unknown>> = {};
  for (const [field, utmKey] of Object.entries(UTM_FORM_FIELDS)) {
    raw[utmKey] = get(field);
  }
  return normalizeUtm(raw);
}

/**
 * Normalized campaign key — the join/dedupe identity shared by leads and imported
 * campaign rows. Lowercased, whitespace-collapsed, punctuation-trimmed so
 * "Spring_Launch " and "spring launch" resolve to the same campaign.
 */
export function campaignKeyFor(name: string | undefined | null): string | undefined {
  if (typeof name !== "string") return undefined;
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .replace(/[^a-z0-9 &/.\-]+/g, "")
    .trim();
  return key.length > 0 ? key : undefined;
}

// utm_source token -> platform. Keys are matched case-insensitively after
// stripping non-alphanumerics, so "Google Ads", "google-ads", "googleads" all hit.
const PLATFORM_BY_SOURCE_TOKEN: Record<string, CampaignPlatform> = {
  meta: "meta",
  facebook: "meta",
  fb: "meta",
  instagram: "meta",
  ig: "meta",
  messenger: "meta",
  an: "meta", // audience network
  fbig: "meta",
  google: "google",
  googleads: "google",
  adwords: "google",
  gdn: "google",
  youtube: "google",
  yt: "google",
  linkedin: "linkedin",
  li: "linkedin",
};

/** Infer the ad platform a lead came from, from its `utm_source` (and `utm_medium` as a fallback signal). */
export function inferPlatform(utmSource: string | undefined, utmMedium?: string | undefined): CampaignPlatform | null {
  const norm = (v: string | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const src = norm(utmSource);
  if (src && PLATFORM_BY_SOURCE_TOKEN[src]) return PLATFORM_BY_SOURCE_TOKEN[src];

  // Partial containment (e.g. "facebook.com", "l.facebook").
  for (const token of Object.keys(PLATFORM_BY_SOURCE_TOKEN)) {
    if (token.length >= 3 && src.includes(token)) return PLATFORM_BY_SOURCE_TOKEN[token];
  }

  const med = norm(utmMedium);
  if (med.includes("cpc") || med.includes("ppc") || med.includes("paidsearch")) {
    if (src.includes("bing") || src.includes("microsoft")) return null;
  }
  return null;
}
