import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { request, formBody, basicAuth, HttpError } from "./http";
import { GRAPH_VERSION, GRAPH, linkedinVersion } from "./versions";
import type { AppCreds } from "./apps";
import { GOOGLE_SCOPES, type AccountProvider, type ConnectionProvider } from "./types";

/**
 * One adapter per OAuth provider: build the authorize URL, exchange the code, refresh, revoke, inspect (is the token still valid and what
 * does it allow), name the person, discover the accounts they can post to, and probe an account with a real read call.
 * Endpoints and scope names were checked against each platform's official documentation on 2026-11-01 (see docs/build-apps.md 14b).
 * Nothing here reads or writes the database.
 */

export interface TokenSet {
  access: string;
  refresh: string | null;
  expiresAt: Date | null;
  /** Scopes the platform says it granted; null when it does not say. */
  scopes: string[] | null;
}

export interface Inspection {
  valid: boolean;
  /** True when the platform says the access was withdrawn (not merely expired). */
  revoked: boolean;
  scopes: string[] | null;
  /** undefined = the check cannot tell, keep what is stored. */
  expiresAt?: Date | null;
  dataAccessExpiresAt?: Date | null;
  error: string | null;
}

export interface Discovered {
  provider: AccountProvider;
  externalId: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  /** The account's own token (a Facebook Page's). */
  token?: string;
  meta?: Record<string, string>;
}

export interface Identity {
  externalUserId: string;
  name: string;
  avatarUrl: string | null;
}

export interface ProbeTarget {
  provider: AccountProvider;
  externalId: string;
  meta: Record<string, string>;
}

export interface Adapter {
  usesPkce: boolean;
  authorizeUrl(p: { app: AppCreds; redirectUri: string; state: string; scopes: string[]; challenge: string | null; rerequest?: boolean }): string;
  exchange(app: AppCreds, code: string, redirectUri: string, verifier: string | null): Promise<TokenSet>;
  /** Null for logins that cannot renew themselves (Meta): the person reconnects. */
  refresh: ((app: AppCreds, refreshToken: string) => Promise<TokenSet>) | null;
  /** Returns true when the platform confirmed the revoke, false when it has no revoke API or the call failed. */
  revoke(app: AppCreds, t: { access: string; refresh: string | null; userId: string }): Promise<boolean>;
  inspect(app: AppCreds, access: string): Promise<Inspection>;
  identity(access: string): Promise<Identity>;
  discover(access: string, granted: string[]): Promise<{ accounts: Discovered[]; notes: string[] }>;
  /** A real read call against the account. Returns what it found, in plain words. Throws HttpError on failure. */
  probe(t: ProbeTarget, token: string): Promise<string>;
}

const bearer = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });
const secondsFromNow = (s: number | undefined | null): Date | null => (typeof s === "number" && s > 0 ? new Date(Date.now() + s * 1000) : null);
const splitScopes = (s: string | undefined | null): string[] | null => (s ? s.split(/[ ,]+/).filter(Boolean) : null);

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

// ── Meta ────────────────────────────────────────────────────────────────────

interface MetaPage { id: string; name: string; access_token?: string; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } }

async function metaPaged<T>(first: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = first;
  for (let i = 0; url && i < 10; i++) {
    const page: { data?: T[]; paging?: { next?: string } } = await request(url);
    out.push(...(page.data ?? []));
    url = page.paging?.next;
  }
  return out;
}

