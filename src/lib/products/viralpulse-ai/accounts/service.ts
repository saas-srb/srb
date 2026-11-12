import "server-only";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret, isEncryptionConfigured, isSealedWithCurrentKey, resealSecret } from "@/lib/products/viralpulse-ai/crypto";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { recordAudit } from "@/lib/products/viralpulse-ai/audit";
import { COLLECTIONS, smmsCollection } from "@/lib/products/viralpulse-ai/db";
import { oauthRedirectUrl } from "@/lib/products/viralpulse-ai/oauth-redirect";
import { smmsEvents } from "@/lib/notify/triggers/smms";
import type { IntegrationDoc } from "@/lib/products/viralpulse-ai/integrations";
import { oauthApp } from "./apps";
import { HttpError } from "./http";
import { ADAPTERS, fetchPageToken, pkcePair, type Discovered } from "./providers";
import { accountsCol, acctAad, connAad, connectionsCol, ensureMigrated, statesCol, toView, type OAuthStateDoc } from "./store";
import { computeStatus, daysUntil, effectiveExpiry, warnBucket } from "./status";
import {
  ACCOUNT_INFO, CONNECTION_INFO, diffScopes, featuresForScopes, scopesForFeatures,
  type AccountDoc, type AccountProvider, type AccountStatus, type AccountView, type ConnectionDoc, type ConnectionProvider,
} from "./types";

/**
 * The accounts API the rest of ViralPulse uses: list/get accounts, `getAccountFor` (compatibility for posts written before accounts
 * existed), `withAccountToken` (fresh token, one automatic refresh-and-retry on 401), `markAccountError`, connect / disconnect /
 * enable / reconnect, and the periodic sweep. Tokens are decrypted only inside this module and handed to a caller's function; they are
 * never returned from a list, logged or put in an audit entry.
 */

export interface Actor {
  userId: string;
  email: string | null;
}
const SYSTEM: Actor = { userId: "system", email: null };

/** The login can no longer be used and the person has to connect again. The message is safe to show. */
export class AccountAuthError extends SmmsInputError {}

const LEASE_MS = 30_000;
const REFRESH_AHEAD_MS = 120_000;
const SWEEP_REFRESH_AHEAD_MS = 15 * 60_000;
const STATE_MAX_AGE_MS = 10 * 60_000;
/** How often the sweep asks the platform to confirm a token. X charges per read and LinkedIn limits calls, so those are slower. */
const VERIFY_EVERY_MS: Record<ConnectionProvider, number> = { meta: 25 * 60_000, google: 25 * 60_000, linkedin: 6 * 3_600_000, x: 6 * 3_600_000 };

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const label = (c: Pick<ConnectionDoc, "oauth">) => CONNECTION_INFO[c.oauth].short;

export function isAuthFailure(e: unknown): boolean {
  const s = (e as { status?: unknown })?.status;
  const code = (e as { code?: unknown })?.code;
  return s === 401 || (s === 400 && (code === "190" || code === "invalid_grant")) || code === "190";
}

// ── reading ────────────────────────────────────────────────────────────────────────────────────────

async function connMap(): Promise<Map<string, ConnectionDoc>> {
  return new Map((await (await connectionsCol()).find({}).toArray()).map((c) => [c._id, c]));
}

export interface ListFilter {
  provider?: AccountProvider;
  oauth?: ConnectionProvider;
  status?: AccountStatus;
  enabled?: boolean;
  client?: string;
  includeDisconnected?: boolean;
}

export async function listAccounts(f: ListFilter = {}, now: Date = new Date()): Promise<AccountView[]> {
  await ensureMigrated();
  const q: Record<string, unknown> = {};
  if (f.provider) q.provider = f.provider;
  if (f.oauth) q.oauth = f.oauth;
  if (!f.includeDisconnected) q.disconnectedAt = null;
  const [docs, conns] = await Promise.all([(await accountsCol()).find(q).sort({ provider: 1, name: 1 }).toArray(), connMap()]);
  return docs
    .map((a) => toView(a, conns.get(a.connectionId) ?? null, now))
    .filter((v) => (f.status ? v.status === f.status : true) && (f.enabled === undefined ? true : v.enabled === f.enabled) && (f.client === undefined ? true : v.client === f.client));
}

export async function getAccount(id: string, now: Date = new Date()): Promise<AccountView | null> {
  await ensureMigrated();
  const a = await (await accountsCol()).findOne({ _id: id });
  if (!a) return null;
  return toView(a, await (await connectionsCol()).findOne({ _id: a.connectionId }), now);
}

export interface ConnectionView {
  id: string;
  oauth: ConnectionProvider;
  label: string;
  name: string;
  avatarUrl: string | null;
  status: ConnectionDoc["status"];
  scopes: string[];
  features: string[];
  expiresAt: string | null;
  daysLeft: number | null;
  autoRenews: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  notes: string[];
  connectedAt: string;
  accountIds: string[];
}

export async function listConnections(now: Date = new Date()): Promise<ConnectionView[]> {
  await ensureMigrated();
  const [conns, accts] = await Promise.all([(await connectionsCol()).find({}).sort({ connectedAt: 1 }).toArray(), (await accountsCol()).find({ disconnectedAt: null }).toArray()]);
  return conns.map((c) => {
    const exp = effectiveExpiry(c);
    return { id: c._id, oauth: c.oauth, label: CONNECTION_INFO[c.oauth].label, name: c.name, avatarUrl: c.avatarUrl, status: c.status, scopes: c.scopes, features: c.features, expiresAt: exp?.toISOString() ?? null, daysLeft: daysUntil(exp, now), autoRenews: c.refreshable, lastVerifiedAt: c.lastVerifiedAt?.toISOString() ?? null, lastError: c.lastError, notes: c.discoveryNotes, connectedAt: c.connectedAt.toISOString(), accountIds: accts.filter((a) => a.connectionId === c._id).map((a) => a._id) };
  });
}

