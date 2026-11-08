import "server-only";
import { COLLECTIONS, smmsCollection } from "@/lib/products/viralpulse-ai/db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { decryptSecret, encryptSecret } from "@/lib/products/viralpulse-ai/crypto";
import type { IntegrationDoc } from "@/lib/products/viralpulse-ai/integrations";
import { ACCOUNT_INFO, diffScopes, type AccountDoc, type AccountProvider, type AccountView, type ConnectionDoc, type ConnectionProvider } from "./types";
import { computeStatus, daysUntil, effectiveExpiry } from "./status";

export const ACCOUNT_COLLECTIONS = { connections: "smms_account_connections", accounts: "smms_accounts", states: "smms_oauth_states" } as const;

export interface OAuthStateDoc {
  /** sha256 of the `state` value sent to the provider: the value itself is never stored. */
  _id: string;
  oauth: ConnectionProvider;
  userId: string;
  nonceHash: string;
  verifierEnc: import("@/lib/products/viralpulse-ai/crypto").EncryptedValue | null;
  redirectUri: string;
  scopes: string[];
  features: string[];
  rerequest: boolean;
  /** Reconnecting this login (keeps its accounts and settings). */
  connectionId: string | null;
  createdAt: Date;
}

let indexed = false;
async function ensureIndexes() {
  if (indexed) return;
  indexed = true;
  const [c, a, s] = await Promise.all([connectionsCol(true), accountsCol(true), statesCol(true)]);
  await Promise.all([
    c.createIndex({ oauth: 1, externalUserId: 1 }, { unique: true }).catch(() => {}),
    a.createIndex({ provider: 1, externalId: 1 }, { unique: true }).catch(() => {}),
    a.createIndex({ connectionId: 1 }).catch(() => {}),
    s.createIndex({ createdAt: 1 }, { expireAfterSeconds: 900 }).catch(() => {}),
  ]);
}

export async function connectionsCol(raw = false) {
  const c = await smmsCollection<ConnectionDoc>(ACCOUNT_COLLECTIONS.connections);
  if (!raw) await ensureIndexes();
  return c;
}
export async function accountsCol(raw = false) {
  const c = await smmsCollection<AccountDoc>(ACCOUNT_COLLECTIONS.accounts);
  if (!raw) await ensureIndexes();
  return c;
}
export async function statesCol(raw = false) {
  const c = await smmsCollection<OAuthStateDoc>(ACCOUNT_COLLECTIONS.states);
  if (!raw) await ensureIndexes();
  return c;
}

export const connAad = (id: string, kind: "access" | "refresh") => `conn:${id}:${kind}`;
export const acctAad = (id: string) => `acct:${id}:token`;

export function toView(a: AccountDoc, c: ConnectionDoc | null, now: Date = new Date()): AccountView {
  const scopes = c?.scopes ?? [];
  const diff = diffScopes(a.provider, scopes);
  const exp = c ? effectiveExpiry(c) : null;
  const status = c
    ? computeStatus({ provider: a.provider, now, connectionStatus: c.status, tokenExpiresAt: c.tokenExpiresAt, dataAccessExpiresAt: c.dataAccessExpiresAt, refreshable: c.refreshable, scopes, disconnected: Boolean(a.disconnectedAt) })
    : "revoked";
  return {
    id: a._id,
    provider: a.provider,
    providerLabel: ACCOUNT_INFO[a.provider].label,
    oauth: a.oauth,
    externalId: a.externalId,
    name: a.name,
    handle: a.handle,
    avatarUrl: a.avatarUrl,
    connectionId: a.connectionId,
    connectionName: c?.name ?? "—",
    status,
    enabled: a.enabled && !a.disconnectedAt,
    isDefault: a.isDefault,
    client: a.client,
    scopes,
    missingRequired: diff.missingRequired,
    missingOptional: diff.missingOptional,
    expiresAt: exp ? exp.toISOString() : null,
    daysLeft: daysUntil(exp, now),
    autoRenews: Boolean(c?.refreshable),
    lastVerifiedAt: (a.lastVerifiedAt ?? c?.lastVerifiedAt)?.toISOString() ?? null,
    lastError: a.lastError ?? c?.lastError ?? null,
    connectedAt: a.connectedAt.toISOString(),
    disconnected: Boolean(a.disconnectedAt),
    meta: a.meta,
  };
}

// ── Lazy migration from the old one-document-per-provider store (`smms_integrations`) ─────────────────────────────────

const migrated = new Set<string>();
export function resetMigrationCacheForTests() {
  migrated.clear();
}

const LEGACY_PROVIDERS: ConnectionProvider[] = ["meta", "google", "linkedin"];

/**
 * Copies a company's old connection (one per provider, with its chosen targets) into connections and accounts, once. Idempotent and safe
 * to race: every write is an upsert with fixed ids. The old document is left in place (nothing is deleted), and tokens are re-sealed with
 * the new record ids as authenticated data. Existing posts keep working because they never stored an account id: they resolve the
 * default account for their platform through `getAccountFor`.
 */
