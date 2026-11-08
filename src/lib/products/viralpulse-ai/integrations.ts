import "server-only";
import { smmsEvents } from "@/lib/notify/triggers/smms";
import { decryptSecret, encryptSecret, type EncryptedValue } from "@/lib/products/viralpulse-ai/crypto";
import { PLATFORM_META, type Platform, type Provider } from "@/lib/products/viralpulse-ai/constants";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { oauthRedirectUrl } from "@/lib/products/viralpulse-ai/oauth-redirect";
import { oauthApp as appFor, providerConfigured as configuredFor } from "@/lib/products/viralpulse-ai/accounts/apps";
import { request } from "@/lib/products/viralpulse-ai/accounts/http";
import { GRAPH, linkedinVersion } from "@/lib/products/viralpulse-ai/accounts/versions";
import { CONNECTION_INFO, type AccountProvider, type AccountView, type ConnectionProvider } from "@/lib/products/viralpulse-ai/accounts/types";
import { disconnectConnection, listAccounts, listConnections, markAccountError, setAccountDefault, freshAccessToken, getPageToken } from "@/lib/products/viralpulse-ai/accounts/service";

/**
 * Compatibility layer over the connected-accounts store (`accounts/*`). Before WP2 each provider had one document here; code written
 * against that shape (the publishers, the publishing queue, the nav badges, the health page) keeps working through these functions,
 * which now read the real accounts. New code should use `accounts/service` directly (`getAccountFor`, `withAccountToken`).
 * Nothing in this file stores a token: the old document is migrated lazily into `smms_accounts` and then only read through here.
 */

export { GRAPH, linkedinVersion };

export const isProvider = (v: unknown): v is Provider => v === "meta" || v === "google" || v === "linkedin";
const LEGACY: Provider[] = ["meta", "google", "linkedin"];

/** The workspace's own OAuth app for a provider (Platform Console > Connections), or null. */
export const oauthApp = (p: ConnectionProvider) => appFor(p);
export const providerConfigured = (p: ConnectionProvider) => configuredFor(p);

const PROVIDER_PLATFORMS: Record<Provider, Platform[]> = { meta: ["facebook", "instagram"], google: ["youtube", "google_business"], linkedin: ["linkedin"] };
const PLATFORM_KIND: Record<string, AccountProvider[]> = { facebook: ["facebook_page"], instagram: ["instagram_business"], youtube: ["youtube_channel"], google_business: ["gbp_location"], linkedin: ["linkedin_organization", "linkedin_member"], x: ["x_account"] };

export interface Target {
  id: string;
  name: string;
  /** Meta page access token (encrypted): pages publish with their own token. Built on demand from the account store. */
  tokenEnc?: EncryptedValue | null;
  pageId?: string;
}

export interface IntegrationDoc {
  _id: Provider;
  status: "connected" | "error";
  accountName: string;
  accessEnc: EncryptedValue | null;
  refreshEnc: EncryptedValue | null;
  expiresAt: Date | null;
  scopes: string[];
  targets: { facebookPages: Target[]; instagramAccounts: Target[]; youtubeChannels: Target[]; gbpLocations: Target[]; linkedinAuthors: Target[] };
  selected: Partial<Record<Platform, string>>;
  lastError: string | null;
  connectedBy: string;
  connectedAt: Date;
  updatedAt: Date;
}

const providerAccounts = async (p: Provider): Promise<AccountView[]> => (await listAccounts({ oauth: p })).filter((a) => !a.disconnected);

/** The default account per post platform, in the old `selected` shape. */
function selectedOf(p: Provider, accts: AccountView[]): Partial<Record<Platform, string>> {
  const out: Partial<Record<Platform, string>> = {};
  for (const platform of PROVIDER_PLATFORMS[p]) {
    for (const kind of PLATFORM_KIND[platform]) {
      const best = accts.filter((a) => a.provider === kind && a.enabled).sort((x, y) => Number(y.isDefault) - Number(x.isDefault))[0];
      if (best) {
        out[platform] = best.externalId;
        break;
      }
    }
  }
  return out;
}

export async function getIntegration(p: Provider): Promise<IntegrationDoc | null> {
  const accts = await providerAccounts(p);
  if (accts.length === 0) return null;
  const conns = (await listConnections()).filter((c) => c.oauth === p);
  const tgt = (kind: AccountProvider) => accts.filter((a) => a.provider === kind).map((a): Target => ({ id: a.externalId, name: a.name, pageId: a.meta.pageId }));
  const facebookPages = await Promise.all(accts.filter((a) => a.provider === "facebook_page").map(async (a): Promise<Target> => {
    const t = await getPageToken(a.id);
    return { id: a.externalId, name: a.name, tokenEnc: t ? encryptSecret(t, `meta:page:${a.externalId}`) : null };
  }));
  const bad = accts.some((a) => a.enabled && (a.status === "revoked" || a.status === "expired" || a.lastError));
  return {
    _id: p,
    status: bad ? "error" : "connected",
    accountName: conns[0]?.name ?? accts[0].connectionName,
    accessEnc: null,
    refreshEnc: null,
    expiresAt: null,
    scopes: [...new Set(accts.flatMap((a) => a.scopes))],
    targets: { facebookPages, instagramAccounts: tgt("instagram_business"), youtubeChannels: tgt("youtube_channel"), gbpLocations: tgt("gbp_location"), linkedinAuthors: [...tgt("linkedin_organization"), ...tgt("linkedin_member")] },
    selected: selectedOf(p, accts),
    lastError: accts.find((a) => a.enabled && a.lastError)?.lastError ?? null,
    connectedBy: "",
    connectedAt: new Date(Math.min(...accts.map((a) => new Date(a.connectedAt).getTime()))),
    updatedAt: new Date(),
  };
}

