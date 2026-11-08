# Paid-ads platform spec (verified 2026-11-01)

Source of truth for the Campaigns & Ads wizard. Every field below was read from the official page named in its section on 2026-11-01.
Where a page was truncated or did not state a value it is marked **UNVERIFIED**; the code treats UNVERIFIED limits as warnings, never as hard
errors, and never invents them. The UI must show only fields in this document.

## 0. What is real in this build

| Platform | Status in code | Why |
|---|---|---|
| Meta (Facebook + Instagram) | **Real**: client, validators, builders, create/compensate, activate, pause/resume/archive, edit, insights sync | Own ad accounts work in Standard/Limited access without review |
| Google Ads | **Shape + validation only** (`requires approved access`) | Needs a Cloud project with Explorer+ access, plus a campaign/ad-group/ad mutate flow that cannot be tested without a live account |
| LinkedIn | **Shape + validation only** (`requires approved access`) | Advertising API product needs LinkedIn approval (Development tier: 5 ad accounts, no account creation) |
| X (Twitter) | **Shape + validation only** (`requires approved access`) | Ads API is gated; account hierarchy verified, field enums partly UNVERIFIED |

Platforms without API support keep an audited manual path labelled "manually tracked" (`markAdManuallyTracked`).

## 1. Meta Marketing API

Graph versions (developers.facebook.com/docs/graph-api/changelog/versions): v26.0 released 2026-07-29 (expiry TBD), v25.0 released
2026-02-18 (expires 2028-07-29), v24.0 until 2028-02-18, v23.0 until 2027-10-08. Default in code: `v25.0`, override `META_ADS_GRAPH_VERSION`.

### 1.1 Access (authorization page)
- Permissions `ads_management` (+ `ads_read`). Standard access: automatic for Business apps, **own ad accounts only**. Advanced access: App Review per
  permission, needed to manage ad accounts owned by others; Business Verification is required when an app accesses sensitive data.
- Separate from that is the **Marketing API Access Tier**: renamed, Standard -> **Limited Access** (default, heavily rate limited, development only),
  Advanced -> **Full Access** (after App Review). To get/keep Full Access: **>= 500 API calls in the last 15 days** (was 1,500) and **error rate < 15% across
  the last 500 calls**. This resolves the audit's conflicting claim: 500, not 1,500; the rename is real.
- Error 294: managing ads requires `ads_management` and an app on the allow list.

### 1.2 Campaign: `POST /act_{id}/campaigns`
| Field | Type / rule |
|---|---|
| name | string |
| objective | `OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_APP_PROMOTION, OUTCOME_SALES` (the legacy values APP_INSTALLS, CONVERSIONS, LEAD_GENERATION, LINK_CLICKS ... are listed by the page but deprecated on create since v17 and **not offered**) |
| special_ad_categories | **required** array: `NONE, EMPLOYMENT, HOUSING, CREDIT, ISSUES_ELECTIONS_POLITICS, ONLINE_GAMBLING_AND_GAMING, FINANCIAL_PRODUCTS_SERVICES`; `NONE` or `[]` if none |
| special_ad_category_country | array of 2-letter codes (the countries the category applies to) |
| buying_type | `AUCTION` (default) or `RESERVED` (reach & frequency; **not offered**: all ad sets must match) |
| bid_strategy | `LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS` (campaign level, with campaign budget) |
| status | only `ACTIVE` / `PAUSED` on create (we always create `PAUSED`) |
| spend_cap | int64 minor units; ~USD 100 minimum; `922337203685478` removes it |
| daily_budget / lifetime_budget | int64 minor units, campaign budget optimisation (CBO); set at campaign **or** ad set level, never both (error subcode 1885621) |
| start_time / stop_time | datetime |
| is_adset_budget_sharing_enabled | boolean (update section; shares up to 20% across ad sets) |
| execution_options | `validate_only`, `include_recommendations` |

