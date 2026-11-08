# ViralPulse AI - production-readiness audit

Scope: `src/lib/products/viralpulse-ai`, `src/app/(products)/viralpulse-ai`, `src/app/(products)/api/viralpulse-ai`, `src/components/products/viralpulse-ai`, plus the platform pieces it uses (`src/lib/platform/connections/*`, `src/lib/cron/*`, `src/lib/campaigns.ts`, `vercel.json`).
Method: read-only code audit on the working tree at audit time (2026-11-01), plus official-doc checks (WebFetch/WebSearch). No source edited. Where an official page could not be confirmed, it is marked **UNVERIFIED**.
Internal name is "SMMS"; user-facing name is "ViralPulse AI".

---

## 0. Executive summary (read this first)

1. **Nothing in this product creates a real paid ad.** Ads/campaigns are copy+status records. "Mark live" is a manual checkbox. There is no Meta Marketing / Google Ads / LinkedIn Marketing / X Ads client anywhere in the repo (`grep` for `ads_management|googleads|adsapi` hits only `utm.ts` and the connection catalog text). `ads.ts:8-10`, `publishing.ts:165`, `integrations.ts:17-19`, settings page notice.
2. **Analytics are not pulled from any platform.** Organic metrics are typed in by hand (`savePostMetricsAction`, `PublishPanel.tsx:57`); paid numbers come from CSV uploads into the LMS (`lib/campaigns.ts importPerformanceCsv`) joined by name key (`analytics.ts:11-18`, `paidPerformance`). Dashboard/analytics are real aggregations over *manually entered* data.
3. **P0, probably broken today: the default AI image model `gpt-image-1` was shut down by OpenAI on 23 Oct 2026** (OpenAI model page). `settings.ts:77` defaults to it, so every AI image generation (ads, posts, media library) will fail unless an admin changed the model in Settings. Text default `gpt-4.1-mini` (`settings.ts:76`) also needs re-validation (OpenAI notes a 2026-04-22 legacy-snapshot deprecation notice; UNVERIFIED which models).
4. **P0 likely: LinkedIn `LinkedIn-Version` default `202509`** (`integrations.ts:22`). LinkedIn's own page says even version 202511 sunsets 16 Nov 2026, so 202509 is almost certainly already sunset -> LinkedIn publishing returns version errors. Also only `w_member_social` is requested (`integrations.ts:58`): personal profiles only, no company pages.
5. **P1 near-certain: Veo provider default models are past shutdown.** `veo-3.0-*-generate-001` earliest shutdown 30 Jun 2026 (Gemini deprecations page). `gemini-omni-1.1-flash` (GA 27 Aug 2026) is the default provider so UGC still works, but the Veo option is dead.
6. **Publishers are real-API code but "not yet exercised against live accounts"** (`publishers.ts:23-24`). No retries, no backoff, no token refresh for Meta/LinkedIn, whole videos buffered in memory, YouTube non-resumable single PUT, no Shorts handling, no X/TikTok. Meta user token (60 days) is never refreshed (`integrations.ts:325`).
7. **UGC Studio is the most genuine feature** (real Gemini Omni/Veo calls, cost caps, approvals, policy engine, audit, honest "nothing is faked" fallbacks) but its hand-off is only "attach to an existing post" (`ugc/engine.ts:777`), not to ads/campaigns; and final assembly needs `ffmpeg`, which is not a dependency (`package.json` has no `ffmpeg-static`), so on Vercel multi-scene videos end as `clips-only` (`engine.ts:754-757`).
8. **"AI generate on every field" is far from done.** AI exists at record level (whole strategy, whole post, one variant, ad creative, image prompt) but **no field-level AI** in any form (campaign brief, post brief, brand settings, UGC brief/offer/audience/CTA, media metadata). Section 5 has the inventory and the `AiFieldButton` design.
9. **Demo data is script-seeded, not in app code** (`scripts/demo/smms.mjs` writes fake metrics e.g. `impressions: 5210` into `smms_posts`). Real app code has no seeded numbers, but hardcoded vocab/limits/prices exist (section 2.9).

---

## 1. Current map

### 1.1 Sidebar (`components/products/viralpulse-ai/SmmsSidebar.tsx:165-183`)
Dashboard / Content: Campaigns & Ads, Social Media Posts, Media Library / Insights: AI Content Generator, AI UGC Studio, Analytics / Governance: Settings. Visibility is permission-flagged from the server (`(protected)/layout.tsx`). There is no "AI Image Studio" (image generation is a dialog inside Media Library + buttons in Ad/Post editors) and no audit-log page in the sidebar (`flags.audit` exists; the log is read via `audit.ts listAudit`; the page is not in the route list - **verify**: no `audit/page.tsx` exists).

### 1.2 Pages (`src/app/(products)/viralpulse-ai`)
| Route | Purpose | Collections |
|---|---|---|
| `/login`, `/change-password` | auth (shared admin_users + `smms_*` roles) | `admin_users` |
| `/(protected)` dashboard `page.tsx` | counts by status, upcoming schedule, AI 30-day usage, post metric totals, paid totals | `smms_campaigns/ads/posts/media/generations`, LMS `campaigns`, `campaign_metrics` |
| `/campaigns`, `/campaigns/new`, `/campaigns/[id]`, `/campaigns/[id]/edit` | campaign brief CRUD, AI strategy, version history, link to LMS campaigns, lifecycle (schedule/"published"/failed) | `smms_campaigns`, `smms_generations` |
| `/campaigns/[id]/ads/[adId]` | ad editor (copy, creative, AI image, preview, schedule, mark live) | `smms_ads`, `smms_media` |
| `/posts`, `/posts/new`, `/posts/[id]`, `/posts/[id]/edit` | post brief, AI per-platform versions, media, schedule/approve/publish/mark-published/record metrics | `smms_posts`, `smms_media`, `smms_generations` |
| `/media` | library, upload (Vercel Blob), AI image dialog, prompt generator, versions | `smms_media` |
| `/ai` | AI Content Generator workspace (9 types, history) | `smms_generations` |
| `/ugc`, `/ugc/new`, `/ugc/[id]`, `/ugc/[id]/edit`, `/ugc/settings` | UGC wizard (5 steps), project detail, caps/settings | `ugc_projects`, `ugc_jobs`, `smms_settings.ugc`, `smms_media` |
| `/analytics` | per-platform/type/top posts/weekly + paid (LMS) | as dashboard |
| `/notifications` | `smms_*` notifications from shared `chat_notifications` | `chat_notifications` |
| `/settings` (tabs Brand, AI, Integrations, Roles) | brand voice, OpenAI params, OAuth connect/disconnect/select target, role table | `smms_settings`, `smms_integrations` |
| `/saas/products/viralpulse-ai` | platform marketing page | - |

### 1.3 Server actions (`(protected)/actions.ts`, `ugc/actions.ts`, `ugc/api.ts`)
All wrapped in `run()` (`lib/products/viralpulse-ai/run.ts`): session viewer, all-permissions check, read-only block for suspended workspaces, friendly error mapping. Campaign (create/update/generate/saveAi/duplicate/archive/delete/lifecycle/linkLms), Ad (create/save/generate/duplicate+adapt/schedule/markLive/archive/delete/generateImage), Post (create/updateBrief/saveContent/generate/regenerateVariant/generateImage/duplicate/archive/delete/schedule/approve/publish/markPublished/resetPublish/saveMetrics), versions (get/restore), Media (register/replace/updateMeta/delete/generatePrompt/generateImage/usage/picker), Generator (run/history/postFromGenerator), Settings (saveBrand/saveAi), Integrations (disconnect/selectTarget), UGC (create/updateBrief/setCast/changeStyle/generatePlan/editPlan/restoreVersion/estimate/addReference/approveAndGenerate/regenerateScene/cancel/resume/delete/attachToPost/saveSettings/exportSrt/style samples).