/** What a page may show: never tokens. Legacy shape: one entry per login provider (Meta, Google, LinkedIn). */
export interface IntegrationView {
  provider: Provider;
  label: string;
  platforms: Platform[];
  configured: boolean;
  connected: boolean;
  status: "connected" | "error" | null;
  accountName: string | null;
  expiresAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
  redirectUrl: string | null;
  targets: Record<string, { id: string; name: string }[]>;
  selected: Partial<Record<Platform, string>>;
}

export async function listIntegrationViews(origin: string | null = null): Promise<IntegrationView[]> {
  const conns = await listConnections();
  return Promise.all(LEGACY.map(async (p): Promise<IntegrationView> => {
    const accts = await providerAccounts(p);
    const mine = conns.filter((c) => c.oauth === p);
    const by = (kind: AccountProvider) => accts.filter((a) => a.provider === kind).map((a) => ({ id: a.externalId, name: a.name }));
    return {
      provider: p,
      label: CONNECTION_INFO[p].label,
      platforms: PROVIDER_PLATFORMS[p],
      configured: await configuredFor(p),
      connected: accts.length > 0,
      status: accts.length ? "connected" : null,
      accountName: mine[0]?.name ?? null,
      // Expiry, revocation and missing permissions are reported per account (accounts/health.ts); this summary only says what is connected.
      expiresAt: null,
      lastError: null,
      connectedAt: mine[0]?.connectedAt ?? null,
      redirectUrl: origin ? oauthRedirectUrl(p, origin) : null,
      targets: { facebook: by("facebook_page"), instagram: by("instagram_business"), youtube: by("youtube_channel"), google_business: by("gbp_location"), linkedin: [...by("linkedin_organization"), ...by("linkedin_member")] },
      selected: selectedOf(p, accts),
    };
  }));
}

/** Which post platforms can publish through the API right now (an enabled, healthy-enough account exists). */
export async function connectedPlatforms(): Promise<Set<Platform>> {
  const out = new Set<Platform>();
  for (const a of await listAccounts({ enabled: true })) {
    if (a.status === "revoked" || a.status === "expired") continue;
    for (const [platform, kinds] of Object.entries(PLATFORM_KIND)) if (kinds.includes(a.provider)) out.add(platform as Platform);
  }
  return out;
}

/** Throws with the platform's own message; keeps the HTTP status so callers can tell a 401. */
export async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  return request<T>(url, init);
}

/** Disconnects every login of a provider (old per-provider button). Revokes at the platform where possible. */
export async function disconnect(p: Provider): Promise<void> {
  for (const c of (await listConnections()).filter((x) => x.oauth === p)) await disconnectConnection(c.id, { userId: "system", email: null });
}

/** Old "choose the page/channel/profile": makes that account the enabled default for its platform. */
export async function selectTarget(p: Provider, platform: Platform, targetId: string): Promise<void> {
  if (!PROVIDER_PLATFORMS[p].includes(platform)) throw new SmmsInputError("That platform doesn't belong to this connection.");
  const a = (await providerAccounts(p)).find((x) => x.externalId === targetId && PLATFORM_KIND[platform]?.includes(x.provider));
  if (!a) throw new SmmsInputError("Pick one of the discovered accounts.");
  await setAccountDefault(a.id, { userId: "system", email: null });
}

export async function markIntegrationError(p: Provider, message: string): Promise<void> {
  const accts = (await providerAccounts(p)).filter((a) => a.enabled && a.isDefault);
  for (const a of accts) await markAccountError(a.id, message);
  await smmsEvents.error(CONNECTION_INFO[p].label, message);
}

/** The login's current access token (renewed first when it is about to expire), for the connection that owns the provider's default account. */
export async function accessToken(p: Provider): Promise<{ doc: IntegrationDoc; token: string }> {
  const doc = await getIntegration(p);
  if (!doc) throw new SmmsInputError(`${CONNECTION_INFO[p].label} isn't connected.`);
  const accts = await providerAccounts(p);
  const primary = accts.filter((a) => a.enabled).sort((x, y) => Number(y.isDefault) - Number(x.isDefault))[0] ?? accts[0];
  return { doc, token: await freshAccessToken(primary.connectionId) };
}

export function pageToken(doc: IntegrationDoc, pageId: string): string {
  const page = doc.targets.facebookPages.find((x) => x.id === pageId);
  if (!page?.tokenEnc) throw new SmmsInputError("The Facebook Page token can't be read. Reconnect Meta in Settings > Connected accounts.");
  // Decrypted here, at the moment a publish call needs it.
  const t = decryptSecret(page.tokenEnc, `meta:page:${pageId}`);
  if (!t) throw new SmmsInputError("The Facebook Page token can't be read. Reconnect Meta in Settings > Connected accounts.");
  return t;
}

export function providerFor(platform: Platform): Provider | "x" {
  return PLATFORM_META[platform].provider;
}
