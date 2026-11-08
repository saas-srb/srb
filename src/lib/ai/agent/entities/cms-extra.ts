import "server-only";
import * as Offers from "@/app/(products)/sitecraft-ai/(protected)/offers/actions";
import * as OfferItems from "@/app/(products)/sitecraft-ai/(protected)/offers/[id]/offers/actions";
import * as OfferCoupons from "@/app/(products)/sitecraft-ai/(protected)/offers/coupons/actions";
import * as Wallet from "@/app/(products)/sitecraft-ai/(protected)/wallet/actions";
import * as WalletCampaigns from "@/app/(products)/sitecraft-ai/(protected)/wallet/campaigns/actions";
import * as Rules from "@/app/(products)/sitecraft-ai/(protected)/wallet/rules/actions";
import * as UsageRules from "@/app/(products)/sitecraft-ai/(protected)/wallet/usage-rules/actions";
import * as Bot from "@/app/(products)/sitecraft-ai/(protected)/chatbot/actions";
import * as Push from "@/app/(products)/commandos/(protected)/push/actions";
import * as Settings from "@/app/(products)/sitecraft-ai/(protected)/settings/actions";
import { getChatbotConfig } from "@/lib/chatbot-config";
import { getWebsiteKbSummary, listIndexedPages } from "@/lib/kb-website";
import { getPdfKbSummary, listPdfDocuments } from "@/lib/kb-pdf";
import { getWebPushSettings, listBroadcasts, subscriberStats } from "@/lib/webpush/store";
import { getSettings } from "@/lib/products/sitecraft-ai/settings";
import { getTrackingForEdit } from "@/lib/products/sitecraft-ai/tracking";
import { listAudit } from "@/lib/products/sitecraft-ai/audit";
import { listRewardRules } from "@/lib/wallet/reward-rules";
import { listUsageRules } from "@/lib/wallet/usage-rules";
import { listCampaigns as listReferralCampaigns } from "@/lib/wallet/campaigns";
import { getContactFormFields } from "@/lib/products/sitecraft-ai/forms";
import { f, str, viaAction } from "@/lib/ai/agent/entities/helpers";
import type { ActionDef, AgentUser, EntityDef, FieldDef, Json, ReportDef } from "@/lib/ai/agent/types";

/**
 * The rest of the website CMS for the agent: offers & coupons, the wallet and referral programme, the website chatbot (settings and
 * knowledge base), push notifications, tracking and site settings. Changes go through the same server actions the screens use, so
 * their own sign-in and permission checks apply; company-wide settings need a CMS admin.
 */

const cmsAdmin = (u: AgentUser) => u.roles.includes("super_admin") || u.roles.includes("cms_admin");
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Json;
const ro = (key: string, label: string, description: string, collection: string, extra: Partial<EntityDef> = {}): EntityDef => ({ key, panel: "cms", label, description, collection, idType: "string", read: "any", allowRead: cmsAdmin, ...extra });

export const CMS_EXTRA_ENTITIES: EntityDef[] = [
  ro("cms.offer_campaign", "Offer campaign", "Website offer campaigns (name, dates, status, theme).", "offer_campaigns", { titleField: "name", search: ["name", "slug"], baseFilter: { deletedAt: null } }),
  ro("cms.offer", "Offer", "Offers inside campaigns (title, pricing, validity, claim limit).", "offers", { titleField: "title", search: ["title"], baseFilter: { deletedAt: null } }),
  ro("cms.offer_coupon", "Offer coupon", "Discount coupons for the website's offers.", "coupons", { titleField: "code", search: ["code"], baseFilter: { deletedAt: null } }),
  ro("cms.offer_claim", "Offer claim", "People who claimed an offer.", "offer_claims", { search: ["name", "email"] }),
  ro("cms.wallet", "Wallet", "Credit wallets of portal users (balance, frozen).", "wallets"),
  ro("cms.wallet_transaction", "Wallet transaction", "The wallet ledger: credits, debits, reversals.", "wallet_transactions"),
  ro("cms.referral", "Referral", "Referrals and their reward status.", "referrals"),
  ro("cms.chat_session", "Website chat conversation", "Visitor conversations with the website chatbot.", "chat_sessions", { search: ["visitorName", "sourcePage"] }),
];

