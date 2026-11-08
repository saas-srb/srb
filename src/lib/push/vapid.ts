import "server-only";
import webpush from "web-push";
import { getConfigs } from "@/lib/platform/config/store";
import { getSavedConnection } from "@/lib/platform/connections/store";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";

/**
 * Web Push needs a VAPID key pair. A company that saved its own (Workspace → Settings → Integrations → Web Push) sends under its own
 * identity; every other company uses SelfRun's pair, saved in Platform Console → Integrations → Push notifications (the same-named
 * environment variables still work as a fallback). Without any pair push is simply switched off: the app, the in-app bells and
 * everything else keep working. The contact defaults to the platform staff email.
 * Devices subscribe against one public key, so changing the pair makes existing devices subscribe again.
 */
export interface PushKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
  /** The company's own pair (not SelfRun's). */
  own: boolean;
}

const defaultSubject = () => (process.env.SAAS_ADMIN_EMAIL ? `mailto:${process.env.SAAS_ADMIN_EMAIL}` : "mailto:support@localhost.invalid");
const checked = new Set<string>();

function usable(keys: PushKeys): boolean {
  const signature = `${keys.subject}|${keys.publicKey}|${keys.privateKey}`;
  if (checked.has(signature)) return true;
  try {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    if (checked.size > 200) checked.clear();
    checked.add(signature);
    return true;
  } catch (err) {
    console.error("[push] invalid VAPID configuration; push is disabled for it", err instanceof Error ? err.message : err);
    return false;
  }
}

/** The key pair for the current company: its own, else SelfRun's; null when neither exists or is valid. */
export async function pushKeys(): Promise<PushKeys | null> {
  if (await currentCompanyIdOrNull()) {
    const mine = await getSavedConnection("vapid").catch(() => null);
    if (mine?.publicKey && mine.privateKey) {
      const keys = { publicKey: mine.publicKey, privateKey: mine.privateKey, subject: mine.subject || defaultSubject(), own: true };
      return usable(keys) ? keys : null;
    }
  }
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = await getConfigs(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null;
  const keys = { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT || defaultSubject(), own: false };
  return usable(keys) ? keys : null;
}

export async function pushConfigured(): Promise<boolean> {
  return (await pushKeys()) !== null;
}

export const vapidPublicKey = async () => (await pushKeys())?.publicKey ?? "";

/** The per-send option that signs a push with the right pair. */
export const vapidDetails = (keys: PushKeys) => ({ subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey });
export { webpush };