### 1.3 Ad set: `POST /act_{id}/adsets`
| Field | Rule |
|---|---|
| name | required, max 400 chars |
| campaign_id | parent |
| daily_budget / lifetime_budget | one > 0 when no campaign budget. Daily only for sets lasting > 24h. Lifetime requires `end_time` |
| end_time | required with lifetime budget; `0` = ongoing daily-budget set |
| start_time | datetime |
| bid_amount | minor units; **required** for `LOWEST_COST_WITH_BID_CAP` and `COST_CAP` |
| bid_strategy | as above (ad-set level when no CBO) |
| billing_event | `APP_INSTALLS, IMPRESSIONS, LINK_CLICKS, NONE, OFFER_CLAIMS, PAGE_LIKES, POST_ENGAGEMENT, THRUPLAY, PURCHASE, LISTING_INTERACTION` (CLICKS deprecated) |
| optimization_goal | `NONE, APP_INSTALLS, AD_RECALL_LIFT, ENGAGED_USERS, EVENT_RESPONSES, IMPRESSIONS, LEAD_GENERATION, QUALITY_LEAD, LINK_CLICKS, OFFSITE_CONVERSIONS, PAGE_LIKES, POST_ENGAGEMENT, QUALITY_CALL, REACH, LANDING_PAGE_VIEWS, VISIT_INSTAGRAM_PROFILE, ENGAGED_PAGE_VIEWS, VALUE, THRUPLAY, DERIVED_EVENTS, CONVERSATIONS, ...` (full list in `meta/constants.ts`) |
| destination_type | `WEBSITE, APP, MESSENGER, WHATSAPP, INSTAGRAM_DIRECT, FACEBOOK, ON_AD, ON_POST, ON_EVENT, ON_VIDEO, ON_PAGE, INSTAGRAM_PROFILE, ...` |
| promoted_object | `pixel_id`, `custom_event_type` (+`custom_event_str` for OTHER), `page_id` (PAGE_LIKES, OFFER_CLAIMS, LEAD_GENERATION, messaging), `application_id` + `object_store_url`, `product_catalog_id`, `product_set_id`, `offer_id`, `event_id`, `offline_conversion_data_set_id`, `lead_ads_*` |
| targeting | see 1.4 |
| attribution_spec | list of `{event_type: CLICK_THROUGH\|VIEW_THROUGH\|ENGAGED_VIDEO_VIEW, window_days}`; valid windows depend on goal (UNVERIFIED which) |
| dsa_beneficiary, dsa_payor | strings <= 512; **required when targeting the EU or associated territories** (error subcodes 3858079 payor, 3858081 beneficiary, 3858152); fall back to the ad account's `default_dsa_*`; one field never copies into the other |
| is_dynamic_creative | boolean default false; true allows only dynamic-creative ads in the set |
| adset_schedule | list `{start_minute, end_minute, days[0=Sun..6=Sat], timezone_type USER\|ADVERTISER}` (only with lifetime budget; UNVERIFIED) |
| frequency_control_specs | `{event IMPRESSIONS\|VIDEO_VIEWS\|..., interval_days 1-90, max_frequency 1-90}`, **only REACH and THRUPLAY goals** |
| daily_spend_cap / lifetime_spend_cap, daily_min_spend_target | minor units (ad-set level spend limits; require matching budget type) |
| ad_set_goal | OUTCOME_SALES only |
| execution_options | `validate_only` |

**ODAX objective -> optimisation goal / destination / promoted object** (campaign reference, "Objective Mapping"):
- AWARENESS: AD_RECALL_LIFT (page_id) / REACH or IMPRESSIONS (page_id) / THRUPLAY or TWO_SECOND_CONTINUOUS_VIDEO_VIEWS (page_id)
- TRAFFIC: LINK_CLICKS, LANDING_PAGE_VIEWS, REACH, IMPRESSIONS (website; app needs application_id + object_store_url); MESSENGER / WHATSAPP (page_id) with LINK_CLICKS, REACH, IMPRESSIONS; PHONE_CALL with QUALITY_CALL or LINK_CLICKS
- ENGAGEMENT: ON_POST -> POST_ENGAGEMENT, REACH, IMPRESSIONS; ON_PAGE -> PAGE_LIKES (page_id); ON_EVENT -> EVENT_RESPONSES, POST_ENGAGEMENT, REACH, IMPRESSIONS; ON_VIDEO -> THRUPLAY, TWO_SECOND_CONTINUOUS_VIDEO_VIEWS; MESSENGER -> CONVERSATIONS, LINK_CLICKS, LEAD_GENERATION (page_id); conversions -> OFFSITE_CONVERSIONS (pixel_id+custom_event_type)
- APP_PROMOTION: LINK_CLICKS, OFFSITE_CONVERSIONS, APP_INSTALLS (application_id, object_store_url)
- LEADS: ON_AD -> LEAD_GENERATION or QUALITY_LEAD (page_id); LEAD_FROM_MESSENGER / LEAD_FROM_IG_DIRECT -> LEAD_GENERATION; PHONE_CALL -> QUALITY_CALL; website conversions -> OFFSITE_CONVERSIONS or LINK_CLICKS (pixel_id + custom_event_type)
- SALES: OFFSITE_CONVERSIONS (pixel_id + custom_event_type, or application_id + object_store_url); CONVERSATIONS (page_id, pixel_id, custom_event_type); QUALITY_CALL (page_id); catalog: LINK_CLICKS (campaign product_catalog_id; ad set product_set_id + custom_event_type)
The mapping table is the page's; Meta can add goals, so the API error is always the final word (we also map it).
The page does not list billing events per objective (**UNVERIFIED**); the code applies Meta's documented defaults (IMPRESSIONS for most goals, THRUPLAY for THRUPLAY, LINK_CLICKS only when the goal allows) and the API validates.