### 1.4 API routes
| Route | Notes |
|---|---|
| `GET /api/viralpulse-ai/oauth/[provider]` | starts OAuth, state cookie (httpOnly, 10 min, bound to provider+user), MANAGE_INTEGRATIONS |
| `GET /api/viralpulse-ai/oauth/[provider]/callback` | state check (timingSafeEqual), exchanges code, discovers targets, encrypts tokens |
| `GET /api/viralpulse-ai/media/[id]` | authenticated streamer, `withTransport` |
| `GET /api/viralpulse-ai/media/public/[id]` | HMAC-signed 1 h URL for Meta/GBP to fetch media, `withTransport` |
| `POST /api/viralpulse-ai/media/upload` | Vercel Blob client-upload token, MANAGE_MEDIA, type/size caps |
| `GET /api/viralpulse-ai/cron` | job `viralpulse`, daily `30 4 * * *` (`vercel.json:24`), per company, `runDueSweep` |
| `GET /api/viralpulse-ai/ugc/cron` | job `viralpulse-ugc`, every 2 min (`vercel.json:28`), advances UGC queue |

### 1.5 Collections
`smms_campaigns, smms_ads, smms_posts, smms_media, smms_generations (versions + AI ledger), smms_settings (_id "main"; also holds `ugc` sub-doc), smms_integrations (_id = provider), smms_activity_logs, ugc_projects, ugc_jobs`; notifications in `chat_notifications`. DB access is via `getDb()` which is company-scoped (`lib/mongodb.ts:14-17`, `scopeDb`), so tenant isolation of documents is enforced centrally (not audited in `scopeDb` itself).

---

## 2. Real vs fake, feature by feature

Legend: REAL = real third-party API call exists in code; MANUAL = human does it elsewhere, app only records; SIMULATED = invented data.

### 2.1 Publishing (`publishers.ts`, `publishing.ts`)
Header disclaimer: "written against each platform's documented API; not yet exercised against live accounts (no app credentials in this environment)" - `publishers.ts:23-24`. So **code-complete but unproven**.

| Platform | Status | API / endpoint | Scopes requested | Evidence & defects |
|---|---|---|---|---|
| Facebook Page | REAL (unproven) | Graph `POST /{page}/feed`, `/photos`, `/videos` on `graph-video.facebook.com` with `file_url` | `pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish, business_management` (`integrations.ts:41`) | Only first image published (`publishers.ts:83`), no multi-photo; video goes through `/videos` not Reels endpoint (`:79`) so FB Reels are not published as Reels; no scheduling parameter used (own scheduler only); no retry. |
| Instagram | REAL (unproven) | Graph `/{ig}/media` container (`REELS`, image, `CAROUSEL`), poll `status_code`, `/media_publish` | as above | Reels: `media_type=REELS` (`:99`), cover via `cover_url`. Polling loop 24x5 s blocking inside the request/cron (`:108-114`); Meta recommends once/minute up to 5 min. No `share_to_feed`, `trial_reels`, collaborators, location, alt text. Image carousel capped at 10 (`:106`) while Meta allows 20 (doc). No `content_publishing_limit` pre-check (100 posts/24 h). Stories unsupported. Only JPEG images are accepted by IG; code allows png/webp/gif uploads (`constants.ts:222`) and does not convert -> container ERROR. |
| LinkedIn | REAL (unproven) | `/rest/images`, `/rest/videos` (multipart init/PUT/finalize), `/rest/posts` | `openid profile w_member_social` only | **Personal profile only**; no organization posting (`w_organization_social` + Community Management API product + admin role needed - LinkedIn doc). Version default `202509` (`integrations.ts:22`) likely sunset. Whole video read into RAM (`:126`, `mediaBytes` `:56-59`); no thumbnail/captions; article link has no thumbnail/description (LinkedIn says no URL scraping - docs). Etag array passed as `uploadedPartIds` (correct shape). |
| YouTube | REAL (unproven) | `videos.insert` resumable, `thumbnails.set` | `youtube.upload, youtube.readonly, business.manage` | Single PUT of the full buffer (no chunk/resume/retry, `:170`); `categoryId "22"` hardcoded (`:168`); `privacyStatus: "public"` hardcoded; thumbnail failures swallowed `.catch(() => {})` (`:175`); no Shorts logic (title `#Shorts`/aspect check) - Shorts is inferred by YouTube from vertical + <=3 min; `PLATFORM_META.youtube.formats yt_short` is only a label. **Unverified API project uploads are forced private** (see 3.3) so "public" will silently be private until audited. |
| Google Business Profile | REAL (unproven) | legacy `mybusiness.googleapis.com/v4/{loc}/localPosts` | `business.manage` | Only PHOTO media; no video despite `gbp_video` format (`constants.ts:147`). Needs GBP API access approval. Language hardcoded `"en"` (`:~185`). |
| X (Twitter), TikTok, Pinterest, Threads | **absent** | - | - | Not in `PLATFORMS` (`constants.ts:7`). |

Scheduling/approval (`publishing.ts`): schedule is app-side only. `runDueSweep` runs daily on Vercel cron (`vercel.json`) plus a page-load "opportunistic" sweep throttled 5 min per *server instance* via an in-memory `Map` (`publishing.ts:124`) -> on serverless this is unreliable; a scheduled 09:00 post may go out up to ~24 h late when nobody opens the app. Limit 25 due posts per run (`:137`). Claim is atomic (`updateOne` on status) - good, but failure state after claim is `edited`->published/failed OK; no retry/backoff queue; failed posts require human "reset". Re-checks approver's permission at publish time - good design.
Token handling (`integrations.ts`): AES-256-GCM with record-id AAD (good, `crypto.ts`), key HKDF-derived from `PLATFORM_ENCRYPTION_KEY` (`derived-key.ts`); stale comments mention `SMMS_ENCRYPTION_KEY`. Refresh only for Google (`:315`); Meta long-lived user token (~60 days, Meta doc) is never refreshed and *any* expired token throws (`:325`) - even though derived Page tokens do not expire (Meta doc) -> Facebook/Instagram publishing dies at day 60 until someone reconnects. LinkedIn tokens (60-day, refresh only for approved partners) same. `markIntegrationError` records last error but there is no proactive expiry warning (cron only handles posts), no `/debug_token` check, no revocation webhook, no `data_access_expires_at` handling.
Media hand-off to Meta/GBP: signed URL on the *company's own site* (`publishers.ts:44-50`); requires public reachability (not localhost/preview deploy behind auth) and `SMMS_PUBLIC_BASE_URL` for platform owner only. Signature is HMAC over id+exp - does not bind company (route resolves company from host - OK).
Manual path: "Mark as published" with URL (`markPublishedManually`) - MANUAL, honest.