/** Post platform (or account type) -> the account types that can publish to it, best match first. */
const PLATFORM_ACCOUNTS: Record<string, AccountProvider[]> = {
  facebook: ["facebook_page"],
  instagram: ["instagram_business"],
  youtube: ["youtube_channel"],
  google_business: ["gbp_location"],
  linkedin: ["linkedin_organization", "linkedin_member"],
  x: ["x_account"],
  twitter: ["x_account"],
};

/**
 * Compatibility entry point. `kind` is an account type ("facebook_page"), a post platform ("instagram") or, for old code, a login
 * provider ("meta"). With an `accountId` that exact account is returned (or null if it is gone / of another kind). Without one, the
 * enabled default account of that kind. Posts written before accounts existed carry no account id, so they resolve here.
 */
export async function getAccountFor(kind: string, accountId?: string | null, now: Date = new Date()): Promise<AccountView | null> {
  if (accountId) {
    const a = await getAccount(accountId, now);
    if (!a || a.disconnected) return null;
    const kinds = new Set<string>([kind, ...(PLATFORM_ACCOUNTS[kind] ?? []), ...(Object.entries(ACCOUNT_INFO) as [string, { oauth: string }][]).filter(([, i]) => i.oauth === kind).map(([k]) => k)]);
    return kinds.has(a.provider) || kinds.has(a.oauth) ? a : null;
  }
  const wanted = PLATFORM_ACCOUNTS[kind] ?? (kind in ACCOUNT_INFO ? [kind as AccountProvider] : (Object.keys(ACCOUNT_INFO) as AccountProvider[]).filter((k) => ACCOUNT_INFO[k].oauth === kind));
  for (const provider of wanted) {
    const list = (await listAccounts({ provider, enabled: true }, now)).sort((x, y) => Number(y.isDefault) - Number(x.isDefault));
    if (list[0]) return list[0];
  }
  return null;
}

// ── tokens ─────────────────────────────────────────────────────────────────────────────────────────

const needsRefresh = (c: ConnectionDoc, ahead: number) => c.refreshable && c.tokenExpiresAt !== null && c.tokenExpiresAt.getTime() - Date.now() < ahead;

async function appFor(oauth: ConnectionProvider) {
  const app = await oauthApp(oauth);
  if (!app) throw new AccountAuthError(`${CONNECTION_INFO[oauth].short} isn't set up. Add your app credentials in Platform Console > Connections.`);
  return app;
}

async function setConnectionState(id: string, status: ConnectionDoc["status"], error: string): Promise<void> {
  await (await connectionsCol()).updateOne({ _id: id }, { $set: { status, lastError: error.slice(0, 300), lease: null, updatedAt: new Date() } });
}

/** Refreshes a login's tokens. Only one caller at a time does it (a lease in the database); the others wait and use the result. */
async function refreshWithLease(connId: string, usedAccess: string | null, ahead: number = REFRESH_AHEAD_MS): Promise<string> {
  const col = await connectionsCol();
  const holder = randomUUID();
  let claimed: ConnectionDoc | null = null;
  for (let i = 0; i < 60 && !claimed; i++) {
    const now = new Date();
    claimed = await col.findOneAndUpdate({ _id: connId, $or: [{ lease: null }, { "lease.until": { $lt: now } }] }, { $set: { lease: { holder, until: new Date(now.getTime() + LEASE_MS) } } }, { returnDocument: "after" });
    if (claimed) break;
    await sleep(250);
    const c = await col.findOne({ _id: connId });
    if (!c) throw new AccountAuthError("That login was disconnected.");
    const tok = decryptSecret(c.accessEnc, connAad(connId, "access"));
    // Someone else finished the refresh while we waited: use theirs.
    if (tok && tok !== usedAccess && !needsRefresh(c, ahead) && c.status === "active") return tok;
  }
  if (!claimed) throw new SmmsInputError("The login is being refreshed by another request. Please try again in a moment.");
  try {
    const c = claimed;
    const current = decryptSecret(c.accessEnc, connAad(connId, "access"));
    if (current && current !== usedAccess && !needsRefresh(c, ahead) && c.status === "active") return current;
    const refresh = decryptSecret(c.refreshEnc, connAad(connId, "refresh"));
    const adapter = ADAPTERS[c.oauth];
    if (!refresh || !adapter.refresh) throw new AccountAuthError(`${label(c)} can't renew this login by itself. Reconnect it in Settings > Connected accounts.`);
    let ts;
    try {
      ts = await adapter.refresh(await appFor(c.oauth), refresh);
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 401)) {
        await setConnectionState(connId, "revoked", `${label(c)} refused to renew the login (${e.message}). The person revoked access or the refresh token lapsed.`);
        await recordAudit({ actorId: SYSTEM.userId, action: "update", entity: "integration", entityId: connId, entityLabel: `${label(c)}: ${c.name}`, summary: "Login could not be renewed: reconnect needed" });
        throw new AccountAuthError(`${label(c)} access was revoked or expired. Reconnect it in Settings > Connected accounts.`);
      }
      throw new SmmsInputError(`${label(c)} could not be reached to renew the login. It will be retried.`);
    }
    const now = new Date();
    const set: Record<string, unknown> = { accessEnc: encryptSecret(ts.access, connAad(connId, "access")), tokenExpiresAt: ts.expiresAt, lastRefreshedAt: now, lastError: null, status: "active", lease: null, updatedAt: now };
    // X (and some Google responses) hand back a NEW refresh token: it must replace the old one in the same write.
    if (ts.refresh) set.refreshEnc = encryptSecret(ts.refresh, connAad(connId, "refresh"));
    if (ts.scopes) set.scopes = ts.scopes;
    const res = await col.updateOne({ _id: connId, "lease.holder": holder }, { $set: set });
    if (res.matchedCount === 0) throw new SmmsInputError("The login refresh was interrupted. Please try again.");
    await recordAudit({ actorId: SYSTEM.userId, action: "update", entity: "integration", entityId: connId, entityLabel: `${label(c)}: ${c.name}`, summary: "Access token renewed" });
    return ts.access;
  } finally {
    await col.updateOne({ _id: connId, "lease.holder": holder }, { $set: { lease: null } }).catch(() => {});
  }
}

