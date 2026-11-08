import "server-only";
import nodemailer from "nodemailer";
import webpush from "web-push";
import { getServiceAccountToken } from "@/lib/google-service-account";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { recordTestResult } from "@/lib/platform/connections/store";

/** A light, read-only check that the saved credentials work. Never sends a message or spends money. */
export type TestOutcome = { ok: boolean; message: string };

const TIMEOUT = 12_000;
const get = (url: string, headers: Record<string, string>) => fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
const fail = (message: string): TestOutcome => ({ ok: false, message });
const httpResult = async (res: Response, label: string): Promise<TestOutcome> => {
  if (res.ok) return { ok: true, message: `${label} accepted the credentials.` };
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string; message?: string };
  const detail = typeof body.error === "string" ? body.error : (body.error?.message ?? body.message ?? "");
  return fail(`${label} replied ${res.status}${detail ? `: ${detail}` : ""}.`);
};

async function run(provider: string, v: Record<string, string>): Promise<TestOutcome> {
  switch (provider) {
    case "openai":
      return httpResult(await get("https://api.openai.com/v1/models?limit=1", { Authorization: `Bearer ${v.apiKey}`, ...(v.organization ? { "OpenAI-Organization": v.organization } : {}), ...(v.project ? { "OpenAI-Project": v.project } : {}) }), "OpenAI");
    case "elevenlabs":
      return httpResult(await get("https://api.elevenlabs.io/v1/user", { "xi-api-key": v.apiKey }), "ElevenLabs");
    case "resend":
      return httpResult(await get("https://api.resend.com/domains", { Authorization: `Bearer ${v.apiKey}` }), "Resend");
    case "sendgrid":
      return httpResult(await get("https://api.sendgrid.com/v3/scopes", { Authorization: `Bearer ${v.apiKey}` }), "SendGrid");
    case "twilio":
      return httpResult(await get(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(v.accountSid)}.json`, { Authorization: `Basic ${Buffer.from(`${v.accountSid}:${v.authToken}`).toString("base64")}` }), "Twilio");
    case "whatsapp-cloud":
      return httpResult(await get(`https://graph.facebook.com/v23.0/${encodeURIComponent(v.phoneNumberId)}`, { Authorization: `Bearer ${v.accessToken}` }), "WhatsApp Cloud API");
    case "pagespeed":
      return httpResult(await get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fexample.com&category=performance&key=${encodeURIComponent(v.apiKey)}`, {}), "PageSpeed");
    case "google-service-account": {
      try {
        await getServiceAccountToken({ clientEmail: v.clientEmail, privateKey: v.privateKey }, ["https://www.googleapis.com/auth/webmasters.readonly"]);
        return { ok: true, message: "Google issued an access token for this service account. Remember to add its email as a user on your Search Console and Analytics properties." };
      } catch (err) {
        return fail(`Google rejected the key: ${err instanceof Error ? err.message : "invalid credentials"}.`);
      }
    }
    case "livekit": {
      // Lists rooms (read-only) with a short-lived admin token: proves the URL, key and secret belong together.
      const { RoomServiceClient } = await import("livekit-server-sdk");
      const host = (v.url || "").replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      try {
        await new RoomServiceClient(host, v.apiKey, v.apiSecret).listRooms();
        return { ok: true, message: "LiveKit accepted the URL and credentials." };
      } catch (err) {
        return fail(`LiveKit rejected the credentials: ${err instanceof Error ? err.message : "check failed"}.`);
      }
    }
    case "smtp": {
      const transporter = nodemailer.createTransport({
        host: v.host, port: Number(v.port) || 587, secure: v.secure === "ssl", requireTLS: v.secure === "starttls", ignoreTLS: v.secure === "none",
        auth: v.username ? { user: v.username, pass: v.password } : undefined, connectionTimeout: TIMEOUT, greetingTimeout: TIMEOUT, socketTimeout: TIMEOUT,
      });
      try {
        await transporter.verify();
        return { ok: true, message: "Connected to the SMTP server and signed in." };
      } catch (err) {
        return fail(`SMTP check failed: ${err instanceof Error ? err.message : "could not connect"}.`);
      }
    }
    case "vapid":
      try {
        webpush.setVapidDetails(v.subject || "mailto:support@example.com", v.publicKey, v.privateKey);
        return { ok: true, message: "These two keys are a valid pair." };
      } catch {
        return fail("These two keys aren't a valid pair. Generate them together with  npx web-push generate-vapid-keys.");
      }
    default:
      return { ok: true, message: "Saved. This service has no automatic check — it is verified the first time a product uses it." };
  }
}

/** Runs the check against the CURRENT workspace's connection and remembers the result. */
export async function testConnection(provider: string): Promise<TestOutcome> {
  const values = await connectionValues(provider);
  if (!values) return fail("Nothing is saved for this connection yet.");
  let outcome: TestOutcome;
  try {
    outcome = await run(provider, values);
  } catch (err) {
    outcome = fail(err instanceof Error && err.name === "TimeoutError" ? "The service didn't answer in time." : `Check failed: ${err instanceof Error ? err.message : "unknown error"}.`);
  }
  await recordTestResult(provider, outcome.ok, outcome.message).catch(() => {});
  return outcome;
}