### 2.2 Ads and campaigns (`ads.ts`, `campaigns.ts`, `generate.ts`)
- **Ads are MANUAL.** `ads.ts` header: "Ads are never pushed to an ad platform automatically - 'Mark live' records that someone launched it" (`ads.ts:8-11`). `markAdLiveAction` (`actions.ts:234`) sets `status: published` with a free-text `externalRef`. `runDueSweep` only sends a reminder notification for due ads (`publishing.ts:165-171`).
- `AD_PLATFORMS` includes `google_ads` (`constants.ts:11`) but there is no Google Ads connection at all - not in `PROVIDERS` (`integrations.ts:34-60`); `google_ads.provider = "google"` is nominal.
- Campaign "lifecycle" `scheduled/published/failed` (`actions.ts:126-141`) is a human-set label; `startDate/endDate/budget/currency` are stored but never sent anywhere.
- Campaign AI = OpenAI structured outputs (`ai.ts SCHEMAS.campaign`), includes channel budget percentages, audiences, keywords - **advisory text only**, no targeting objects mapped to platform schemas (Meta targeting spec, Google keyword/ad group, LinkedIn facets).
- Ad "variations", "audienceSuggestions" are text.
- Creative sizes (`PLATFORM_META.*.formats`) are hardcoded constants; character limits (`captionLimit`, `headlineLimit`) are hardcoded and in places wrong/outdated (e.g. Google Ads responsive display headline 30, desc 90 - hardcoded `constants.ts:123-124`; Facebook headline 40 is a recommendation, not a limit).

### 2.3 Analytics (`analytics.ts`)
- Organic: sums `variants.metrics.*` written by `savePostMetricsAction` (`actions.ts:438`, UI `PublishPanel.tsx:57` `<Input type="number">`). **No platform insights API is called anywhere** (Meta `/insights`, YouTube Analytics/Data `statistics`, LinkedIn `socialActions`/`organizationalEntityShareStatistics` all absent). Metric keys fixed in `posts.ts:41`.
- Paid: `paidPerformance()` reads LMS `campaigns`/`campaign_metrics` for LMS keys linked via `lmsCampaignKeys` (`analytics.ts:36-60`). Those are filled by **CSV upload** (`lib/campaigns.ts importPerformanceCsv`, `importLeadListCsv`). The old DealFlow "Meta sync" route was a stub calling `syncMetaLeads()` from an in-memory store (HEAD version of `dealflow-ai/integrations/meta/sync/route.ts`; now deleted in the working tree), so there was never a live ad-platform sync.
- Currency fallback `lms?.currency ?? "INR"` (`analytics.ts:63`) hardcoded.
- `weekly` uses default 84-day window hardcoded (`analytics.ts:~203`).
- Therefore every KPI is as real as the person typing/uploading it; ROAS, CPL are derived from CSV rows.

### 2.4 AI text (`ai.ts`, `generate.ts`)
REAL: OpenAI Responses API, strict JSON schema, `store:false`, company key via `getOpenAI()` with plan/billing guard (`aiBlockReason`, `isBillingLimitError`), per-user daily cap `dailyGenerationLimit` default 150 (`settings.ts:81`, `ai.ts guard`) counting only `smms_generations` rows with `source:"ai"` (`generations.ts:107-110`; image calls and UGC are separate ledgers). Cost = tokens x price table (`estimateCost` returns **0 for unknown models**, `settings.ts:101`). Prompts come from `lib/prompts/store` (`smms.*` keys). No fact-grounding: `refineBlock`, `brandPrompt` pass brand data but there is no "do not invent facts" enforcement beyond system prompt text (not audited in prompt store) and no post-generation validation (e.g. claims, prices, URLs, hashtag/char limits - char limits are not enforced on AI output; `composeText` truncates at publish time `publishers.ts:~66`).

### 2.5 AI images (`ai.ts generateImage`, `generate.ts generateImageToLibrary`, `media.ts saveAiImage`)
- Provider: OpenAI Images API `images.generate`, `n:1`, model from settings (`gpt-image-1` default, **shut down 23 Oct 2026** - OpenAI; recommended successor "GPT-Image-2.5 Sunburst"), sizes limited to 1024x1024/1536x1024/1024x1536 (`constants.ts:202`); platform formats are mapped to nearest ratio (`imageSizeFor`) so 1080x1920 story art is produced at 1024x1536 and **never resized/cropped to the real spec**.
- Cost: flat `imageCostUsd` default $0.04 (`settings.ts:82`) regardless of quality/size; actual gpt-image-1 pricing was $0.011-$0.25 per image by quality/size (OpenAI page) -> usage ledger inaccurate. Not wired to `recordAiUsage` like UGC (only `setAiFeature("Social media AI")`).
- Storage: PNG bytes -> Vercel Blob private store under `smms/` + `smms_media` doc, `source:"ai"`, `creativePrompt`. No `images.edit` (no reference/brand-logo/product-photo input), no variations, no mask/inpaint, no text-overlay compositing despite `overlayText` in schema (`ai.ts` IMAGE schema), no batch/N variants, no background removal. No AI-disclosure/C2PA metadata on stills (UGC videos do carry `ai` flag).
- Wiring exists for: Ad editor ("Generate image from prompt", "thumbnail from concept"), Post editor, Media Library dialog.

### 2.6 AI UGC Studio (`ugc/*`)
REAL and carefully built:
- Providers: Gemini Omni Flash via Interactions API in background mode (`providers/gemini-omni.ts`), Veo via `predictLongRunning` (`providers/veo.ts`). Company's own Gemini key only (`catalog.ts:119-123`: "no shared fallback key").
- Script: OpenAI (`script-openai.ts`), 5-step wizard (Brief, Style, Cast & look, Script, Review), policy engine (`policy.ts`: blocks celebrity likeness, fake testimonials, minors etc.), consent/attestation for reference photos, spend caps (default $25/day, manager approval above $5 - `store.ts:141-151`), IST day boundaries, concurrency, attempts, audit trail, notifications, SRT export, AI label burn-in.
- Pricing is hardcoded: Omni $0.10/s (`gemini-omni.ts:15`), Veo $0.40/$0.15 per s (`veo.ts:12`) - estimates only; override `pricePerSecUsd`. Omni duration is prompt-steered, not parameterised, so billed seconds can differ from the plan.
- `ffmpeg` dependency: `findFfmpeg()` (`assemble.ts:21-44`) looks for `FFMPEG_PATH`, `ffmpeg-static` (not in `package.json`) or `ffmpeg` on PATH. Without it multi-scene videos become `strategy:"clips-only"` with `render.mediaId = null` (`engine.ts:754-757`) -> **no single final video to attach/publish** on a default Vercel deployment. Captions/AI-label burn-in also require ffmpeg.
- Hand-off: `attachToPost(id, postId)` only (`engine.ts:777-790`, `deps-default.ts attachMedia` sets `contentType:"video"`, keeps `post.thumbnailId ?? thumbnailId`). Nothing for ads, nothing creating a *new* post/ad from a video, no pre-fill of caption/hashtags from `captions.ts`/`post-guidance.ts` (those exist: `UgcReviewStep` "Copy caption line" is a clipboard action).
- "Style sample" clips are real paid generations on request (not fake), but the style gallery tiles are gradient+icon placeholders by design (`UgcBits.tsx` comment: "No photos or fake previews").
- Veo defaults dead (see 0.5). `engine-sample.ts`, `sample.ts` are real sample generation, not mocks.

### 2.7 Integrations (`integrations.ts`, platform `connections/*`)
- OAuth apps are the **company's own** keys stored in Platform Console connections (`oauthApp()` via `connectionValues`, `integrations.ts:65-70`) - consistent with the repo's "company keys first" rule.
- OAuth flow correct in shape (state cookie, per-provider redirect URI `/api/viralpulse-ai/oauth/{provider}/callback`). **Documented redirect URL in the catalog omits `/callback`**: `catalog.ts:131,138,145` tell users to register `.../oauth/meta` (and google, linkedin), but the code uses `.../oauth/{provider}/callback` (`oauth/[provider]/route.ts:229`). Following the on-screen note makes the provider reject with redirect_uri mismatch. **Bug.**
- Scopes: Meta lacks `instagram_manage_insights`, `pages_read_user_content`, `ads_management`, `ads_read`, `read_insights`; Google lacks `yt-analytics.readonly`/Google Ads scope `adwords`; LinkedIn lacks `w_organization_social`, `r_organization_social`, `rw_ads`. Meta scope list includes `business_management` (needs app review, unused).
- Single connection per provider (`_id = provider`): one Meta login per company; no multi-account, no per-brand/client accounts although campaigns/posts have `clientId`.
- LinkedIn discovery only returns the person URN (`integrations.ts:255-257`); no org lookup (`/rest/organizationAcls`).
- Google discovery errors are swallowed in two empty-ish catches (`:240-242`, `:250-252`) - user sees "connected" with zero targets and no reason.
- Meta Graph default `v23.0` (`integrations.ts:21`) - verify still supported when going live.
- `disconnect` deletes the doc locally but does not revoke the token at the provider.