### 1.4 Targeting spec
- At least one country in `geo_locations` unless a custom audience is used.
- `geo_locations`: `countries[]`, `regions[{key}]` (<=200), `cities[{key, radius, distance_unit}]` (<=250, radius 10-50 mi or 17-80 km), `zips[{key}]` (<=50,000), `places`, `custom_locations` (radius 0.63-50 mi / 1-80 km, <=200), `geo_markets`, `country_groups`, `location_types` (`home`,`recent`; subcode 1870199 says all location targeting now reaches people in or recently in the locations, so we **do not send** location_types). Mixing `radius` with multiple locations can fail (subcode 1815946).
- `excluded_geo_locations` same shape. Search: `GET /search?type=adgeolocation&location_types=["country","region","city","zip"]&q=`.
- `age_min` default 18, must be >= 13; `age_max` <= 65; `genders` `[1]` male / `[2]` female (omit = all). Under-18 audiences are not allowed for audience targeting (subcode 1870165).
- `locales[]` ids from `type=adlocale`, max 50.
- Detailed targeting: `flexible_spec: [{interests:[{id,name}], behaviors:[...], life_events, industries, income, family_statuses, demographics ...}]` (OR inside a spec, AND between specs); `exclusions` same shape. Requires `geo_locations`, `custom_audiences`, ... alongside.
  Search: `type=adinterest&q=`, `type=adinterestsuggestion&interest_list=[...]`, `type=adinterestvalid`, `type=adTargetingCategory&class=behaviors|demographics|life_events|industries|income|family_statuses|user_device|user_os`, `type=adworkemployer`.
- `custom_audiences[{id}]`, `excluded_custom_audiences[{id}]` <= 500 each. Lookalikes are custom audiences (`subtype LOOKALIKE`); the audience terms must be accepted on the account (subcodes 1870034/1870047/1870090/1870092).
- `targeting_automation.advantage_audience` 0|1 (Advantage+ audience). Page does not define semantics beyond the sample (**UNVERIFIED** constraints); sent as documented in the sample.
- Placements (placement-targeting page): omit all = **Advantage+ placements**. Manual: `publisher_platforms` `facebook, instagram, threads, messenger, audience_network, whatsapp`; `facebook_positions` `feed, right_hand_column, marketplace, video_feeds, story, search, instream_video, facebook_reels, facebook_reels_overlay, profile_feed, notification`; `instagram_positions` `stream, story, explore, explore_home, reels, profile_feed, ig_search, profile_reels`; `messenger_positions` `sponsored_messages, story`; `audience_network_positions` `classic, rewarded_video`; `device_platforms` `mobile, desktop`; `user_os` `iOS, Android` (+ versioned).
  Rules enforced by `meta/validate.ts`: `audience_network` cannot be alone; FB `story` / messenger `story` need `feed` (or IG `story`) and mobile only; `marketplace, search, profile_feed, notification` need FB `feed`; `sponsored_messages` cannot combine with others; `right_hand_column` only TRAFFIC / CONVERSIONS-type goals; `instream_video` only video-view/engagement goals; Audience Network + video views must use THRUPLAY; a position list must match its publisher platform being selected.
- `targeting_relaxation_types` appears only in samples (UNVERIFIED).

