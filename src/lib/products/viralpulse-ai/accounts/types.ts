import type { EncryptedValue } from "@/lib/products/viralpulse-ai/crypto";

/**
 * Connected accounts (WP2). One OAuth login ("connection": a person's Meta / Google / LinkedIn / X login, holding the tokens) owns many
 * accounts (a Facebook Page, an Instagram business account, a YouTube channel, a LinkedIn organisation, an ad account ...). Posts and ads
 * target accounts; tokens live on the connection (and, for Facebook Pages, on the account: a Page has its own token).
 * Pure types and constants only: safe to import from the browser.
 */

export const CONNECTION_PROVIDERS = ["meta", "google", "linkedin", "x"] as const;
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];
export const isConnectionProvider = (v: unknown): v is ConnectionProvider => (CONNECTION_PROVIDERS as readonly unknown[]).includes(v);

export const ACCOUNT_PROVIDERS = ["facebook_page", "instagram_business", "youtube_channel", "linkedin_member", "linkedin_organization", "x_account", "meta_ad_account", "google_ads_customer", "gbp_location"] as const;
export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[number];
export const isAccountProvider = (v: unknown): v is AccountProvider => (ACCOUNT_PROVIDERS as readonly unknown[]).includes(v);

export const ACCOUNT_STATUSES = ["healthy", "expiring", "expired", "revoked", "missing_scope"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface AccountProviderInfo {
  label: string;
  oauth: ConnectionProvider;
  /** Short noun for one account of this type ("Page", "channel"). */
  noun: string;
  /** Scopes without which this account cannot do its main job (publishing or reading). Missing one = status "missing_scope". */
  required: string[];
  /** Scopes for extra abilities (insights, ads). Missing one is a warning with a fix button, not a failure. */
  optional: { scope: string; why: string }[];
  /** False = the account type exists in the model but nothing discovers it yet (see notes). */
  discoverable: boolean;
}

const G = "https://www.googleapis.com/auth/";
export const GOOGLE_SCOPES = {
  youtubeUpload: `${G}youtube.upload`,
  youtubeReadonly: `${G}youtube.readonly`,
  ytAnalytics: `${G}yt-analytics.readonly`,
  business: `${G}business.manage`,
  adwords: `${G}adwords`,
} as const;

export const ACCOUNT_INFO: Record<AccountProvider, AccountProviderInfo> = {
  facebook_page: { label: "Facebook Page", oauth: "meta", noun: "Page", required: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"], optional: [{ scope: "read_insights", why: "Page insights and analytics" }], discoverable: true },
  instagram_business: { label: "Instagram business account", oauth: "meta", noun: "account", required: ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"], optional: [{ scope: "instagram_manage_insights", why: "Instagram insights and analytics" }], discoverable: true },
  meta_ad_account: { label: "Meta ad account", oauth: "meta", noun: "ad account", required: ["ads_read"], optional: [{ scope: "ads_management", why: "creating and changing campaigns" }], discoverable: true },
  youtube_channel: { label: "YouTube channel", oauth: "google", noun: "channel", required: [GOOGLE_SCOPES.youtubeUpload, GOOGLE_SCOPES.youtubeReadonly], optional: [{ scope: GOOGLE_SCOPES.ytAnalytics, why: "channel analytics" }], discoverable: true },
  gbp_location: { label: "Google Business Profile location", oauth: "google", noun: "location", required: [GOOGLE_SCOPES.business], optional: [], discoverable: true },
  google_ads_customer: { label: "Google Ads customer", oauth: "google", noun: "customer", required: [GOOGLE_SCOPES.adwords], optional: [], discoverable: false },
  linkedin_member: { label: "LinkedIn profile", oauth: "linkedin", noun: "profile", required: ["w_member_social"], optional: [], discoverable: true },
  linkedin_organization: { label: "LinkedIn organisation page", oauth: "linkedin", noun: "page", required: ["w_organization_social"], optional: [{ scope: "r_organization_social", why: "reading page posts and analytics" }], discoverable: true },
  x_account: { label: "X account", oauth: "x", noun: "account", required: ["tweet.read", "tweet.write", "users.read", "offline.access"], optional: [{ scope: "media.write", why: "uploading images and video" }], discoverable: true },
};

export const CONNECTION_INFO: Record<ConnectionProvider, { label: string; short: string; platforms: string }> = {
  meta: { label: "Meta (Facebook & Instagram)", short: "Meta", platforms: "Facebook Pages, Instagram business accounts, ad accounts" },
  google: { label: "Google (YouTube & Business Profile)", short: "Google", platforms: "YouTube channels, Business Profile locations" },
  linkedin: { label: "LinkedIn", short: "LinkedIn", platforms: "your profile and organisation pages" },
  x: { label: "X", short: "X", platforms: "your X account" },
};

/** Features a login can ask for. Each adds the scopes that need extra approval from the platform, so a company asks only for what it uses. */
export const CONNECTION_FEATURES: Record<ConnectionProvider, { key: string; label: string; scopes: string[]; default: boolean; approval: string }[]> = {
  meta: [
    { key: "publish", label: "Publish to Facebook Pages and Instagram", scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"], default: true, approval: "Works for people with a role on your Meta app. Others need App Review and Business Verification." },
    { key: "insights", label: "Read insights and analytics", scopes: ["read_insights", "instagram_manage_insights"], default: true, approval: "Needs App Review for people without a role on your app." },
    { key: "ads", label: "Read and manage ad accounts", scopes: ["ads_read", "ads_management"], default: false, approval: "Your own ad accounts work in Standard access. Other businesses' ad accounts need Advanced access (App Review and Business Verification)." },
  ],
  google: [
    { key: "youtube", label: "Upload to YouTube", scopes: [GOOGLE_SCOPES.youtubeUpload, GOOGLE_SCOPES.youtubeReadonly], default: true, approval: "Videos stay private until your Google Cloud project passes the YouTube API Services compliance audit." },
    { key: "analytics", label: "YouTube analytics", scopes: [GOOGLE_SCOPES.ytAnalytics], default: true, approval: "Sensitive scope: needs OAuth consent screen verification." },
    { key: "business", label: "Google Business Profile posts", scopes: [GOOGLE_SCOPES.business], default: false, approval: "Business Profile API access must be requested from Google for your project." },
  ],
  linkedin: [
    { key: "member", label: "Post as yourself", scopes: ["openid", "profile", "w_member_social"], default: true, approval: "Needs the 'Share on LinkedIn' product on your LinkedIn app (self-serve)." },
    { key: "organization", label: "Post as an organisation page", scopes: ["w_organization_social", "r_organization_social"], default: false, approval: "Needs the Community Management API product (LinkedIn approval, verified page). LinkedIn may require it on its own app." },
  ],
  x: [{ key: "post", label: "Post to X", scopes: ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"], default: true, approval: "Needs an X developer app with credits (pay-per-use)." }],
};

export function scopesForFeatures(oauth: ConnectionProvider, features: string[] | null): { scopes: string[]; features: string[] } {
  const defs = CONNECTION_FEATURES[oauth];
  const chosen = defs.filter((d) => (features && features.length ? features.includes(d.key) : d.default));
  const use = chosen.length ? chosen : defs.filter((d) => d.default);
  const scopes = [...new Set(use.flatMap((d) => d.scopes))];
  // Google identity (so the connection can be named) is always asked for.
  if (oauth === "google") scopes.unshift("openid", "email", "profile");
  return { scopes: [...new Set(scopes)], features: use.map((d) => d.key) };
}

export interface ScopeDiff {
  /** Required scopes the login has not granted: the account cannot work. */
  missingRequired: string[];
  /** Optional scopes not granted: shown as a warning. */
  missingOptional: { scope: string; why: string }[];
}

/** Scopes compare case-sensitively except Google, which may return the short or the full URL form. */
const norm = (s: string) => s.replace(/^https:\/\/www\.googleapis\.com\/auth\//, "");

export function diffScopes(provider: AccountProvider, granted: string[]): ScopeDiff {
  const have = new Set(granted.map(norm));
  const info = ACCOUNT_INFO[provider];
  return {
    missingRequired: info.required.filter((s) => !have.has(norm(s))),
    missingOptional: info.optional.filter((o) => !have.has(norm(o.scope))),
  };
}

/** The extra features a reconnect should request so that the listed scopes become available. */
export function featuresForScopes(oauth: ConnectionProvider, scopes: string[]): string[] {
  const want = new Set(scopes.map(norm));
  return CONNECTION_FEATURES[oauth].filter((f) => f.scopes.some((s) => want.has(norm(s)))).map((f) => f.key);
}

export interface ConnectionDoc {
  _id: string;
  oauth: ConnectionProvider;
  externalUserId: string;
  name: string;
  avatarUrl: string | null;
  accessEnc: EncryptedValue | null;
  refreshEnc: EncryptedValue | null;
  /** When the access token stops working (null = no expiry, as for Meta Page tokens). */
  tokenExpiresAt: Date | null;
  /** Meta: when the app loses access to the person's data (90 days after their last login). */
  dataAccessExpiresAt: Date | null;
  /** Whether this login can renew itself (has a refresh token). Meta and LinkedIn (without partner approval) cannot: they need the person to reconnect. */
  refreshable: boolean;
  scopes: string[];
  features: string[];
  status: "active" | "expired" | "revoked";
  lastVerifiedAt: Date | null;
  lastRefreshedAt: Date | null;
  lastError: string | null;
  /** Things discovery could not read (e.g. "Business Profile: access not approved"), shown to the admin instead of being swallowed. */
  discoveryNotes: string[];
  /** Short-lived claim so only one request refreshes the tokens at a time. */
  lease: { holder: string; until: Date } | null;
  connectedBy: string;
  connectedAt: Date;
  updatedAt: Date;
  /** Set when this connection was created from the old single-connection document (`smms_integrations`). */
  legacyFrom?: string;
}

export interface AccountDoc {
  _id: string;
  provider: AccountProvider;
  oauth: ConnectionProvider;
  externalId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  connectionId: string;
  /** The account's own token (a Facebook Page has one); null = use the connection's. */
  tokenEnc: EncryptedValue | null;
  status: AccountStatus;
  enabled: boolean;
  /** The account used when a post names no account for this platform. */
  isDefault: boolean;
  /** Optional agency label: which client this account belongs to. */
  client: string | null;
  /** Provider-specific links, e.g. `pageId` for an Instagram account. */
  meta: Record<string, string>;
  lastVerifiedAt: Date | null;
  lastRefreshedAt: Date | null;
  lastError: string | null;
  connectedBy: string;
  connectedAt: Date;
  updatedAt: Date;
  /** Set when the login was disconnected or no longer returns this account; the row is kept so a reconnect revives it. */
  disconnectedAt: Date | null;
  /** What the account was set to when its login was disconnected, so reconnecting the same login restores it instead of leaving it off. */
  enabledBeforeDisconnect?: boolean;
  defaultBeforeDisconnect?: boolean;
}

/** What a page may see: never a token. */
export interface AccountView {
  id: string;
  provider: AccountProvider;
  providerLabel: string;
  oauth: ConnectionProvider;
  externalId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  connectionId: string;
  connectionName: string;
  status: AccountStatus;
  enabled: boolean;
  isDefault: boolean;
  client: string | null;
  scopes: string[];
  missingRequired: string[];
  missingOptional: { scope: string; why: string }[];
  expiresAt: string | null;
  daysLeft: number | null;
  /** True when the login renews itself; false = the person must reconnect before `expiresAt`. */
  autoRenews: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  connectedAt: string;
  disconnected: boolean;
  meta: Record<string, string>;
}
