/**
 * Meta Graph error -> plain message + class. Codes and subcodes are from the Marketing API error reference (SPEC 1.9). Messages never
 * contain the request URL, token or body. Handle by code/subcode, never by Meta's text (it can change).
 */

export type MetaErrorKind = "auth" | "permission" | "rate_limit" | "validation" | "policy" | "transient" | "unknown";

export interface GraphErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  is_transient?: boolean;
  error_data?: { blame_field_specs?: string[][] } | string;
}

/** Plain explanations of subcodes (and code+subcode pairs written `code:sub`). */
const SUBCODE_MESSAGES: Record<string, string> = {
  "1815694": "Your login does not have permission for this action on the ad account.",
  "1815199": "The ad account has no access to that Instagram account. Add the Instagram account to the ad account in Meta Business settings.",
  "1487007": "The ad set has already ended. Move its end date into the future.",
  "1487033": "The campaign's end date must be in the future.",
  "1487056": "The ad set was deleted, so only its name can change.",
  "1487566": "The campaign was deleted, so only its name can change.",
  "1885088": "The ad is archived, so only its name can change.",
  "1885272": "The budget is below Meta's minimum for this ad account. Raise the budget.",
  "1885621": "A budget is set on both the campaign and the ad set. Use one of them.",
  "1885650": "The budget is too low to cover what has already been spent in the last 15 minutes.",
  "1885204": "This optimisation goal needs automatic bidding. Choose 'Lowest cost' or change the goal.",
  "1885029": "The ad's Facebook Page does not match the Page in the ad set's promoted object.",
  "1885557": "The post you chose to promote is not available.",
  "1870034": "Accept Meta's Custom Audience terms in Ads Manager before using custom audiences.",
  "1870090": "Accept Meta's Custom Audience terms in Ads Manager before creating ad sets.",
  "1870092": "Accept the Meta Business Tools terms in Ads Manager before creating ad sets.",
  "1870047": "The audience would become too small to deliver. Widen the targeting.",
  "1870065": "The audience includes a disabled audience. Remove it.",
  "1870165": "Audience targeting is not allowed for people under 18 (20 in Thailand, 21 in Indonesia). Raise the minimum age.",
  "3858064": "These campaign options cannot be used with audiences under 18 (20 in Thailand, 21 in Indonesia).",
  "1870199": "Location targeting now always reaches people in or recently in the place. Remove the location type setting.",
  "2446289": "The chosen post is not available (deleted or no permission).",
  "2446383": "This objective needs a website address and a call to action button.",
  "2446394": "The detailed targeting and exclusions you chose conflict. Adjust them.",
  "2446307": "The campaign spend cap is below Meta's minimum.",
  "2446712": "Store visits optimisation is no longer available.",
  "2490427": "Meta rejected and disabled this ad. Edit it and create a new ad.",
  "2490468": "Meta rejected and disabled this ad. Edit it and create a new ad.",
  "2708008": "Your account is not authorised to run ads about social issues, elections or politics.",
  "3858079": "EU targeting needs the 'paid for by' (payor) name. Fill it in on the ad set.",
  "3858081": "EU targeting needs the 'beneficiary' name. Fill it in on the ad set.",
  "3858152": "The ad set needs the beneficiary and payor before it can be published.",
  "3858258": "Meta could not download the image. Make sure it is publicly reachable.",
  "2238055": "Use either Instagram user id or Instagram actor id in the creative, not both.",
  "2446149": "Use either Instagram user id or Instagram actor id in the creative, not both.",
  "1373054": "That call to action button type is not valid.",
  "1487929": "The promoted object is ambiguous. Provide only one object.",
  "1487472": "That post type cannot be promoted in an ad.",
  "1815946": "Radius cannot be combined with several locations. Use one location with a radius, or remove the radius.",
  "1487694": "A targeting category you chose is no longer available. Search targeting again and pick another.",
  "1815857": "A special ad category is required or incorrect for this campaign. Pick the category that applies, or 'None'.",
  "1487742": "Too many calls on this ad account. Try again shortly.",
  "5044001": "Too many changes at once. Try again shortly.",
  "4841018": "This object was changed a moment ago. Wait 30 seconds and try again.",
  "1487632": "Ad set budgets can change only 4 times an hour. Try again later.",
  "1885172": "Meta allows 10 spend changes a day on an ad account. Try again tomorrow.",
  "2446079": "Too many calls on this ad account. Try again shortly.",
  "1504022": "Too many insights calls. Try again later.",
  "1504039": "Too many insights calls. Try again later.",
};