### 2.8 Settings, notifications, audit
- Settings: brand context + OpenAI params genuinely persisted (`settings.ts`); Roles tab renders the permission table. Page-level gate is `MANAGE_INTEGRATIONS` for the whole settings page, including brand voice.
- Notifications: real, through `chat_notifications` (`notifications.ts`), best-effort with swallowed errors (`:15-19`). Only fires for in-app bell; email/WhatsApp are not used for publish failures (platform has `smmsEvents` triggers for connection errors - `integrations.ts:292,306`).
- Audit: `recordAudit` never throws (by design), covers create/update/generate/publish/connect; **no audit entry for settings/brand/AI-settings saves was verified** (`AUDIT_ENTITIES` includes "settings"; confirm actions `saveBrandAction`/`saveAiSettingsAction` call it) and no audit for token refresh/expiry, disconnect-by-system, or cron publishes (publish audit uses `userId = approvedBy`).

### 2.9 Fake / hardcoded / placeholder scan (evidence)
Searches run over the product dirs for `Math.random|lorem|sample|demo|mock|TODO|FIXME|setTimeout|dummy|fake|simulat|stub|.catch(() => {})`:
- **No `TODO`/`FIXME`, no `lorem`, no mock responses, no setTimeout-faked loaders in product code.**
- `Math.random` only in `UgcWizard.tsx:37` (seed for look variation) - not data faking.
- `setTimeout`: legit (IG polling `publishers.ts:112`; UI debounce/poll `UgcWizard.tsx:101,179`, `UgcStyleGallery.tsx:214`, `UgcProjectDetail.tsx:178`; `StoryboardPlayer.tsx:36` storyboard animation).
- Silent `.catch(() => {})`: index creation (`ads.ts:43`, `posts.ts:94-96`, `campaigns.ts:55`, `media.ts:76`, `generations.ts:51-53`, `audit.ts:65-68`, `ugc/store.ts:159-172`) - acceptable; **functional swallows**: YouTube thumbnail (`publishers.ts:175`), IG permalink fetch (`:117`), Google target discovery (`integrations.ts:240,250`), `notifySmmsUsers` (`notifications.ts:15-19`), duplicate-ad AI adapt (`actions.ts:210-212`), `runDueSweep` errors only `console.error` (`publishing.ts:130`).
- Seeded demo content: `scripts/demo/smms.mjs` (hand-written copy and numeric metrics, `demo-smms-` ids, demo logins with password `Demo@12345`, lines 1-20, 112-240) invoked from `scripts/demo-seeders.ts:31`. Must never run against production; ensure `mark-demo-company`/demo companies are the only target.
- Hardcoded domain data (needs configurability or removal): objectives/tones/languages/CTAs/industries (`constants.ts:178-183`); platform formats, character limits (`constants.ts:47-150`); model price table `DEFAULT_MODELS` imported from AgentOS (`settings.ts:4`); image/video prices (above); UGC style catalogues (`ugc/styles/catalogue-*.ts`, ~2k lines of static style data - this is product content, not fake data); example placeholders with business-specific text: "Diwali AI Automation Push" (`CampaignForm.tsx`), "Agentic AI training batch starting 15 Oct ... placement support" (`AiWorkspace.tsx`), "#YourBrand #BuiltWithAI" (`SettingsForms.tsx`); default INR currency in analytics; default IST day boundary for UGC caps (`api.ts istMonthStart`, `state.ts istDayStart`) - India-only is a stated product rule, so acceptable but not tenant-configurable.
- Wording that overpromises: `(protected)/ai/page.tsx` and platform marketing page describe "publishing" without noting ads are manual - copy needs updating once decided.

### 2.10 Multi-tenancy, security quick notes (details in section 4)
Company scoping through `scopeDb`; permission checks via `run()`; media upload path regex `^smms/uploads/<uuid>.<ext>` is **not company-prefixed** (`media.ts UPLOAD_PATH`), shared Blob store - cross-tenant risk only if a UUID path is guessed (low, but should be company-prefixed and verified on register).

---

## 3. Official-API reality check (verified against official docs on 2026-11-01 unless marked)

### 3.1 Meta (Facebook Pages + Instagram) - organic
Source: developers.facebook.com/docs/instagram-platform/content-publishing
- Supports single image, video, **Reels** (`media_type=REELS`), Stories, carousels (up to 20). Only **JPEG** images. Media must be on a **public server** when the call is made; resumable upload (`rupload.facebook.com`) only for apps on Facebook Login for Business.
- Limit: **100 API-published posts per rolling 24 h** (doc also states 50 for carousels in one place - treat 50 as conservative); check `GET /{ig}/content_publishing_limit`.
- Account: Instagram **professional** (Business/Creator) account; if the linked Page needs Page Publishing Authorization, publishing is blocked until PPA is done.
- Permissions: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` (+ `ads_management`/`ads_read` if a Business Manager role on the Page) under Facebook Login for Business; or `instagram_business_*` under Instagram Login. Advanced or Standard access; **Standard access only works for users with roles on the app (dev/test), so publishing for the company's own accounts works in Development/Standard with admin-role users, but public production use for other people's accounts needs App Review + Business Verification** (Meta permissions reference).
- Status polling: `status_code` (`IN_PROGRESS|FINISHED|ERROR|EXPIRED|PUBLISHED`), recommended **once a minute up to 5 minutes**; containers expire after 24 h.
- Tokens: short-lived user token -> long-lived (~**60 days**); Page tokens derived from a long-lived user token **do not expire** (Meta access-token guide). Plan: store Page tokens, re-auth flow when `/debug_token` says invalid.
- Reel video specs (aspect 9:16, 3 s-15 min depending on rollout, H.264/AAC, <=1 GB) are not in the page I fetched - **UNVERIFIED, check the Reels reference before building validation**.

### 3.2 Meta Marketing API - ads
- Needs `ads_management` (+`ads_read`), an ad account, Business Manager. Standard Access = your own ad accounts only; **managing other businesses' ad accounts needs Advanced Access -> App Review + Business Verification** (Meta permissions reference/Marketing API access page). Third-party guides cite a prior-call-volume threshold (1,500 calls/15 days vs 500) - **conflicting, UNVERIFIED**; also an unconfirmed claim that the tier was renamed "Marketing API Access Tier" on 4 May 2026. For the company's own ad account in Standard Access, no review is needed for the owner's own account.
- Creating a campaign -> ad set (budget, schedule, targeting, optimization goal) -> creative (`object_story_spec`) -> ad, starts `PAUSED` (safe default). Spend is real money: needs payment method on the ad account, explicit confirm UI, and caps.
- Cost: API is free; ad spend billed by Meta.

### 3.3 YouTube Data API v3
- `videos.insert` scopes: `youtube.upload` (or broader) - doc. Upload up to 256 GB; resumable protocol is the recommended path.
- **Quota**: the reference lists 1,600 units for insert historically; current docs show a separate "Video Uploads" bucket (100/day default listed) - **figures conflict between pages, UNVERIFIED; read the live quota table**. Default project quota is 10,000 units/day.
- **Unverified API projects (created after 28 Jul 2020) have `videos.insert` uploads locked to private** until the project passes a compliance audit (official insert reference, confirmed by search; the quick page summary that said otherwise was wrong). The company needs: OAuth consent screen verification (sensitive/restricted scopes), then the YouTube API Services audit. Until then, "public" in code (`publishers.ts:168`) yields private videos.
- **Shorts**: no separate API; a vertical (<=1:1... in practice 9:16 or 1:1) video up to 3 minutes is classified as a Short automatically (YouTube help; this specific rule is **UNVERIFIED in this audit**, re-check). `#Shorts` in title/description is conventional.
- Analytics: `videos.list?part=statistics` (public counts, 1 unit) and YouTube Analytics API for detailed metrics (`yt-analytics.readonly`).

