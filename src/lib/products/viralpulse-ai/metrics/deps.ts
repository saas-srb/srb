import "server-only";
import { notDeleted } from "@/lib/products/viralpulse-ai/db";
import { postsCollection } from "@/lib/products/viralpulse-ai/posts";
import { attemptsCol } from "@/lib/products/viralpulse-ai/publishers/attempts";
import { smmsEvents } from "@/lib/notify/triggers/smms";
import { PROVIDER_PLATFORM } from "./types";
import type { MetricsDeps, SyncAccount } from "./sync";

/** The real wiring: connected accounts (WP2) for tokens, the posts and publish attempts for ids, the real clock and fetch. */
export const defaultMetricsDeps: MetricsDeps = {
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  fetch: (...a) => fetch(...a),
  budgetMs: 240_000,
  async listAccounts() {
    const { listAccounts } = await import("@/lib/products/viralpulse-ai/accounts/service");
    return (await listAccounts()).flatMap((v): SyncAccount[] => {
      const platform = PROVIDER_PLATFORM[v.provider];
      return platform ? [{ id: v.id, externalId: v.externalId, name: v.name, provider: v.provider, meta: v.meta, scopes: v.scopes, platform, enabled: v.enabled, isDefault: v.isDefault, status: v.status }] : [];
    });
  },
  async withToken(accountId, fn) {
    const { withAccountToken } = await import("@/lib/products/viralpulse-ai/accounts/service");
    return withAccountToken(accountId, (token) => fn(token));
  },
  async loadPosts() {
    return (await (await postsCollection()).find({ ...notDeleted, "variants.publish.state": "published" }, { projection: { contentType: 1, publishOptions: 1, "variants.platform": 1, "variants.publish": 1 } }).toArray()) as never;
  },
  async loadAttempts() {
    return (await (await attemptsCol()).find({ state: "published", externalId: { $ne: null } }, { projection: { postId: 1, platform: 1, accountId: 1, externalId: 1, finishedAt: 1 } }).toArray()) as never;
  },
  notify: (n) => smmsEvents.accountIssue(n),
  async linkedinVersion() {
    const { getSettings } = await import("@/lib/products/viralpulse-ai/settings");
    const { effectiveLinkedinVersion } = await import("@/lib/products/viralpulse-ai/linkedin-version");
    return effectiveLinkedinVersion((await getSettings()).linkedinVersion).version;
  },
};
