import "server-only";
import { isPlatformOwnerContext, currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getSavedConnection } from "@/lib/platform/connections/store";
import { PLATFORM_FALLBACK } from "@/lib/platform/connections/catalog";
import { getConfig } from "@/lib/platform/config/store";

/**
 * What the rest of the app asks for: "the credentials for <provider>, for the current company".
 *
 *  1. the company's own saved connection (Workspace → Settings → Integrations): used by that company only
 *  2. else, for the services SelfRun can provide (`PLATFORM_FALLBACK`: AI, voice, WhatsApp/SMS, PageSpeed, TURN, Google service account),
 *     the platform's own keys from Platform Console → Integrations (or the server environment); those uses count against the plan
 *  3. else, for the PLATFORM OWNER's own workspace only, the deployment's environment variables (social apps)
 *  4. else nothing. A company never gets another company's keys, and never the platform's keys for payments or social apps.
 * Email and push have the same rule in `email/index.ts` and `push/vapid.ts`.
 */
export const ENV_CONNECTION_PROVIDERS = (): string[] => Object.keys(ENV);
const ENV: Record<string, Record<string, string[]>> = {
  openai: { apiKey: ["OPENAI_API_KEY"] },
  twilio: { accountSid: ["TWILIO_ACCOUNT_SID"], authToken: ["TWILIO_AUTH_TOKEN"], whatsappFrom: ["TWILIO_WHATSAPP_FROM"] },
  elevenlabs: { apiKey: ["ELEVENLABS_API_KEY"] },
  "google-service-account": { clientEmail: ["GOOGLE_SEO_CLIENT_EMAIL", "GOOGLE_INDEXING_CLIENT_EMAIL"], privateKey: ["GOOGLE_SEO_PRIVATE_KEY", "GOOGLE_INDEXING_PRIVATE_KEY"] },
  pagespeed: { apiKey: ["PAGESPEED_API_KEY"] },
  livekit: { url: ["LIVEKIT_URL"], apiKey: ["LIVEKIT_API_KEY"], apiSecret: ["LIVEKIT_API_SECRET"] },
  turn: { url: ["MESSENGER_TURN_URL"], username: ["MESSENGER_TURN_USERNAME"], credential: ["MESSENGER_TURN_CREDENTIAL"] },
  meta: { appId: ["META_APP_ID"], appSecret: ["META_APP_SECRET"] },
  google: { clientId: ["GOOGLE_OAUTH_CLIENT_ID"], clientSecret: ["GOOGLE_OAUTH_CLIENT_SECRET"] },
  linkedin: { clientId: ["LINKEDIN_CLIENT_ID"], clientSecret: ["LINKEDIN_CLIENT_SECRET"] },
};

/**
 * The credentials the deployment holds for `provider` (null when none): the keys saved in Platform Console → Integrations, else the
 * environment variables — used by the platform operator's own workspace and for the platform-provided services.
 */
export async function fromEnv(provider: string): Promise<Record<string, string> | null> {
  const map = ENV[provider];
  if (!map) return null;
  const out: Record<string, string> = {};
  for (const [field, names] of Object.entries(map)) {
    for (const n of names) {
      const v = await getConfig(n);
      if (v) {
        out[field] = field === "privateKey" ? v.replace(/\\n/g, "\n") : v;
        break;
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

export type ResolvedConnection = { values: Record<string, string>; source: "workspace" | "platform" };

export async function resolveConnection(provider: string): Promise<ResolvedConnection | null> {
  if (!(await currentCompanyIdOrNull())) return null;
  const saved = await getSavedConnection(provider);
  if (saved && Object.keys(saved).length) return { values: saved, source: "workspace" };
  if (PLATFORM_FALLBACK.includes(provider) || (await isPlatformOwnerContext())) {
    const env = await fromEnv(provider);
    if (env) return { values: env, source: "platform" };
  }
  return null;
}

/** The credentials, or null. */
export async function connectionValues(provider: string): Promise<Record<string, string> | null> {
  return (await resolveConnection(provider))?.values ?? null;
}

/** Is a usable connection (every required field present) available for this workspace? */
export async function isConnected(provider: string, requiredFields: string[]): Promise<boolean> {
  const v = await connectionValues(provider);
  return !!v && requiredFields.every((f) => !!v[f]);
}