### 1.5 Creative: `POST /act_{id}/adcreatives`
- `name` (<= 100), `object_story_spec {page_id, instagram_user_id (instagram_actor_id deprecated; sending both is error 2238055/2446149), link_data | video_data | photo_data | text_data | template_data}`, `object_story_id` (existing post), `asset_feed_spec` (multiple texts/headlines; for dynamic creative), `url_tags` (query string appended to link, e.g. UTM), `degrees_of_freedom_spec`, `authorization_category` (`POLITICAL`, `POLITICAL_WITH_DIGITALLY_CREATED_MEDIA`).
- `link_data`: `link`, `message` (primary text), `name` (headline), `description`, `image_hash`, `call_to_action {type, value{link, lead_gen_form_id, ...}}`, `child_attachments[{link, name, description, image_hash | video_id, call_to_action}]` (carousel, 2-10 cards: **UNVERIFIED count**), `multi_share_optimized`, `caption` (display link).
- `video_data`: `video_id`, `image_hash` or `image_url` (thumbnail), `message`, `title`, `link_description`, `call_to_action` (required for video ads).
- `photo_data`: `image_hash`, `caption`.
- CTA types (page enum, 120+): the wizard offers the verified list in `meta/constants.ts` (SHOP_NOW, LEARN_MORE, SIGN_UP, BOOK_TRAVEL/BOOK_NOW, DOWNLOAD, CONTACT_US, GET_QUOTE, SUBSCRIBE, APPLY_NOW, GET_OFFER, ORDER_NOW, WATCH_MORE, MESSAGE_PAGE, WHATSAPP_MESSAGE, GET_DIRECTIONS, CALL_NOW, INSTALL_MOBILE_APP, DONATE_NOW, NO_BUTTON, ...). Invalid type -> error 1373054.
- Text limits: the creative page states title 1-25 / body 1-90 for a **specific format (UNVERIFIED which)**; the Ads Guide for Facebook Feed image states primary text 50 chars shown, headline 27, file JPG/PNG, 4:5, min width 600 / height 750, 3% ratio tolerance, **max 30 MB**. These are *display truncation recommendations*, so they produce **warnings**; hard errors only for the API-documented ones (name 100, headline/ad name non-empty, link https).
- `asset_feed_spec` keys used by the builder (`bodies`, `titles`, `descriptions`, `link_urls`, `images`, `videos`, `ad_formats`, `call_to_action_types`) come from the Dynamic Creative reference; that page was **not** re-fetched, so they are UNVERIFIED and the first live launch must confirm them.
- The "25% daily overshoot" the spend guard counts is Meta help-centre wording that was **not** re-fetched (UNVERIFIED); it only makes the company daily cap more conservative.
- Ad: `POST /act_{id}/ads` `{name (required), adset_id, creative {creative_id}, status ACTIVE|PAUSED, tracking_specs, conversion_domain (first+second level domain, required when campaign shares data with a pixel), ad_schedule_start_time/end_time (sales + app only)}`.

### 1.6 Assets
- `POST /act_{id}/adimages` `bytes` (base64) -> `images.{name}.hash`; `copy_from {source_account_id, hash}`. Size/format limits **not stated by that page**; ads-guide says JPG/PNG, <= 30 MB.
- `POST /act_{id}/advideos` chunked: `upload_phase=start` (`file_size`) -> `upload_session_id`, `video_id`, `start_offset`, `end_offset` -> repeat `upload_phase=transfer` (`upload_session_id`, `start_offset`, `video_file_chunk`) -> `upload_phase=finish`. Title < 255 chars. Chunk size / max size not stated on that page (the offsets in each response drive the next chunk). Error 352 unsupported format, 382 too small. Poll `GET /{video_id}?fields=status` until `video_status` is `ready` (or `error`).
- Ads Guide (read via search): feed video 4:5 recommended 1440x1800, max 4 GB; Stories/Reels 9:16, Stories 1-120 s (a second page says 60 s: **conflict, treated as a warning at 60 and error at 120**); Reels-specific numbers not found (**UNVERIFIED**). Validators for video aspect/duration are therefore **warnings** except documented hard facts.

