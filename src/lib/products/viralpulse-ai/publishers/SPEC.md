# Publisher specs (verified against the official docs, 2026-11-01 / 2026-11-02)

"Verified" = read on the linked page on that date. "UNVERIFIED" = not on the page we could read; implemented from general knowledge, covered by a warning (never a blocking error) where it is a limit, and listed here so someone checks it against a live account. No live publish has been done (no provider credentials in this environment); every adapter is tested against a scripted fake `fetch`.

## Instagram (Graph API, Facebook Login)
Source: https://developers.facebook.com/docs/instagram-platform/content-publishing (examples use v26.0; code takes the version from `accounts/versions.ts`, default v23.0, env `META_GRAPH_VERSION`).
- Verified: `POST /{ig}/media` (container), `POST /{ig}/media_publish` (`creation_id`), `GET /{container}?fields=status_code` (`IN_PROGRESS|FINISHED|ERROR|EXPIRED|PUBLISHED`, poll once a minute for at most 5 minutes, expires after 24 h), `GET /{ig}/content_publishing_limit`; `media_type` `REELS|STORIES|CAROUSEL|VIDEO`, `image_url`/`video_url` must be publicly reachable at call time; JPEG is the only image format (we send a JPEG rendition via `?fmt=jpeg` on the signed media route); carousel up to 20 items, a carousel is one post; `is_ai_generated=true` (native AI label; set on the carousel container only, never on children); `alt_text` for image posts (since 2025-03-24; not for Reels/Stories); `trial_params`; 100 API posts per rolling 24 h (the page also says 50 for carousels: we use the account's own `config.quota_total` when the limit endpoint returns it).
- UNVERIFIED (page does not list them): `share_to_feed`, `cover_url`, `location_id`, Reels duration/aspect/size/codec limits (we warn at 3 s - 15 min and 9:16), caption 2200 chars and 30 hashtags (warnings), `collaborators`/`user_tags` (not sent). Instagram Stories use `media_type=STORIES`.
- Not possible: delete via API; scheduling is ours (no native schedule); resumable `upload_type` needs Facebook Login for Business (we use URL fetch).
- Needs: Meta app review for `instagram_content_publish` + Business Verification for accounts outside the app's role holders; IG professional account linked to a Page; Page Publishing Authorization if required.

## Facebook Pages
Sources: https://developers.facebook.com/docs/video-api/guides/reels-publishing , https://developers.facebook.com/docs/pages-api/posts
- Verified (Reels): `POST /{page}/video_reels` `upload_phase=start` -> `video_id`; `POST https://rupload.facebook.com/video-upload/{video-id}` with `Authorization: OAuth` and a `file_url` header (public http/https, not fbcdn); status `GET /{video-id}?fields=status` (`video_status`: uploading, upload_complete, processing, ready, upload_failed, error, expired); `upload_phase=finish` with `video_state` `DRAFT|SCHEDULED|PUBLISHED`, `description`, `title`, `scheduled_publish_time` (more than 10 min and within 29 days), `is_ai_generated`; 9:16, at least 540x960, 3-90 s, 24-60 fps, H.264/H.265 + AAC; 30 API posts per 24 h; permissions `pages_show_list, pages_read_engagement, pages_manage_posts`.
- Verified (feed/photos): `POST /{page}/feed` (`message`, `link`, `published=false` + `scheduled_publish_time` 10 min - 30 days), `POST /{page}/photos` (`url`; returns `id`, `post_id`), `DELETE /{post-id}`; permissions also `publish_video` for video.
- UNVERIFIED (page silent): `graph-video.facebook.com/{page}/videos` with `file_url`, multi-photo via unpublished photos + `attached_media`, photo alt text (not sent), caption limit (63,206).
- Needs: App Review for `pages_manage_posts`/`publish_video` beyond app role holders.

## YouTube
Sources: https://developers.google.com/youtube/v3/docs/videos/insert , https://developers.google.com/youtube/v3/docs/videos
- Verified: `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`; max 256 GB; scopes `youtube.upload` (or broader); quota shown as 1 unit in a separate "Video Uploads" bucket, 100 calls/day (used as our daily budget); `status.privacyStatus` private|unlisted|public (default public if omitted - we always send it, default private); `status.publishAt` only with `private` and never-published; `selfDeclaredMadeForKids` (we require an explicit answer); `status.containsSyntheticMedia` (boolean, "altered or synthetic content" disclosure) - set for AI-generated media; snippet `title, description, tags, categoryId, defaultLanguage`.
- **Correction to the audit (section 3.3):** the insert reference now says "Videos uploaded from unverified API projects are not restricted to private viewing mode." The old statement that they are forced private no longer appears there; we still default to private on our side and warn.
- UNVERIFIED: the resumable session protocol itself (Content-Range, 308, `bytes */total` probe) is the documented generic Google protocol, not on the reference page; title 100 chars / description 5000 / tags 500 chars; Shorts = vertical or square and at most 3 min (YouTube help centre rule, no API flag; we add `#Shorts`); `thumbnails.set` (2 MB) not re-read.
- Needs: OAuth consent-screen verification (sensitive scope); YouTube API Services audit for production use.

## LinkedIn
Sources: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api and .../videos-api (li-lms-2026-10).
- Verified: `POST /rest/posts` with `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`; author `urn:li:person` or `urn:li:organization`; 201 + `x-restli-id` header; content `media {id,title,altText}`, `multiImage`, `article {source,thumbnail,title,description}` (no URL scraping), organic carousels unsupported; `DELETE /rest/posts/{urn}` (204, idempotent); permissions `w_member_social`, `w_organization_social` (admin / content admin / DSC poster); Videos API: `POST /rest/videos?action=initializeUpload` (`owner`, `fileSizeBytes`), parts of 4 MiB (`uploadInstructions` firstByte/lastByte), PUT each, collect `ETag`s, `finalizeUpload` (`video`, `uploadToken`, `uploadedPartIds` in order), `GET /rest/videos/{urn}` status `PROCESSING|PROCESSING_FAILED|AVAILABLE|WAITING_UPLOAD`; MP4, 3 s - 30 min, 75 KB - 500 MB; version 202511 sunsets 2026-11-16 (default here 202610).
- UNVERIFIED: Images API request shape (`/rest/images?action=initializeUpload` -> `uploadUrl` + `image` urn, PUT bytes), commentary max 3000 chars, "little text" escaping of `| { } [ ] ( ) < > \ * _ ~` (we escape these but leave `#` and `@`), up to 20 images in `multiImage`.
- Needs: self-serve "Share on LinkedIn" product for members; Community Management API approval + verified Page for organisations.

## X (API v2)
Sources: https://docs.x.com/x-api/media/introduction , .../media/quickstart/media-upload-chunked , .../posts/creation-of-a-post
- Verified: `POST /2/tweets` body `text`, `media.media_ids` (max 4 photos / 1 GIF / 1 video), `reply.in_reply_to_tweet_id`, `made_with_ai`, `paid_partnership`; 201 `data.id`; scopes `tweet.write tweet.read users.read`; chunked upload `POST /2/media/upload/initialize` (JSON `media_type,total_bytes,media_category`) -> `data.id`, `POST /2/media/upload/{id}/append` (multipart `segment_index`,`media`, chunks at most 5 MB), `POST /2/media/upload/{id}/finalize`, `GET /2/media/upload?command=STATUS&media_id=` (`processing_info.state` pending|in_progress|succeeded|failed); categories `tweet_image|tweet_gif|tweet_video`; limits image 5 MB, GIF 15 MB, video 20 min / 8 GB (Premium 125 min / 16 GB); an over-length video is rejected with 403 at post time. Pay-per-use pricing (posts with a URL cost much more) per the audit.
- UNVERIFIED: 280-character limit (Premium longer; `creds.extra.textLimit` overrides), alt-text endpoint (`POST /2/media/metadata`; failure is only a warning), `DELETE /2/tweets/:id`, `media.write` scope name, rate limits.
- Status: implemented and tested, but "x" is not a `PostPlatform` yet (constants/UI are shared contracts). Wiring it needs `PostPlatform`/`PLATFORM_META` to include `x` (provider `x`, accounts kind `x_account` already exists in WP2).

## Google Business Profile
Source: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts
- Verified: `LocalPost` fields `languageCode, summary, callToAction {actionType,url}, media[].sourceUrl (only supported media field), topicType (STANDARD|EVENT|OFFER|ALERT)`; create is `accounts.locations.localPosts.create`; actions BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL.
- UNVERIFIED: summary max (1500 used), photo-only (page does not state formats), deprecation status, API access approval process.
- Behind a flag: posting refuses to run until the company turns on "Business Profile API access approved" (`smms_settings` `_id: "publishing"`, `gbpEnabled`).

## Company-side approvals (summary)
Meta App Review + Business Verification (IG/FB); Google OAuth verification + YouTube API audit (YouTube); LinkedIn Community Management API (company pages); X credits; Google Business Profile API access.