/** A usable access token for the login. `force` = the one we have was just rejected. */
async function freshAccess(connId: string, force: boolean): Promise<string> {
  const c = await (await connectionsCol()).findOne({ _id: connId });
  if (!c) throw new AccountAuthError("That login was disconnected.");
  if (c.status === "revoked") throw new AccountAuthError(`${label(c)} access was revoked. Reconnect it in Settings > Connected accounts.`);
  const token = decryptSecret(c.accessEnc, connAad(connId, "access"));
  if (!token) throw new AccountAuthError(`The stored ${label(c)} token can't be read. Reconnect the account.`);
  const expired = c.tokenExpiresAt !== null && c.tokenExpiresAt.getTime() <= Date.now();
  if (!c.refreshable) {
    if (expired || c.status === "expired") {
      if (c.status !== "expired") await setConnectionState(connId, "expired", `${label(c)} login expired on ${c.tokenExpiresAt?.toISOString().slice(0, 10)}.`);
      throw new AccountAuthError(`The ${label(c)} login expired. Reconnect it in Settings > Connected accounts.`);
    }
    if (force) throw new AccountAuthError(`${label(c)} rejected the login and it can't be renewed by itself. Reconnect it in Settings > Connected accounts.`);
    return token;
  }
  if (force || expired || needsRefresh(c, REFRESH_AHEAD_MS) || c.status === "expired") return refreshWithLease(connId, force ? token : null);
  return token;
}

async function resolveToken(a: AccountDoc, force: boolean): Promise<string> {
  if (a.tokenEnc) {
    // An account's own token is only as good as the login it came from.
    const owner = await (await connectionsCol()).findOne({ _id: a.connectionId });
    if (!owner || owner.status === "revoked") throw new AccountAuthError(`${CONNECTION_INFO[a.oauth].short} access was revoked. Reconnect it in Settings > Connected accounts.`);
    if (owner.status === "expired" || (!owner.refreshable && owner.tokenExpiresAt && owner.tokenExpiresAt.getTime() <= Date.now())) throw new AccountAuthError(`The ${CONNECTION_INFO[a.oauth].short} login expired. Reconnect it in Settings > Connected accounts.`);
    const own = decryptSecret(a.tokenEnc, acctAad(a._id));
    const pageId = a.provider === "facebook_page" ? a.externalId : a.meta.pageId;
    if (force && pageId && a.oauth === "meta") {
      // A Page token can be read again from the person's token, so a rejected one is repaired without bothering anyone.
      const user = await freshAccess(a.connectionId, false);
      let next: string;
      try {
        next = await fetchPageToken(user, pageId);
      } catch (e) {
        throw new AccountAuthError(`Meta no longer gives access to this Page (${e instanceof Error ? e.message : "error"}). Reconnect Meta in Settings > Connected accounts.`);
      }
      if (next === own) throw new AccountAuthError("Meta rejected this Page's token and has no newer one. Reconnect Meta in Settings > Connected accounts.");
      await (await accountsCol()).updateOne({ _id: a._id }, { $set: { tokenEnc: encryptSecret(next, acctAad(a._id)), lastRefreshedAt: new Date(), updatedAt: new Date() } });
      return next;
    }
    if (own) return own;
    throw new AccountAuthError("The stored account token can't be read. Reconnect the account.");
  }
  return freshAccess(a.connectionId, force);
}

/**
 * Runs `fn` with the account's current token. Refreshes first when it is about to expire; if the platform answers 401 it refreshes once
 * and calls `fn` again. Never returns the token. When the login cannot be used, throws `AccountAuthError` (a message safe to show).
 */
export async function withAccountToken<T>(accountId: string, fn: (token: string, account: AccountView) => Promise<T>): Promise<T> {
  await ensureMigrated();
  const doc = await (await accountsCol()).findOne({ _id: accountId });
  if (!doc || doc.disconnectedAt) throw new AccountAuthError("That account isn't connected any more. Connect it again in Settings > Connected accounts.");
  const view = async () => toView((await (await accountsCol()).findOne({ _id: accountId })) ?? doc, await (await connectionsCol()).findOne({ _id: doc.connectionId }));
  let token = await resolveToken(doc, false);
  try {
    return await fn(token, await view());
  } catch (e) {
    if (!isAuthFailure(e)) throw e;
  }
  try {
    token = await resolveToken((await (await accountsCol()).findOne({ _id: accountId })) ?? doc, true);
  } catch (e) {
    await markAccountError(accountId, e instanceof Error ? e.message : "The platform rejected the login.", { auth: true });
    throw e;
  }
  try {
    return await fn(token, await view());
  } catch (e) {
    if (isAuthFailure(e)) {
      const msg = `${CONNECTION_INFO[doc.oauth].short} rejected the login even after renewing it. Reconnect it in Settings > Connected accounts.`;
      await markAccountError(accountId, msg, { auth: true });
      throw new AccountAuthError(msg);
    }
    throw e;
  }
}