type Run = (v: Json, u: AgentUser) => Promise<unknown>;
const act = (key: string, label: string, description: string, params: FieldDef[], run: Run, success: string, destructive = false): ActionDef => ({
  key, panel: "cms", label, description, params, level: "any", allow: cmsAdmin, destructive, run: (v, u) => viaAction(() => run(v, u), success),
});
const rep = (key: string, label: string, description: string, params: FieldDef[], run: (v: Json) => Promise<unknown>): ReportDef => ({ key, panel: "cms", label, description, level: "any", allow: cmsAdmin, params, run: async (v) => json(await run(v)) });
const input = (what: string) => f.json("input", `${what} — an object of the fields (see the description)`, true);
const id = (what: string) => f.str("id", `${what} id`, true);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the screens' own validators check the shape
const obj = (v: Json): any => (v.input && typeof v.input === "object" ? v.input : {});

export const CMS_EXTRA_ACTIONS: ActionDef[] = [
  act("cms.save_offer_campaign", "Create or edit an offer campaign", "input: {name, slug, campaignType, themePreset, theme:{primaryColor,accentColor,bannerHeadline,bannerSubheadline}, bannerImage, startDate, endDate (ISO), status, priority, targetAudience[], isFeatured, faqs[{question,answer}], display}. Leave `id` out to create.", [f.str("id", "Campaign id to edit (leave out to create)"), input("Campaign")], (v) => Offers.saveCampaignAction(str(v.id), obj(v)), "Campaign saved.", true),
  act("cms.delete_offer_campaign", "Delete an offer campaign", "Delete a campaign.", [id("Campaign")], (v) => Offers.deleteCampaignAction(String(v.id)), "Campaign deleted.", true),
  act("cms.save_offer", "Create or edit an offer", "input: {title, description, badgeText, category, subService, audience[], pricing, benefits[], eligibility[], offerTypes[], segment, limitKind, linked, ctaText, claimLimit, validFrom, validUntil (ISO), priority, isFeatured, isDealOfTheDay, isFlashDeal, status}.", [f.str("campaignId", "Campaign id", true), f.str("offerId", "Offer id to edit (leave out to create)"), input("Offer")], (v) => OfferItems.saveOfferAction(String(v.campaignId), str(v.offerId), obj(v)), "Offer saved.", true),
  act("cms.delete_offer", "Delete an offer", "Delete an offer from its campaign.", [f.str("campaignId", "Campaign id", true), f.str("offerId", "Offer id", true)], (v) => OfferItems.deleteOfferAction(String(v.campaignId), String(v.offerId)), "Offer deleted.", true),
  act("cms.save_offer_coupon", "Create or edit a coupon", "input: {code (3-24 capital letters/digits), campaignId, discountType, discountAmount, maxDiscountCap, minOrderValue, applicableServices[], applicableAudience[], startDate, endDate (ISO), usageLimit, perUserLimit, isActive}.", [f.str("id", "Coupon id to edit (leave out to create)"), input("Coupon")], (v) => OfferCoupons.saveCouponAction(str(v.id), obj(v)), "Coupon saved.", true),
  act("cms.delete_offer_coupon", "Delete a coupon", "Delete a coupon.", [id("Coupon")], (v) => OfferCoupons.deleteCouponAction(String(v.id)), "Coupon deleted.", true),

  act("cms.adjust_wallet", "Credit or debit a wallet", "Manually add or remove credits (with a reason; it is recorded in the ledger).", [f.str("userId", "Portal user id (cms.wallet id)", true), f.enum("direction", "Direction", ["credit", "debit"], true), f.num("amount", "Amount", true), f.text("reason", "Reason", true)], (v) => Wallet.adjustWalletAction({ userId: String(v.userId), direction: v.direction as "credit", amount: Number(v.amount), reason: String(v.reason ?? "") }), "Wallet adjusted.", true),
  act("cms.set_wallet_frozen", "Freeze or unfreeze a wallet", "A frozen wallet cannot be used.", [f.str("userId", "Portal user id", true), f.bool("frozen", "Frozen")], (v) => Wallet.setWalletFrozenAction(String(v.userId), v.frozen !== false), "Wallet updated.", true),
  act("cms.approve_referral", "Approve a referral", "Pay out a pending referral's reward.", [id("Referral")], (v) => Wallet.approveReferralAction(String(v.id)), "Referral approved.", true),
  act("cms.reject_referral", "Reject a referral", "Reject a pending referral (reason of at least 5 characters).", [id("Referral"), f.text("reason", "Reason", true)], (v) => Wallet.rejectReferralAction(String(v.id), String(v.reason ?? "")), "Referral rejected.", true),
  act("cms.reverse_referral", "Reverse a rewarded referral", "Take back the rewards of a referral that was already paid.", [id("Referral"), f.text("reason", "Reason", true)], (v) => Wallet.reverseReferralAction(String(v.id), String(v.reason ?? "")), "Referral reversed.", true),
  act("cms.reverse_wallet_transaction", "Reverse a wallet transaction", "Undo one ledger entry.", [id("Transaction"), f.text("reason", "Reason", true)], (v) => Wallet.reverseTransactionAction(String(v.id), String(v.reason ?? "")), "Transaction reversed.", true),
  act("cms.refund_redemption", "Refund a credit redemption", "Give back credits that were spent on a payment.", [id("Transaction"), f.text("reason", "Reason", true)], (v) => Wallet.refundRedemptionAction(String(v.id), String(v.reason ?? "")), "Refunded.", true),
  act("cms.run_expiry_sweep", "Expire old credits now", "Run the credit-expiry sweep immediately.", [], () => Wallet.runExpirySweepAction(), "Expiry sweep done.", true),
  act("cms.save_reward_rule", "Create or edit a reward rule", "input: {type, appliesToRole, amount, expiresInDays|null, isActive, subKey|null}.", [f.str("id", "Rule id to edit (leave out to create)"), input("Rule")], (v) => Rules.saveRewardRuleAction(str(v.id), obj(v)), "Rule saved.", true),
  act("cms.delete_reward_rule", "Delete a reward rule", "Delete a rule.", [id("Rule")], (v) => Rules.deleteRewardRuleAction(String(v.id)), "Rule deleted.", true),
  act("cms.save_usage_rule", "Create or edit a credit-usage rule", "input: {module, appliesToRole, isEnabled, maxPercentOfPrice (1-100), maxCreditsPerTransaction|null, minOrderValue|null}.", [f.str("id", "Rule id to edit (leave out to create)"), input("Rule")], (v) => UsageRules.saveUsageRuleAction(str(v.id), obj(v)), "Rule saved.", true),
  act("cms.delete_usage_rule", "Delete a credit-usage rule", "Delete a rule.", [id("Rule")], (v) => UsageRules.deleteUsageRuleAction(String(v.id)), "Rule deleted.", true),
  act("cms.save_referral_campaign", "Create or edit a referral campaign", "input: {name, isActive, qualifyingEvent, referrerAudience, maxReferralsPerReferrer, startsAt|null, endsAt|null}.", [f.str("id", "Campaign id to edit (leave out to create)"), input("Referral campaign")], (v) => WalletCampaigns.saveCampaignAction(str(v.id), obj(v)), "Campaign saved.", true),
  act("cms.set_referral_campaign_active", "Turn a referral campaign on or off", "Enable or pause it.", [id("Campaign"), f.bool("active", "Active")], (v) => WalletCampaigns.toggleCampaignAction(String(v.id), v.active !== false), "Campaign updated.", true),

  act("cms.save_chatbot_config", "Change the website chatbot's settings", "input (any of): {model, temperature, maxOutputTokens, systemPrompt, maxNumResults, contextMessageLimit, rateLimitPerMinute, rateLimitPerDay, maxMessageChars, welcomeMessage, suggestedQuestions[], preChat}. Only the fields you send change.", [input("Chatbot settings")], async (v) => {
    const c = await getChatbotConfig();
    const base = { model: c.model, temperature: c.temperature, maxOutputTokens: c.maxOutputTokens, systemPrompt: c.systemPrompt, maxNumResults: c.retrieval.maxNumResults, contextMessageLimit: c.contextMessageLimit, rateLimitPerMinute: c.rateLimit.perMinute, rateLimitPerDay: c.rateLimit.perDay, maxMessageChars: c.rateLimit.maxMessageChars, welcomeMessage: c.welcomeMessage, suggestedQuestions: c.suggestedQuestions, preChat: c.preChat };
    return Bot.saveChatbotConfigAction({ ...base, ...obj(v) });
  }, "Chatbot settings saved.", true),
  act("cms.save_voice_config", "Change the website voice assistant's settings", "input: the voice settings object (see cms.chatbot_config → voice); only valid keys are kept.", [input("Voice settings")], async (v) => {
    const c = await getChatbotConfig();
    return Bot.saveVoiceConfigAction({ ...c.voice, ...(obj(v) as object) });
  }, "Voice settings saved.", true),
  act("cms.reindex_website", "Re-read the website into the chatbot's knowledge", "full = everything · incremental = only changed pages. Runs in the background.", [f.enum("mode", "Mode", ["incremental", "full"])], (v) => Bot.triggerWebsiteIndexAction(v.mode === "full" ? "full" : "incremental"), "Indexing started."),
  act("cms.reindex_pdf", "Re-index a knowledge-base document", "Re-read an uploaded PDF.", [id("Document")], (v) => Bot.reindexPdfAction(String(v.id)), "Re-indexing."),
  act("cms.delete_pdf", "Delete a knowledge-base document", "Remove a document from the chatbot's knowledge.", [id("Document")], (v) => Bot.deletePdfAction(String(v.id)), "Document deleted.", true),
  act("cms.delete_chat_conversation", "Delete a website chat conversation", "Permanently delete one visitor chat.", [id("Conversation")], (v) => Bot.deleteConversationInPlaceAction(String(v.id)), "Conversation deleted.", true),
  act("cms.delete_voice_conversation", "Delete a voice conversation", "Permanently delete one voice session.", [id("Conversation")], (v) => Bot.deleteVoiceConversationInPlaceAction(String(v.id)), "Conversation deleted.", true),

  act("cms.save_web_push_settings", "Change website push-notification settings", "input: the push settings object (see cms.push → settings).", [input("Push settings")], async (v) => Push.saveWebPushSettingsAction({ ...(await getWebPushSettings()), ...(obj(v) as object) } as never), "Push settings saved.", true),
  act("cms.send_web_push", "Send a push notification to site visitors", "Goes to everyone subscribed to the topic — it cannot be recalled.", [f.str("topic", "Topic", true), f.str("title", "Title", true), f.text("body", "Message", true), f.str("url", "Link when tapped", true)], (v) => Push.sendWebPushAction({ topic: String(v.topic), title: String(v.title), body: String(v.body ?? ""), url: String(v.url ?? "") }), "Notification sent.", true),
  act("cms.save_tracking", "Change analytics and verification settings", "input: the tracking settings object (see cms.site_settings → tracking); send the full object with your changes.", [input("Tracking settings")], async (v) => Settings.saveTrackingAction({ ...(await getTrackingForEdit()), ...(obj(v) as object) } as never), "Tracking settings saved.", true),
  act("cms.save_site_settings", "Change maintenance mode, default share image and legal name", "input (any of): {maintenanceMode:{enabled,message,title,heading}, defaultOgImage, companyLegalName}. Turning maintenance on hides the public site.", [input("Settings")], async (v) => {
    const cur = await getSettings();
    const o = obj(v) as Partial<typeof cur>;
    return Settings.saveSettingsAction({ ...cur, ...o, maintenanceMode: { ...cur.maintenanceMode, ...(o.maintenanceMode ?? {}) } });
  }, "Settings saved.", true),
];

