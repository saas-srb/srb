/**
 * Pure helpers of the Social Media Reels/Posts wizard (no server imports - safe in client components and in tests):
 * steps, the state reducer, per-step validation, per-platform character counting, UTM builder, thread splitting, schedule
 * messages, publish-tracker status mapping and the hand-off (query parameter) parser.
 */
import { POST_PLATFORMS, PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { LocalTimeError, checkSchedule, isValidTimezone, zonedToUtc } from "@/lib/products/viralpulse-ai/publishers/schedule";
import type { PublishOptions } from "@/lib/products/viralpulse-ai/publishers/types";

// ── Steps ────────────────────────────────────────────────────────────────────

export const WIZARD_STEPS = [
  { key: "goal", label: "Goal & platforms", hint: "What the post is for and where it goes" },
  { key: "brief", label: "Brief & AI", hint: "The idea, audience and message" },
  { key: "content", label: "Content", hint: "Text, hashtags and link per platform" },
  { key: "media", label: "Media", hint: "Pictures and videos" },
  { key: "options", label: "Platform options", hint: "Privacy, format and declarations" },
  { key: "schedule", label: "Schedule", hint: "Now, later and approval" },
  { key: "review", label: "Review", hint: "Check everything, then send" },
] as const;
export type StepKey = (typeof WIZARD_STEPS)[number]["key"];
export const STEP_KEYS = WIZARD_STEPS.map((s) => s.key) as StepKey[];
export const isStepKey = (v: unknown): v is StepKey => typeof v === "string" && (STEP_KEYS as string[]).includes(v);
export const stepIndex = (k: StepKey) => STEP_KEYS.indexOf(k);

export const OBJECTIVES = [
  { key: "awareness", label: "Awareness", hint: "Be seen by new people" },
  { key: "engagement", label: "Engagement", hint: "Likes, comments, shares, saves" },
  { key: "traffic", label: "Traffic", hint: "Send people to a page" },
  { key: "leads", label: "Leads", hint: "Collect enquiries or sign-ups" },
  { key: "sales", label: "Sales", hint: "Sell a product or service" },
  { key: "announcement", label: "Announcement", hint: "News, launch, event" },
  { key: "hiring", label: "Hiring", hint: "Recruit people" },
] as const;
export type ObjectiveKey = (typeof OBJECTIVES)[number]["key"];
export const objectiveLabel = (k: string) => OBJECTIVES.find((o) => o.key === k)?.label ?? k;
/** Posts store the label (the AI fields read it as plain text); this maps it back when a post is reopened. */
export const objectiveKeyFor = (label: string): ObjectiveKey | "" => OBJECTIVES.find((o) => o.label.toLowerCase() === label.trim().toLowerCase() || o.key === label.trim().toLowerCase())?.key ?? "";

// ── Content types per platform (limited to what each publisher supports, see publishers/SPEC.md) ───

export type ContentTypeKey = "text" | "image" | "carousel" | "video" | "reel" | "story" | "short" | "article" | "thread";
export type MediaNeed = "none" | "image" | "images" | "video" | "image_or_video";
export interface ContentTypeDef {
  key: ContentTypeKey;
  label: string;
  media: MediaNeed;
  min: number;
  max: number;
  hint: string;
  /** Publish options this choice sets. */
  options: Partial<PublishOptions>;
}

const T = (key: ContentTypeKey, label: string, media: MediaNeed, min: number, max: number, hint: string, options: Partial<PublishOptions> = {}): ContentTypeDef => ({ key, label, media, min, max, hint, options });

export const CONTENT_TYPES: Record<PostPlatform, ContentTypeDef[]> = {
  instagram: [
    T("image", "Photo post", "image", 1, 1, "One picture in the feed", { instagram: { format: "feed" } }),
    T("carousel", "Carousel", "images", 2, 20, "2 to 20 pictures in one post", { instagram: { format: "feed" } }),
    T("reel", "Reel", "video", 1, 1, "One vertical video", { instagram: { format: "reel" } }),
    T("story", "Story", "image_or_video", 1, 1, "One picture or video that disappears after 24 hours", { instagram: { format: "story" } }),
  ],
  facebook: [
    T("text", "Text post", "none", 0, 0, "Words only (with an optional link)", { facebook: { format: "feed" } }),
    T("image", "Photo post", "image", 1, 1, "One picture", { facebook: { format: "feed" } }),
    T("carousel", "Several photos", "images", 2, 10, "2 to 10 pictures in one post", { facebook: { format: "feed" } }),
    T("video", "Video post", "video", 1, 1, "One video in the feed", { facebook: { format: "feed" } }),
    T("reel", "Reel", "video", 1, 1, "One vertical video, 3 to 90 seconds", { facebook: { format: "reel" } }),
  ],
  youtube: [
    T("video", "Video", "video", 1, 1, "A normal YouTube video", { youtube: { short: false } }),
    T("short", "Short", "video", 1, 1, "A vertical or square video up to 3 minutes", { youtube: { short: true } }),
  ],
  linkedin: [
    T("text", "Text post", "none", 0, 0, "Words only", {}),
    T("image", "Image post", "image", 1, 1, "One picture", {}),
    T("carousel", "Several images", "images", 2, 20, "2 to 20 pictures in one post", {}),
    T("video", "Video post", "video", 1, 1, "One video, 3 seconds to 30 minutes", {}),
    T("article", "Link (article) post", "none", 0, 0, "A post that shares a link", {}),
  ],
  x: [
    T("text", "Post", "none", 0, 0, "Words only", { x: { thread: false } }),
    T("image", "Post with pictures", "images", 1, 4, "Up to 4 pictures", { x: { thread: false } }),
    T("video", "Post with video", "video", 1, 1, "One video", { x: { thread: false } }),
    T("thread", "Thread", "none", 0, 0, "Long text split into numbered posts", { x: { thread: true } }),
  ],
  google_business: [
    T("text", "Local post", "none", 0, 0, "Words only", {}),
    T("image", "Local post with photo", "image", 1, 1, "One photo", {}),
  ],
};

export const contentTypeDef = (platform: PostPlatform, key: string | undefined): ContentTypeDef | null => CONTENT_TYPES[platform].find((c) => c.key === key) ?? null;
export const defaultContentType = (platform: PostPlatform): ContentTypeKey => CONTENT_TYPES[platform][0].key;

/** Whether a content type needs a video (so the post's `contentType` is "video"). */
export const needsVideo = (m: MediaNeed) => m === "video" || m === "image_or_video";

// ── Account health ───────────────────────────────────────────────────────────

export interface WizardAccount {
  id: string;
  platform: PostPlatform;
  providerLabel: string;
  name: string;
  handle: string | null;
  status: "healthy" | "expiring" | "expired" | "revoked" | "missing_scope";
  enabled: boolean;
  isDefault: boolean;
  daysLeft: number | null;
  expiresAt: string | null;
  missingRequired: string[];
  lastError: string | null;
  /** LinkedIn: member or organisation. */
  kind: string;
}

export type AccountUse = { usable: boolean; tone: "ok" | "warn" | "bad"; label: string; fix: string | null };

/** Whether an account can publish and what to tell the person. Expired, revoked and missing-scope accounts are blocked. */
export function accountUse(a: Pick<WizardAccount, "status" | "enabled" | "daysLeft" | "missingRequired">): AccountUse {
  if (!a.enabled) return { usable: false, tone: "bad", label: "Switched off", fix: "Switch it on in Settings > Connected accounts." };
  switch (a.status) {
    case "expired": return { usable: false, tone: "bad", label: "Login expired", fix: "Reconnect this login in Settings > Connected accounts." };
    case "revoked": return { usable: false, tone: "bad", label: "Access revoked", fix: "Reconnect this login in Settings > Connected accounts." };
    case "missing_scope": return { usable: false, tone: "bad", label: "Missing permission", fix: `Press "Fix permissions" in Settings > Connected accounts${a.missingRequired.length ? ` (needs ${a.missingRequired.join(", ")})` : ""}.` };
    case "expiring": return { usable: true, tone: "warn", label: a.daysLeft != null ? `Expires in ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"}` : "Expiring soon", fix: "Reconnect it before then, or scheduled posts after that date will fail." };
    default: return { usable: true, tone: "ok", label: "Healthy", fix: null };
  }
}

/** The account a platform should use by default: the one picked, else the account marked default, else the first usable one. */
export function pickAccount(platform: PostPlatform, accounts: WizardAccount[], chosen?: string): WizardAccount | null {
  const list = accounts.filter((a) => a.platform === platform);
  return list.find((a) => a.id === chosen) ?? list.find((a) => a.isDefault && accountUse(a).usable) ?? list.find((a) => accountUse(a).usable) ?? list[0] ?? null;
}

// ── Wizard state ─────────────────────────────────────────────────────────────

export interface VariantDraft {
  title: string;
  content: string;
  hashtags: string[];
  keywords: string[];
  cta: string;
}
export const EMPTY_VARIANT_DRAFT: VariantDraft = { title: "", content: "", hashtags: [], keywords: [], cta: "" };

export interface UtmState {
  enabled: boolean;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
}
export const EMPTY_UTM: UtmState = { enabled: false, source: "", medium: "social", campaign: "", content: "", term: "" };

export interface OptionsState {
  instagramShareToFeed: boolean;
  instagramLocationId: string;
  youtubePrivacy: "private" | "unlisted" | "public";
  youtubeCategoryId: string;
  /** null = not answered yet (YouTube makes the person answer). */
  youtubeMadeForKids: boolean | null;
  linkedinVisibility: "PUBLIC" | "CONNECTIONS";
}
export const EMPTY_OPTIONS: OptionsState = { instagramShareToFeed: true, instagramLocationId: "", youtubePrivacy: "private", youtubeCategoryId: "", youtubeMadeForKids: null, linkedinVisibility: "PUBLIC" };

export type ScheduleMode = "now" | "schedule" | "draft";
export interface ScheduleState {
  mode: ScheduleMode;
  /** Wall-clock time in `timezone`, `YYYY-MM-DDTHH:mm`. */
  local: string;
  timezone: string;
  approve: boolean;
}

export interface WizardState {
  step: StepKey;
  postId: string | null;
  // 1
  objective: string;
  campaignId: string;
  platforms: PostPlatform[];
  accountIds: Partial<Record<PostPlatform, string>>;
  contentTypes: Partial<Record<PostPlatform, ContentTypeKey>>;
  // 2
  title: string;
  topic: string;
  serviceProduct: string;
  audience: string;
  tone: string;
  language: string;
  keyMessage: string;
  cta: string;
  offerText: string;
  offerId: string;
  clientId: string;
  notes: string;
  // 3
  variants: Partial<Record<PostPlatform, VariantDraft>>;
  link: string;
  utm: UtmState;
  // 4
  mediaIds: string[];
  thumbnailId: string | null;
  // 5
  options: OptionsState;
  // 6
  schedule: ScheduleState;
  // 7
  confirmed: boolean;
  /** Where the media came from (a studio hand-off); informs the AI disclosure note. */
  handoff: HandoffSource | null;
}

/** The part of the wizard state the post document keeps next to its normal fields. */
export interface PostWizardMeta {
  step: StepKey;
  contentTypes: Partial<Record<PostPlatform, ContentTypeKey>>;
  keyMessage: string;
  cta: string;
  offerText: string;
  utm: UtmState;
  baseLink: string;
  handoff: HandoffSource | null;
}

export const emptyWizard = (timezone: string): WizardState => ({
  step: "goal", postId: null, objective: "", campaignId: "", platforms: [], accountIds: {}, contentTypes: {},
  title: "", topic: "", serviceProduct: "", audience: "", tone: "", language: "English", keyMessage: "", cta: "", offerText: "", offerId: "", clientId: "", notes: "",
  variants: {}, link: "", utm: EMPTY_UTM, mediaIds: [], thumbnailId: null, options: EMPTY_OPTIONS,
  schedule: { mode: "schedule", local: "", timezone, approve: true }, confirmed: false, handoff: null,
});

export type WizardAction =
  | { type: "set"; patch: Partial<WizardState> }
  | { type: "togglePlatform"; platform: PostPlatform; accounts: WizardAccount[] }
  | { type: "variant"; platform: PostPlatform; patch: Partial<VariantDraft> }
  | { type: "option"; patch: Partial<OptionsState> }
  | { type: "utm"; patch: Partial<UtmState> }
  | { type: "schedule"; patch: Partial<ScheduleState> }
  | { type: "moveMedia"; from: number; to: number }
  | { type: "step"; step: StepKey };

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/** Any change after the last "I have checked it" invalidates the final confirmation. */
export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case "step":
      return { ...s, step: a.step };
    case "set": {
      const content = Object.keys(a.patch).some((k) => k !== "postId" && k !== "handoff" && k !== "step" && k !== "confirmed");
      return { ...s, ...a.patch, confirmed: a.patch.confirmed ?? (content ? false : s.confirmed) };
    }
    case "togglePlatform": {
      const on = s.platforms.includes(a.platform);
      if (on) {
        const accountIds = { ...s.accountIds };
        const contentTypes = { ...s.contentTypes };
        delete accountIds[a.platform];
        delete contentTypes[a.platform];
        return { ...s, platforms: s.platforms.filter((p) => p !== a.platform), accountIds, contentTypes, confirmed: false };
      }
      const acct = pickAccount(a.platform, a.accounts);
      return {
        ...s,
        platforms: POST_PLATFORMS.filter((p) => p === a.platform || s.platforms.includes(p)),
        accountIds: acct ? { ...s.accountIds, [a.platform]: acct.id } : s.accountIds,
        contentTypes: { ...s.contentTypes, [a.platform]: defaultContentType(a.platform) },
        confirmed: false,
      };
    }
    case "variant":
      return { ...s, variants: { ...s.variants, [a.platform]: { ...EMPTY_VARIANT_DRAFT, ...(s.variants[a.platform] ?? {}), ...a.patch } }, confirmed: false };
    case "option":
      return { ...s, options: { ...s.options, ...a.patch }, confirmed: false };
    case "utm":
      return { ...s, utm: { ...s.utm, ...a.patch }, confirmed: false };
    case "schedule":
      return { ...s, schedule: { ...s.schedule, ...a.patch }, confirmed: false };
    case "moveMedia":
      return { ...s, mediaIds: moveItem(s.mediaIds, a.from, a.to), confirmed: false };
  }
}

