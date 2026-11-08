import "server-only";
import { notifySmmsUsers } from "@/lib/products/viralpulse-ai/notifications";
import { audienceUserIds } from "@/lib/notify/audience";
import { short } from "@/lib/notify/triggers/format";

/** Social media notifications about the connected accounts go to SMMS admins and managers (the people who connect them). */
const hour = () => new Date().toISOString().slice(0, 13);
async function owners() {
  return audienceUserIds("smms", "admin");
}
export const smmsEvents = {
  disconnected: async (provider: string) =>
    notifySmmsUsers(await owners(), { type: "smms_integration_disconnected", title: `${provider} was disconnected`, body: "Posts to this account will fail until you reconnect it.", link: "/viralpulse-ai/settings", dedupeKey: `smms-disc:${provider}:${hour()}` }),
  /** A connected account's login is expiring, expired, revoked or missing a permission. Dedupe keys come from the caller so a reminder is not repeated. */
  accountIssue: async (n: { title: string; body: string; link: string; dedupeKey: string }) =>
    notifySmmsUsers(await owners(), { type: "smms_integration_error", title: short(n.title, 120), body: short(n.body, 200), link: n.link, dedupeKey: n.dedupeKey }),
  error: async (provider: string, message: string) =>
    notifySmmsUsers(await owners(), { type: "smms_integration_error", title: `${provider} needs attention`, body: short(message, 140), link: "/viralpulse-ai/settings", dedupeKey: `smms-err:${provider}:${short(message, 30)}:${new Date().toISOString().slice(0, 10)}` }),
};
