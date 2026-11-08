import type { Target, MetricPlatform } from "./types";

/**
 * Which published posts belong to which connected account. Posts are matched to platform data ONLY by the platform's own id
 * (`externalId` of the publish attempt or of the post version) - never by title or caption.
 */

export interface AttemptLite {
  postId: string;
  platform: string;
  accountId: string | null;
  externalId: string | null;
  finishedAt: Date | null;
}
export interface PostLite {
  _id: string;
  contentType: "image" | "video";
  publishOptions?: { accountIds?: Partial<Record<string, string>>; instagram?: { format?: string }; facebook?: { format?: string }; youtube?: { short?: boolean } };
  variants: { platform: string; publish: { state: string; externalId: string | null; at: Date | null } }[];
}
export interface AccountLite {
  id: string;
  platform: MetricPlatform;
  provider: string;
  isDefault: boolean;
  enabled: boolean;
}

const POST_PLATFORM: Record<string, MetricPlatform> = { instagram: "instagram", facebook: "facebook", youtube: "youtube", linkedin: "linkedin", x: "x", twitter: "x" };

function formatOf(platform: MetricPlatform, p: PostLite): Target["format"] {
  const o = p.publishOptions ?? {};
  if (platform === "instagram") return (o.instagram?.format as Target["format"]) ?? (p.contentType === "video" ? "reel" : "feed");
  if (platform === "facebook") return (o.facebook?.format as Target["format"]) ?? (p.contentType === "video" ? "video" : "feed");
  if (platform === "youtube") return o.youtube?.short ? "short" : "video";
  return p.contentType === "video" ? "video" : "text";
}

export interface MatchResult {
  byAccount: Map<string, Target[]>;
  /** Published versions we could not look up: no platform id, or no account to read them with. */
  unmatched: { postId: string; platform: string; reason: string }[];
}

export function matchTargets(posts: PostLite[], attempts: AttemptLite[], accounts: AccountLite[]): MatchResult {
  const byAccount = new Map<string, Target[]>();
  const unmatched: MatchResult["unmatched"] = [];
  const latest = new Map<string, AttemptLite>();
  for (const a of attempts) {
    if (!a.externalId) continue;
    const k = `${a.postId}:${a.platform}`;
    const prev = latest.get(k);
    if (!prev || (a.finishedAt?.getTime() ?? 0) >= (prev.finishedAt?.getTime() ?? 0)) latest.set(k, a);
  }
  const seen = new Set<string>();
  for (const p of posts) {
    for (const v of p.variants) {
      const platform = POST_PLATFORM[v.platform];
      if (!platform || v.publish.state !== "published") continue;
      const att = latest.get(`${p._id}:${v.platform}`);
      const externalId = att?.externalId ?? v.publish.externalId;
      if (!externalId) {
        unmatched.push({ postId: p._id, platform: v.platform, reason: "Marked published by hand: there is no platform post id to read numbers for." });
        continue;
      }
      const candidates = accounts.filter((a) => a.platform === platform && a.enabled);
      const wanted = att?.accountId ?? p.publishOptions?.accountIds?.[v.platform] ?? null;
      const acct = (wanted ? accounts.find((a) => a.id === wanted) : null) ?? (candidates.length === 1 ? candidates[0] : candidates.find((a) => a.isDefault)) ?? null;
      if (!acct) {
        unmatched.push({ postId: p._id, platform: v.platform, reason: "The account it was published with is not connected any more." });
        continue;
      }
      const key = `${platform}:${externalId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t: Target = { platform, externalId, postId: p._id, accountId: acct.id, publishedAt: v.publish.at ?? att?.finishedAt ?? new Date(0), format: formatOf(platform, p) };
      byAccount.set(acct.id, [...(byAccount.get(acct.id) ?? []), t]);
    }
  }
  return { byAccount, unmatched };
}

/** Recent posts every run, older ones (up to `olderDays`) only on the daily pass; anything older is not re-read. */
export function pickTargets(all: Target[], now: Date, s: { recentPostDays: number; olderPostDays: number }, includeOlder: boolean): Target[] {
  const age = (t: Target) => (now.getTime() - t.publishedAt.getTime()) / 86_400_000;
  return all.filter((t) => age(t) <= s.recentPostDays || (includeOlder && age(t) <= s.olderPostDays)).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}
