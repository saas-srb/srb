/**
 * LEDGER IN CODE: every company Integrations card and where its platform default is set today. Pure data, no behaviour: nothing is read or migrated from here yet.
 * `test:platform-defaults` fails when a card, a Console server key or a card field is added without being accounted for, so the two-section Console
 * (docs/platform-defaults.md) can be built card by card without losing one.
 *
 *   platform     the platform default exists and companies without their own use it
 *   company-only deliberately never shared with companies (the reason says why)
 *   gap          a platform default is wanted but does not exist yet
 */
export type PlatformCounterpart =
  | { status: "platform"; where: "console-integrations" | "console-payments"; keys: string[] }
  | { status: "company-only"; reason: string; platformKeys?: string[] }
  | { status: "gap"; missing: string };

export const INTEGRATION_DEFAULTS: Record<string, PlatformCounterpart> = {
  smtp: { status: "platform", where: "console-integrations", keys: ["PLATFORM_SMTP_HOST", "PLATFORM_SMTP_PORT", "PLATFORM_SMTP_SECURE", "PLATFORM_SMTP_USERNAME", "PLATFORM_SMTP_PASSWORD", "PLATFORM_SMTP_FROM"] },
  resend: { status: "platform", where: "console-integrations", keys: ["integrations:email.resendApiKey", "integrations:email.from"] },
  sendgrid: { status: "platform", where: "console-integrations", keys: ["PLATFORM_SENDGRID_API_KEY", "PLATFORM_SENDGRID_FROM"] },
  twilio: { status: "platform", where: "console-integrations", keys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "TWILIO_SMS_FROM"] },
  "whatsapp-cloud": { status: "company-only", reason: "WhatsApp rules require business-initiated messages to use templates approved for the sending business, so a shared platform number cannot send a company's messages." },
  openai: { status: "platform", where: "console-integrations", keys: ["OPENAI_API_KEY"] },
  elevenlabs: { status: "platform", where: "console-integrations", keys: ["ELEVENLABS_API_KEY"] },
  gemini: { status: "company-only", reason: "Video generation is billed per second to the key's owner; there is deliberately no shared fallback." },
  meta: { status: "company-only", reason: "Publishing identity stays with the company; the deployment's app keys serve only the platform owner's own workspace." },
  google: { status: "company-only", reason: "Publishing identity stays with the company; the deployment's app keys serve only the platform owner's own workspace." },
  linkedin: { status: "company-only", reason: "Publishing identity stays with the company; the deployment's app keys serve only the platform owner's own workspace." },
  x: { status: "company-only", reason: "Publishing identity stays with the company; no shared app exists." },
  "google-service-account": { status: "platform", where: "console-integrations", keys: ["GOOGLE_SEO_CLIENT_EMAIL", "GOOGLE_SEO_PRIVATE_KEY"] },
  pagespeed: { status: "platform", where: "console-integrations", keys: ["PAGESPEED_API_KEY"] },
  vapid: { status: "platform", where: "console-integrations", keys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] },
  turn: { status: "platform", where: "console-integrations", keys: ["MESSENGER_TURN_URL", "MESSENGER_TURN_USERNAME", "MESSENGER_TURN_CREDENTIAL"] },
  livekit: { status: "platform", where: "console-integrations", keys: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] },
  razorpay: { status: "company-only", reason: "Customer money must reach the company's own account; the platform's Razorpay (Console, Payments) is only for the platform's own billing.", platformKeys: ["console-payments:razorpay"] },
  "website-tracking": { status: "company-only", reason: "Tracking ids belong to the company's own website." },
  domains: { status: "platform", where: "console-integrations", keys: ["integrations:domains.vercelToken"] },
  webhooks: { status: "company-only", reason: "A company's own automation endpoints; hidden from the Integrations cards." },
  storage: { status: "platform", where: "console-integrations", keys: ["FILE_BACKEND", "BLOB_READ_WRITE_TOKEN"] },
  "social-accounts": { status: "company-only", reason: "A company's own connected social accounts." },
};

/** Console server keys that serve the platform itself and have no company card (builds, jobs, safety, testing, India SMS registration). */
export const PLATFORM_ONLY_KEYS: Record<string, string> = {
  GITHUB_DISPATCH_TOKEN: "App builds", GITHUB_REPOSITORY: "App builds", DESKTOP_BUILD_SECRET: "App builds", GITHUB_WORKFLOW_FILE: "App builds", DESKTOP_RELEASES_REPO: "App builds",
  DLT_ENTITY_ID: "India SMS registration of the platform's sender", DLT_TEMPLATE_ID: "India SMS registration of the platform's sender", DLT_SENDER_ID: "India SMS registration of the platform's sender",
  CRON_SECRET: "Scheduled jobs", EMAIL_DEV_TO: "Email testing", VIRUSTOTAL_API_KEY: "Upload safety check",
};