### 1.7 Account info (`GET /act_{id}`)
`account_status` (1 active, 2 disabled, 3 unsettled, 7 pending risk review, 8 pending settlement, 9 grace period, 100 pending closure, 101 closed), `disable_reason`, `currency`, `timezone_name`, `min_daily_budget`, `min_campaign_group_spend_cap`, `spend_cap`, `amount_spent`, `balance`, `funding_source_details` (needs MANAGE), `is_prepay_account`, `business`, `capabilities`, `default_dsa_payor`, `default_dsa_beneficiary`, `tax_id_status`, `user_tasks`. Amounts are minor units.

### 1.8 Estimates, status, insights
- `GET /act_{id}/delivery_estimate?optimization_goal=&promoted_object=&targeting_spec=` (required: optimization_goal, targeting_spec); node fields not documented (we read `estimate_dau`, `estimate_mau_lower_bound`, `estimate_mau_upper_bound`, `estimate_ready`, treating all as optional).
- `effective_status`: `ACTIVE, PAUSED, DELETED, PENDING_REVIEW, DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO, CAMPAIGN_PAUSED, ARCHIVED, ADSET_PAUSED, IN_PROCESS, WITH_ISSUES`. `ad_review_feedback` / `issues_info` (structure not on the page; we store the raw object trimmed). Status writes: `ACTIVE, PAUSED, DELETED, ARCHIVED`.
- Insights `GET /{id}/insights` (`level`, `time_increment`, `fields`, `date_preset`/`time_range`, `breakdowns`, async for big reports); we pull `impressions, reach, clicks, inline_link_clicks, spend, cpc, cpm, ctr, frequency, actions, cost_per_action_type, purchase_roas` (list typical; page fetch failed, field names from the standard AdsInsights node).

### 1.9 Rate limits and errors
- Headers: `X-Business-Use-Case-Usage` (per business-use-case: `call_count`, `total_cputime`, `total_time` percent, `estimated_time_to_regain_access` minutes, `type`, `ads_api_access_tier`), `X-Ad-Account-Usage` (`acc_id_util_pct`, `reset_time_duration`), `X-FB-Ads-Insights-Throttle`, `x-app-usage`.
- Throttle codes: 4 (app; subcodes 1504022/1504039 insights), 17 (subcodes 2446079, 1885172 = 10 spend changes/day), 613 (1487742; 5044001 = 100 QPS mutation; 4841018 = concurrent edits one per 30 s; 1487632 = ad set budget changes 4/hour), 80000/80003/80004/80014 (BUC). Per-account hourly formula: ads_management 100,000 (Full) or 300 (Dev tier) + 40 x active ads.
- Auth: 190 (token), 102, 10, 200 (permission), 294. 100 = invalid parameter; `error_data.blame_field_specs` names the field.
- Mapped subcodes (plain message in `meta/errors.ts`): 1815694, 1815199, 1487007, 1487033, 1487056, 1487566, 1885088, 1885272, 1885621, 1885650, 1885204, 1885029, 1870034, 1870047, 1870065, 1870090, 1870092, 1870165, 1870199, 2446289, 2446383, 2446394, 2446307, 2490427, 2490468, 2708008, 3858079, 3858081, 3858152, 3858258, 3858064, 2238055, 2446149, 1373054, 1487929, 1487472, 2446712.

## 2. Google Ads API (developers.google.com/google-ads/api)
- Latest **v26.1** released 2026-10-28 (minor, no breaking changes). Code pins `v26`.
- **Access (re-verified, audit confirmed):** developer tokens were **sunset 9 Sep 2026**; access is granted to the **Google Cloud project** owning the OAuth client. Levels: Test (15,000 ops/day, test accounts only), Explorer (<= 2,880 ops/day on production, automated review in most cases), Basic (brand verification, automated review), Standard (manual review). `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (v25+) = Test-only project calling production. A manager account is **not** required unless managing multiple accounts. A token header, if sent, is ignored (will be rejected in a future major version), so the code does **not** send one. Scope `https://www.googleapis.com/auth/adwords`.
- Structure (mutate operations): CampaignBudget -> Campaign (`name`, `advertising_channel_type`, `status`, bidding strategy, `campaign_budget`, `start_date`/`end_date`, network settings, geo/language targeting) -> AdGroup -> AdGroupAd (Responsive search ad: 3-15 headlines <= 30 chars, 2-4 descriptions <= 90 chars) + keywords. Field-by-field page fetch for v26 was **not** done: Google builders are limited to the verified limits above (headline 30, description 90 — also stated in `constants.ts`) and structural rules; everything else UNVERIFIED and marked `requires approved access`.

