"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { checkWorkspaceAccess, requireWorkspaceAction } from "@/lib/products/commandos/access";
import { listLog, resetRule, updateRule, type LogQuery, type RulePatch, type RuleResult } from "@/lib/notify/center/store";
import { cancelAnnouncement, createAnnouncement, deleteAnnouncement, sendAnnouncementNow, updateAnnouncement, type AnnouncementInput, type AnnouncementResult } from "@/lib/notify/center/announcements";
import type { LogEntry } from "@/lib/notify/center/shared";
import { renderEmail } from "@/lib/platform/email/template";
import { getCompanyBrand } from "@/lib/platform/branding";
import { emailSubject } from "@/lib/notify/email-channel-rule";

const NAV_KEY = "company.notifications";
const done = <T>(res: T) => {
  revalidatePath("/commandos/settings/notifications");
  return res;
};
const input = (v: unknown): AnnouncementInput => (v && typeof v === "object" ? (v as AnnouncementInput) : ({ title: "", channels: {}, audience: { type: "everyone" }, when: "draft" } as AnnouncementInput));

export async function updateRuleAction(key: string, patch: RulePatch): Promise<RuleResult> {
  const user = await requireWorkspaceAction(NAV_KEY);
  return done(await updateRule(String(key ?? ""), patch && typeof patch === "object" ? patch : {}, user.id));
}

export async function resetRuleAction(key: string): Promise<RuleResult> {
  const user = await requireWorkspaceAction(NAV_KEY);
  return done(await resetRule(String(key ?? ""), user.id));
}

export async function createAnnouncementAction(data: AnnouncementInput): Promise<AnnouncementResult> {
  const user = await requireWorkspaceAction(NAV_KEY);
  return done(await createAnnouncement(input(data), user.id));
}

export async function updateAnnouncementAction(id: string, data: AnnouncementInput): Promise<AnnouncementResult> {
  await requireWorkspaceAction(NAV_KEY);
  return done(await updateAnnouncement(String(id ?? ""), input(data)));
}

export async function sendAnnouncementNowAction(id: string): Promise<AnnouncementResult> {
  await requireWorkspaceAction(NAV_KEY);
  return done(await sendAnnouncementNow(String(id ?? "")));
}

export async function cancelAnnouncementAction(id: string): Promise<AnnouncementResult> {
  await requireWorkspaceAction(NAV_KEY);
  return done(await cancelAnnouncement(String(id ?? "")));
}

export async function deleteAnnouncementAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceAction(NAV_KEY);
  return done(await deleteAnnouncement(String(id ?? "")));
}

/** Reading the log works even while the workspace is read-only (it only needs the page's access). */
export async function loadLogAction(query: LogQuery): Promise<{ entries: LogEntry[]; next: string | null }> {
  const user = await getCurrentHubUser();
  if (!user || user.mustChangePassword || !(await checkWorkspaceAccess(user, NAV_KEY))) throw new Error("Forbidden");
  const q = query && typeof query === "object" ? query : {};
  return listLog({ channel: q.channel, status: q.status, event: q.event, q: q.q, before: q.before, limit: q.limit });
}

/**
 * How the email looks with the wording being edited: the same layout the real email uses. The fields hold readable text (example values
 * already in place), so they are shown exactly as typed.
 */
export async function previewEmailAction(email: { subject: string; title: string; body: string; greeting: string; button: string; footnote: string }): Promise<{ ok: true; subject: string; html: string } | { ok: false; error: string }> {
  const user = await getCurrentHubUser();
  if (!user || user.mustChangePassword || !(await checkWorkspaceAccess(user, NAV_KEY))) return { ok: false, error: "Forbidden" };
  const brand = (await getCompanyBrand().catch(() => null))?.name ?? "Your company";
  const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const { html } = renderEmail({
    brand,
    heading: clip(email?.title, 160),
    paragraphs: [...(clip(email?.greeting, 160) ? [clip(email.greeting, 160)] : []), ...(clip(email?.body, 600) ? [clip(email.body, 600)] : [])],
    action: { label: clip(email?.button, 40) || "Open it", url: "https://app.example.com/commandos/notifications" },
    footnote: clip(email?.footnote, 400) || undefined,
  });
  return { ok: true, subject: emailSubject(brand, clip(email?.subject, 160)), html };
}
