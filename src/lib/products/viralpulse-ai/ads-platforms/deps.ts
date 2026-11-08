import "server-only";
import { getObject } from "@/lib/storage/blob";
import { COLLECTIONS, smmsCollection } from "@/lib/products/viralpulse-ai/db";
import type { MediaDoc } from "@/lib/products/viralpulse-ai/media";
import { recordAudit } from "@/lib/products/viralpulse-ai/audit";
import { smmsEvents } from "@/lib/notify/triggers/smms";
import { MetaClient } from "./meta/client";
import { MetaApiError } from "./meta/errors";
import type { ByteSource } from "./meta/assets";

/**
 * Everything the launch service needs from the outside world, behind one interface so the tests run with a fake Meta, fake media and
 * no notifications. `defaultDeps` is the real wiring: connected accounts (WP2) for tokens, the media library for bytes.
 */

export interface AccountLite {
  id: string;
  externalId: string;
  name: string;
  provider: string;
  meta: Record<string, string>;
  enabled: boolean;
  status: string;
}

export interface MediaLite {
  id: string;
  kind: "image" | "video";
  name: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  storageKey: string;
}

export interface AdsDeps {
  withMeta<T>(accountId: string, fn: (client: MetaClient, account: AccountLite) => Promise<T>): Promise<T>;
  getAccount(id: string): Promise<AccountLite | null>;
  getMedia(ids: string[]): Promise<MediaLite[]>;
  byteSource(m: MediaLite): ByteSource;
  now(): Date;
  sleep(ms: number): Promise<void>;
  notify(n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
  audit: typeof recordAudit;
}

const lite = (v: { id: string; externalId: string; name: string; provider: string; meta: Record<string, string>; enabled: boolean; status: string }): AccountLite => ({ id: v.id, externalId: v.externalId, name: v.name, provider: v.provider, meta: v.meta, enabled: v.enabled, status: v.status });

export const defaultDeps: AdsDeps = {
  async withMeta(accountId, fn) {
    const { withAccountToken } = await import("@/lib/products/viralpulse-ai/accounts/service");
    const { oauthApp } = await import("@/lib/products/viralpulse-ai/accounts/apps");
    const app = await oauthApp("meta");
    return withAccountToken(accountId, async (token, acct) => {
      const client = new MetaClient({ token, appSecret: app?.secret ?? null });
      try {
        return await fn(client, lite(acct));
      } catch (e) {
        // The accounts layer refreshes the login and retries once on an auth failure; teach it that this is one.
        if (e instanceof MetaApiError && e.kind === "auth") throw Object.assign(new Error(e.message), { status: 401, code: "190" });
        throw e;
      }
    });
  },
  async getAccount(id) {
    const { getAccount } = await import("@/lib/products/viralpulse-ai/accounts/service");
    const a = await getAccount(id);
    return a ? lite(a) : null;
  },
  async getMedia(ids) {
    if (!ids.length) return [];
    const col = await smmsCollection<MediaDoc>(COLLECTIONS.media);
    const docs = await col.find({ _id: { $in: ids }, deletedAt: null }).toArray();
    return docs.map((m) => ({ id: m._id, kind: m.kind, name: m.name, contentType: m.contentType, size: m.size, width: m.width, height: m.height, durationSec: m.durationSec, storageKey: m.storageKey }));
  },
  byteSource(m) {
    return {
      size: m.size,
      async open() {
        const o = await getObject(m.storageKey);
        if (!o) throw new MetaApiError(`The file "${m.name}" is missing from the media library.`, 404, null, null, "validation", false);
        return o.stream;
      },
    };
  },
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  notify: (n) => smmsEvents.accountIssue(n),
  audit: recordAudit,
};