export const metaAdapter: Adapter = {
  usesPkce: false,
  // `auth_type=rerequest` asks again for permissions the person declined earlier; without it Meta silently skips them.
  authorizeUrl: ({ app, redirectUri, state, scopes, rerequest }) =>
    `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${new URLSearchParams({ client_id: app.id, redirect_uri: redirectUri, state, response_type: "code", scope: scopes.join(","), ...(rerequest ? { auth_type: "rerequest" } : {}) })}`,
  async exchange(app, code, redirectUri) {
    const short = await request<{ access_token: string }>(`${GRAPH}/oauth/access_token?${new URLSearchParams({ client_id: app.id, client_secret: app.secret, redirect_uri: redirectUri, code })}`);
    // Long-lived user token (about 60 days). Page tokens read with it do not expire.
    const long = await request<{ access_token: string; expires_in?: number }>(`${GRAPH}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.id, client_secret: app.secret, fb_exchange_token: short.access_token })}`);
    return { access: long.access_token, refresh: null, expiresAt: secondsFromNow(long.expires_in), scopes: null };
  },
  refresh: null,
  async revoke(_app, t) {
    try {
      const r = await request<{ success?: boolean }>(`${GRAPH}/${encodeURIComponent(t.userId)}/permissions?${new URLSearchParams({ access_token: t.access })}`, { method: "DELETE" });
      return r.success === true;
    } catch {
      return false;
    }
  },
  async inspect(app, access) {
    try {
      const r = await request<{ data?: { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[]; error?: { message?: string; code?: number } } }>(
        `${GRAPH}/debug_token?${new URLSearchParams({ input_token: access, access_token: `${app.id}|${app.secret}` })}`,
      );
      const d = r.data ?? {};
      const at = (s: number | undefined) => (typeof s === "number" ? (s === 0 ? null : new Date(s * 1000)) : undefined);
      if (d.is_valid === false) return { valid: false, revoked: true, scopes: d.scopes ?? null, expiresAt: at(d.expires_at), dataAccessExpiresAt: at(d.data_access_expires_at), error: d.error?.message ?? "Meta says this login is no longer valid." };
      return { valid: true, revoked: false, scopes: d.scopes ?? [], expiresAt: at(d.expires_at), dataAccessExpiresAt: at(d.data_access_expires_at), error: null };
    } catch (e) {
      // The check itself failed (network, app secret): that is not proof the token is bad.
      return { valid: true, revoked: false, scopes: null, error: e instanceof Error ? e.message : "The Meta token check failed." };
    }
  },
  async identity(access) {
    const me = await request<{ id: string; name?: string; picture?: { data?: { url?: string } } }>(`${GRAPH}/me?${new URLSearchParams({ fields: "id,name,picture.type(large){url}", access_token: access })}`);
    return { externalUserId: me.id, name: me.name ?? "Meta account", avatarUrl: me.picture?.data?.url ?? null };
  },
  async discover(access, granted) {
    const accounts: Discovered[] = [];
    const notes: string[] = [];
    const q = (o: Record<string, string>) => new URLSearchParams({ ...o, access_token: access }).toString();
    try {
      const pages = await metaPaged<MetaPage>(`${GRAPH}/me/accounts?${q({ fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}", limit: "100" })}`);
      if (pages.length === 0) notes.push("Meta returned no Facebook Pages. The person needs a role on a Page, and must tick that Page in the login dialog.");
      for (const pg of pages) {
        accounts.push({ provider: "facebook_page", externalId: pg.id, name: pg.name, avatarUrl: pg.picture?.data?.url ?? null, token: pg.access_token });
        const ig = pg.instagram_business_account;
        if (ig) accounts.push({ provider: "instagram_business", externalId: ig.id, name: ig.name || ig.username || ig.id, handle: ig.username ? `@${ig.username}` : null, avatarUrl: ig.profile_picture_url ?? null, token: pg.access_token, meta: { pageId: pg.id, pageName: pg.name } });
      }
    } catch (e) {
      notes.push(`Facebook Pages could not be read: ${e instanceof Error ? e.message : "unknown error"}`);
    }
    if (granted.includes("ads_read") || granted.includes("ads_management")) {
      try {
        const ads = await metaPaged<{ id: string; account_id?: string; name?: string; currency?: string; account_status?: number }>(`${GRAPH}/me/adaccounts?${q({ fields: "id,account_id,name,currency,account_status", limit: "100" })}`);
        for (const a of ads) accounts.push({ provider: "meta_ad_account", externalId: a.id, name: a.name || a.account_id || a.id, meta: { currency: a.currency ?? "", adAccountStatus: String(a.account_status ?? "") } });
      } catch (e) {
        notes.push(`Ad accounts could not be read: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    return { accounts, notes };
  },
  async probe(t, token) {
    if (t.provider === "meta_ad_account") {
      const r = await request<{ name?: string; account_status?: number }>(`${GRAPH}/${encodeURIComponent(t.externalId)}?${new URLSearchParams({ fields: "name,account_status", access_token: token })}`);
      return `Ad account "${r.name ?? t.externalId}" answered.`;
    }
    const fields = t.provider === "instagram_business" ? "id,username" : "id,name";
    const r = await request<{ name?: string; username?: string }>(`${GRAPH}/${encodeURIComponent(t.externalId)}?${new URLSearchParams({ fields, access_token: token })}`);
    return `${t.provider === "instagram_business" ? "Instagram" : "Facebook"} answered for "${r.name ?? r.username ?? t.externalId}".`;
  },
};

/** A Facebook Page's token can be read again from the person's token, so a page-token 401 can be repaired without the person. */
export async function fetchPageToken(userAccess: string, pageId: string): Promise<string> {
  const r = await request<{ access_token?: string }>(`${GRAPH}/${encodeURIComponent(pageId)}?${new URLSearchParams({ fields: "access_token", access_token: userAccess })}`);
  if (!r.access_token) throw new HttpError("Meta did not return a Page token. The person may have lost their role on the Page.", 403);
  return r.access_token;
}

// ── Google ──────────────────────────────────────────────────────────────────

export const googleAdapter: Adapter = {
  usesPkce: true,
  authorizeUrl: ({ app, redirectUri, state, scopes, challenge }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: app.id, redirect_uri: redirectUri, state, response_type: "code", scope: scopes.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", ...(challenge ? { code_challenge: challenge, code_challenge_method: "S256" } : {}) })}`,
  async exchange(app, code, redirectUri, verifier) {
    const t = await request<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: app.id, client_secret: app.secret, ...(verifier ? { code_verifier: verifier } : {}) }),
    });
    return { access: t.access_token, refresh: t.refresh_token ?? null, expiresAt: secondsFromNow(t.expires_in ?? 3600), scopes: splitScopes(t.scope) };
  },
  async refresh(app, refreshToken) {
    const t = await request<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: app.id, client_secret: app.secret }),
    });
    return { access: t.access_token, refresh: t.refresh_token ?? null, expiresAt: secondsFromNow(t.expires_in ?? 3600), scopes: splitScopes(t.scope) };
  },
  async revoke(_app, t) {
    try {
      await request("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ token: t.refresh ?? t.access }) });
      return true;
    } catch {
      return false;
    }
  },
  async inspect(_app, access) {
    try {
      const r = await request<{ scope?: string; expires_in?: string | number }>(`https://oauth2.googleapis.com/tokeninfo?${new URLSearchParams({ access_token: access })}`);
      return { valid: true, revoked: false, scopes: splitScopes(r.scope), expiresAt: secondsFromNow(Number(r.expires_in)), error: null };
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 401)) return { valid: false, revoked: false, scopes: null, error: "Google says this access token is no longer valid." };
      return { valid: true, revoked: false, scopes: null, error: e instanceof Error ? e.message : "The Google token check failed." };
    }
  },
  async identity(access) {
    const u = await request<{ sub: string; name?: string; email?: string; picture?: string }>("https://openidconnect.googleapis.com/v1/userinfo", bearer(access));
    return { externalUserId: u.sub, name: u.name || u.email || "Google account", avatarUrl: u.picture ?? null };
  },
  async discover(access, granted) {
    const accounts: Discovered[] = [];
    const notes: string[] = [];
    const has = (s: string) => granted.some((g) => g === s || g === s.replace("https://www.googleapis.com/auth/", ""));
    if (has(GOOGLE_SCOPES.youtubeReadonly) || has(GOOGLE_SCOPES.youtubeUpload)) {
      try {
        const ch = await request<{ items?: { id: string; snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[] }>("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50", bearer(access));
        for (const c of ch.items ?? []) accounts.push({ provider: "youtube_channel", externalId: c.id, name: c.snippet?.title ?? c.id, handle: c.snippet?.customUrl ?? null, avatarUrl: c.snippet?.thumbnails?.default?.url ?? null });
        if (!ch.items?.length) notes.push("This Google account has no YouTube channel. Create one on YouTube, or pick the brand account that owns the channel when you connect.");
      } catch (e) {
        notes.push(`YouTube channels could not be read: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    if (has(GOOGLE_SCOPES.business)) {
      try {
        const accts = await request<{ accounts?: { name: string; accountName?: string }[] }>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", bearer(access));
        for (const a of (accts.accounts ?? []).slice(0, 10)) {
          const locs = await request<{ locations?: { name: string; title?: string }[] }>(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title&pageSize=100`, bearer(access));
          // Local posts (v4) address a location as accounts/{a}/locations/{l}.
          for (const l of locs.locations ?? []) accounts.push({ provider: "gbp_location", externalId: `${a.name}/${l.name}`, name: l.title ?? l.name, meta: { accountName: a.accountName ?? a.name } });
        }
      } catch (e) {
        notes.push(`Google Business Profile could not be read (${e instanceof Error ? e.message : "unknown error"}). The Business Profile APIs need access approved for your Google Cloud project.`);
      }
    }
    // Google Ads customers are part of the model but not discovered yet: listing them needs the Google Ads API access level on the project.
    return { accounts, notes };
  },
  async probe(t, token) {
    if (t.provider === "gbp_location") {
      const r = await request<{ title?: string }>(`https://mybusinessbusinessinformation.googleapis.com/v1/${t.externalId.split("/locations/")[1] ? `locations/${t.externalId.split("/locations/")[1]}` : t.externalId}?readMask=title`, bearer(token));
      return `Business Profile location "${r.title ?? t.externalId}" answered.`;
    }
    const r = await request<{ items?: { snippet?: { title?: string } }[] }>(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(t.externalId)}`, bearer(token));
    if (!r.items?.length) throw new HttpError("YouTube does not return this channel for this login any more.", 404);
    return `YouTube channel "${r.items[0].snippet?.title ?? t.externalId}" answered.`;
  },
};

// ── LinkedIn ────────────────────────────────────────────────────────────────

const LI_ORG_ROLES = new Set(["ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER", "CONTENT_ADMIN"]);

async function liHeaders(token: string): Promise<RequestInit> {
  return { headers: { Authorization: `Bearer ${token}`, "Linkedin-Version": await linkedinVersion(), "X-Restli-Protocol-Version": "2.0.0" } };
}

export const linkedinAdapter: Adapter = {
  usesPkce: false,
  authorizeUrl: ({ app, redirectUri, state, scopes }) =>
    `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: "code", client_id: app.id, redirect_uri: redirectUri, state, scope: scopes.join(" ") })}`,
  async exchange(app, code, redirectUri) {
    const t = await request<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: app.id, client_secret: app.secret }),
    });
    return { access: t.access_token, refresh: t.refresh_token ?? null, expiresAt: secondsFromNow(t.expires_in), scopes: splitScopes(t.scope) };
  },
  // LinkedIn only issues refresh tokens to approved partners; the adapter is used whenever one was returned.
  async refresh(app, refreshToken) {
    const t = await request<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: app.id, client_secret: app.secret }),
    });
    return { access: t.access_token, refresh: t.refresh_token ?? refreshToken, expiresAt: secondsFromNow(t.expires_in), scopes: splitScopes(t.scope) };
  },
  async revoke(app, t) {
    try {
      await request("https://www.linkedin.com/oauth/v2/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formBody({ client_id: app.id, client_secret: app.secret, token: t.access }) });
      return true;
    } catch {
      return false;
    }
  },
  async inspect(app, access) {
    try {
      const r = await request<{ active?: boolean; scope?: string; expires_at?: number; status?: string }>("https://www.linkedin.com/oauth/v2/introspectToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ client_id: app.id, client_secret: app.secret, token: access }),
      });
      if (r.active === false) return { valid: false, revoked: r.status === "revoked", scopes: splitScopes(r.scope), error: r.status === "revoked" ? "LinkedIn says this access was revoked." : "LinkedIn says this token is no longer active." };
      return { valid: true, revoked: false, scopes: splitScopes(r.scope), expiresAt: typeof r.expires_at === "number" ? new Date(r.expires_at * 1000) : undefined, error: null };
    } catch (e) {
      return { valid: true, revoked: false, scopes: null, error: e instanceof Error ? e.message : "The LinkedIn token check failed." };
    }
  },
  async identity(access) {
    const u = await request<{ sub: string; name?: string; picture?: string }>("https://api.linkedin.com/v2/userinfo", bearer(access));
    return { externalUserId: u.sub, name: u.name ?? "LinkedIn member", avatarUrl: u.picture ?? null };
  },
  async discover(access, granted) {
    const notes: string[] = [];
    const accounts: Discovered[] = [];
    const me = await linkedinAdapter.identity(access);
    if (granted.includes("w_member_social")) accounts.push({ provider: "linkedin_member", externalId: `urn:li:person:${me.externalUserId}`, name: me.name, avatarUrl: me.avatarUrl });
    if (granted.includes("w_organization_social")) {
      try {
        const h = await liHeaders(access);
        const acl = await request<{ elements?: { organization?: string; role?: string; state?: string }[] }>("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100", h);
        const ids = [...new Set((acl.elements ?? []).filter((e) => e.organization && e.role && LI_ORG_ROLES.has(e.role)).map((e) => e.organization!.split(":").pop()!))].slice(0, 25);
        if (ids.length === 0) notes.push("No LinkedIn organisation page was found where this person is an administrator, content admin or sponsored-content poster.");
        for (const id of ids) {
          try {
            const o = await request<{ localizedName?: string; vanityName?: string; logoV2?: { "original~"?: { elements?: { identifiers?: { identifier?: string }[] }[] } } }>(`https://api.linkedin.com/rest/organizations/${encodeURIComponent(id)}`, h);
            const logo = o.logoV2?.["original~"]?.elements?.[0]?.identifiers?.[0]?.identifier ?? null;
            accounts.push({ provider: "linkedin_organization", externalId: `urn:li:organization:${id}`, name: o.localizedName ?? `Organisation ${id}`, handle: o.vanityName ?? null, avatarUrl: logo });
          } catch {
            accounts.push({ provider: "linkedin_organization", externalId: `urn:li:organization:${id}`, name: `Organisation ${id}` });
          }
        }
      } catch (e) {
        notes.push(`LinkedIn organisation pages could not be read (${e instanceof Error ? e.message : "unknown error"}). Organisation posting needs the Community Management API approved for your LinkedIn app.`);
      }
    }
    return { accounts, notes };
  },
  async probe(t, token) {
    if (t.provider === "linkedin_organization") {
      const o = await request<{ localizedName?: string }>(`https://api.linkedin.com/rest/organizations/${encodeURIComponent(t.externalId.split(":").pop()!)}`, await liHeaders(token));
      return `LinkedIn page "${o.localizedName ?? t.externalId}" answered.`;
    }
    const u = await request<{ name?: string }>("https://api.linkedin.com/v2/userinfo", bearer(token));
    return `LinkedIn profile "${u.name ?? t.externalId}" answered.`;
  },
};

