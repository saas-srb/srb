/**
 * Shared contract of the per-platform publishers. Pure types (no server-only import) so the validators and the UI can use them.
 * Spec sources and the date they were checked are in SPEC.md.
 */
import type { PostPlatform } from "@/lib/products/viralpulse-ai/constants";

/** Every platform a publisher exists for. X has a publisher but is not yet a `PostPlatform` (constants/integrations belong to WP1/WP2). */
export type PlatformKey = PostPlatform | "x";

export type Severity = "error" | "warning";

/** One problem found before publishing; `fix` is plain language the UI shows next to it. */
export interface PublishIssue {
  code: string;
  severity: Severity;
  message: string;
  fix: string;
  mediaId?: string;
}

export type ErrorClass = "auth" | "rate_limit" | "media" | "policy" | "transient" | "permanent" | "ambiguous";

/** Facts about one media item the validators use. All optional because older library items lack metadata. */
export interface MediaFacts {
  id: string;
  kind: "image" | "video";
  name: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  altText: string;
  /** Set for AI-generated items (UGC Studio) — drives the disclosure rules. */
  aiGenerated: boolean;
  aiDisclosureRequired: boolean;
}

/** The post as a publisher sees it. */
export interface PublishPost {
  id: string;
  title: string;
  link: string | null;
  /** ISO 639-1 code of the post language (Business Profile needs one). */
  languageCode: string;
  variant: { title: string; text: string; hashtags: string[]; keywords: string[]; cta: string };
  /** Final text including hashtags / AI suffix, already limited to the platform caption limit by `composeCaption`. */
  caption: string;
  /** Set the provider's own AI / altered-content flag (media is AI-generated and the platform has one). */
  aiNative: boolean;
  options: PublishOptions;
}

export interface PublishOptions {
  /** Account (smms_accounts id) to publish with per platform; default account when absent. */
  accountIds?: Partial<Record<PostPlatform, string>>;
  instagram?: { format?: "feed" | "reel" | "story"; shareToFeed?: boolean; locationId?: string; collaborators?: string[] };
  facebook?: { format?: "feed" | "reel" | "story" };
  youtube?: { privacy?: "private" | "unlisted" | "public"; categoryId?: string; madeForKids?: boolean; short?: boolean };
  linkedin?: { visibility?: "PUBLIC" | "CONNECTIONS" };
  x?: { thread?: boolean };
  /** Set at publish time from the COMPANY setting only (publish-settings); a value stored on a post is stripped and ignored. Only honoured when the platform has no label requirement. */
  aiDisclosureOff?: boolean;
  /** Ask the provider to hold the post until the schedule time where it supports that (otherwise our 5-minute job publishes it). */
  nativeSchedule?: boolean;
}

export interface Capabilities {
  label: string;
  formats: ("image" | "carousel" | "video" | "reel" | "story" | "text" | "link" | "short")[];
  maxImages: number;
  maxVideos: number;
  /** Allowed content types per kind. */
  imageTypes: string[];
  videoTypes: string[];
  maxImageBytes: number | null;
  maxVideoBytes: number | null;
  videoDurationSec: { min: number; max: number } | null;
  /** width/height range; null = no documented limit. */
  aspect: { min: number; max: number } | null;
  captionLimit: number;
  hashtagLimit: number | null;
  /** Native scheduling (provider holds the post) or ours (the 5-minute job). */
  nativeScheduling: boolean;
  /** API-published posts allowed per rolling 24 h per account, when the provider documents one. */
  dailyBudget: number | null;
  /** Provider exposes an AI / altered-content flag we set. */
  nativeAiLabel: boolean;
  /** Needs an approval by the platform before it works for third-party accounts. */
  needsAppApproval: string | null;
  /** Disabled until the company confirms it has access (feature flag, e.g. Business Profile). */
  behindFlag?: string;
  /** Specs we could not confirm in the official docs and therefore only warn about. */
  unverified: string[];
}