// ── Character counting ───────────────────────────────────────────────────────

/** X counts every link as 23 characters, whatever its length. */
export const X_LINK_WEIGHT = 23;
const URL_RE = /https?:\/\/[^\s]+/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** twitter-text weighting: Latin-ish ranges weigh 1, everything else (CJK, emoji, Indic scripts...) weighs 2. */
function weightOf(cp: number): number {
  if ((cp >= 0 && cp <= 4351) || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247)) return 1;
  return 2;
}

/** Weighted length of a piece of text the way X counts it (emoji sequences and links count as units). */
export function xWeightedLength(text: string): number {
  let total = 0;
  const stripped = text.replace(URL_RE, () => {
    total += X_LINK_WEIGHT;
    return "";
  });
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const units = seg ? Array.from(seg.segment(stripped), (g) => g.segment) : Array.from(stripped);
  for (const u of units) {
    if (EMOJI_RE.test(u)) total += 2;
    else for (const ch of u) total += weightOf(ch.codePointAt(0) ?? 0);
  }
  return total;
}

/**
 * The length a platform is checked against. X: weighted (links 23, emoji and non-Latin scripts 2). Every other platform:
 * UTF-16 length, which is what the publishers' own validators use (so an emoji counts 2 here exactly as it does when the
 * post is checked before sending).
 */
