/**
 * ONE tester interface for every connection (company Integrations cards AND the staff Missing-settings checklist).
 *
 * A tester gets the credentials and the things it may touch (`TesterDeps`: the HTTP client, the SMTP check, the Google token call …), so it
 * is tested with stubs and never needs a network. Rules every tester follows:
 *  - read-only or free: a list/identity call, never a purchase, a post or a message to a real person
 *  - plain results ("OpenAI accepted the credentials." / "OpenAI replied 401: Incorrect API key.")
 *  - a secret never appears in a result, a log line or a thrown error: `runTester` scrubs every credential value out of the text
 *
 * No `server-only` here on purpose: it is pure apart from the default dependencies, which are imported lazily.
 */

export type TestOutcome = { ok: boolean; message: string };
export type Credentials = Record<string, string>;

export interface TesterDeps {
  /** The HTTP client (a stub in tests). */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** SMTP: connect and sign in, nothing sent. Throws on failure. */
  smtpVerify: (v: Credentials) => Promise<void>;
  /** Google service account: ask for an access token. Throws on failure. */
  googleToken: (clientEmail: string, privateKey: string) => Promise<void>;
  /** LiveKit: list rooms (read-only). Throws on failure. */
  livekitList: (host: string, apiKey: string, apiSecret: string) => Promise<void>;
  /** Web push: are these two keys a valid pair? Throws when not. */
  vapidCheck: (subject: string, publicKey: string, privateKey: string) => void;
}

const TIMEOUT = 12_000;

export function defaultDeps(): TesterDeps {
  return {
    fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT), cache: "no-store", redirect: "manual" }),
    smtpVerify: async (v) => {
      const nodemailer = (await import("nodemailer")).default;
      await nodemailer
        .createTransport({
          host: v.host, port: Number(v.port) || 587, secure: v.secure === "ssl", requireTLS: v.secure === "starttls", ignoreTLS: v.secure === "none",
          auth: v.username ? { user: v.username, pass: v.password } : undefined, connectionTimeout: TIMEOUT, greetingTimeout: TIMEOUT, socketTimeout: TIMEOUT,
        })
        .verify();
    },
    googleToken: async (clientEmail, privateKey) => {
      const { getServiceAccountToken } = await import("@/lib/google-service-account");
      await getServiceAccountToken({ clientEmail, privateKey }, ["https://www.googleapis.com/auth/webmasters.readonly"]);
    },
    livekitList: async (host, apiKey, apiSecret) => {
      const { RoomServiceClient } = await import("livekit-server-sdk");
      await new RoomServiceClient(host, apiKey, apiSecret).listRooms();
    },
    vapidCheck: (subject, publicKey, privateKey) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const webpush = require("web-push") as typeof import("web-push");
      webpush.setVapidDetails(subject, publicKey, privateKey);
    },
  };
}

const ok = (message: string): TestOutcome => ({ ok: true, message });
const fail = (message: string): TestOutcome => ({ ok: false, message });
const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

/** What the service said, in a few plain words. */
async function detailOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; description?: string } | string; message?: string; error_description?: string; detail?: string; title?: string } | null;
  if (!body) return "";
  if (typeof body.error === "string") return body.error_description ? `${body.error} (${body.error_description})` : body.error;
  return body.error?.message ?? body.error?.description ?? body.message ?? body.detail ?? body.title ?? "";
}

async function verdict(res: Response, label: string, goodWord = "accepted the credentials"): Promise<TestOutcome> {
  if (res.ok) return ok(`${label} ${goodWord}.`);
  const detail = await detailOf(res);
  return fail(`${label} replied ${res.status}${detail ? `: ${detail}` : ""}.`);
}

export type Tester = (v: Credentials, d: TesterDeps) => Promise<TestOutcome>;