### 3.4 LinkedIn
Source: Microsoft Learn Posts API (li-lms-2026-10).
- Posts API replaces ugcPosts; headers `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0` required. Content types: text, image, video, document, article, multi-image, poll. **Article posts need explicit title/description/thumbnail (no URL scraping).** Organic carousels not supported.
- Permissions: `w_member_social` (post as a member); **`w_organization_social`** to post as a company page, restricted to ADMINISTRATOR/DIRECT_SPONSORED_CONTENT_POSTER/CONTENT_ADMIN; `r_organization_social` read; `r_member_social` restricted to approved partners. Organization permissions come with the **Community Management API** product, which requires LinkedIn app/partner approval and a verified company page (LinkedIn program terms - details not on the fetched page, UNVERIFIED).
- **Versions are time-limited**: the page warns 202511 sunsets on 16 Nov 2026. The code default `202509` (`integrations.ts:22`) should be treated as expired; move to the current supported month and make it a tested constant with a startup check.
- Video: Videos API (initializeUpload -> PUT parts -> finalize) - matches code; thumbnails/captions optional.
- Rate limits: 429 with per-app daily limits (numbers in Developer Portal, not public).
- Tokens: access ~60 days; refresh tokens only for approved Marketing/Community products.

### 3.5 X (Twitter) API v2
Source: docs.x.com pricing & media pages.
- **Pay-per-use credits, no subscription tiers**: ~$0.015 per post created; posts containing a URL ~$0.20 each; reads $0.005/post (owned reads $0.001). Free-tier posting not documented on the page.
- Media: v2 `POST /2/media/upload` (simple, images/small) and chunked INIT/APPEND/FINALIZE for video/GIF; categories `tweet_image`, `tweet_gif`, `tweet_video`, `amplify_video`. Limits depend on the posting user's Premium status: default video 20 min / 8 GB, Premium 125 min / 16 GB; image 5 MB; up to 4 photos or 1 GIF or 1 video per post. Scopes (`tweet.write`, `media.write`, `offline.access` for refresh) and token lifetimes: not on fetched page, **UNVERIFIED**; OAuth 2.0 PKCE with 2 h access token + refresh token is the documented model to confirm.
- X Ads API: separate **application/approval per developer app** (Ads API Access Form); approved tier covers analytics, campaign management, creatives, custom audiences, conversions; after approval tokens must be regenerated; rate limits not raised by tier (third-party statement, UNVERIFIED). Needs an X ad account with funding.

### 3.6 Google Ads API
Source: developers.google.com/google-ads/api/docs/api-policy/developer-token (fetched).
- The page states **developer tokens were sunset on 9 Sep 2026; access levels are now granted to the Google Cloud project** that owns the OAuth client: Test (15,000 ops/day, test accounts), Explorer (up to 2,880 ops/day, production, automated), Basic (brand verification + automated review), Standard (manual compliance review). A manager (MCC) account is no longer required unless managing multiple accounts. **This contradicts older docs/knowledge; re-confirm in the Cloud Console before building.**
- Scope `https://www.googleapis.com/auth/adwords`; campaign creation uses mutate operations (budget -> campaign -> ad group -> ad). Video ads run on YouTube via Google Ads (video campaigns need the video uploaded to YouTube first, linked to the Ads account).

### 3.7 Google Business Profile
- Local posts remain on `mybusiness.googleapis.com/v4/.../localPosts`; docs only show PHOTO media (no video); CTA types BOOK/ORDER/SHOP/LEARN_MORE/SIGN_UP/CALL; product posts unsupported. API access requires registering the project and OAuth; the Business Profile APIs need access approval via Google's request form (**approval step UNVERIFIED on fetched page**).

### 3.8 What needs the company's own developer-app approvals (summary)
| Capability | Company must obtain |
|---|---|
| FB/IG organic publishing for its own accounts | Meta app (Business type), roles on app, Standard access works for own admin users; **App Review + Business Verification** for `instagram_content_publish`/`pages_manage_posts` if used beyond app-role users; IG professional account linked to a Page; PPA if required |
| FB/IG insights | + `instagram_manage_insights`, `read_insights`, `pages_read_engagement` (review) |
| Meta ads creation | `ads_management`/`ads_read`; own account Standard; others -> Advanced (review + verification) |
| YouTube upload (public) | Google Cloud project, OAuth consent screen verification, **YouTube API compliance audit** |
| LinkedIn personal posting | LinkedIn app with "Share on LinkedIn" product (self-serve) |
| LinkedIn company page posting/analytics | Community Management API approval (+ verified page) |
| LinkedIn ads | Advertising API/Marketing Developer Platform approval (UNVERIFIED process details) |
| X posting | X developer account + prepaid credits; X Ads API separate approval form |
| Google Ads | Cloud project access level (Basic requires brand verification; Standard manual review) |
| GBP posts | GBP API access request |
| UGC video | Company's Gemini API key (billing), OpenAI key |

---

## 4. Gaps and risks (prioritised)

### P0 - blockers for "production ready"
1. **AI image model retired** (`settings.ts:77`). Fix: configurable model list verified at runtime (`models.list`), default to current model, health check in Settings, correct cost table by quality/size, `images.edit` support.
2. **LinkedIn API version expired** (`integrations.ts:22`) + personal-only posting. Fix: update version, add `w_organization_social` flow with org discovery, document Community Management API prerequisite.
3. **No real ads creation** (requirement: "Campaigns & Ads production ready"). Need Meta Marketing API client first (own-account Standard access), then Google Ads, LinkedIn, X. Needs new `ad_launches` data model (platform ids, status sync, spend caps, approvals, kill switch).
4. **No real analytics ingestion.** Build metric pullers (Meta insights, IG insights, YouTube statistics/Analytics, LinkedIn org stats) + paid insights pullers; store time-series snapshots with source/timestamp; remove typed-in metrics as the primary path (keep as "manual override" flagged).
5. **Publishers unproven end-to-end.** No live-account test, no retries/backoff/idempotency (a retry after a network timeout post-container-creation can double-publish), no token refresh for Meta/LinkedIn, no expiry warnings, IG polling blocks a request for 2 min, memory-buffered uploads up to 500 MB (`MAX_VIDEO_BYTES` `constants.ts:221`) -> OOM on serverless.
6. **Redirect URI instructions wrong** (`catalog.ts:131/138/145` missing `/callback`) - first connection attempt fails for any company following the UI.
7. **Scheduling reliability**: daily cron + in-memory throttle (`publishing.ts:124`, `vercel.json:24`). Needs a frequent cron (e.g. every 5 min like `viralpulse-ugc`), DB-based lease, retries with attempt counter, publish window (+/- minutes), timezone per company.
8. **UGC final video may not exist** without ffmpeg (`engine.ts:754-757`): add `ffmpeg-static`/`@ffmpeg-installer` + `outputFileTracingIncludes`, or an external render worker; otherwise "UGC -> post" is unusable for multi-scene videos.
9. **YouTube uploads private until API audit** and hardcoded `public` (`publishers.ts:168`): apply for audit early; surface visibility option and warn.
10. **Instagram image formats**: only JPEG accepted by IG; no conversion (`sharp` transcode + size/ratio validation) -> silent publish failures.