export function countChars(platform: PostPlatform, text: string): number {
  return platform === "x" ? xWeightedLength(text) : text.length;
}

export function hashtagGuidance(platform: PostPlatform, count: number): { tone: "ok" | "warn"; text: string } {
  const g = PLATFORM_META[platform].hashtagAdvice;
  const limits: Partial<Record<PostPlatform, number>> = { instagram: 30, youtube: 15 };
  const lim = limits[platform];
  if (lim && count > lim) return { tone: "warn", text: `${count} hashtags; ${PLATFORM_META[platform].label} allows ${lim}. Advice: ${g}.` };
  if (platform === "youtube" && count > 3) return { tone: "warn", text: `Only the first 3 hashtags show above the title on YouTube. Advice: ${g}.` };
  if (platform === "x" && count > 2) return { tone: "warn", text: `Many hashtags look spammy on X. Advice: ${g}.` };
  return { tone: "ok", text: `Advice: ${g}.` };
}

export function normalizeHashtag(t: string): string {
  const w = t.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
  return w ? `#${w}` : "";
}
export function normalizeHashtags(list: string[]): string[] {
  return [...new Set(list.map(normalizeHashtag).filter(Boolean))];
}

// ── Thread splitting (the same algorithm the X publisher uses, so the preview is what is sent) ───

export const X_TEXT_LIMIT = 280;
export function splitThread(text: string, limit = X_TEXT_LIMIT): string[] {
  const clean = text.trim();
  if (clean.length <= limit) return [clean];
  const room = limit - 6; // " 12/12"
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > room) {
    const window = rest.slice(0, room);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
    const at = cut > room * 0.5 ? cut + 1 : Math.max(window.lastIndexOf(" "), room * 0.5);
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts.map((p, i) => `${p} ${i + 1}/${parts.length}`);
}