// ── X ───────────────────────────────────────────────────────────────────────

const X_TOKEN = "https://api.x.com/2/oauth2/token";

export const xAdapter: Adapter = {
  usesPkce: true,
  authorizeUrl: ({ app, redirectUri, state, scopes, challenge }) =>
    `https://x.com/i/oauth2/authorize?${new URLSearchParams({ response_type: "code", client_id: app.id, redirect_uri: redirectUri, scope: scopes.join(" "), state, code_challenge: challenge ?? "", code_challenge_method: "S256" })}`,
  async exchange(app, code, redirectUri, verifier) {
    const t = await request<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(X_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(app.id, app.secret) },
      body: formBody({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier ?? "", client_id: app.id }),
    });
    return { access: t.access_token, refresh: t.refresh_token ?? null, expiresAt: secondsFromNow(t.expires_in ?? 7200), scopes: splitScopes(t.scope) };
  },
  // X rotates the refresh token on every refresh: the new one MUST be stored, the old one stops working.
  async refresh(app, refreshToken) {
    const t = await request<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(X_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(app.id, app.secret) },
      body: formBody({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: app.id }),
    });
    return { access: t.access_token, refresh: t.refresh_token ?? null, expiresAt: secondsFromNow(t.expires_in ?? 7200), scopes: splitScopes(t.scope) };
  },
  async revoke(app, t) {
    try {
      await request("https://api.x.com/2/oauth2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(app.id, app.secret) },
        body: formBody({ token: t.refresh ?? t.access, token_type_hint: t.refresh ? "refresh_token" : "access_token", client_id: app.id }),
      });
      return true;
    } catch {
      return false;
    }
  },
  // X has no token-introspection endpoint: a cheap read of the person's own profile is the check, and the scopes stay as granted.
  async inspect(_app, access) {
    try {
      await request("https://api.x.com/2/users/me", bearer(access));
      return { valid: true, revoked: false, scopes: null, error: null };
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) return { valid: false, revoked: false, scopes: null, error: "X says this access token is no longer valid." };
      return { valid: true, revoked: false, scopes: null, error: e instanceof Error ? e.message : "The X check failed." };
    }
  },
  async identity(access) {
    const r = await request<{ data: { id: string; name?: string; username?: string; profile_image_url?: string } }>("https://api.x.com/2/users/me?user.fields=profile_image_url,username,name", bearer(access));
    return { externalUserId: r.data.id, name: r.data.name || r.data.username || "X account", avatarUrl: r.data.profile_image_url ?? null };
  },
  async discover(access) {
    const r = await request<{ data: { id: string; name?: string; username?: string; profile_image_url?: string } }>("https://api.x.com/2/users/me?user.fields=profile_image_url,username,name", bearer(access));
    return { accounts: [{ provider: "x_account", externalId: r.data.id, name: r.data.name || r.data.username || r.data.id, handle: r.data.username ? `@${r.data.username}` : null, avatarUrl: r.data.profile_image_url ?? null }], notes: [] };
  },
  async probe(t, token) {
    const r = await request<{ data?: { username?: string } }>("https://api.x.com/2/users/me", bearer(token));
    return `X account @${r.data?.username ?? t.externalId} answered.`;
  },
};

export const ADAPTERS: Record<ConnectionProvider, Adapter> = { meta: metaAdapter, google: googleAdapter, linkedin: linkedinAdapter, x: xAdapter };