export async function ensureMigrated(): Promise<void> {
  const company = await currentCompanyId();
  if (migrated.has(company)) return;
  let failures = 0;
  /** One failed write must not hide the rest, and must not be forgotten: it is logged and the migration runs again on the next call. A duplicate key means a concurrent run already wrote it. */
  const attempt = async (what: string, write: () => Promise<unknown>) => {
    try {
      await write();
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return;
      failures++;
      console.error(`[viralpulse] legacy connection migration: ${what} failed for company ${company}; it will be retried`, e instanceof Error ? e.message : e);
    }
  };
  const legacy = await smmsCollection<IntegrationDoc>(COLLECTIONS.integrations);
  const docs = await legacy.find({}).toArray();
  const conns = await connectionsCol();
  const accts = await accountsCol();
  for (const d of docs) {
    const p = d._id as ConnectionProvider;
    if (!LEGACY_PROVIDERS.includes(p)) continue;
    const access = decryptSecret(d.accessEnc, `${p}:access`);
    const refresh = d.refreshEnc ? decryptSecret(d.refreshEnc, `${p}:refresh`) : null;
    // `_id`s are unique across the whole collection (every company shares it), so a fixed `legacy-meta` would make the second company's
    // migration collide with the first. The company id is part of the id; an earlier plain-id row is found by `legacyFrom` and kept.
    const existingConn = await conns.findOne({ legacyFrom: p });
    const connId = existingConn?._id ?? `legacy-${company}-${p}`;
    const now = new Date();
    if (!existingConn && access) {
      await attempt(`connection ${p}`, () => conns
        .updateOne(
          { legacyFrom: p },
          {
            $setOnInsert: {
              _id: connId,
              oauth: p,
              externalUserId: `legacy:${p}`,
              name: d.accountName,
              avatarUrl: null,
              accessEnc: encryptSecret(access, connAad(connId, "access")),
              refreshEnc: refresh ? encryptSecret(refresh, connAad(connId, "refresh")) : null,
              tokenExpiresAt: d.expiresAt ?? null,
              dataAccessExpiresAt: null,
              refreshable: Boolean(refresh),
              scopes: d.scopes ?? [],
              features: [],
              status: "active",
              lastVerifiedAt: null,
              lastRefreshedAt: null,
              lastError: d.lastError ?? null,
              discoveryNotes: [],
              lease: null,
              connectedBy: d.connectedBy,
              connectedAt: d.connectedAt,
              updatedAt: now,
              legacyFrom: p,
            } satisfies ConnectionDoc,
          },
          { upsert: true },
        ));
    }
    if (!access) continue;
    const tg = d.targets;
    const t = {
      facebookPages: tg?.facebookPages ?? [],
      instagramAccounts: tg?.instagramAccounts ?? [],
      youtubeChannels: tg?.youtubeChannels ?? [],
      gbpLocations: tg?.gbpLocations ?? [],
      linkedinAuthors: tg?.linkedinAuthors ?? [],
    };
    const rows: { provider: AccountProvider; id: string; name: string; token?: string | null; meta?: Record<string, string>; platform: string }[] = [
      ...t.facebookPages.map((x) => ({ provider: "facebook_page" as const, id: x.id, name: x.name, token: x.tokenEnc ? decryptSecret(x.tokenEnc, `meta:page:${x.id}`) : null, platform: "facebook" })),
      ...t.instagramAccounts.map((x) => {
        const page = t.facebookPages.find((pg) => pg.id === x.pageId);
        return { provider: "instagram_business" as const, id: x.id, name: x.name, token: page?.tokenEnc ? decryptSecret(page.tokenEnc, `meta:page:${page.id}`) : null, meta: x.pageId ? { pageId: x.pageId } : undefined, platform: "instagram" };
      }),
      ...t.youtubeChannels.map((x) => ({ provider: "youtube_channel" as const, id: x.id, name: x.name, platform: "youtube" })),
      ...t.gbpLocations.map((x) => ({ provider: "gbp_location" as const, id: x.id, name: x.name, platform: "google_business" })),
      ...t.linkedinAuthors.map((x) => ({ provider: "linkedin_member" as const, id: x.id, name: x.name, platform: "linkedin" })),
    ];
    for (const r of rows) {
      const id = `legacy-${company}-${r.provider}-${r.id}`;
      const selected = d.selected?.[r.platform as keyof typeof d.selected] === r.id;
      await attempt(`account ${r.provider} ${r.id}`, () => accts
        .updateOne(
          { provider: r.provider, externalId: r.id },
          {
            $setOnInsert: {
              _id: id,
              provider: r.provider,
              oauth: p,
              externalId: r.id,
              name: r.name,
              handle: null,
              avatarUrl: null,
              connectionId: connId,
              tokenEnc: r.token ? encryptSecret(r.token, acctAad(id)) : null,
              status: "healthy",
              enabled: selected,
              isDefault: selected,
              client: null,
              meta: r.meta ?? {},
              lastVerifiedAt: null,
              lastRefreshedAt: null,
              lastError: null,
              connectedBy: d.connectedBy,
              connectedAt: d.connectedAt,
              updatedAt: now,
              disconnectedAt: null,
            } satisfies AccountDoc,
          },
          { upsert: true },
        ));
    }
  }
  if (failures === 0) migrated.add(company);
}