// ── UTM builder ──────────────────────────────────────────────────────────────

const utmValue = (v: string) => v.trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_\-.+]/gu, "").slice(0, 100);
export const slugify = (v: string) => v.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60);

export function defaultUtm(platforms: PostPlatform[], title: string, campaignName: string): UtmState {
  return { enabled: true, source: platforms.length === 1 ? platforms[0] : "social", medium: "social", campaign: slugify(campaignName || title), content: "", term: "" };
}

export type UtmResult = { ok: true; url: string; added: string[] } | { ok: false; error: string };

/** Adds utm_* parameters to a link (keeps its existing query, replaces existing utm_* values). */
export function buildUtmUrl(base: string, utm: UtmState): UtmResult {
  const raw = base.trim();
  if (!raw) return { ok: false, error: "Add a link first." };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "That isn't a full link. Start it with https://" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "The link must start with http:// or https://" };
  if (!utm.enabled) return { ok: true, url: u.toString(), added: [] };
  const added: string[] = [];
  for (const [k, v] of [["utm_source", utm.source], ["utm_medium", utm.medium], ["utm_campaign", utm.campaign], ["utm_content", utm.content], ["utm_term", utm.term]] as const) {
    const val = utmValue(v);
    u.searchParams.delete(k);
    if (val) {
      u.searchParams.set(k, val);
      added.push(k);
    }
  }
  if (!utmValue(utm.source) || !utmValue(utm.medium) || !utmValue(utm.campaign)) return { ok: false, error: "utm_source, utm_medium and utm_campaign are all needed." };
  return { ok: true, url: u.toString(), added };
}

/** Removes utm_* from a stored link so the wizard can show the base link again. */
export function stripUtm(link: string): string {
  try {
    const u = new URL(link);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return link;
  }
}

export function readUtm(link: string): UtmState | null {
  try {
    const u = new URL(link);
    const g = (k: string) => u.searchParams.get(k) ?? "";
    if (!g("utm_source") && !g("utm_campaign")) return null;
    return { enabled: true, source: g("utm_source"), medium: g("utm_medium"), campaign: g("utm_campaign"), content: g("utm_content"), term: g("utm_term") };
  } catch {
    return null;
  }
}

/** The link as saved on the post: base + UTM when enabled and valid, otherwise the base link as typed. */
export function finalLink(base: string, utm: UtmState): string {
  if (!base.trim()) return "";
  const r = buildUtmUrl(base, utm);
  return r.ok ? r.url : base.trim();
}

// ── Schedule helpers ─────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DDTHH:mm` of a UTC instant on the wall clock of `tz`. */
export function localInZone(utc: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(utc);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export interface ScheduleCheckResult {
  ok: boolean;
  /** Blocking message. */
  error?: string;
  /** Daylight-saving notes, never blocking. */
  notes: string[];
  utc: Date | null;
}

/** Validates a wall-clock schedule the way `schedulePost` will, so the person sees the same message before pressing the button. */
export function checkScheduleInput(local: string, tz: string, now: Date): ScheduleCheckResult {
  if (!local) return { ok: false, error: "Pick a date and time.", notes: [], utc: null };
  if (!isValidTimezone(tz)) return { ok: false, error: "That time zone isn't recognised.", notes: [], utc: null };
  let utc: Date;
  try {
    utc = zonedToUtc(local, tz);
  } catch (e) {
    return { ok: false, error: e instanceof LocalTimeError ? e.message : "That isn't a valid date and time.", notes: [], utc: null };
  }
  const chk = checkSchedule(utc, now);
  if (!chk.ok) return { ok: false, error: `${chk.message} ${chk.fix}`, notes: [], utc };
  const notes: string[] = [];
  for (const mins of [30, 60, 90, 120]) {
    if (localInZone(new Date(utc.getTime() + mins * 60_000), tz) === local) {
      notes.push(`${local.replace("T", " ")} happens twice in ${tz} when the clocks go back. The first one is used.`);
      break;
    }
  }
  return { ok: true, notes, utc };
}

/** A value from the best-time helper (it speaks India time) converted to the wall clock of another zone. */
export function istToZone(istLocal: string, tz: string): string {
  if (tz === "Asia/Kolkata") return istLocal;
  try {
    return localInZone(zonedToUtc(istLocal, "Asia/Kolkata"), tz);
  } catch {
    return istLocal;
  }
}

export function defaultScheduleLocal(now: Date, tz: string): string {
  const tomorrow = new Date(now.getTime() + 24 * 3600_000);
  return localInZone(tomorrow, tz).slice(0, 14) + "00";
}

// ── Publish tracker ──────────────────────────────────────────────────────────

export type TrackerPhase = "queued" | "uploading" | "processing" | "published" | "failed" | "ambiguous" | "cancelled" | "idle";
export interface TrackerAttempt {
  state: "queued" | "uploading" | "processing" | "published" | "failed" | "cancelled";
  errorClass: string | null;
  nextAttemptAt: string | null;
}

export function trackerPhase(a: TrackerAttempt | null): TrackerPhase {
  if (!a) return "idle";
  if (a.state === "failed" && a.errorClass === "ambiguous") return "ambiguous";
  return a.state;
}
export const PHASE_LABEL: Record<TrackerPhase, string> = {
  idle: "Not sent yet", queued: "Waiting to start", uploading: "Uploading", processing: "The platform is processing it", published: "Published", failed: "Failed", ambiguous: "May already be published", cancelled: "Cancelled",
};
export const isTerminalPhase = (p: TrackerPhase) => p === "published" || p === "failed" || p === "ambiguous" || p === "cancelled" || p === "idle";

/** Polling stops once every platform is final; before that it slows down with time so an open tab does not hammer the server. */
export function shouldPoll(attempts: (TrackerAttempt | null)[]): boolean {
  return attempts.some((a) => !isTerminalPhase(trackerPhase(a)));
}
export function pollDelayMs(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 2_000;
  if (elapsedMs < 120_000) return 5_000;
  return 15_000;
}
export const POLL_GIVE_UP_MS = 30 * 60_000;

/** What the person can do for a phase. */
export function trackerActions(phase: TrackerPhase): { retry: boolean; confirmRetry: boolean; cancel: boolean } {
  return { retry: phase === "failed" || phase === "cancelled", confirmRetry: phase === "ambiguous", cancel: phase === "queued" };
}

// ── Hand-off from the studios ────────────────────────────────────────────────

export type HandoffSource = "image_studio" | "ugc_studio" | "library";
export interface Handoff {
  mediaIds: string[];
  source: HandoffSource | null;
  platform: PostPlatform | null;
}

/** Reads `?media=ID,ID&source=image_studio|ugc_studio&platform=instagram` (the receiving side of "Create post from this image / video"). */
export function parseHandoff(sp: Record<string, string | string[] | undefined>): Handoff {
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined)) ?? "";
  const ids = [...new Set([...one("media").split(","), ...(Array.isArray(sp.mediaId) ? sp.mediaId : [one("mediaId")])].map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{6,64}$/.test(s)))].slice(0, 20);
  const src = one("source").replace("-", "_");
  const source: HandoffSource | null = src === "image_studio" || src === "ugc_studio" || src === "library" ? src : src === "ugc" ? "ugc_studio" : src === "image" ? "image_studio" : ids.length ? "library" : null;
  const platform = (POST_PLATFORMS as readonly string[]).includes(one("platform")) ? (one("platform") as PostPlatform) : null;
  return { mediaIds: ids, source, platform };
}