/** Every provider with a real check. The key is the provider key in `catalog.ts`. */
export const TESTERS: Record<string, Tester> = {
  // ── AI: the cheapest authenticated call each provider has (a one-item model list). Nothing is generated, nothing is billed. ──
  openai: async (v, d) =>
    verdict(await d.fetch("https://api.openai.com/v1/models?limit=1", { headers: { Authorization: `Bearer ${v.apiKey}`, ...(v.organization ? { "OpenAI-Organization": v.organization } : {}), ...(v.project ? { "OpenAI-Project": v.project } : {}) } }), "OpenAI"),
  gemini: async (v, d) => verdict(await d.fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": v.apiKey } }), "Google Gemini"),
  elevenlabs: async (v, d) => verdict(await d.fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": v.apiKey } }), "ElevenLabs"),

  // ── Email providers (the API ones: an authenticated read; the SMTP one signs in). "Send me a test email" is a separate button. ──
  resend: async (v, d) => verdict(await d.fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${v.apiKey}` } }), "Resend"),
  sendgrid: async (v, d) => verdict(await d.fetch("https://api.sendgrid.com/v3/scopes", { headers: { Authorization: `Bearer ${v.apiKey}` } }), "SendGrid"),
  smtp: async (v, d) => {
    try {
      await d.smtpVerify(v);
      return ok("Connected to the SMTP server and signed in.");
    } catch (err) {
      return fail(`SMTP check failed: ${err instanceof Error ? err.message : "could not connect"}.`);
    }
  },

  // ── Phone and messaging: the account itself (SMS and WhatsApp both send through it). ──
  twilio: async (v, d) => verdict(await d.fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(v.accountSid)}.json`, { headers: { Authorization: basic(v.accountSid, v.authToken) } }), "Twilio"),
  "whatsapp-cloud": async (v, d) => verdict(await d.fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(v.phoneNumberId)}`, { headers: { Authorization: `Bearer ${v.accessToken}` } }), "WhatsApp Cloud API"),

  // ── Payments: a read-only call with the key pair. ──
  razorpay: async (v, d) => {
    if (!/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/.test(v.keyId ?? "")) return fail("The Key ID should look like rzp_test_… or rzp_live_….");
    const res = await d.fetch("https://api.razorpay.com/v1/payments?count=1", { headers: { Authorization: basic(v.keyId, v.keySecret) } });
    if (res.status === 401) return fail("Razorpay rejected these keys. Check the Key ID and Key Secret.");
    return verdict(res, "Razorpay");
  },

  // ── Search and analytics ──
  pagespeed: async (v, d) => verdict(await d.fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fexample.com&category=performance&key=${encodeURIComponent(v.apiKey)}`), "PageSpeed"),
  "google-service-account": async (v, d) => {
    try {
      await d.googleToken(v.clientEmail, v.privateKey);
      return ok("Google issued an access token for this service account. Remember to add its email as a user on your Search Console and Analytics properties.");
    } catch (err) {
      return fail(`Google rejected the key: ${err instanceof Error ? err.message : "invalid credentials"}.`);
    }
  },

  // ── Calls and realtime ──
  livekit: async (v, d) => {
    const host = (v.url || "").replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    try {
      await d.livekitList(host, v.apiKey, v.apiSecret);
      return ok("LiveKit accepted the URL and credentials.");
    } catch (err) {
      return fail(`LiveKit rejected the credentials: ${err instanceof Error ? err.message : "check failed"}.`);
    }
  },
  vapid: async (v, d) => {
    try {
      d.vapidCheck(v.subject || "mailto:support@example.com", v.publicKey, v.privateKey);
      return ok("These two keys are a valid pair.");
    } catch {
      return fail("These two keys aren't a valid pair. Generate them together with  npx web-push generate-vapid-keys.");
    }
  },

  // ── Social apps. A login-free "is this app known to the network" probe: it asks the provider's token endpoint for something it will refuse
  //    for a different reason than a bad app. A bad id/secret is the only thing that reads as a failure. It never posts anything. ──
  meta: async (v, d) => {
    const res = await d.fetch("https://graph.facebook.com/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_id: v.appId, client_secret: v.appSecret, grant_type: "client_credentials" }) });
    return verdict(res, "Meta", "recognised the app ID and secret");
  },
  google: async (v, d) => oauthClientProbe(d, "Google", "https://oauth2.googleapis.com/token", v.clientId, v.clientSecret, false),
  linkedin: async (v, d) => oauthClientProbe(d, "LinkedIn", "https://www.linkedin.com/oauth/v2/accessToken", v.clientId, v.clientSecret, false),
  x: async (v, d) => oauthClientProbe(d, "X", "https://api.x.com/2/oauth2/token", v.clientId, v.clientSecret, true),
};

/**
 * Sends a deliberately invalid authorization code. "invalid_client" / 401 = the app id or secret is wrong; "invalid_grant" and friends
 * mean the provider knows the app and only rejected our fake code, which is what we want to see.
 */