/** Records why a call with this account failed (shown on the account). `auth: true` also tells the admins the login needs attention. */
export async function markAccountError(accountId: string, message: string, opts: { auth?: boolean } = {}): Promise<void> {
  const msg = message.replace(/\s+/g, " ").slice(0, 300);
  const a = await (await accountsCol()).findOneAndUpdate({ _id: accountId }, { $set: { lastError: msg, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!a) return;
  if (opts.auth) {
    await smmsEvents.accountIssue({ title: `${a.name} (${CONNECTION_INFO[a.oauth].short}) needs attention`, body: msg, link: "/viralpulse-ai/settings/accounts", dedupeKey: `acct-err:${accountId}:${new Date().toISOString().slice(0, 10)}` });
  }
}


// ── connecting ─────────────────────────────────────────────────────────────────────────────────────

export interface StartedConnect {
  url: string;
  /** Goes in an httpOnly cookie; binds the callback to the browser that started the flow. */
  nonce: string;
}

export async function startConnect(p: { oauth: ConnectionProvider; userId: string; origin: string; features?: string[] | null; connectionId?: string | null; extraScopes?: string[] }): Promise<StartedConnect> {
  if (!isEncryptionConfigured()) throw new SmmsInputError("Secure storage isn't available right now. Please try again in a few minutes, or contact support.");
  const app = await appFor(p.oauth);
  await ensureMigrated();
  let features = p.features ?? null;
  if (p.connectionId) {
    const c = await (await connectionsCol()).findOne({ _id: p.connectionId });
    if (!c || c.oauth !== p.oauth) throw new SmmsInputError("That login doesn't exist.");
    // Reconnecting keeps everything the login could do before, and adds what is being fixed.
    features = [...new Set([...(c.features.length ? c.features : featuresForScopes(p.oauth, c.scopes)), ...(features ?? [])])];
  }
  const sf = scopesForFeatures(p.oauth, features);
  const scopes = [...new Set([...sf.scopes, ...(p.extraScopes ?? [])])];
  const adapter = ADAPTERS[p.oauth];
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(18).toString("base64url");
  const pkce = adapter.usesPkce ? pkcePair() : null;
  const id = sha(state);
  const redirectUri = oauthRedirectUrl(p.oauth, p.origin);
  await (await statesCol()).insertOne({
    _id: id, oauth: p.oauth, userId: p.userId, nonceHash: sha(nonce),
    verifierEnc: pkce ? encryptSecret(pkce.verifier, `oauthstate:${id}`) : null,
    redirectUri, scopes, features: sf.features, rerequest: Boolean(p.connectionId), connectionId: p.connectionId ?? null, createdAt: new Date(),
  } satisfies OAuthStateDoc);
  return { url: adapter.authorizeUrl({ app, redirectUri, state, scopes, challenge: pkce?.challenge ?? null, rerequest: Boolean(p.connectionId) }), nonce };
}

/** Throws a pending connect request away (the person said no at the platform), so it cannot be used later. */
export async function discardConnectState(state: string): Promise<void> {
  await (await statesCol()).deleteOne({ _id: sha(state) }).catch(() => {});
}

export interface ConnectResult {
  connectionId: string;
  oauth: ConnectionProvider;
  name: string;
  accounts: number;
  notes: string[];
  missing: string[];
}

/**
 * The callback half. The `state` is single use (deleted atomically as it is read, so a replayed callback finds nothing), must belong to the
 * signed-in person and the browser cookie nonce, and must be under ten minutes old.
 */
export async function finishConnect(p: { oauth: ConnectionProvider; state: string; nonce: string; code: string; actor: Actor }): Promise<ConnectResult> {
  const st = await (await statesCol()).findOneAndDelete({ _id: sha(p.state) });
  if (!st) throw new SmmsInputError("The connection request expired or was already used. Please start again.");
  const a = Buffer.from(st.nonceHash);
  const b = Buffer.from(sha(p.nonce || ""));
  if (st.oauth !== p.oauth || st.userId !== p.actor.userId || a.length !== b.length || !timingSafeEqual(a, b) || Date.now() - st.createdAt.getTime() > STATE_MAX_AGE_MS) {
    throw new SmmsInputError("The connection request didn't match this browser session. Please start again.");
  }
  const adapter = ADAPTERS[p.oauth];
  const app = await appFor(p.oauth);
  const verifier = st.verifierEnc ? decryptSecret(st.verifierEnc, `oauthstate:${st._id}`) : null;
  let tokens;
  try {
    tokens = await adapter.exchange(app, p.code, st.redirectUri, verifier);
  } catch (e) {
    throw new SmmsInputError(`${CONNECTION_INFO[p.oauth].short} didn't accept the sign-in: ${e instanceof Error ? e.message : "error"}. Check the app credentials and the redirect URL.`);
  }
  const insp = await adapter.inspect(app, tokens.access);
  if (!insp.valid) throw new SmmsInputError(`${CONNECTION_INFO[p.oauth].short} returned a token that isn't valid: ${insp.error ?? "unknown reason"}.`);
  // What the platform says it granted wins; when it does not say (X), what was asked for and returned in the token response.
  const granted = insp.scopes ?? tokens.scopes ?? st.scopes;
  const identity = await adapter.identity(tokens.access);
  const disc = await adapter.discover(tokens.access, granted);
  const result = await saveConnection({ oauth: p.oauth, tokens, insp, granted, identity, disc, features: st.features, actor: p.actor, reconnectId: st.connectionId });
  await recordAudit({ actorId: p.actor.userId, actorEmail: p.actor.email, action: "connect", entity: "integration", entityId: result.connectionId, entityLabel: CONNECTION_INFO[p.oauth].label, summary: `${identity.name}: ${result.accounts} account${result.accounts === 1 ? "" : "s"} found` });
  return result;
}

async function saveConnection(p: {
  oauth: ConnectionProvider; tokens: { access: string; refresh: string | null; expiresAt: Date | null }; insp: { expiresAt?: Date | null; dataAccessExpiresAt?: Date | null };
  granted: string[]; identity: { externalUserId: string; name: string; avatarUrl: string | null }; disc: { accounts: Discovered[]; notes: string[] }; features: string[]; actor: Actor; reconnectId: string | null;
}): Promise<ConnectResult> {
  const conns = await connectionsCol();
  const accts = await accountsCol();
  const now = new Date();
  let existing = await conns.findOne({ oauth: p.oauth, externalUserId: p.identity.externalUserId });
  if (p.reconnectId) {
    const target = await conns.findOne({ _id: p.reconnectId });
    if (target && target.oauth === p.oauth && !target.legacyFrom) {
      // Reconnect renews THIS login. Signing in as someone else must not quietly create a second login (and leave this one expired).
      if (target.externalUserId !== p.identity.externalUserId) {
        throw new SmmsInputError(`You signed in as "${p.identity.name}", but this reconnect is for "${target.name}". Sign in as ${target.name} to renew it, or use Connect to add ${p.identity.name} as a separate login.`);
      }
      existing = target;
    }
  }
  const id = existing?._id ?? randomUUID();
  const previousRefresh = existing?.refreshEnc ? decryptSecret(existing.refreshEnc, connAad(id, "refresh")) : null;
  const refresh = p.tokens.refresh ?? previousRefresh;
  const expiresAt = p.insp.expiresAt !== undefined ? p.insp.expiresAt : p.tokens.expiresAt;
  const mergedFeatures = [...new Set([...(existing?.features ?? []), ...p.features])];
  const body = {
    oauth: p.oauth, externalUserId: p.identity.externalUserId, name: p.identity.name, avatarUrl: p.identity.avatarUrl,
    accessEnc: encryptSecret(p.tokens.access, connAad(id, "access")), refreshEnc: refresh ? encryptSecret(refresh, connAad(id, "refresh")) : null,
    tokenExpiresAt: expiresAt ?? null, dataAccessExpiresAt: p.insp.dataAccessExpiresAt ?? null, refreshable: Boolean(refresh),
    scopes: p.granted, features: mergedFeatures, status: "active" as const, lastVerifiedAt: now, lastRefreshedAt: now, lastError: null, discoveryNotes: p.disc.notes, lease: null, updatedAt: now,
  };
  if (existing) await conns.updateOne({ _id: id }, { $set: body });
  else await conns.insertOne({ _id: id, ...body, connectedBy: p.actor.userId, connectedAt: now });

  const seen = new Set<string>();
  for (const d of p.disc.accounts) {
    seen.add(`${d.provider}|${d.externalId}`);
    const old = await accts.findOne({ provider: d.provider, externalId: d.externalId });
    const aid = old?._id ?? randomUUID();
    const common = {
      name: d.name, handle: d.handle ?? null, avatarUrl: d.avatarUrl ?? null, connectionId: id, oauth: p.oauth, meta: d.meta ?? {},
      tokenEnc: d.token ? encryptSecret(d.token, acctAad(aid)) : null, lastVerifiedAt: now, lastError: null, disconnectedAt: null, updatedAt: now,
    };
    if (old) {
      // An account switched off because its login was disconnected comes back as it was; one nobody ever decided on follows the first-of-its-kind rule.
      let restore: { enabled: boolean; isDefault: boolean } | null = null;
      if (old.disconnectedAt) {
        const otherEnabled = (await accts.countDocuments({ provider: d.provider, enabled: true, disconnectedAt: null, _id: { $ne: aid } })) > 0;
        const otherDefault = (await accts.countDocuments({ provider: d.provider, isDefault: true, enabled: true, disconnectedAt: null, _id: { $ne: aid } })) > 0;
        const enabled = old.enabledBeforeDisconnect ?? !otherEnabled;
        restore = { enabled, isDefault: enabled && !otherDefault && (old.defaultBeforeDisconnect ?? !otherEnabled) };
      }
      await accts.updateOne({ _id: aid }, { $set: { ...common, ...(restore ?? {}), status: computeStatus({ provider: d.provider, now, connectionStatus: "active", tokenExpiresAt: expiresAt ?? null, dataAccessExpiresAt: p.insp.dataAccessExpiresAt ?? null, refreshable: Boolean(refresh), scopes: p.granted }) } });
    } else {
      // The first account of a kind is switched on (and made the default) so a single-account company can publish straight away; more are the admin's choice.
      const hasEnabled = (await accts.countDocuments({ provider: d.provider, enabled: true, disconnectedAt: null })) > 0;
      await accts.insertOne({
        _id: aid, provider: d.provider, externalId: d.externalId, ...common,
        status: computeStatus({ provider: d.provider, now, connectionStatus: "active", tokenExpiresAt: expiresAt ?? null, dataAccessExpiresAt: p.insp.dataAccessExpiresAt ?? null, refreshable: Boolean(refresh), scopes: p.granted }),
        enabled: !hasEnabled, isDefault: !hasEnabled, client: null, lastRefreshedAt: null, connectedBy: p.actor.userId, connectedAt: now,
      });
    }
  }
  // Accounts this login owned before but the platform no longer returns (access removed in the login dialog): keep the row, switch it off.
  const mine = await accts.find({ connectionId: id, disconnectedAt: null }).toArray();
  for (const m of mine) {
    if (seen.has(`${m.provider}|${m.externalId}`)) continue;
    await accts.updateOne({ _id: m._id }, { $set: { disconnectedAt: now, enabledBeforeDisconnect: m.enabled, defaultBeforeDisconnect: m.isDefault, enabled: false, isDefault: false, lastError: `${CONNECTION_INFO[p.oauth].short} no longer gives this login access to it.`, updatedAt: now } });
  }
  await pruneLegacyConnection(p.oauth, id);
  const missing = [...new Set(p.disc.accounts.flatMap((d) => diffScopes(d.provider, p.granted).missingRequired))];
  return { connectionId: id, oauth: p.oauth, name: p.identity.name, accounts: p.disc.accounts.length, notes: p.disc.notes, missing };
}

/** Once a real login has taken over the accounts of the migrated one, the migrated login and the old document are retired. */
async function pruneLegacyConnection(oauth: ConnectionProvider, keepId: string): Promise<void> {
  const conns = await connectionsCol();
  const legacy = await conns.findOne({ legacyFrom: oauth });
  if (!legacy || legacy._id === keepId) return;
  const legacyId = legacy._id;
  if ((await (await accountsCol()).countDocuments({ connectionId: legacyId, disconnectedAt: null })) === 0) {
    await conns.deleteOne({ _id: legacyId });
    await (await smmsCollection<IntegrationDoc>(COLLECTIONS.integrations)).deleteOne({ _id: oauth as never });
  }
}

// ── managing ───────────────────────────────────────────────────────────────────────────────────────

async function mustAccount(id: string): Promise<AccountDoc> {
  const a = await (await accountsCol()).findOne({ _id: id });
  if (!a || a.disconnectedAt) throw new SmmsInputError("That account isn't connected.");
  return a;
}

export async function setAccountEnabled(id: string, enabled: boolean, actor: Actor): Promise<void> {
  const a = await mustAccount(id);
  const col = await accountsCol();
  if (enabled) {
    const hasDefault = (await col.countDocuments({ provider: a.provider, enabled: true, isDefault: true, disconnectedAt: null, _id: { $ne: id } })) > 0;
    await col.updateOne({ _id: id }, { $set: { enabled: true, isDefault: a.isDefault || !hasDefault, updatedAt: new Date() } });
  } else {
    await col.updateOne({ _id: id }, { $set: { enabled: false, isDefault: false, updatedAt: new Date() } });
    // Another enabled account of the kind takes over as default.
    const next = await col.findOne({ provider: a.provider, enabled: true, disconnectedAt: null, _id: { $ne: id } });
    if (a.isDefault && next && !(await col.findOne({ provider: a.provider, isDefault: true, enabled: true, disconnectedAt: null }))) await col.updateOne({ _id: next._id }, { $set: { isDefault: true } });
  }
  await recordAudit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "integration", entityId: id, entityLabel: a.name, summary: `${ACCOUNT_INFO[a.provider].label} ${enabled ? "enabled" : "disabled"}` });
}