/** Subcode -> the draft field it is about, when Meta gives no blame_field_specs. Paths are relative to the object (`budget`, `targeting`, ...). */
const SUBCODE_FIELD: Record<string, string> = {
  "1885272": "budget", "1885621": "budget", "1885650": "budget", "2446307": "spendCap", "1487033": "endTime", "1487007": "endTime", "3858079": "dsaPayor", "3858081": "dsaBeneficiary", "3858152": "dsaBeneficiary",
  "1870165": "targeting.ageMin", "1870199": "targeting", "2446394": "targeting.detailed", "1870034": "targeting.customAudiences", "1815946": "targeting.geo", "1885204": "bidStrategy", "1373054": "cta", "2446383": "link", "1815199": "instagramAccountId", "1885029": "pageAccountId",
};

export class MetaApiError extends Error {
  readonly kind: MetaErrorKind;
  constructor(
    /** Plain message, safe to show. */
    message: string,
    readonly status: number,
    readonly code: number | null,
    readonly subcode: number | null,
    kind: MetaErrorKind,
    readonly retryable: boolean,
    /** Fields Meta blamed (e.g. ["targeting"]). */
    readonly blame: string[] = [],
    /** Suggested draft field for the UI, relative to the object that failed. */
    readonly field: string | null = null,
    readonly retryAfterMs: number | null = null,
    readonly fbtraceId: string | null = null,
    /** True when a create call may have been executed even though we got no clean answer (network error, 5xx). */
    readonly ambiguous = false,
  ) {
    super(message);
    this.kind = kind;
    this.name = "MetaApiError";
  }
}

const THROTTLE_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);

export function classifyGraphError(body: GraphErrorBody | null | undefined, status: number, retryAfterMs: number | null = null): MetaApiError {
  const e = body ?? {};
  const code = typeof e.code === "number" ? e.code : null;
  const sub = typeof e.error_subcode === "number" ? e.error_subcode : null;
  const trace = e.fbtrace_id ?? null;
  const blame = typeof e.error_data === "object" && e.error_data?.blame_field_specs ? e.error_data.blame_field_specs.flat().map(String) : [];
  const mapped = sub !== null ? SUBCODE_MESSAGES[String(sub)] : undefined;
  const field = sub !== null ? SUBCODE_FIELD[String(sub)] ?? null : null;
  const userMsg = e.error_user_msg ? String(e.error_user_msg).slice(0, 300) : null;
  const clean = (e.message ?? "").replace(/(access_token|appsecret_proof|client_secret)=[^&\s"']+/gi, "$1=[redacted]").slice(0, 300);

  if (code !== null && THROTTLE_CODES.has(code) || (status === 429)) {
    return new MetaApiError(mapped ?? "Meta is limiting how fast we can call it for this ad account. It will be retried shortly.", status, code, sub, "rate_limit", true, blame, field, retryAfterMs, trace);
  }
  if (code === 190 || code === 102 || status === 401) {
    const expired = sub === 463 || sub === 467;
    return new MetaApiError(expired ? "The Meta login has expired. Reconnect the account in Settings > Connected accounts." : "Meta rejected the login. Reconnect the account in Settings > Connected accounts.", status, code, sub, "auth", false, blame, null, null, trace);
  }
  if (code === 200 || code === 10 || code === 294 || code === 1815694 || sub === 1815694) {
    const m = code === 294 ? "This Meta app is not approved to manage ads. Request the ads_management permission (Advanced access is needed for ad accounts you do not own)." : (mapped ?? "Your login does not have permission for this action. Check you have the right role on the ad account and that the ads_management permission was granted.");
    return new MetaApiError(m, status, code, sub, "permission", false, blame, field, null, trace);
  }
  if (sub !== null && (sub === 2490427 || sub === 2490468 || sub === 2708008)) {
    return new MetaApiError(mapped!, status, code, sub, "policy", false, blame, field, null, trace);
  }
  if (code === 1404078 || code === 2859015 || code === 1404163) {
    return new MetaApiError(code === 1404163 ? "Meta no longer allows this account to advertise." : "Meta has temporarily blocked this action for the account. Try again later.", status, code, sub, "policy", false, blame, field, null, trace);
  }
  if (code === 100 || code === 2654 || code === 1487390 || (sub !== null && mapped)) {
    const bl = blame.length ? ` (field: ${blame.join(", ")})` : "";
    const fallback = userMsg ?? (clean ? `Meta rejected a value: ${clean}${bl}` : `Meta rejected the request${bl}.`);
    return new MetaApiError(mapped ?? fallback, status, code, sub, "validation", false, blame, field, null, trace);
  }
  if (e.is_transient || status >= 500 || code === 1 || code === 2) {
    return new MetaApiError("Meta had a temporary problem. It will be retried.", status, code, sub, "transient", true, blame, field, retryAfterMs, trace, status >= 500 || code === 1 || code === 2);
  }
  return new MetaApiError(mapped ?? userMsg ?? (clean || `Meta returned an error (HTTP ${status}).`), status, code, sub, status >= 400 && status < 500 ? "validation" : "unknown", false, blame, field, null, trace);
}

export const networkError = (timeout: boolean) => new MetaApiError(timeout ? "Meta did not answer in time." : "Could not reach Meta.", 0, null, null, "transient", true, [], null, null, null, true);