export function handoffHref(mediaId: string, source: HandoffSource): string {
  return `/viralpulse-ai/posts/new?media=${encodeURIComponent(mediaId)}&source=${source}`;
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface ValidationCtx {
  accounts: WizardAccount[];
  /** Per media id: what it is. Needed for step 4. */
  media: Record<string, { kind: "image" | "video" }>;
  captionLimits: Partial<Record<PostPlatform, number>>;
  now: Date;
}
export interface StepValidation {
  errors: Record<string, string>;
  warnings: string[];
}

export function composeVariantPreview(state: WizardState, platform: PostPlatform): string {
  const v = state.variants[platform];
  return (v?.content ?? "").trim();
}

export function validateStep(state: WizardState, step: StepKey, ctx: ValidationCtx): StepValidation {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];
  const label = (p: PostPlatform) => PLATFORM_META[p].label;
  switch (step) {
    case "goal": {
      if (!state.objective) errors.objective = "Choose what this post is for.";
      if (state.platforms.length === 0) errors.platforms = "Choose at least one platform.";
      for (const p of state.platforms) {
        const list = ctx.accounts.filter((a) => a.platform === p);
        const chosen = list.find((a) => a.id === state.accountIds[p]);
        if (list.length === 0) errors[`account.${p}`] = `No ${label(p)} account is connected.`;
        else if (!chosen) errors[`account.${p}`] = `Choose the ${label(p)} account to post with.`;
        else {
          const use = accountUse(chosen);
          if (!use.usable) errors[`account.${p}`] = `${chosen.name}: ${use.label}. ${use.fix ?? ""}`.trim();
          else if (use.tone === "warn") warnings.push(`${chosen.name}: ${use.label}. ${use.fix}`);
        }
        if (!contentTypeDef(p, state.contentTypes[p])) errors[`type.${p}`] = `Choose what kind of ${label(p)} post this is.`;
      }
      break;
    }
    case "brief": {
      if (!state.topic.trim()) errors.topic = "Describe what the post is about.";
      else if (state.topic.length > 500) errors.topic = "The topic is limited to 500 characters.";
      if (!state.language.trim()) errors.language = "Choose the language of the post.";
      if (state.title.length > 120) errors.title = "The internal title is limited to 120 characters.";
      break;
    }
    case "content": {
      for (const p of state.platforms) {
        const v = state.variants[p] ?? EMPTY_VARIANT_DRAFT;
        const def = contentTypeDef(p, state.contentTypes[p]);
        const limit = ctx.captionLimits[p] ?? PLATFORM_META[p].captionLimit;
        const n = countChars(p, v.content);
        const thread = p === "x" && state.contentTypes.x === "thread";
        if (!v.content.trim() && def?.media === "none") errors[`content.${p}`] = `Write the ${label(p)} text.`;
        else if (!v.content.trim()) warnings.push(`${label(p)} has no caption. That is allowed, but a caption usually helps.`);
        if (n > limit && !thread) errors[`content.${p}`] = `${label(p)} allows ${limit} characters; this is ${n}.`;
        if (p === "youtube") {
          if (!v.title.trim()) errors["title.youtube"] = "Write the YouTube title.";
          else if (v.title.length > 100) errors["title.youtube"] = `The YouTube title is limited to 100 characters; this is ${v.title.length}.`;
        }
        if (p === "linkedin" && state.contentTypes.linkedin === "article" && !state.link.trim()) errors["link.linkedin"] = "A link post needs a link.";
        const g = hashtagGuidance(p, v.hashtags.length);
        if (g.tone === "warn") warnings.push(`${label(p)}: ${g.text}`);
      }
      if (state.link.trim()) {
        const r = buildUtmUrl(state.link, state.utm);
        if (!r.ok) errors.link = r.error;
      }
      break;
    }
    case "media": {
      const items = state.mediaIds.map((id) => ctx.media[id]).filter(Boolean);
      const images = items.filter((m) => m.kind === "image").length;
      const videos = items.filter((m) => m.kind === "video").length;
      for (const p of state.platforms) {
        const def = contentTypeDef(p, state.contentTypes[p]);
        if (!def) continue;
        const k = `media.${p}`;
        switch (def.media) {
          case "none": if (items.length > 0) warnings.push(`${label(p)} ${def.label.toLowerCase()} has no media; the attached files are ignored for it.`); break;
          case "image": if (images < 1) errors[k] = `${label(p)} ${def.label.toLowerCase()} needs a picture.`; else if (images > 1 || videos) warnings.push(`${label(p)} ${def.label.toLowerCase()} uses one picture; the first is sent.`); break;
          case "images": if (images < def.min) errors[k] = `${label(p)} ${def.label.toLowerCase()} needs at least ${def.min} picture${def.min === 1 ? "" : "s"}.`; else if (images > def.max) errors[k] = `${label(p)} takes at most ${def.max} pictures; you have ${images}.`; if (videos) errors[k] = `${label(p)} can't mix a video with pictures.`; break;
          case "video": if (videos < 1) errors[k] = `${label(p)} ${def.label.toLowerCase()} needs a video.`; else if (videos > 1) errors[k] = `${label(p)} takes one video.`; break;
          case "image_or_video": if (images + videos < 1) errors[k] = `${label(p)} ${def.label.toLowerCase()} needs a picture or a video.`; else if (images + videos > 1) errors[k] = `${label(p)} ${def.label.toLowerCase()} takes one picture or one video.`; break;
        }
      }
      break;
    }
    case "options": {
      if (state.platforms.includes("youtube") && state.options.youtubeMadeForKids === null) errors.madeForKids = "YouTube requires you to say whether the video is made for kids.";
      if (state.platforms.includes("youtube") && state.options.youtubePrivacy === "public") warnings.push("The YouTube video will be public as soon as it is processed.");
      break;
    }
    case "schedule": {
      if (state.schedule.mode === "schedule") {
        const r = checkScheduleInput(state.schedule.local, state.schedule.timezone, ctx.now);
        if (!r.ok) errors.when = r.error ?? "Pick a date and time.";
        warnings.push(...r.notes);
      }
      break;
    }
    case "review": {
      if (!state.confirmed) errors.confirmed = "Tick the box to confirm you have checked the post.";
      break;
    }
  }
  return { errors, warnings };
}