async function oauthClientProbe(d: TesterDeps, label: string, url: string, clientId: string, clientSecret: string, useBasic: boolean): Promise<TestOutcome> {
  const body = form({ grant_type: "authorization_code", code: "connection-test", redirect_uri: "https://example.invalid/callback", ...(useBasic ? { client_id: clientId } : { client_id: clientId, client_secret: clientSecret }) });
  const res = await d.fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...(useBasic ? { Authorization: basic(clientId, clientSecret) } : {}) }, body });
  const text = await detailOf(res.clone());
  if (res.status === 401 || /invalid_client|unauthorized_client|client authentication failed|invalid client/i.test(text)) return fail(`${label} did not recognise this client ID and secret. Check them in the ${label} developer console.`);
  if (res.status >= 500) return fail(`${label} is not answering right now (${res.status}). Try again in a minute.`);
  return ok(`${label} recognised this app. Connect the accounts from the product that publishes.`);
}

/** Does this provider have a real automatic check? */
export const hasTester = (provider: string): boolean => provider in TESTERS;

/** Replaces every credential value in `text` with asterisks (a remote error that echoes a key never reaches a screen or a log). */
export function scrub(text: string, v: Credentials): string {
  let out = text;
  for (const secret of Object.values(v)) if (secret && secret.length >= 4) out = out.split(secret).join("***");
  return out;
}

/**
 * Runs the check for one provider with the given credentials. Never throws and never leaks a credential.
 * `deps` is injectable; the default talks to the real service.
 */
export async function runTester(provider: string, v: Credentials, deps: TesterDeps = defaultDeps()): Promise<TestOutcome> {
  const tester = TESTERS[provider];
  if (!tester) return ok("Saved. This service has no automatic check: it is verified the first time a product uses it.");
  try {
    const out = await tester(v, deps);
    return { ok: out.ok, message: scrub(out.message, v).slice(0, 300) };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return fail(timedOut ? "The service didn't answer in time." : scrub(`Check failed: ${err instanceof Error ? err.message : "unknown error"}.`, v).slice(0, 300));
  }
}

// ── Checks that are not credentials ──────────────────────────────────────────────────────────────────────────────────────────────

/** File storage: write a few bytes, read them back, delete them. `store` is the storage layer (a fake in tests). */
export interface StorageProbe {
  put: (key: string, body: Buffer) => Promise<void>;
  get: (key: string) => Promise<Buffer | null>;
  remove: (key: string) => Promise<void>;
}

export async function probeStorage(store: StorageProbe, now: () => number = Date.now): Promise<TestOutcome> {
  const key = `connection-test/${now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  const bytes = Buffer.from(`connection test ${now()}`);
  try {
    await store.put(key, bytes);
    const back = await store.get(key);
    if (!back || !back.equals(bytes)) return fail("File storage accepted a test file but did not give the same bytes back.");
    return ok("File storage works: a test file was written, read back and removed.");
  } catch (err) {
    return fail(`File storage check failed: ${err instanceof Error ? err.message : "error"}.`);
  } finally {
    await store.remove(key).catch(() => {});
  }
}

export interface WebhookTarget { name: string; url: string; secret: string }
export type WebhookSender = (url: string, payload: unknown, opts: { secret: string; eventType: string; deliveryId: string }) => Promise<{ ok: boolean; status: number | null; error: string | null }>;

/** Sends a signed `connection.test` ping to each of the company's own webhook URLs and reports each plainly. */
export async function pingWebhooks(targets: WebhookTarget[], send: WebhookSender, newId: () => string = () => `test-${Date.now()}`): Promise<TestOutcome> {
  if (targets.length === 0) return fail("No automation calls a webhook yet. Add a \"Call a webhook\" action to an automation first.");
  const lines: string[] = [];
  let allOk = true;
  for (const t of targets) {
    const r = await send(t.url, { event: "connection.test", sentAt: new Date().toISOString(), test: true }, { secret: t.secret, eventType: "connection.test", deliveryId: newId() });
    if (!r.ok) allOk = false;
    lines.push(`${t.name}: ${r.ok ? `answered ${r.status}` : r.error ?? `replied ${r.status}`}`);
  }
  return { ok: allOk, message: lines.join("; ").slice(0, 300) };
}

/** The one email test: to the signed-in person only (the address is never typed in, so it cannot be used to mail anyone else). */
export interface EmailTestSender { send: (to: string, subject: string, text: string) => Promise<{ ok: boolean; error?: string }> }
export async function sendTestEmailToPerson(personEmail: string | null | undefined, sender: EmailTestSender): Promise<TestOutcome> {
  const to = (personEmail ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail("Your account has no valid email address to send the test to.");
  const r = await sender.send(to, "Test email from your workspace", "This is a test message from Settings, Integrations. If you can read it, your email connection works.");
  return r.ok ? ok(`A test email was sent to ${to}. Check your inbox.`) : fail(`The test email was not sent${r.error ? `: ${r.error}` : ""}.`);
}
