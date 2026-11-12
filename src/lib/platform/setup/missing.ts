import "server-only";
import { getConfig } from "@/lib/platform/config/store";
import { resolveEmailConfig } from "@/lib/platform/integrations/resolve";
import { getRazorpayCredentials } from "@/lib/platform/billing/razorpay-config";

/**
 * STAFF-ONLY guided checklist: every setting that used to live only in the old deployment's environment and is empty now, with the exact
 * Console section, a "Test" and a short hint on where to get the key. Read-only except the tests (small, harmless calls).
 */

export interface MissingItem {
  id: string;
  title: string;
  configured: boolean;
  /** The Console page and section to fill it in. */
  href: string;
  hint: string;
  testable: boolean;
}

const has = async (...keys: string[]) => (await Promise.all(keys.map((k) => getConfig(k).catch(() => null)))).every(Boolean);

export async function missingSettings(): Promise<MissingItem[]> {
  const email = await resolveEmailConfig().then((e) => e.provider === "resend" && Boolean(e.resendApiKey)).catch(() => false);
  const razorpay = await getRazorpayCredentials().then((c) => c !== null).catch(() => false);
  return [
    { id: "blob", title: "File storage (Vercel Blob token)", configured: await has("BLOB_READ_WRITE_TOKEN"), href: "/console/integrations#cfg-BLOB_READ_WRITE_TOKEN", hint: "Old files are copied into the database once this token is saved. Vercel → Storage → your Blob store → copy the read-write token (the old store keeps working until Vercel removes it).", testable: true },
    { id: "email", title: "Email provider (Resend)", configured: email, href: "/console/integrations", hint: "resend.com → API Keys → create a key; save it under Integrations → Email with a sender on your verified domain.", testable: true },
    { id: "openai", title: "AI (OpenAI)", configured: await has("OPENAI_API_KEY"), href: "/console/integrations#cfg-OPENAI_API_KEY", hint: "platform.openai.com → API keys.", testable: true },
    { id: "elevenlabs", title: "Voice (ElevenLabs)", configured: await has("ELEVENLABS_API_KEY"), href: "/console/integrations#cfg-ELEVENLABS_API_KEY", hint: "elevenlabs.io → Profile → API key.", testable: true },
    { id: "twilio", title: "Messaging and calls (Twilio)", configured: await has("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"), href: "/console/integrations#cfg-TWILIO_ACCOUNT_SID", hint: "twilio.com/console → Account info (SID and auth token).", testable: true },
    { id: "razorpay", title: "Payments (Razorpay)", configured: razorpay, href: "/console/payments", hint: "Razorpay dashboard → Settings → API keys (test and live). Saved on the Payments page, which has its own test.", testable: false },
    { id: "github", title: "App builds (GitHub)", configured: await has("GITHUB_DISPATCH_TOKEN", "GITHUB_REPOSITORY", "DESKTOP_BUILD_SECRET"), href: "/console/integrations#cfg-GITHUB_DISPATCH_TOKEN", hint: "GitHub → Settings → Developer settings → fine-grained token (Actions read/write) for the build repository; the callback secret is any long random value.", testable: true },
    { id: "push", title: "Push notifications (VAPID)", configured: await has("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"), href: "/console/integrations#cfg-VAPID_PUBLIC_KEY", hint: "Generate a key pair with `npx web-push generate-vapid-keys` and save both halves.", testable: false },
  ];
}

export type TestResult = { ok: true; message: string } | { ok: false; error: string };

/** A small, harmless read call for one setting. `fetchFn` is injectable for tests. */
export async function testSetting(id: string, fetchFn: typeof fetch = fetch, extra?: { emailTo?: string }): Promise<TestResult> {
  const get = async (url: string, headers: Record<string, string>, label: string): Promise<TestResult> => {
    try {
      const r = await fetchFn(url, { headers, signal: AbortSignal.timeout(10_000) });
      return r.ok ? { ok: true, message: `${label} accepted the key.` } : { ok: false, error: `${label} answered ${r.status}${r.status === 401 || r.status === 403 ? ": the key was refused" : ""}.` };
    } catch {
      return { ok: false, error: `Couldn't reach ${label}.` };
    }
  };
  switch (id) {
    case "blob": {
      const token = await getConfig("BLOB_READ_WRITE_TOKEN");
      if (!token) return { ok: false, error: "No token saved." };
      try {
        const { createBlobStoreApi } = await import("@/lib/storage/blob-migrate-run");
        const page = await createBlobStoreApi(token).list(null, 5);
        return { ok: true, message: `The Blob store answers (${page.blobs.length}${page.cursor ? "+" : ""} files in the first page).` };
      } catch (e) {
        return { ok: false, error: `The Blob store can't be read: ${e instanceof Error ? e.message.slice(0, 120) : "error"}` };
      }
    }
    case "email": {
      if (!extra?.emailTo) return { ok: false, error: "No address to send to." };
      const { sendIntegrationsTestEmail } = await import("@/lib/platform/integrations");
      return sendIntegrationsTestEmail(extra.emailTo, "system:missing-settings");
    }
    case "openai": {
      const k = await getConfig("OPENAI_API_KEY");
      return k ? get("https://api.openai.com/v1/models", { Authorization: `Bearer ${k}` }, "OpenAI") : { ok: false, error: "No key saved." };
    }
    case "elevenlabs": {
      const k = await getConfig("ELEVENLABS_API_KEY");
      return k ? get("https://api.elevenlabs.io/v1/user", { "xi-api-key": k }, "ElevenLabs") : { ok: false, error: "No key saved." };
    }
    case "twilio": {
      const [sid, tok] = await Promise.all([getConfig("TWILIO_ACCOUNT_SID"), getConfig("TWILIO_AUTH_TOKEN")]);
      return sid && tok ? get(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, { Authorization: `Basic ${Buffer.from(`${sid}:${tok}`).toString("base64")}` }, "Twilio") : { ok: false, error: "No credentials saved." };
    }
    case "github": {
      const [tok, repo] = await Promise.all([getConfig("GITHUB_DISPATCH_TOKEN"), getConfig("GITHUB_REPOSITORY")]);
      return tok && repo ? get(`https://api.github.com/repos/${repo}`, { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json" }, "GitHub") : { ok: false, error: "No token or repository saved." };
    }
    default:
      return { ok: false, error: "This one has no test here." };
  }
}
