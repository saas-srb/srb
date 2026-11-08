# Organic metrics (WP7): endpoints, metrics, limits

Verified against the official documentation on **2026-11-01/02** unless marked **UNVERIFIED**. We have no live API access: every parser is tested against fixtures written from these docs (`scripts/test-viralpulse-wp7.ts`). Each unverified item degrades to a warning on the account (never to an invented number).

Storage: `smms_metric_snapshots` (WP6a), key `(platform, externalId, level, metric, date, source)`, `source = <platform>_insights`, extra fields `accountId`, `postId`. Post rows are lifetime totals read on `date`; account rows are the day's value (reach, views) or a level (followers). Sync state: `smms_metric_sync`; settings: `smms_metric_settings`.

## Instagram (Facebook Login, graph.facebook.com v23.0)
Docs: developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/insights, .../reference/instagram-user/insights, .../reference/instagram-media/insights.
- Permissions: `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`. Standard Access works for accounts the app owner administers; Advanced Access (App Review) for other people's accounts.
- Account `GET /{ig}/insights?metric=...&metric_type=total_value&period=day&since&until`. Metrics used: `reach, views, accounts_engaged, total_interactions, likes, comments, shares, saves, profile_links_taps`. Deprecated and NOT used: `impressions` (deprecated for new media from 2024-07-02), `profile_views`, `online_followers` (30 days only). Some metrics need 100+ followers; missing data returns an empty set (we store nothing).
- Followers: `GET /{ig}?fields=followers_count` read each run, history kept by us (API history is limited).
- Media `GET /{media}/insights`. REELS: `reach, likes, comments, saved, shares, total_interactions, views, ig_reels_avg_watch_time, ig_reels_video_view_total_time`. FEED: `reach, likes, comments, saved, shares, total_interactions, views, profile_visits, follows`. STORY (24 h only): `reach, views, shares, total_interactions, profile_visits, follows, replies`. Data can lag up to 48 h; media in albums have no insights; values under 5 viewers on stories error (#10).
- **UNVERIFIED**: day boundary timezone of daily metrics; the unit of `ig_reels_*` (assumed milliseconds, converted to seconds); history depth beyond 30 days (backfill is capped at 30); `since/until` window limits (we ask one day at a time).

## Facebook Page (Page access token)
Docs: developers.facebook.com/docs/graph-api/reference/page/insights.
- Permissions `read_insights`, `pages_read_engagement`; token of a person with the ANALYZE task. Pages need 100+ likes for insights; 2 years of history; `since/until` max 90 days (backfill = 90 days). Most metrics update daily.
- Metrics used (period `day`): `page_media_view`, `page_total_media_view_unique`, `page_post_engagements`, `page_follows` (followers level), `page_daily_follows_unique`, `page_daily_unfollows_unique`, `page_video_views`. The doc warns that "a number of Page Insights metrics will be deprecated for all API versions" from **2026-06-15** and links a list we could not read: every metric is therefore requested with per-metric fallback, and retired ones are named in a warning.
- Posts: `GET /{post}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares` (stable public counts). **UNVERIFIED**: post insight metric names (`post_media_view`, `post_total_media_view_unique`, `post_clicks`, `post_video_avg_time_watched`, `post_video_view_time`) and the `video_insights` edge for Reels/videos; tried with fallback.

## YouTube
Docs: developers.google.com/youtube/v3/determine_quota_cost, .../v3/docs/videos/list, .../youtube/analytics/channel_reports.
- Data API: `channels.list?part=statistics` (1 unit), `videos.list?part=statistics&id=` up to 50 ids (1 unit). Default quota 10,000 units/day per project, resets midnight Pacific. We count units, stop at the company's cap (default 3,000/day) and defer on `quotaExceeded` until Pacific midnight. Hidden subscriber counts are not stored.
- Analytics API (`yt-analytics.readonly`, optional scope): `GET https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&dimensions=day|video&metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares`. Video reports require `sort` and `maxResults` <= 200; the `video` filter accepts several ids. Capped at 200 calls/day by us. Without the scope: warning.
- **UNVERIFIED**: whether the Analytics API consumes the Data API quota (not stated on the pages read); `filters=video==a,b` together with `dimensions=video` (documented for "most reports"); backfill depth (90 days chosen); data for the last 1-2 days may be incomplete (we re-read 3 days).

## LinkedIn organisation (approval-gated)
Docs: learn.microsoft.com/linkedin/marketing/community-management/organizations/share-statistics, follower-statistics, organization-lookup-api (version li-lms-2026-10).
- Needs the Community Management API product approved by LinkedIn and an ADMINISTRATOR of the page. The docs list `rw_organization_admin` as the permission for these endpoints; the account catalogue lists `r_organization_social`. We attempt when either scope is granted, otherwise show "not approved" (no call is made).
- `GET /rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=<urn>` with `timeIntervals=(timeRange:(start,end),timeGranularityType:DAY)`: organic only, rolling 12 months, fields `impressionCount, uniqueImpressionsCount, clickCount, likeCount, commentCount, shareCount, engagement`. Per post: `shares=List(urn:li:share:..)` or `ugcPosts[i]=urn:li:ugcPost:..` lifetime only; posts with no activity are omitted and are zero (documented), stored as zero.
- Followers: `GET /rest/networkSizes/urn:li:organization:{id}?edgeType=COMPANY_FOLLOWED_BY_MEMBER` -> `firstDegreeSize`; daily gains: `organizationalEntityFollowerStatistics` (DAY; 12 months back to 2 days ago).
- Headers `Linkedin-Version` (settings/env/default 202610; 202511 sunsets 2026-11-16) and `X-Restli-Protocol-Version: 2.0.0`.
- **UNVERIFIED**: maximum posts per request (we send 10); rate limits (not public).

## X (API v2, pay per use)
Docs: docs.x.com/x-api/fundamentals/metrics; pricing as recorded in docs/viralpulse-audit.md 3.5.
- `GET /2/tweets?ids=&tweet.fields=public_metrics[,organic_metrics]`: public (`retweet_count, reply_count, like_count, quote_count, bookmark_count, impression_count`) with any token; `organic_metrics`/`non_public_metrics` only for the owner's posts created in the **last 30 days**. `GET /2/users/me?user.fields=public_metrics` for followers.
- Every read is billed, so it is OFF by default (Analytics > Accounts > Sync settings), capped (25 posts/run) and spaced (24 h).
- **UNVERIFIED**: 100-id limit per lookup; field names inside `organic_metrics` (`url_link_clicks`, `user_profile_clicks`); behaviour when `organic_metrics` is requested for posts older than 30 days (we request public only for those); per-read price.

## Paid
Meta ads insights are already synced by WP6a (`meta_ads_insights`); Analytics reads them (spend, impressions, `inline_link_clicks`, `action:*`, `roas:*`). Conversions = the first present of `purchase, omni_purchase, lead, ...` (never summed, the types overlap). ROAS only when Meta reported `roas:*`. Google / LinkedIn / X ads are not synced yet (not launched through the app).

## Cadence and limits
Cron `viralpulse-metrics` every 3 hours: recent posts (14 days) each run, older (to 180 days) once a day, account insights once per UTC day. Per-account intervals: Instagram/Facebook/YouTube 3 h, LinkedIn 6 h, X 24 h. Failures back off exponentially (to 12 h); rate limit / quota defer until the platform's own retry time; admins are notified after 3 failures in a row, once per day. "Sync now" cooldown 10 minutes. Retention default 730 days.