export const CMS_EXTRA_REPORTS: ReportDef[] = [
  rep("cms.chatbot_config", "Website chatbot settings", "The chatbot's model, instructions, limits, welcome message and voice settings.", [], async () => { const c = await getChatbotConfig(); return { ...c, vectorStoreId: c.vectorStoreId ? "connected" : null }; }),
  rep("cms.chatbot_knowledge", "Chatbot knowledge base", "What the chatbot knows: indexed website pages and uploaded documents.", [], async () => ({ website: await getWebsiteKbSummary(), pages: (await listIndexedPages()).slice(0, 60), documents: { summary: await getPdfKbSummary(), items: await listPdfDocuments() } })),
  rep("cms.push", "Website push notifications", "Settings, subscriber counts by topic and the latest broadcasts.", [], async () => ({ settings: await getWebPushSettings(), subscribers: await subscriberStats(), broadcasts: await listBroadcasts(15) })),
  rep("cms.site_settings", "Site settings", "Maintenance mode, default share image, legal name and tracking / verification settings.", [], async () => ({ settings: await getSettings(), tracking: await getTrackingForEdit() })),
  rep("cms.wallet_rules", "Wallet rules and referral campaigns", "Reward rules, credit-usage rules and referral campaigns.", [], async () => ({ rewardRules: await listRewardRules(), usageRules: await listUsageRules(), referralCampaigns: await listReferralCampaigns() })),
  rep("cms.contact_form", "Contact form fields", "The contact form's fields.", [], () => getContactFormFields()),
  rep("cms.audit_log", "CMS change history", "Who changed what in the CMS (newest first).", [f.str("q", "Search")], async (v) => listAudit({ q: str(v.q) ?? undefined, pageSize: 40 } as never)),
];