export async function setAccountDefault(id: string, actor: Actor): Promise<void> {
  const a = await mustAccount(id);
  const col = await accountsCol();
  await col.updateMany({ provider: a.provider, _id: { $ne: id } }, { $set: { isDefault: false } });
  await col.updateOne({ _id: id }, { $set: { isDefault: true, enabled: true, updatedAt: new Date() } });
  await recordAudit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "integration", entityId: id, entityLabel: a.name, summary: `Default ${ACCOUNT_INFO[a.provider].label}` });
}

export async function setAccountClient(id: string, client: string | null, actor: Actor): Promise<void> {
  const a = await mustAccount(id);
  const v = client ? client.trim().slice(0, 80) : null;
  await (await accountsCol()).updateOne({ _id: id }, { $set: { client: v || null, updatedAt: new Date() } });
  await recordAudit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "integration", entityId: id, entityLabel: a.name, summary: `Client label: ${v || "none"}` });
}

/** Disconnects a whole login: revokes it at the platform where there is an API for it, deletes the stored tokens and switches its accounts off. */
export async function disconnectConnection(connId: string, actor: Actor): Promise<{ revokedAtProvider: boolean }> {
  const conns = await connectionsCol();
  const c = await conns.findOne({ _id: connId });
  if (!c) throw new SmmsInputError("That login isn't connected.");
  let revoked = false;
  const access = decryptSecret(c.accessEnc, connAad(connId, "access"));
  if (access && c.status !== "revoked") {
    try {
      revoked = await ADAPTERS[c.oauth].revoke(await appFor(c.oauth), { access, refresh: decryptSecret(c.refreshEnc, connAad(connId, "refresh")), userId: c.externalUserId });
    } catch {
      revoked = false;
    }
  }
  const now = new Date();
  await conns.deleteOne({ _id: connId });
  const acctCol = await accountsCol();
  for (const a of await acctCol.find({ connectionId: connId }).toArray()) {
    // Remember the switches of an account that was live; one already disconnected keeps what was remembered then.
    const remembered = a.disconnectedAt ? {} : { enabledBeforeDisconnect: a.enabled, defaultBeforeDisconnect: a.isDefault };
    await acctCol.updateOne({ _id: a._id }, { $set: { ...remembered, disconnectedAt: a.disconnectedAt ?? now, enabled: false, isDefault: false, tokenEnc: null, status: "revoked", updatedAt: now } });
  }
  if (c.legacyFrom) await (await smmsCollection<IntegrationDoc>(COLLECTIONS.integrations)).deleteOne({ _id: c.legacyFrom as never });
  await recordAudit({ actorId: actor.userId, actorEmail: actor.email, action: "disconnect", entity: "integration", entityId: connId, entityLabel: `${CONNECTION_INFO[c.oauth].label}: ${c.name}`, summary: revoked ? "Access revoked at the platform" : "Tokens deleted here; revoke it in the platform's settings too" });
  await smmsEvents.disconnected(`${CONNECTION_INFO[c.oauth].short} (${c.name})`);
  return { revokedAtProvider: revoked };
}

