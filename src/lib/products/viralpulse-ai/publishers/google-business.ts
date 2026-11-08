import { call } from "./http";
import { baseValidate, issue } from "./validate";
import type { Capabilities, PlatformPublisher, PublishCtx, PublishIssue, PublishResult } from "./types";

/**
 * Google Business Profile local posts (mybusiness.googleapis.com/v4/{location}/localPosts). Access to the Business Profile APIs needs
 * Google's approval, so this adapter is behind `behindFlag` (the engine refuses to run until the company confirms access in Settings).
 * Photo media only (sourceUrl); the docs list no video support. Spec: SPEC.md.
 */

export const gbpCapabilities: Capabilities = {
  label: "Google Business Profile",
  formats: ["text", "image", "link"],
  maxImages: 1,
  maxVideos: 0,
  imageTypes: ["image/jpeg", "image/png"],
  videoTypes: [],
  maxImageBytes: 5 * 1024 * 1024,
  maxVideoBytes: null,
  videoDurationSec: null,
  aspect: null,
  captionLimit: 1500,
  hashtagLimit: null,
  nativeScheduling: false,
  dailyBudget: null,
  nativeAiLabel: false,
  needsAppApproval: "Google Business Profile API access request approved for your Cloud project",
  behindFlag: "approved Business Profile API access (turn on in Settings)",
  unverified: ["captionLimit", "maxImageBytes"],
};

const ACTIONS: Record<string, string> = { "book now": "BOOK", book: "BOOK", "shop now": "SHOP", order: "ORDER", "order now": "ORDER", "sign up": "SIGN_UP", register: "SIGN_UP", "call now": "CALL", "learn more": "LEARN_MORE" };

export const gbpAction = (cta: string): string => ACTIONS[cta.trim().toLowerCase()] ?? "LEARN_MORE";

function validate(post: Parameters<PlatformPublisher["validate"]>[0], media: Parameters<PlatformPublisher["validate"]>[1]): PublishIssue[] {
  const out = baseValidate({ ...gbpCapabilities, behindFlag: undefined }, post, media);
  if (!post.caption.trim()) out.push(issue("text_required", "error", "A Business Profile post needs text.", "Write the post text."));
  if (post.link && !/^https:\/\//i.test(post.link)) out.push(issue("link_not_https", "error", "The link must start with https://.", "Use the secure address."));
  return out;
}

async function publish(ctx: PublishCtx): Promise<PublishResult> {
  const action = gbpAction(ctx.post.variant.cta);
  const body = {
    languageCode: ctx.post.languageCode,
    topicType: "STANDARD",
    summary: ctx.post.caption,
    ...(ctx.post.link || action === "CALL" ? { callToAction: action === "CALL" ? { actionType: action } : { actionType: action, url: ctx.post.link } } : {}),
    ...(ctx.images[0] ? { media: [{ mediaFormat: "PHOTO", sourceUrl: await ctx.publicUrl(ctx.images[0].id) }] } : {}),
  };
  await ctx.markCommitPoint();
  const r = await call<{ name: string; searchUrl?: string }>(ctx, (t) => ({ url: `https://mybusiness.googleapis.com/v4/${ctx.creds.targetId}/localPosts`, init: { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify(body) } }), { label: "Google Business Profile", idempotent: false });
  return { externalId: r.body.name, url: r.body.searchUrl ?? null };
}

export const googleBusiness: PlatformPublisher = {
  platform: "google_business",
  capabilities: gbpCapabilities,
  validate,
  publish,
  async delete(ctx, externalId) {
    await call(ctx, (t) => ({ url: `https://mybusiness.googleapis.com/v4/${externalId}`, init: { method: "DELETE", headers: { Authorization: `Bearer ${t}` } } }), { label: "Google Business Profile", idempotent: true });
  },
};