### P1
- Veo model ids dead (`veo.ts:14-18`): drop or update; add live model listing and capability check.
- Meta token lifecycle (60-day user token; `integrations.ts:325` blocks even valid Page tokens). Switch to Page tokens + `debug_token`, store `data_access_expires_at`, alert 14/7/1 days before.
- X (Twitter) not supported; TikTok not supported (owner list excludes TikTok but "Reels/Posts" scope may include it - confirm).
- Facebook Reels use `/videos` not `/video_reels` flow; FB multi-photo; IG carousel 20; IG alt text; `trial_reels`; YouTube category/privacy/madeForKids/`#Shorts`; GBP video unsupported.
- Single connection per provider; need multiple connected accounts per company and per client (`clientId` exists on campaigns/posts but not on integrations). Data model change: `smms_integrations` keyed by `{provider, accountId}`.
- Rate limiting: only a per-user daily AI count (`ai.ts guard`); none on image generation count/cost, no per-route rate limits on server actions, no concurrency control on OpenAI calls, no per-company spend ceiling for images.
- Usage metering: images not recorded in the AI usage log (`recordAiUsage`) - text uses `setAiFeature` wrapper only; UGC meters Omni only (`deps-default.ts meter`, Veo not metered).
- Audit logging gaps (publish via cron attributed to approver; no log for token refresh/expiry, settings saves unconfirmed, no log on media delete in use).
- Validation of AI output against platform limits (hashtags count, char limits, URLs) not enforced on generation; truncation at publish time can cut sentences or hashtags (`composeText` `.slice(captionLimit)`).
- No SSRF in media fetch **found** (publishers read bytes from Blob by key, platforms fetch our signed URL; there is no user-supplied URL fetch in the product) - but also no "import media from URL" feature. If added (needed for "bring your own asset" flows) it must use an allowlist/resolved-IP check. `link` fields (posts/campaigns landing page) are not validated for scheme beyond `type=url` and are placed into GBP `callToAction.url` and LinkedIn article source: validate `https` only.
- Public media URL: valid for 1 h and not single-use; anyone with the URL can fetch; acceptable but add `Cache-Control` (already `no-store`) and IP-logging.
- `media/[id]` streamer: any signed-in SMMS user may view any media (`route.ts` header comment); no per-client scoping (`clientId`) - matters for agencies.
- Settings page gated wholly by MANAGE_INTEGRATIONS (including brand voice); split permissions.
- OAuth routes are GET redirects (not wrapped in `withTransport`, correct for redirects); server actions are same-origin POSTs (Next CSRF protections apply); `media/upload` and `media/*` GET routes use `withTransport` - fine. Any new JSON route the browser calls (e.g. progress polling) must be wrapped.

### P2
- Hardcoded vocab (objectives, CTAs, industries, languages) -> configurable; example placeholders mention one business.
- Empty states/errors: list pages have empty states, but integration discovery failures show nothing; no "connection health" view; no global "AI unavailable" banner when OpenAI/Gemini unconfigured except per-action errors.
- UX: no unified create flow (campaign -> ad -> media -> schedule) and no bulk scheduling/calendar view; "Marked as published" manual path should disappear once API works.
- i18n/timezone: IST assumptions in UGC caps.
- Tests: only UGC has scripts (`test-ugc*.ts`); publishing, integrations, analytics, actions have **no automated tests**. Mocked-HTTP contract tests are needed for each platform adapter.
- Collections: separate `ugc_*` prefix breaks the "smms_" naming; fine but note for backups/export.

### Data model problems
- Metrics stored inline per variant (`posts.variants[].metrics`), one snapshot, no history -> cannot chart growth. Needs `smms_metric_snapshots`.
- `AdDoc` has `externalRef` string only; need `launch` sub-doc: `{platform, accountId, campaignExtId, adSetExtId, adExtId, state, lastSyncAt, lastError, budget, currency}`.
- Posts have `mediaIds` in a flat list with one `thumbnailId`; platform-specific media selection (different crop per platform) missing; UGC provenance (`ai.projectId`) exists on media but not surfaced on post/ad.
- Campaign `platforms` use `AdPlatform`, posts use `PostPlatform` - no relation between a campaign and organic posts except optional `campaignId` on posts (`posts.ts:96` index); needed for "UGC flows into Campaigns & Ads and Social posts".
- Soft delete + `notDeleted` consistently used - good.

---

## 5. "AI generate on every field" inventory and `AiFieldButton` design

### 5.1 Inventory
Existing AI = record-level only: `generateCampaignAction`, `generateAdAction`, `generatePostAction`/variant, `generateMediaPromptAction`, `runGeneratorAction`, UGC `generatePlan`, `AdaptButton`, `GenerateBar`. **No field has its own AI action today.** Proposed action = what a field button should do (reads -> writes; validation).

**Campaign brief (`CampaignForm.tsx`)**
| Field | Has AI? | Proposed |
|---|---|---|
| Name | no | reads objective, platforms, offer/service, audience -> 5 short names; max 120 |
| Platforms | no | recommend platforms from objective/industry/budget (ids from `AD_PLATFORMS` only) |
| Objective | no (suggestion list) | pick/propose from `CAMPAIGN_OBJECTIVES` + custom from offer |
| Industry | no | infer from brand about/services |
| Target audience | no | from brand audience, offer, industry, location -> 2-3 sentences |
| Location | no | from brand/company address (HRMS) - only real data, never invented |
| Budget / currency | no | **suggest range with explicit assumptions**, never auto-set; flag as estimate |
| Start/End dates | no | from offer `validUntil` (Festival Offers) / duration; deterministic, not LLM |
| CTA | no | from objective + platform |
| Landing page | no | pick from known site pages / offer URL only; no invented URLs |
| Offer/service | no | choose from catalogue |
| Keywords | no | from service + audience; validate dedupe, max 30 |
| Tone, Language | no | from brand tone |
| Brand information | no | summarise brand context + client |

**Campaign strategy editor (`CampaignStrategyEditor.tsx`, `StructuredEditor.tsx`)**: whole-strategy regenerate exists; per-field (summary, positioning, each key message, channel plan, KPIs, ideas, audiences, keywords, hashtags, each ad concept) = no. Proposed: per-field "rewrite/expand/shorten" with current value + rest of strategy as context.

**Ad editor (`AdEditor.tsx`, `NewAdForm.tsx`)**
Name (no), Platform/Format/Size (no -> recommend from campaign objective), Headline, Primary text, Description, CTA, Caption, Hashtags, Keywords, Audience suggestions, Image concept/prompt/overlay text, Video concept/hook/scenes/voiceover/on-screen text/thumbnail concept, Variations: whole-ad generate exists (`generateAdAction`), `AdaptButton` for cross-platform; **no per-field AI**. Image prompt -> image has a button (generate image). Missing: video generation from ad (link to UGC with prefilled brief).