/** A real read call against the platform using this account. */
export async function testAccount(id: string, actor: Actor): Promise<{ ok: boolean; detail: string }> {
  const a = await getAccount(id);
  if (!a || a.disconnected) throw new SmmsInputError("That account isn't connected.");
  const doc = await mustAccount(id);
  try {
    const detail = await withAccountToken(id, (token) => ADAPTERS[doc.oauth].probe({ provider: doc.provider, externalId: doc.externalId, meta: doc.meta }, token));
    await (await accountsCol()).updateOne({ _id: id }, { $set: { lastVerifiedAt: new Date(), lastError: null, updatedAt: new Date() } });
    await recordAudit({ actorId: actor.userId, actorEmail: actor.email, action: "update", entity: "integration", entityId: id, entityLabel: doc.name, summary: "Connection tested: ok" });
    return { ok: true, detail };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "The test failed.";
    await markAccountError(id, msg);
    return { ok: false, detail: msg };
  }
}

// ── the sweep ──────────────────────────────────────────────────────────────────────────────────────

export interface SweepSummary {
  connections: number;
  refreshed: number;
  verified: number;
  resealed: number;
  notified: number;
  errors: number;
  statuses: Record<AccountStatus, number>;
}

const weekKey = (d: Date) => `${d.getUTCFullYear()}-w${Math.floor(d.getTime() / (7 * 86_400_000))}`;