## 3. LinkedIn Marketing API (learn.microsoft.com, version 202610 pages)
- Headers: `Linkedin-Version: YYYYMM`, `X-Restli-Protocol-Version: 2.0.0`, `Authorization: Bearer`. Base `https://api.linkedin.com/rest`. Version 202511 sunsets **2026-11-16**; default 202610. Scopes `rw_ads` (+`r_ads`, `r_ads_reporting`); member needs ad-account role ACCOUNT_BILLING_ADMIN / ACCOUNT_MANAGER / CAMPAIGN_MANAGER / CREATIVE_MANAGER (VIEWER read-only). 3-legged OAuth only.
- **Access:** Advertising API product on the LinkedIn app needs LinkedIn approval; Development tier manages up to **5 ad accounts**, cannot create accounts.
- Campaign group `POST /adAccounts/{id}/adCampaignGroups`: `account` (urn:li:sponsoredAccount), `name` (<= 200 bytes), `runSchedule {start (required), end (required if totalBudget)}`, `status` (create ACTIVE or DRAFT), `totalBudget {amount, currencyCode}` (currency = account's), optional `objectiveType`, `budgetOptimization {bidStrategy MAXIMUM_DELIVERY|MANUAL|COST_CAP, budgetOptimizationStrategy DYNAMIC}`, `dailyBudget` (DYNAMIC only, 202504+). Limit 5,000 campaigns/account, 2,000/non-default group.
- Campaign `POST /adAccounts/{id}/adCampaigns`: `account`, `campaignGroup`, `name`, `type` (`TEXT_AD, SPONSORED_UPDATES, SPONSORED_INMAILS, DYNAMIC`), `objectiveType` (`BRAND_AWARENESS, ENGAGEMENT, JOB_APPLICANTS, LEAD_GENERATION, WEBSITE_CONVERSIONS, WEBSITE_VISITS, VIDEO_VIEWS`), `costType` (`CPM, CPC, CPV`, required), `unitCost {amount, currencyCode}`, `dailyBudget` or `totalBudget` (one required; total needs `runSchedule.end`), `runSchedule {start, end}` (epoch ms), `locale {country, language}`, `targetingCriteria`, `audienceExpansionEnabled`, `offsiteDeliveryEnabled` (not with Lead Gen), `creativeSelection` (`OPTIMIZED|ROUND_ROBIN`), `optimizationTargetType` (manual: NONE, ENHANCED_CONVERSION; auto: MAX_IMPRESSION, MAX_CLICK, MAX_CONVERSION, MAX_VIDEO_VIEW, MAX_LEAD, MAX_QUALIFIED_LEAD (202602+), MAX_REACH; target cost: TARGET_COST_PER_CLICK|IMPRESSION|VIDEO_VIEW; cost cap: CAP_COST_AND_MAXIMIZE_CLICKS|IMPRESSIONS|VIDEO_VIEWS|LEADS), `associatedEntity` (required for Sponsored Content / Dynamic / Lead Gen), `politicalIntent` (EU consent), `status` (ACTIVE, PAUSED, DRAFT, ARCHIVED). Max 15 active creatives per campaign. Conversion tracking is REQUIRED for WEBSITE_CONVERSIONS on single video/carousel/text/spotlight; audience expansion and LinkedIn Audience Network have per-format allow rules (table in `linkedin.ts`).
- Targeting facets and creatives not fetched (**UNVERIFIED**); only `urn:li:adTargetingFacet:interfaceLocales` seen in the page samples.

## 4. X Ads API
- docs.x.com hierarchy page: ads account (base36 `account_id`) -> funding instruments (each campaign must use one) -> campaigns (name, schedule, budget) -> line items (ad groups: targeting, bidding, creatives). Limits: 100 line items per campaign, 200 active campaigns per account (paused count), **4,000 active line items per account** (an older page said 256: conflict, the newer docs.x.com page is used). Each line item needs a creative. Videos for in-stream use the Amplify category.
- Access/approval: **not described** on the fetched page. Treated as gated ("requires approved access"). Field enums (objective, placements, bid types, micro-currency amounts) come from the X Ads API reference that returned 402 when fetched: **UNVERIFIED**; the shape validator checks only hierarchy and limits above plus non-empty names, a funding instrument, a positive budget and a future start.