/** The first step (in order) that still has blocking errors, or null when the whole post is complete. */
export function firstIncompleteStep(state: WizardState, ctx: ValidationCtx, upTo: StepKey = "schedule"): StepKey | null {
  for (const k of STEP_KEYS) {
    if (k === "review" || stepIndex(k) > stepIndex(upTo)) break;
    if (Object.keys(validateStep(state, k, ctx).errors).length) return k;
  }
  return null;
}

/** Where to reopen a saved post: the last step reached, but never past the first step that is still incomplete. */
export function resumeStep(state: WizardState, ctx: ValidationCtx): StepKey {
  const bad = firstIncompleteStep(state, ctx, state.step === "review" ? "schedule" : state.step);
  return bad ?? state.step;
}

// ── Publish options (what the publishers receive) ────────────────────────────

export function buildPublishOptions(s: WizardState, existing: PublishOptions | undefined): PublishOptions {
  const out: PublishOptions = { ...(existing ?? {}) };
  out.accountIds = {};
  for (const p of s.platforms) if (s.accountIds[p]) out.accountIds[p] = s.accountIds[p];
  const set = (patch: Partial<PublishOptions>) => {
    for (const [k, v] of Object.entries(patch) as [keyof PublishOptions, unknown][]) (out as Record<string, unknown>)[k] = { ...((out as Record<string, unknown>)[k] as object | undefined), ...(v as object) };
  };
  for (const p of s.platforms) {
    const def = contentTypeDef(p, s.contentTypes[p]);
    if (def) set(def.options);
  }
  if (s.platforms.includes("instagram")) {
    const f = out.instagram?.format;
    out.instagram = { ...out.instagram, ...(f === "reel" ? { shareToFeed: s.options.instagramShareToFeed } : {}), ...(s.options.instagramLocationId.trim() ? { locationId: s.options.instagramLocationId.trim() } : { locationId: undefined }) };
  }
  if (s.platforms.includes("youtube")) {
    out.youtube = { ...out.youtube, privacy: s.options.youtubePrivacy, categoryId: s.options.youtubeCategoryId || undefined, madeForKids: s.options.youtubeMadeForKids ?? undefined };
  }
  if (s.platforms.includes("linkedin")) out.linkedin = { ...out.linkedin, visibility: s.options.linkedinVisibility };
  return out;
}

/** Brief-level `contentType` of the post: a video if any platform type or attached file is a video. */
export function postContentType(s: Pick<WizardState, "platforms" | "contentTypes">, mediaKinds: ("image" | "video")[]): "image" | "video" {
  if (mediaKinds.includes("video")) return "video";
  return s.platforms.some((p) => needsVideo(contentTypeDef(p, s.contentTypes[p])?.media ?? "none")) ? "video" : "image";
}

/** Alt text is read by Instagram, LinkedIn and X from the media item; the other platforms ignore it. */
export const ALT_TEXT_PLATFORMS: PostPlatform[] = ["instagram", "linkedin", "x"];

/** The AI-disclosure line the post will carry, shown in the wizard before sending (the publisher adds it; this only previews). */
export function disclosureSummary(aiMedia: { video: boolean; any: boolean }, platforms: PostPlatform[], suffixOff: boolean, nativeLabel: Partial<Record<PostPlatform, boolean>>): { applies: boolean; lines: string[] } {
  if (!aiMedia.any) return { applies: false, lines: ["No AI-generated media is attached, so no AI disclosure is added."] };
  const lines: string[] = [];
  for (const p of platforms) {
    const native = nativeLabel[p];
    const suffixSkipped = suffixOff && !aiMedia.video && !native;
    lines.push(`${PLATFORM_META[p].label}: ${native ? "the platform's own AI label is switched on" : "no platform AI label is available"}${suffixSkipped ? "; the caption note is off (company setting)." : "; a note is added to the caption."}`);
  }
  return { applies: true, lines };
}