/**
 * Keeps every login honest: re-seals tokens after a key rotation, renews tokens that are close to expiry, asks the platform whether each
 * token is still valid and what it allows (`debug_token`, tokeninfo, introspection), refreshes each account's status and tells the admins
 * about anything that is expiring (14 / 7 / 3 / 1 days ahead), expired, revoked or missing a permission. Safe to run twice at once.
 */
export async function runAccountsSweep(now: Date = new Date()): Promise<SweepSummary> {
  await ensureMigrated();
  const sum: SweepSummary = { connections: 0, refreshed: 0, verified: 0, resealed: 0, notified: 0, errors: 0, statuses: { healthy: 0, expiring: 0, expired: 0, revoked: 0, missing_scope: 0 } };
  const conns = await connectionsCol();
  const accts = await accountsCol();
  for (const c0 of await conns.find({}).toArray()) {
    sum.connections++;
    try {
      let c = c0;
      // 1. key rotation
      const patch: Record<string, unknown> = {};
      if (!isSealedWithCurrentKey(c.accessEnc)) patch.accessEnc = resealSecret(c.accessEnc!, connAad(c._id, "access"));
      if (c.refreshEnc && !isSealedWithCurrentKey(c.refreshEnc)) patch.refreshEnc = resealSecret(c.refreshEnc, connAad(c._id, "refresh"));
      for (const k of Object.keys(patch)) if (!patch[k]) delete patch[k];
      if (Object.keys(patch).length) {
        await conns.updateOne({ _id: c._id }, { $set: patch });
        sum.resealed++;
      }
      for (const a of await accts.find({ connectionId: c._id, tokenEnc: { $ne: null } }).toArray()) {
        if (a.tokenEnc && !isSealedWithCurrentKey(a.tokenEnc)) {
          const next = resealSecret(a.tokenEnc, acctAad(a._id));
          if (next) {
            await accts.updateOne({ _id: a._id }, { $set: { tokenEnc: next } });
            sum.resealed++;
          }
        }
      }
      c = (await conns.findOne({ _id: c._id })) ?? c;
      // 2. renew
      if (c.status !== "revoked" && c.refreshable && needsRefresh(c, SWEEP_REFRESH_AHEAD_MS)) {
        try {
          await refreshWithLease(c._id, null, SWEEP_REFRESH_AHEAD_MS);
          sum.refreshed++;
        } catch {
          sum.errors++;
        }
        c = (await conns.findOne({ _id: c._id })) ?? c;
      }
      // 3. ask the platform
      const due = !c.lastVerifiedAt || now.getTime() - c.lastVerifiedAt.getTime() >= VERIFY_EVERY_MS[c.oauth];
      const expiredNow = c.tokenExpiresAt !== null && c.tokenExpiresAt.getTime() <= now.getTime() && !c.refreshable;
      if (c.status !== "revoked" && due && !expiredNow) {
        const app = await oauthApp(c.oauth);
        const token = decryptSecret(c.accessEnc, connAad(c._id, "access"));
        if (app && token) {
          const insp = await ADAPTERS[c.oauth].inspect(app, token);
          sum.verified++;
          if (!insp.valid) {
            await setConnectionState(c._id, insp.revoked || !c.refreshable ? "revoked" : "expired", insp.error ?? "The platform no longer accepts this login.");
            await recordAudit({ actorId: SYSTEM.userId, action: "update", entity: "integration", entityId: c._id, entityLabel: `${label(c)}: ${c.name}`, summary: "Login is no longer valid at the platform" });
          } else {
            const set: Record<string, unknown> = { lastVerifiedAt: now, status: "active", lastError: insp.error ? c.lastError : null, updatedAt: now };
            if (insp.scopes) set.scopes = insp.scopes;
            if (insp.expiresAt !== undefined) set.tokenExpiresAt = insp.expiresAt;
            if (insp.dataAccessExpiresAt !== undefined) set.dataAccessExpiresAt = insp.dataAccessExpiresAt;
            await conns.updateOne({ _id: c._id }, { $set: set });
          }
        }
      } else if (expiredNow && c.status === "active") {
        await setConnectionState(c._id, "expired", `${label(c)} login expired on ${c.tokenExpiresAt!.toISOString().slice(0, 10)}.`);
      }
      c = (await conns.findOne({ _id: c._id })) ?? c;
      // 4. statuses and notices
      const list = await accts.find({ connectionId: c._id, disconnectedAt: null }).toArray();
      let notified = 0;
      for (const a of list) {
        const v = toView(a, c, now);
        sum.statuses[v.status]++;
        if (a.status !== v.status) await accts.updateOne({ _id: a._id }, { $set: { status: v.status, updatedAt: now } });
      }
      notified += await notifyConnection(c, list.map((a) => toView(a, c, now)), now);
      sum.notified += notified;
    } catch (e) {
      sum.errors++;
      console.error("[viralpulse accounts sweep]", c0.oauth, e instanceof Error ? e.message.slice(0, 200) : "error");
    }
  }
  return sum;
}