**Post brief (`PostBriefForm.tsx`)**: Topic, Objective, Service/Product, Audience, Tone, Language, Planned time (should be "best time" from real analytics), Link, Internal title, Notes - none have AI.
**Post editor (`PostEditor.tsx`, `PublishPanel.tsx`)**: Idea (placeholder says "Generate with AI or write", only via whole-post), per-platform title/content/caption/CTA/hashtags/keywords (variant-level regenerate exists, field-level no), creative image prompt (button exists), video concept/script/scenes (no), thumbnail (image button exists), schedule time (no), "Mark as published" URL (n/a), metrics inputs (n/a - should be auto).
**AI Content Generator (`AiWorkspace.tsx`)**: Platform, count, brief, audience, tone, language, offer, client - none; brief could get "improve brief".
**Media library (`MediaLibrary.tsx`)**: Name, Alt text, Description, Tags, Caption, Script, Creative prompt - only creative prompt has AI (`generateMediaPromptAction`); alt text/description/tags/caption/name should auto-generate from the image (vision).
**Settings Brand (`SettingsForms.tsx`)**: About, Services, Products, Tone, Hashtags, Audience, Messaging, Website info, Selling points, Avoid - none. Must read only real company data (HRMS company, site catalogue, website content) and mark as "draft from your data".
**Settings AI/Integrations**: numeric/model fields - no AI (not applicable); instead provide "recommended" presets.
**UGC wizard (`UgcWizard.tsx` + steps)**: Step 1 Brief: Product name, Video name, What it is, Key points, Offer, Valid until, Coupon, Terms, Audience, CTA, Industry, Goal, Platform, Language, Length - **no AI**. Step 2 Style: `styles/suggest.ts` is a deterministic keyword suggester (not LLM; fine). Step 3 Cast & look: People, Wardrobe, Personality, Accent, Place, Lighting, Time of day, Camera, Pacing, Ambient sound - re-roll variation exists (seeded randomness, `pools.ts`), not field AI. Step 4 Script: whole-plan `generatePlan(instruction)` and per-scene "Rewrite instruction" (`UgcScriptStep.tsx:108`) exist = partial; scene Setting, Camera, On-screen text, Dialogue lines have no per-field button. Step 5 Review: AI-label/caption are deterministic; caption/hashtag generation for the target platform missing. UGC settings (caps) - no.

**Hard rule for offer/coupon/terms/price/validity fields: AI must never invent** (the UGC engine already enforces "the video can only mention what you write", `validate.ts`, `offer.ts`). The button for these fields should only *restructure/clean* user text or pull from Festival Offers.

### 5.2 `AiFieldButton` design
Location: `src/components/products/viralpulse-ai/ai/AiFieldButton.tsx` + `src/lib/products/viralpulse-ai/ai-field/{registry.ts,run.ts,context.ts}` + one server action `aiFieldAction`.

**Props**
```ts
type AiFieldButtonProps = {
  fieldId: FieldId;                       // key into server registry, e.g. "campaign.audience"
  value: string | string[] | number | null; // current value (for rewrite/undo)
  getContext: () => FieldContext;         // lazily reads the sibling form values (not the whole DOM)
  onApply: (next: FieldValue, meta: { runId: string }) => void;
  mode?: "generate" | "improve" | "shorten" | "expand" | "options"; // "options" returns 3-5 choices
  disabled?: boolean;
  language?: string;
  className?: string;
};
```
Wrapped in `<AiField>` (label + input + button + counter + undo) so every form uses one pattern. A `useAiField(fieldId)` hook gives state (idle/running/error), `undo()`, `redo()`.

**Server action contract (`aiFieldAction`)**
```ts
input:  { fieldId, mode, current: FieldValue, context: Record<string, unknown>, locale, entity?: {type:"campaign"|"post"|"ad"|"ugc"|"media"|"brand", id?: string}, nonce: string }
output: { ok: true; runId; options: FieldValue[]; usage:{model,inTok,outTok,costUsd}; warnings: string[]; sources: {kind:"brand"|"offer"|"catalogue"|"user"; ref:string}[] }
      | { ok: false; error: string; code: "NO_KEY"|"LIMIT"|"BLOCKED"|"INVALID"|"RATE"|"PROVIDER" }
```
Implementation = `run(["GENERATE_AI_CONTENT"], ...)` (inherits session, read-only block, plan/billing guard). Registry entry per field: `{ permission, schema (strict JSON, single field or options array), contextKeys (allowlist of context keys the field may read), maxLen, validate(next, ctx), deterministicResolver? (for dates, CTA lists, location from HRMS - no LLM), factPolicy }`. Server **ignores any context key not in `contextKeys`** and re-reads trusted sources (brand, offers, catalogue, client) from DB instead of trusting the browser.

**Context passing**: client sends only the sibling form values listed in `contextKeys` (small JSON, capped 8 KB); server merges `brandPrompt()` (`brand.ts`), live offers, client, campaign strategy, selected platforms + `platformGuide()`.

**No-invented-facts rule**: prompt template section "Allowed facts" (brand context, offer fields, user fields, catalogue) and "Everything else must be omitted or marked [NEEDS INPUT]"; for factual fields (price, discount, dates, coupon, phone, URL, address, claims, statistics, testimonials) registry flag `factual: true` -> model may only restructure user-provided text; output scanned by validator (numbers/URLs/currency/percentages/dates not present in allowed-fact set are rejected or flagged -> `warnings`). Reuse UGC `policy.ts` rules (fake testimonial, fake authority, scarcity) for all marketing text. Response includes `sources` so UI can show "based on: Brand tone, Offer 'Diwali'".

**Undo/history**: client keeps a per-field stack (value before apply); server stores each run in `smms_generations` (`targetType:"field"`, `kind: fieldId`, snapshot, userId) so restore works across sessions; "Undo" restores the previous value and marks the run `reverted` (analytics for quality). Nothing is persisted to the record until the form's normal Save.

**Rate limiting**: per-user token bucket (e.g. 20/min, 300/day, configurable; reuse `dailyGenerationLimit` counter) + per-company daily cost ceiling + de-dup by `nonce`/input hash (return cached options within 60 s) + in-flight lock per field; map OpenAI 429 to `code:"RATE"` with retry-after.

**Usage metering**: call `recordAiUsage` (platform billing ledger) + `smms_generations` row with tokens/cost; feature label `"ViralPulse field AI"`; use cheap text model setting separate from long-form model (`ai.fieldModel`).

**Accessibility/UX**: button inside field (icon + tooltip "Write with AI"), keyboard accessible, `aria-live` status, shows options popover for list/choice fields, "Apply / Try again / Undo", disabled with tooltip when no OpenAI key or no permission, shows char-limit counter and validation errors from `validate`.

**Image/video fields** (prompt, concept) call the same action but may trigger `generateImage`/UGC separately; visual field = "AI generate" opens the AI Image Studio panel prefilled.

**Tests**: unit test per registry entry (schema, validator, fact scanner) with fake LLM; contract test for `aiFieldAction` permission/rate-limit paths.

---

## 6. Proposed information architecture and build plan

### 6.1 New sidebar
1. **Campaigns & Ads** - campaign wizard -> ad sets/creatives -> media (from Image/UGC studios) -> review/approve -> launch (real) -> live performance. Sub-tabs: Campaigns, Ads, Audiences, Launches (status of API pushes), Budgets/Approvals.
2. **Social Media Reels-Posts** - Compose (multi-platform), Calendar, Queue/Failed, Published, Accounts health strip.
3. **AI Image Studio** - generate / edit (image edits) / resize-per-platform / brand kits / library; "Use in post" and "Use in ad" actions.
4. **AI UGC Studio** - existing wizard + projects; "Create post" and "Use in campaign/ad" actions on ready projects.
5. **Analytics** - real-synced organic + paid; per account, per campaign, per creative (image/UGC); source/last-sync badges.
6. **Settings** - Connected accounts (multi-account, health, scopes, expiry), Brand kit, AI models/limits, Spend caps/approvals, Roles, Audit log, Notifications.
Media Library becomes a shared panel/drawer (not top-level) or sits under Image Studio. Dashboard folds into Analytics home (or stays as landing). Old routes get redirects.