export interface Credentials {
  token: string;
  /** Page / IG user / channel / person URN / organisation URN / location. */
  targetId: string;
  /** Meta: separate Page id for IG; X: user id; LinkedIn: "person" | "organization". */
  extra?: Record<string, string>;
  accountId: string;
  /** Refresh once on 401; returns a new token or null when it cannot be refreshed. */
  refresh?: () => Promise<string | null>;
}

export interface PublishResult {
  externalId: string;
  url: string | null;
  /** Extra provider ids worth keeping (child posts of a thread, container id). */
  extraIds?: Record<string, string>;
  /** Non-fatal problems (a thumbnail that failed, alt text that was not applied). */
  warnings?: string[];
}

export type AttemptStepData = Record<string, unknown>;

/** Everything an adapter needs; all I/O goes through here so tests can substitute it. */
export interface PublishCtx {
  platform: PlatformKey;
  post: PublishPost;
  images: MediaFacts[];
  video: MediaFacts | null;
  thumbnail: MediaFacts | null;
  creds: Credentials;
  /** Persisted step data of this attempt; adapters read it to resume and `checkpoint` it after every irreversible step. */
  data: AttemptStepData;
  checkpoint(patch: AttemptStepData): Promise<void>;
  /** Set right before the one non-idempotent call; a later resume that finds it set must reconcile instead of re-sending. */
  markCommitPoint(): Promise<void>;
  committed: boolean;
  /** Provider-visible, short-lived URL of a media item (Meta, GBP fetch by URL). */
  publicUrl(mediaId: string, opts?: { jpeg?: boolean }): Promise<string>;
  /** Streams a media item's bytes without buffering the whole file. */
  openStream(mediaId: string): Promise<ReadableStream<Uint8Array>>;
  /** Small images only (<= 20 MB): bytes after conversion, e.g. JPEG for Instagram. */
  imageBytes(mediaId: string, opts?: { jpeg?: boolean; maxSide?: number }): Promise<{ bytes: Buffer; contentType: string }>;
  fetch: typeof fetch;
  signal?: AbortSignal;
  sleep(ms: number): Promise<void>;
  now(): Date;
  /** Native schedule time for platforms that support it (already validated to be in range). */
  scheduleAt: Date | null;
  log(event: string, fields?: Record<string, unknown>): void;
  /** Request ids seen from the provider, kept on the attempt for support. */
  noteRequestId(id: string | null): void;
}

export interface PlatformPublisher {
  platform: PlatformKey;
  capabilities: Capabilities;
  /** Pure: no network. Issues the UI shows before the user schedules. */
  validate(post: PublishPost, media: { images: MediaFacts[]; video: MediaFacts | null; thumbnail: MediaFacts | null }): PublishIssue[];
  publish(ctx: PublishCtx): Promise<PublishResult>;
  /** Optional: after a lost response at the commit point. Returns the post when it exists, null when it certainly does not (safe to send again), throws ProviderError(ambiguous) when it cannot tell. */
  reconcile?(ctx: PublishCtx): Promise<PublishResult | null>;
  /** Optional: asynchronous processing finished? */
  status?(ctx: PublishCtx, externalId: string): Promise<{ state: "processing" | "published" | "failed"; message?: string }>;
  delete?(ctx: PublishCtx, externalId: string): Promise<void>;
  /** Optional account quota pre-check (Instagram `content_publishing_limit`). Throws ProviderError(rate_limit) when exhausted. */
  precheck?(ctx: PublishCtx): Promise<void>;
}

/** Thrown by an adapter after it saved its progress when the provider is still processing; the engine schedules the next look. */
export class PendingProcessing extends Error {
  constructor(readonly afterMs: number, message = "The platform is still processing the media.") {
    super(message);
    this.name = "PendingProcessing";
  }
}

/** Drops any per-post `aiDisclosureOff`: the AI disclosure may be relaxed by the company setting alone. */
export function stripPostDisclosureOverride<T extends PublishOptions | undefined | null>(o: T): Omit<NonNullable<T>, "aiDisclosureOff"> {
  const { aiDisclosureOff: _ignored, ...rest } = (o ?? {}) as PublishOptions;
  void _ignored;
  return rest as Omit<NonNullable<T>, "aiDisclosureOff">;
}