async function notifyConnection(c: ConnectionDoc, views: AccountView[], now: Date): Promise<number> {
  if (views.length === 0) return 0;
  const reconnect = `/api/viralpulse-ai/oauth/${c.oauth}?reconnect=${encodeURIComponent(c._id)}`;
  const who = `${label(c)} (${c.name})`;
  const exp = effectiveExpiry(c);
  const days = daysUntil(exp, now);
  const statuses = new Set(views.map((v) => v.status));
  let n = 0;
  if (statuses.has("revoked")) {
    await smmsEvents.accountIssue({ title: `${who} was disconnected`, body: c.lastError ?? "Access was withdrawn. Reconnect it so posts can go out.", link: reconnect, dedupeKey: `acct-bad:${c._id}:revoked:${weekKey(now)}` });
    n++;
  } else if (statuses.has("expired")) {
    await smmsEvents.accountIssue({ title: `${who} login has expired`, body: "Posts to these accounts will fail until someone reconnects it.", link: reconnect, dedupeKey: `acct-bad:${c._id}:expired:${weekKey(now)}` });
    n++;
  } else if (statuses.has("expiring")) {
    const bucket = warnBucket(days);
    if (bucket !== null) {
      await smmsEvents.accountIssue({ title: `${who} login expires in ${days === 0 ? "less than a day" : `${days} day${days === 1 ? "" : "s"}`}`, body: `${CONNECTION_INFO[c.oauth].short} logins like this one can't renew themselves. Reconnect before ${exp?.toISOString().slice(0, 10)} so scheduled posts keep going out.`, link: reconnect, dedupeKey: `acct-exp:${c._id}:${bucket}:${exp?.toISOString().slice(0, 10)}` });
      n++;
    }
  }
  for (const v of views.filter((x) => x.status === "missing_scope")) {
    await smmsEvents.accountIssue({ title: `${v.name}: missing permission`, body: `Missing: ${v.missingRequired.join(", ")}. Press "Fix permissions" on the account to grant it.`, link: "/viralpulse-ai/settings/accounts", dedupeKey: `acct-scope:${v.id}:${sha(v.missingRequired.join(",")).slice(0, 10)}` });
    n++;
  }
  return n;
}

/** How many accounts need someone to look (not healthy, or the last call failed): for the sidebar badge. */
export async function countAccountsNeedingAttention(now: Date = new Date()): Promise<number> {
  const list = await listAccounts({}, now);
  return list.filter((v) => v.enabled && (v.status !== "healthy" || v.lastError)).length;
}

// ── compatibility helpers for code written against the old single-connection store ────────────────────────────────

/** A current access token for a login (renewed when about to expire). For the compatibility layer; new code uses `withAccountToken`. */
export async function freshAccessToken(connectionId: string): Promise<string> {
  return freshAccess(connectionId, false);
}

/** The Facebook Page token for an account, or null. Compatibility only: publishers written against the old store read it this way. */
export async function getPageToken(accountId: string): Promise<string | null> {
  const a = await (await accountsCol()).findOne({ _id: accountId });
  return a?.tokenEnc ? decryptSecret(a.tokenEnc, acctAad(a._id)) : null;
}