### 6.2 Work packages
Dependency order: **WP0 -> WP1 -> (WP2, WP3, WP4 in parallel) -> WP5 -> WP6 -> WP7**.

**WP0 - Foundations & P0 hotfixes** (1-2 days; blocks everything)
- Fix image model default + model verification; LinkedIn version; callback URL docs; Veo defaults; add `ffmpeg-static` and `outputFileTracingIncludes`; env/health page.
- Files: `settings.ts`, `ai.ts`, `integrations.ts`, `platform/connections/catalog.ts`, `ugc/providers/veo.ts`, `package.json`, `next.config.ts`.
- Tests: unit for model fallback; manual live check.

**WP1 - IA, sidebar & shared components**
- New nav (`SmmsSidebar.tsx`, `SmmsMobileSidebar.tsx`, `(protected)/layout.tsx`, route moves with redirects), `AiFieldButton`/`AiField`, `ai-field/*` registry + `aiFieldAction`, common `Stepper`, `SourceBadge`, `ConnectionGate` (blocks flows when account missing), `EmptyState`/`ErrorState`.
- Owner: front-end lead. Tests: Playwright nav/permission flags; unit registry tests.

**WP2 - Connections & accounts (Settings)** (precedes 3/4/6)
- New `smms_accounts` (multi-account per provider/client), token refresh + `debug_token`, expiry cron, scope diff, health UI; add X (OAuth 2.0 PKCE) and Google Ads, Meta Ads account discovery, LinkedIn org discovery (`w_organization_social`).
- Files: `integrations.ts` -> `connections/*` in product, `oauth/[provider]` routes, `SettingsForms.tsx`, `crypto.ts` (keep AAD scheme; add key id for rotation).
- Tests: mocked OAuth server contract tests; token-expiry simulation; encryption round trip/AAD tamper.

**WP3 - Social posts/reels with real publishing**
- Rewrite `publishers.ts` as per-platform modules with retry/backoff/idempotency keys (`publish_attempts` collection), resumable uploads from Blob stream (no full buffering), IG/FB Reels flow, JPEG transcode (`sharp`), media validators per platform spec, YouTube privacy/category/Shorts, LinkedIn org posting, X posting + chunked media upload, GBP.
- 5-minute scheduler cron with DB leases; remove in-memory throttle; notifications + email on failure.
- Files: `publishers/*`, `publishing.ts`, `posts.ts`, `PostEditor.tsx`, `PublishPanel.tsx`, `vercel.json`, `lib/cron/*`.
- Tests: HTTP-mocked adapter suites (nock/undici MockAgent) incl. 429/5xx/timeouts; sandbox accounts for each platform (staging checklist); idempotency test.

**WP4 - AI Image Studio**
- Provider abstraction (OpenAI current model + optional Gemini image), `images.edit`, per-platform crop/resize with `sharp`, brand kit (logo/colours), N variants, cost by quality/size recorded to `recordAiUsage`, rate limit/caps, asset provenance metadata; UI under `/viralpulse-ai/image-studio`; hand-off buttons.
- Files: `ai.ts` split -> `ai/image.ts`, `media.ts`, new `ImageStudio*.tsx`.
- Tests: fake provider, size/crop golden images, cost math.

**WP5 - UGC hand-off into posts and campaigns**
- `createPostFromUgc`, `attachToAd`, `useInCampaign` actions; prefill title/caption/hashtags/disclosure from `captions.ts`/`post-guidance.ts`; require final render (ffmpeg) or block; carry AI disclosure flag into publish (IG/YouTube "altered content"/AI label settings where API supports; verify per platform). Track provenance `media.ai.projectId` on posts/ads.
- Files: `ugc/engine.ts attachToPost`, `ugc/api.ts`, `UgcProjectDetail.tsx`, `posts.ts`, `ads.ts`.
- Tests: extend `scripts/test-ugc.ts`; integration test attach -> publish dry-run.

**WP6 - Campaigns & Ads with real launch**
- Phase A: Meta Marketing API (own account Standard access): campaign/adset/ad creation `PAUSED`, creative upload (image/video from library), budgets, targeting mapper from AI audiences (validated against Targeting Search), status sync, pause/resume, spend guard + approval + confirm modal. Phase B: Google Ads (Basic/Standard access), Phase C: LinkedIn (after Advertising API approval), Phase D: X Ads (after approval).
- New collections: `smms_ad_launches`, `smms_ad_sync_runs`. Cron every 15-60 min for status + insights.
- Files: `ads.ts`, `campaigns.ts`, new `ads-platforms/{meta,google,linkedin,x}.ts`, `CampaignForm.tsx`, `AdEditor.tsx`, new wizard.
- Tests: Meta sandbox ad account; mocked API suites; budget-cap property tests.

**WP7 - Analytics real data**
- `smms_metric_snapshots` (platform, externalId, metric, value, capturedAt, source); pullers: IG/FB insights, YouTube statistics/Analytics, LinkedIn org stats, Meta/Google/LinkedIn/X ads insights; backfill job; analytics UI with sync status; remove manual-entry as default (keep audited override). Join paid data via launch ids not name keys.
- Files: `analytics.ts`, `lib/campaigns.ts` consumer, new `metrics/*`, cron job `viralpulse-metrics`, analytics pages.
- Tests: snapshot idempotency, rate-limit handling, fixture-based parsers.

### 6.3 File ownership suggestions
- Platform/OAuth/crypto: backend A (WP2). Publishing & cron: backend B (WP3, WP7 cron). Ads platforms: backend C (WP6). AI/Image: AI engineer (WP0 AI fixes, WP4, `ai-field` server). UGC: UGC owner (WP5). UI/IA: front-end (WP1, UIs for 3-7).
- Shared contract files (`constants.ts`, `db.ts`, `viewer.ts`, `run.ts`) change only via small PRs reviewed by WP1 owner.

### 6.4 Test strategy
- Unit: pure functions (composeText, validators, cost math, registry), run with `tsx` scripts following `scripts/test-*.ts` pattern. **Never run DB tests against `.env.local`** (project memory: test scripts drop any DB named `*test*`; use throwaway `MONGODB_URI`).
- Contract tests with recorded/mocked HTTP for each platform; negative cases: expired token, revoked token, 429, 5xx, partial success (IG container ok, publish fails), duplicate publish.
- Live smoke checklist per platform with company-owned sandbox accounts (run manually before release; scripted but gated by env flag).
- E2E (Playwright, existing `scripts/e2e`): sidebar permissions, create -> generate -> schedule -> publish with mocked platform server, UGC -> post, AI field undo.
- Security: tenant-isolation tests (two companies, same ids), token never in logs/responses (grep tests), media URL signature expiry/tamper, OAuth state replay.
- Observability: structured logs with redaction, dashboards for publish success rate, token expiry, AI cost.

### 6.5 Release gating checklist
1. Company developer apps approved per section 3.8 (start App Review, YouTube audit, LinkedIn CMA, Ads access **now** - they take weeks and gate WP3/WP6/WP7).
2. WP0 shipped; image/text models verified live.
3. All platform adapters pass live smoke with company accounts.
4. Demo seeder (`scripts/demo/smms.mjs`) restricted to demo companies; no seeded numbers in production tenants.
5. Docs: update `docs/build-apps.md` for any build/install change (e.g. `ffmpeg-static`, `sharp`) per project convention.

---
*Items marked UNVERIFIED could not be confirmed from the official pages fetched in this audit and must be re-checked before relying on them.*
