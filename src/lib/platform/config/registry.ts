/**
 * The server keys that are set in Platform Console → Integrations instead of the environment (pure; shared by the form and the store).
 * The environment keeps only what is needed before the database can be read: MONGODB_URI, SAAS_ADMIN_EMAIL / SAAS_ADMIN_PASSWORD,
 * PLATFORM_ENCRYPTION_KEY (the key that opens everything saved here, so it cannot itself be saved here) and SAAS_HOSTS. CRON_SECRET and
 * EMAIL_DEV_TO are saved below; Vercel Cron can only send a secret that is also in the Vercel environment (see the field's help). A key set here wins; the same-named environment variable is only a fallback for
 * deployments that still have it.
 */

export interface ConfigField {
  /** Also the environment variable name used as the fallback. */
  key: string;
  label: string;
  /** Encrypted at rest and never shown again (only its last 4 characters). */
  secret: boolean;
  help: string;
  placeholder?: string;
  /** The form offers a button that fills in a fresh random value (for secrets you make up yourself). */
  generate?: boolean;
}

export interface ConfigSection {
  id: string;
  title: string;
  description: string;
  fields: ConfigField[];
}

export const CONFIG_SECTIONS: ConfigSection[] = [
  {
    id: "ai",
    title: "AI",
    description: "SelfRun's OpenAI account. Every company that has not saved its own key uses it for AI features (chatbots, assistants, Intelligence, content generation) run on it and are metered against the company's plan.",
    fields: [{ key: "OPENAI_API_KEY", label: "OpenAI API key", secret: true, help: "From platform.openai.com → API keys.", placeholder: "sk-…" }],
  },
  {
    id: "voice",
    title: "Voice & messaging",
    description: "Voice replies and WhatsApp messages for companies that have not connected their own accounts.",
    fields: [
      { key: "ELEVENLABS_API_KEY", label: "ElevenLabs API key", secret: true, help: "Voice mode." },
      { key: "TWILIO_ACCOUNT_SID", label: "Twilio account SID", secret: false, help: "Starts with AC.", placeholder: "AC…" },
      { key: "TWILIO_AUTH_TOKEN", label: "Twilio auth token", secret: true, help: "Twilio console → Account info." },
      { key: "TWILIO_WHATSAPP_FROM", label: "Twilio WhatsApp sender", secret: false, help: "The WhatsApp-enabled number, e.g. whatsapp:+14155238886.", placeholder: "whatsapp:+…" },
    ],
  },
  {
    id: "search",
    title: "Search & calls",
    description: "Optional services SEO and Messenger use. A company that saves its own in Settings → Integrations uses those instead.",
    fields: [
      { key: "PAGESPEED_API_KEY", label: "PageSpeed Insights API key", secret: true, help: "Page-speed audits in the SEO product." },
      { key: "GOOGLE_SEO_CLIENT_EMAIL", label: "Google service-account email", secret: false, help: "Search Console, Analytics and Indexing for the SEO product.", placeholder: "name@project.iam.gserviceaccount.com" },
      { key: "GOOGLE_SEO_PRIVATE_KEY", label: "Google service-account private key", secret: true, help: "The private_key value from the JSON key file (-----BEGIN PRIVATE KEY-----…)." },
      { key: "LIVEKIT_URL", label: "LiveKit server URL", secret: false, help: "Video and audio for DealFlow Meetings, for companies that have not connected their own LiveKit.", placeholder: "wss://your-project.livekit.cloud" },
      { key: "LIVEKIT_API_KEY", label: "LiveKit API key", secret: false, help: "" },
      { key: "LIVEKIT_API_SECRET", label: "LiveKit API secret", secret: true, help: "" },
      { key: "MESSENGER_TURN_URL", label: "TURN server URL", secret: false, help: "Relay for Messenger calls behind strict firewalls.", placeholder: "turn:turn.example.com:3478" },
      { key: "MESSENGER_TURN_USERNAME", label: "TURN username", secret: false, help: "" },
      { key: "MESSENGER_TURN_CREDENTIAL", label: "TURN credential", secret: true, help: "" },
    ],
  },
  {
    id: "push",
    title: "Push notifications",
    description: "SelfRun's key pair for push notifications, used by every company that has not saved its own. Create it once with `npx web-push generate-vapid-keys` and do not change it later — every device would have to subscribe again.",
    fields: [
      { key: "VAPID_PUBLIC_KEY", label: "VAPID public key", secret: false, help: "The public half of the pair." },
      { key: "VAPID_PRIVATE_KEY", label: "VAPID private key", secret: true, help: "The private half of the pair." },
      { key: "VAPID_SUBJECT", label: "Contact (optional)", secret: false, help: "A mailto: address or https URL the push services can contact. Defaults to the platform admin email.", placeholder: "mailto:support@example.com" },
    ],
  },
  {
    id: "storage",
    title: "File storage",
    description: "Where every uploaded file and backup is kept (Vercel Blob, private store). Without it local development stores files on disk.",
    fields: [{ key: "BLOB_READ_WRITE_TOKEN", label: "Blob read/write token", secret: true, help: "Vercel → Storage → your Blob store → .env.local tab.", placeholder: "vercel_blob_rw_…" }],
  },
  {
    id: "cron",
    title: "Scheduled jobs",
    description: "The secret that every scheduled-job URL requires (Authorization: Bearer …). The in-app scheduler and Run now need no secret; this is for schedulers that call the URLs: Vercel Cron, GitHub Actions, cron-job.org, a host's cron.",
    fields: [{ key: "CRON_SECRET", label: "Cron secret", secret: true, generate: true, help: "Use 32 or more random characters. Vercel Cron sends the value of the CRON_SECRET environment variable of the Vercel project, so on Vercel set the same value there too (Vercel cannot read this page); every other scheduler can use this one." }],
  },
  {
    id: "testing",
    title: "Email testing",
    description: "For testing only. While this is set, every email the platform sends goes to this one inbox instead of its real recipient, and the real recipient is named in the subject. Needed while the email provider has no verified domain. Leave it empty in normal use: customers' emails are not delivered while it is set.",
    fields: [{ key: "EMAIL_DEV_TO", label: "Send all email to", secret: false, help: "One email address. Remove it to deliver mail normally.", placeholder: "you@example.com" }],
  },
  {
    id: "security",
    title: "Upload safety check",
    description: "Optional. Looks uploaded files up in VirusTotal by SHA-256 (only the hash is sent). The built-in upload safety check always runs.",
    fields: [{ key: "VIRUSTOTAL_API_KEY", label: "VirusTotal API key", secret: true, help: "From virustotal.com → your profile → API key." }],
  },
];

export const CONFIG_FIELDS: Record<string, ConfigField> = Object.fromEntries(CONFIG_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f])));

export const CONFIG_SECRET_CONTEXT = (key: string) => `config:${key}`;