/** Which of the chosen platforms will get their own AI label (Facebook has one for Reels only). */
export function nativeLabelMap(platforms: PostPlatform[], contentTypes: WizardState["contentTypes"], caps: Partial<Record<PostPlatform, { nativeAiLabel: boolean }>>): Partial<Record<PostPlatform, boolean>> {
  return Object.fromEntries(platforms.map((p) => [p, Boolean(caps[p]?.nativeAiLabel) && (p !== "facebook" || contentTypes.facebook === "reel")]));
}

export const YOUTUBE_CATEGORIES: { id: string; label: string }[] = [
  { id: "1", label: "Film & Animation" }, { id: "2", label: "Autos & Vehicles" }, { id: "10", label: "Music" }, { id: "15", label: "Pets & Animals" },
  { id: "17", label: "Sports" }, { id: "19", label: "Travel & Events" }, { id: "20", label: "Gaming" }, { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" }, { id: "24", label: "Entertainment" }, { id: "25", label: "News & Politics" }, { id: "26", label: "Howto & Style" },
  { id: "27", label: "Education" }, { id: "28", label: "Science & Technology" }, { id: "29", label: "Nonprofits & Activism" },
];

export const pad2 = pad;

// ── Reading and writing the state ────────────────────────────────────────────

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const strList = (v: unknown, n: number, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, max)).filter(Boolean).slice(0, n) : []);
const isRec = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Coerces whatever the browser sent into a well-formed state (bounded strings, known platforms and steps). Never trusts shape. */
export function sanitizeWizardState(raw: unknown, timezone: string): WizardState {
  const r = isRec(raw) ? raw : {};
  const base = emptyWizard(timezone);
  const platforms = POST_PLATFORMS.filter((p) => Array.isArray(r.platforms) && (r.platforms as unknown[]).includes(p));
  const accountIds: WizardState["accountIds"] = {};
  const contentTypes: WizardState["contentTypes"] = {};
  const ra = isRec(r.accountIds) ? r.accountIds : {};
  const rc = isRec(r.contentTypes) ? r.contentTypes : {};
  for (const p of platforms) {
    const a = str(ra[p], 64);
    if (a) accountIds[p] = a;
    const def = contentTypeDef(p, str(rc[p], 20));
    contentTypes[p] = def ? def.key : defaultContentType(p);
  }
  const variants: WizardState["variants"] = {};
  const rv = isRec(r.variants) ? r.variants : {};
  for (const p of platforms) {
    const v = isRec(rv[p]) ? (rv[p] as Record<string, unknown>) : {};
    variants[p] = { title: str(v.title, 300), content: str(v.content, 10000), hashtags: normalizeHashtags(strList(v.hashtags, 40, 80)), keywords: strList(v.keywords, 60, 120), cta: str(v.cta, 120) };
  }
  const u = isRec(r.utm) ? r.utm : {};
  const o = isRec(r.options) ? r.options : {};
  const sc = isRec(r.schedule) ? r.schedule : {};
  const tz = str(sc.timezone, 64);
  const src = str(r.handoff, 20);
  return {
    ...base,
    step: isStepKey(r.step) ? r.step : "goal",
    postId: str(r.postId, 64) || null,
    objective: OBJECTIVES.some((x) => x.key === r.objective) ? (r.objective as string) : "",
    campaignId: str(r.campaignId, 64),
    platforms, accountIds, contentTypes,
    title: str(r.title, 120), topic: str(r.topic, 500), serviceProduct: str(r.serviceProduct, 300), audience: str(r.audience, 1000), tone: str(r.tone, 120), language: str(r.language, 60) || "English",
    keyMessage: str(r.keyMessage, 500), cta: str(r.cta, 120), offerText: str(r.offerText, 600), offerId: str(r.offerId, 64), clientId: str(r.clientId, 64), notes: str(r.notes, 3000),
    variants, link: str(r.link, 500),
    utm: { enabled: u.enabled === true, source: str(u.source, 100), medium: str(u.medium, 100), campaign: str(u.campaign, 100), content: str(u.content, 100), term: str(u.term, 100) },
    mediaIds: strList(r.mediaIds, 20, 64),
    thumbnailId: str(r.thumbnailId, 64) || null,
    options: {
      instagramShareToFeed: o.instagramShareToFeed !== false,
      instagramLocationId: str(o.instagramLocationId, 64),
      youtubePrivacy: o.youtubePrivacy === "public" || o.youtubePrivacy === "unlisted" ? o.youtubePrivacy : "private",
      youtubeCategoryId: YOUTUBE_CATEGORIES.some((c) => c.id === o.youtubeCategoryId) ? (o.youtubeCategoryId as string) : "",
      youtubeMadeForKids: typeof o.youtubeMadeForKids === "boolean" ? o.youtubeMadeForKids : null,
      linkedinVisibility: o.linkedinVisibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC",
    },
    schedule: { mode: sc.mode === "now" || sc.mode === "draft" ? sc.mode : "schedule", local: str(sc.local, 16), timezone: tz && isValidTimezone(tz) ? tz : timezone, approve: sc.approve !== false },
    confirmed: false,
    handoff: src === "image_studio" || src === "ugc_studio" || src === "library" ? src : null,
  };
}

const LEGACY_OBJECTIVE: Record<string, ObjectiveKey> = { promotion: "sales", "lead generation": "leads", recruitment: "hiring", event: "announcement", education: "awareness", community: "engagement", "thought leadership": "awareness" };

