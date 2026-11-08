import "server-only";
import { notifyPanel } from "@/lib/notify";
import { plural, short, today } from "@/lib/notify/triggers/format";

/**
 * Website (CMS) notifications. Publishing and site-wide changes go to the website team (editors, admins); settings that affect every
 * visitor (maintenance mode) and failures go to admins. The person who did it is never told about their own action.
 */
export const cmsEvents = {
  pagePublished: (p: { id: string; path: string; version: string }, actor: string) =>
    notifyPanel("cms", { type: "cms_page_published", title: `Page published: ${p.path}`, body: `Version ${p.version} is live on your website.`, link: `/sitecraft-ai/pages/${p.id}` }, { level: "staff", exceptUserId: actor }),
  pageDeleted: (p: { path: string }, actor: string) =>
    notifyPanel("cms", { type: "cms_page_deleted", title: `Page deleted: ${p.path}`, body: "The page and its history were removed.", link: "/sitecraft-ai/pages", priority: "high" }, { level: "admin", exceptUserId: actor }),
  themeChanged: (what: "published" | "activated", name: string, actor: string) =>
    notifyPanel("cms", { type: `cms_theme_${what}`, title: `Theme ${what}: ${short(name, 50)}`, body: what === "activated" ? "Your whole website now uses this look." : "The theme's changes are live.", link: "/sitecraft-ai/theme" }, { level: "staff", exceptUserId: actor }),
  maintenance: (on: boolean, actor: string) =>
    notifyPanel("cms", { type: on ? "cms_maintenance_on" : "cms_maintenance_off", title: on ? "Maintenance mode is ON" : "Maintenance mode is off", body: on ? "Visitors currently see the maintenance page instead of your website." : "Your website is visible to visitors again.", link: "/sitecraft-ai/settings", priority: "high" }, { level: "admin", exceptUserId: actor }),
  recordPublished: (kind: string, title: string, slug: string, key: string, actor: string) =>
    notifyPanel("cms", { type: "cms_record_published", title: `${kind} published: ${short(title, 60)}`, body: "It is live on your website.", link: `/sitecraft-ai/collections/${key}/${slug}` }, { level: "staff", exceptUserId: actor }),
  offerClaimed: (c: { id: string; offerTitle?: string | null; name?: string | null }) =>
    notifyPanel("cms", { type: "cms_offer_claimed", title: `Offer claimed${c.offerTitle ? `: ${short(c.offerTitle, 50)}` : ""}`, body: c.name ? `By ${short(c.name, 60)}` : "A visitor claimed one of your offers.", link: "/sitecraft-ai/offers/claims", dedupeKey: `cms-claim:${c.id}` }, { level: "staff" }),
  broadcastDone: (b: { id: string; title: string; status: string; sent: number; targeted: number; failed: number }, createdBy: string | null) =>
    notifyPanel("cms", { type: b.status === "failed" ? "cms_push_failed" : "cms_push_sent", title: b.status === "failed" ? `Push notification failed: ${short(b.title, 50)}` : `Push notification sent: ${short(b.title, 50)}`, body: `Reached ${b.sent} of ${plural(b.targeted, "subscriber")}${b.failed ? ` · ${b.failed} failed` : ""}.`, link: "/commandos/push", priority: b.status === "failed" ? "high" : "normal", dedupeKey: `cms-push:${b.id}` }, { level: "admin", exceptUserId: createdBy }),
  chatVisitor: (v: { id: string; name?: string | null; service?: string | null }) =>
    notifyPanel("cms", { type: "cms_chat_visitor", title: `${v.name ? short(v.name, 40) : "A visitor"} started chatting on your website`, body: v.service ? `Interested in: ${short(v.service, 60)}` : "Open Chatbot → Conversations to read it.", link: "/commandos/chatbot/conversations", dedupeKey: `cms-visitor:${v.id}` }, { level: "staff" }),
  aiWebsite: (ok: boolean, detail: string) =>
    notifyPanel("cms", { type: ok ? "cms_ai_website_ready" : "cms_ai_website_failed", title: ok ? "Your AI website is ready" : "Your AI website could not be generated", body: ok ? detail : short(detail, 160), link: "/sitecraft-ai/ai-website", priority: ok ? "normal" : "high", dedupeKey: `cms-ai-site:${today()}:${ok ? "ok" : "fail"}:${short(detail, 20)}` }, { level: "admin" }),
  indexFinished: (ok: boolean, detail: string) =>
    notifyPanel("cms", { type: ok ? "cms_kb_indexed" : "cms_kb_failed", title: ok ? "Chatbot knowledge updated" : "Chatbot knowledge update failed", body: short(detail, 160), link: "/commandos/chatbot/knowledge-base", priority: ok ? "normal" : "high", dedupeKey: `cms-kb:${Date.now().toString(36).slice(0, 6)}:${ok ? 1 : 0}` }, { level: "admin" }),
};
