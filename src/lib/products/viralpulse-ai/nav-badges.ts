import "server-only";
import { notDeleted } from "@/lib/products/viralpulse-ai/db";
import { postsCollection } from "@/lib/products/viralpulse-ai/posts";
import { adsCollection } from "@/lib/products/viralpulse-ai/ads";
import { projectsCollection } from "@/lib/products/viralpulse-ai/ugc/store";
import { countAccountsNeedingAttention } from "@/lib/products/viralpulse-ai/accounts/service";
import type { NavBadges, SmmsNavFlags } from "@/lib/products/viralpulse-ai/nav";

/**
 * Live counts for the sidebar badges, straight from the database. A section's count is only read when the viewer may see that
 * section, and any failure shows no badge (a badge is a hint, never a reason to break the page). Zero is not shown.
 */

export interface BadgeCounters {
  failedPosts(): Promise<number>;
  dueAds(now: Date): Promise<number>;
  generatingUgc(): Promise<number>;
  failingAccounts(now: Date): Promise<number>;
}

export const dbCounters: BadgeCounters = {
  async failedPosts() {
    return (await postsCollection()).countDocuments({ ...notDeleted, status: "failed" });
  },
  /** Ads whose scheduled launch time has passed but nobody marked them live. */
  async dueAds(now) {
    return (await adsCollection()).countDocuments({ ...notDeleted, status: "scheduled", scheduledAt: { $lte: now } });
  },
  async generatingUgc() {
    return (await projectsCollection()).countDocuments({ status: "generating" });
  },
  /** Connections that errored on their last use, or whose login has expired. */
  async failingAccounts(now) {
    return countAccountsNeedingAttention(now);
  },
};

export async function getNavBadges(flags: SmmsNavFlags, now: Date = new Date(), counters: BadgeCounters = dbCounters): Promise<NavBadges> {
  const safe = async (allowed: boolean, f: () => Promise<number>): Promise<number> => {
    if (!allowed) return 0;
    try {
      return await f();
    } catch {
      return 0;
    }
  };
  const [failedPosts, dueAds, generatingUgc, failingAccounts] = await Promise.all([
    safe(flags.posts, () => counters.failedPosts()),
    safe(flags.campaigns, () => counters.dueAds(now)),
    safe(Boolean(flags.ugc), () => counters.generatingUgc()),
    safe(flags.settings, () => counters.failingAccounts(now)),
  ]);
  return { failedPosts, dueAds, generatingUgc, failingAccounts };
}