/** Minimal shape of a stored post (dates as ISO strings) - what the page gives the wizard. */
export interface PostLike {
  id: string;
  title: string;
  topic: string;
  serviceProduct: string;
  audience: string;
  tone: string;
  language: string;
  objective: string;
  contentType: "image" | "video";
  platforms: PostPlatform[];
  link: string | null;
  campaignId: string | null;
  offerId: string | null;
  clientId: string | null;
  notes: string;
  idea: string;
  variants: { platform: PostPlatform; title: string; content: string; caption: string; cta: string; hashtags: string[]; keywords: string[] }[];
  mediaIds: string[];
  thumbnailId: string | null;
  scheduledAtIso: string | null;
  plannedAtIso: string | null;
  scheduledTz: string | null;
  publishOptions: PublishOptions | undefined;
  wizard: PostWizardMeta | undefined;
}

/** Content types of a post made before the wizard existed, inferred from how it would be published today. */
export function inferContentTypes(p: Pick<PostLike, "platforms" | "contentType" | "mediaIds" | "link" | "publishOptions">): Partial<Record<PostPlatform, ContentTypeKey>> {
  const out: Partial<Record<PostPlatform, ContentTypeKey>> = {};
  const n = p.mediaIds.length;
  const video = p.contentType === "video";
  for (const pl of p.platforms) {
    const o = p.publishOptions ?? {};
    let k: ContentTypeKey;
    switch (pl) {
      case "instagram": k = o.instagram?.format === "story" ? "story" : o.instagram?.format === "reel" || video ? "reel" : n > 1 ? "carousel" : "image"; break;
      case "facebook": k = o.facebook?.format === "reel" ? "reel" : video ? "video" : n > 1 ? "carousel" : n === 1 ? "image" : "text"; break;
      case "youtube": k = o.youtube?.short ? "short" : "video"; break;
      case "linkedin": k = video ? "video" : n > 1 ? "carousel" : n === 1 ? "image" : p.link ? "article" : "text"; break;
      case "x": k = o.x?.thread ? "thread" : video ? "video" : n > 0 ? "image" : "text"; break;
      default: k = n > 0 ? "image" : "text";
    }
    out[pl] = k;
  }
  return out;
}

export function stateFromPost(p: PostLike, timezone: string): WizardState {
  const base = emptyWizard(timezone);
  const w = p.wizard;
  const link = p.link ?? "";
  const utm = readUtm(link) ?? w?.utm ?? EMPTY_UTM;
  const contentTypes = { ...inferContentTypes(p), ...(w?.contentTypes ?? {}) };
  for (const pl of p.platforms) if (!contentTypeDef(pl, contentTypes[pl])) contentTypes[pl] = defaultContentType(pl);
  const o = p.publishOptions ?? {};
  const variants: WizardState["variants"] = {};
  for (const v of p.variants) variants[v.platform] = { title: v.title, content: v.content || v.caption, hashtags: v.hashtags, keywords: v.keywords, cta: v.cta };
  const sched = p.scheduledAtIso ?? p.plannedAtIso;
  const tz = p.scheduledTz && isValidTimezone(p.scheduledTz) ? p.scheduledTz : timezone;
  const hasContent = p.variants.some((v) => (v.content || v.caption).trim());
  const obj = objectiveKeyFor(p.objective) || LEGACY_OBJECTIVE[p.objective.trim().toLowerCase()] || "";
  return {
    ...base,
    step: w?.step ?? (hasContent ? "content" : p.topic ? "brief" : "goal"),
    postId: p.id,
    objective: obj,
    campaignId: p.campaignId ?? "",
    platforms: [...p.platforms],
    accountIds: { ...(o.accountIds ?? {}) },
    contentTypes,
    title: p.title, topic: p.topic, serviceProduct: p.serviceProduct, audience: p.audience, tone: p.tone, language: p.language,
    keyMessage: w?.keyMessage ?? "", cta: w?.cta ?? p.variants.find((v) => v.cta)?.cta ?? "", offerText: w?.offerText ?? "", offerId: p.offerId ?? "", clientId: p.clientId ?? "", notes: p.notes,
    variants,
    link: w?.baseLink ?? stripUtm(link),
    utm: { ...utm, enabled: utm.enabled && Boolean(readUtm(link)) ? true : w?.utm.enabled ?? false },
    mediaIds: [...p.mediaIds],
    thumbnailId: p.thumbnailId,
    options: {
      instagramShareToFeed: o.instagram?.shareToFeed !== false,
      instagramLocationId: o.instagram?.locationId ?? "",
      youtubePrivacy: o.youtube?.privacy ?? "private",
      youtubeCategoryId: o.youtube?.categoryId ?? "",
      youtubeMadeForKids: typeof o.youtube?.madeForKids === "boolean" ? o.youtube.madeForKids : null,
      linkedinVisibility: o.linkedin?.visibility ?? "PUBLIC",
    },
    schedule: { mode: "schedule", local: sched ? localInZone(new Date(sched), tz) : "", timezone: tz, approve: true },
    confirmed: false,
    handoff: w?.handoff ?? null,
  };
}

export function metaFromState(s: WizardState): PostWizardMeta {
  return { step: s.step, contentTypes: s.contentTypes, keyMessage: s.keyMessage, cta: s.cta, offerText: s.offerText, utm: s.utm, baseLink: s.link, handoff: s.handoff };
}

/** One instruction that carries the wizard-only inputs (key message, CTA, offer) into the "generate the whole draft" call. */
export function draftInstruction(s: WizardState): string {
  const parts = [
    s.keyMessage.trim() && `Key message: ${s.keyMessage.trim()}`,
    s.cta.trim() && `Call to action: ${s.cta.trim()}`,
    s.offerText.trim() && `Offer (state it exactly as written, add no figures): ${s.offerText.trim()}`,
    s.platforms.length && `Formats: ${s.platforms.map((p) => `${PLATFORM_META[p].label} ${contentTypeDef(p, s.contentTypes[p])?.label ?? ""}`.trim()).join("; ")}`,
  ].filter(Boolean);
  return parts.join(". ").slice(0, 1000);
}
