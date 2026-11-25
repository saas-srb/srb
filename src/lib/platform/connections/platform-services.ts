import "server-only";
import { getConfigs } from "@/lib/platform/config/store";
import { platformSendgrid, platformSmtp } from "@/lib/platform/email/platform-accounts";
import { resolveEmailConfig } from "@/lib/platform/integrations/resolve";
import { fromEnv } from "@/lib/platform/connections/resolve";
import { providerByKey } from "@/lib/platform/connections/catalog";

/**
 * What the PLATFORM (SelfRun, "SRB") really has configured, per connection. ONE source: the company's Integrations cards ("Using SRB" or
 * "Not available from SRB, add your own") and the staff Missing-settings checklist both ask it, so they can never disagree.
 *
 * Email is ready when the platform has a real sending account (not the development console printer); push when a VAPID pair is saved;
 * every other service when each required field is present in the platform configuration (Console, Integrations) or the environment.
 */
export async function platformServiceReady(provider: string): Promise<boolean> {
  const p = providerByKey.get(provider);
  if (!p) return false;
  // Email: any of the platform's three sending accounts makes the included default available.
  if (p.group === "email") {
    const resend = await resolveEmailConfig().then((e) => e.provider === "resend" && Boolean(e.resendApiKey)).catch(() => false);
    return resend || Boolean(await platformSmtp().catch(() => null)) || Boolean(await platformSendgrid().catch(() => null));
  }
  if (provider === "vapid") {
    const c = await getConfigs(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]).catch(() => ({}) as Record<string, string | null>);
    return Boolean(c.VAPID_PUBLIC_KEY && c.VAPID_PRIVATE_KEY);
  }
  const env = await fromEnv(provider);
  if (!env) return false;
  return p.fields.filter((f) => f.required).every((f) => Boolean(env[f.key]));
}
