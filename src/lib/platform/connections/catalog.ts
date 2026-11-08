/**
 * The third-party services a workspace can connect — ONE place, for the whole company. Configure a service here once
 * and every product and automation uses it (OpenAI for the AI features everywhere, SMTP/Twilio for notifications,
 * ElevenLabs for voice, Google for search data, the social apps for publishing …). Each company brings its own
 * accounts: nothing is shared with the platform or with other companies.
 *
 * Pure data (client-safe). The saved values live in `workspace_connections` (see `store.ts`), secrets encrypted.
 */

export type FieldKind = "text" | "secret" | "textarea" | "select";

export interface ConnectionField {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}

export type ConnectionGroup = "email" | "messaging" | "push" | "ai" | "social" | "search" | "realtime" | "payments" | "other";

export const GROUP_LABELS: Record<ConnectionGroup, { title: string; description: string }> = {
  email: { title: "Email", description: "How your workspace sends emails — invitations, notifications, reports and automations." },
  push: { title: "Push notifications", description: "Your own web-push keys, so the installed app sends notifications under your identity." },
  messaging: { title: "WhatsApp", description: "WhatsApp messages from your automations and products." },
  ai: { title: "AI & Voice", description: "Your own AI keys. Powers the assistants, chatbots, content generation and voice in every product." },
  social: { title: "Social & Advertising", description: "App credentials for publishing to Facebook, Instagram, LinkedIn, YouTube and Google Business." },
  search: { title: "Search & Analytics", description: "Google Search Console, Analytics, Indexing and PageSpeed for your SEO product." },
  realtime: { title: "Calls & Realtime", description: "Servers behind Messenger voice and video calls." },
  payments: { title: "Payments", description: "Collect money and pay out from your own accounts." },
  other: { title: "Website, domains & automation", description: "Managed in their own settings — shown here so everything is in one place." },
};

export interface ConnectionProvider {
  key: string;
  name: string;
  group: ConnectionGroup;
  description: string;
  /** Products / features that use it. */
  usedBy: string[];
  fields: ConnectionField[];
  docsUrl?: string;
  /** Has a "Test connection" check. */
  testable?: boolean;
  /** Configured on another settings page: this entry only shows the status and links there. */
  managedElsewhere?: { href: string; label: string };
  /** Shown as a note under the form. */
  note?: string;
}

const secret = (key: string, label: string, help?: string, required = true): ConnectionField => ({ key, label, kind: "secret", help, required });
const text = (key: string, label: string, placeholder?: string, help?: string, required = true): ConnectionField => ({ key, label, kind: "text", placeholder, help, required });

export const CONNECTION_PROVIDERS: ConnectionProvider[] = [
  // ── Email ────────────────────────────────────────────────────────────
  {
    key: "smtp", name: "SMTP", group: "email", testable: true,
    description: "Send workspace email through any SMTP server — your own mail host, Google Workspace, Microsoft 365, Zoho, Amazon SES, Brevo and more.",
    usedBy: ["Invitations", "Notifications", "Automations", "HRMS", "Billing mails", "Reports"],
    fields: [
      text("host", "SMTP host", "smtp.yourcompany.com"),
      text("port", "Port", "587", "587 (STARTTLS) or 465 (SSL) are the usual ones."),
      { key: "secure", label: "Encryption", kind: "select", defaultValue: "starttls", options: [{ value: "starttls", label: "STARTTLS (port 587)" }, { value: "ssl", label: "SSL/TLS (port 465)" }, { value: "none", label: "None" }] },
      text("username", "Username", "you@yourcompany.com"),
      secret("password", "Password / app password"),
      text("fromEmail", "From email", "no-reply@yourcompany.com"),
      text("fromName", "From name", "Your Company", undefined, false),
    ],
  },
  {
    key: "resend", name: "Resend", group: "email", testable: true, docsUrl: "https://resend.com/docs",
    description: "Send workspace email through Resend's API.",
    usedBy: ["Invitations", "Notifications", "Automations", "Reports"],
    fields: [secret("apiKey", "API key", "Starts with re_"), text("from", "From address", "Your Company <no-reply@yourcompany.com>")],
  },
  {
    key: "sendgrid", name: "SendGrid", group: "email", testable: true, docsUrl: "https://docs.sendgrid.com",
    description: "Send workspace email through SendGrid's API.",
    usedBy: ["Invitations", "Notifications", "Automations", "Reports"],
    fields: [secret("apiKey", "API key", "Starts with SG."), text("from", "From address", "no-reply@yourcompany.com", "Must be a verified sender in SendGrid.")],
  },
  // ── WhatsApp ───────────────────────────────────────────────────
  {
    key: "twilio", name: "Twilio", group: "messaging", testable: true, docsUrl: "https://www.twilio.com/docs",
    description: "Send WhatsApp messages from automations (and any product that notifies by message). Also the phone line for AgentOS voice agents: your Twilio numbers are imported so agents can make and answer calls.",
    usedBy: ["Automations", "Notifications", "Reminders", "Voice calls (AgentOS)"],
    fields: [
      text("accountSid", "Account SID", "AC…"), secret("authToken", "Auth token"),
      text("whatsappFrom", "WhatsApp sender", "whatsapp:+14155550123", "Your approved WhatsApp sender, if you use WhatsApp.", false),
      // Live phone console (AgentOS): lets a team member listen to a call and take over from the browser.
      text("apiKeySid", "API key SID (live calls)", "SK…", "Twilio Console → Account → API keys. Needed only to listen to and take over AI calls from the browser.", false),
      secret("apiKeySecret", "API key secret (live calls)", "Shown once when you create the API key.", false),
      text("twimlAppSid", "TwiML App SID (live calls)", "AP…", "A TwiML App whose Voice request URL is the address shown in CommandOS → AgentOS settings → Phone → Live calls setup.", false),
    ],
  },
  {
    key: "whatsapp-cloud", name: "WhatsApp Business (Meta Cloud API)", group: "messaging", testable: true, docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    description: "Send WhatsApp messages straight through Meta's WhatsApp Business Cloud API.",
    usedBy: ["Automations", "Notifications"],
    fields: [text("phoneNumberId", "Phone number ID", "1234567890"), secret("accessToken", "Permanent access token"), text("businessAccountId", "Business account ID", undefined, undefined, false)],
  },
  // ── AI & Voice ───────────────────────────────────────────────────────
  {
    key: "openai", name: "OpenAI", group: "ai", testable: true, docsUrl: "https://platform.openai.com/api-keys",
    description: "Your OpenAI key powers every AI feature in the workspace: the website chatbot, AgentOS, Intelligence, social-content generation and the business assistant. AI usage is billed to your OpenAI account.",
    usedBy: ["AI Bots", "Website chatbot (LMS)", "Intelligence", "SMMS content generator", "Workspace assistant", "Knowledge bases"],
    fields: [secret("apiKey", "API key", "Starts with sk-"), text("organization", "Organization ID", "org_…", "Optional.", false), text("project", "Project ID", "proj_…", "Optional.", false)],
  },
  {
    key: "elevenlabs", name: "ElevenLabs", group: "ai", testable: true, docsUrl: "https://elevenlabs.io/docs",
    description: "Voice for the website chatbot — speech-to-text and natural text-to-speech.",
    usedBy: ["Website chatbot voice mode"],
    fields: [secret("apiKey", "API key")],
  },
  {
    key: "gemini", name: "Google Gemini (video)", group: "ai", testable: false, docsUrl: "https://aistudio.google.com/apikey",
    description: "Your Gemini API key renders the AI UGC Studio videos (Gemini Omni Flash, Veo). Video generation is billed to your Google account by the second of video; SelfRun never pays for it, so there is no shared fallback key.",
    usedBy: ["AI UGC Studio (ViralPulse)"],
    fields: [secret("apiKey", "API key", "Starts with AIza")],
  },
  // ── Social & Advertising ─────────────────────────────────────────────
  {
    key: "meta", name: "Facebook & Instagram (Meta app)", group: "social", docsUrl: "https://developers.facebook.com/apps",
    description: "Your Meta developer app. After saving it, connect your Pages and Instagram accounts from the Social Media product.",
    usedBy: ["Social Media (SMMS)"],
    managedElsewhere: undefined,
    fields: [text("appId", "App ID"), secret("appSecret", "App secret")],
    note: "Set the app's Valid OAuth Redirect URI to  <your workspace address>/api/viralpulse-ai/oauth/meta/callback  (the exact address is shown in ViralPulse > Settings > Connected accounts).",
  },
  {
    key: "google", name: "YouTube & Google Business (Google OAuth app)", group: "social", docsUrl: "https://console.cloud.google.com/apis/credentials",
    description: "Your Google OAuth client for YouTube and Google Business Profile publishing. Connect the accounts from the Social Media product afterwards.",
    usedBy: ["Social Media (SMMS)"],
    fields: [text("clientId", "OAuth client ID"), secret("clientSecret", "OAuth client secret")],
    note: "Authorised redirect URI:  <your workspace address>/api/viralpulse-ai/oauth/google/callback  (the exact address is shown in ViralPulse > Settings > Connected accounts).",
  },
  {
    key: "linkedin", name: "LinkedIn (app)", group: "social", docsUrl: "https://www.linkedin.com/developers/apps",
    description: "Your LinkedIn app for publishing to your company page and profile.",
    usedBy: ["Social Media (SMMS)"],
    fields: [text("clientId", "Client ID"), secret("clientSecret", "Client secret")],
    note: "Authorised redirect URL:  <your workspace address>/api/viralpulse-ai/oauth/linkedin/callback  (the exact address is shown in ViralPulse > Settings > Connected accounts).",
  },
  {
    key: "x", name: "X (developer app)", group: "social", docsUrl: "https://developer.x.com/en/portal/dashboard",
    description: "Your X developer app (OAuth 2.0 with PKCE) for posting to your X account. X bills posting by use, so keep credits on the developer account.",
    usedBy: ["Social Media (SMMS)"],
    fields: [text("clientId", "OAuth 2.0 Client ID"), secret("clientSecret", "OAuth 2.0 Client Secret")],
    note: "Set the app to a Web App / Automated App (confidential client), turn on OAuth 2.0, and add the callback URL:  <your workspace address>/api/viralpulse-ai/oauth/x/callback  (the exact address is shown in ViralPulse > Settings > Connected accounts). Permissions: Read and write.",
  },
  // ── Search & Analytics ───────────────────────────────────────────────
  {
    key: "google-service-account", name: "Google (Search Console, Analytics & Indexing)", group: "search", testable: true, docsUrl: "https://console.cloud.google.com/iam-admin/serviceaccounts",
    description: "A Google service account that reads your Search Console and Analytics 4 data and requests indexing. Add its email as a user on your Search Console property and GA4 property.",
    usedBy: ["SEO product", "Indexing requests", "Dashboard SEO stats"],
    fields: [
      text("clientEmail", "Service-account email", "name@project.iam.gserviceaccount.com"),
      { key: "privateKey", label: "Private key", kind: "secret", required: true, help: "The private_key value from the JSON key file (-----BEGIN PRIVATE KEY-----…)." },
    ],
  },
  {
    key: "pagespeed", name: "Google PageSpeed Insights", group: "search", testable: true, docsUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    description: "API key for page-speed audits in the SEO product.",
    usedBy: ["SEO product"],
    fields: [secret("apiKey", "API key")],
  },
  // ── Push ─────────────────────────────────────────────────────────────
  {
    key: "vapid", name: "Web Push (VAPID keys)", group: "push", testable: true,
    description: "Your own VAPID key pair for push notifications to your team's and visitors' devices. Without it, SelfRun's keys are used. Create the pair once with  npx web-push generate-vapid-keys  and do not change it later: every device would have to subscribe again.",
    usedBy: ["Push notifications", "Website push"],
    fields: [text("publicKey", "Public key"), secret("privateKey", "Private key"), text("subject", "Contact", "mailto:support@yourcompany.com", "A mailto: address or https URL the push services can contact.", false)],
  },
  // ── Calls & Realtime ─────────────────────────────────────────────────
  {
    key: "turn", name: "TURN server (calls)", group: "realtime",
    description: "Relay server for Messenger voice and video calls behind strict firewalls. Optional — calls work on most networks without it.",
    usedBy: ["Messenger calls"],
    fields: [text("url", "TURN URL", "turn:turn.yourcompany.com:3478"), text("username", "Username", undefined, undefined, false), secret("credential", "Credential", undefined, false)],
  },
  {
    key: "livekit", name: "LiveKit (meetings)", group: "realtime", testable: true, docsUrl: "https://docs.livekit.io/home/cloud/keys-and-tokens/",
    description: "The video and audio server behind DealFlow Meetings. Use your own LiveKit Cloud project or self-hosted server. Without it, SelfRun's server is used and its use counts against your plan.",
    usedBy: ["DealFlow Meetings"],
    fields: [text("url", "Server URL", "wss://your-project.livekit.cloud"), text("apiKey", "API key", "API…"), secret("apiSecret", "API secret")],
  },
  // ── Managed on their own pages ───────────────────────────────────────
  {
    key: "razorpay", name: "Razorpay", group: "payments", description: "Collect invoice payments and pay salaries from your own Razorpay account.", usedBy: ["Finance", "Payroll", "Payment links"],
    fields: [], managedElsewhere: { href: "/commandos/settings/payments", label: "Payments settings" },
  },
  {
    key: "website-tracking", name: "Analytics, tracking & site verification", group: "other",
    description: "Google Analytics, Tag Manager, Clarity, Meta Pixel, live chat, any custom script, and Search Console / Bing verification for your website.",
    usedBy: ["Website"], fields: [], managedElsewhere: { href: "/sitecraft-ai/settings", label: "CMS → Settings" },
  },
  {
    key: "domains", name: "Custom domain", group: "other", description: "Serve your workspace and website from your own domain with automatic SSL.", usedBy: ["Website", "Workspace"],
    fields: [], managedElsewhere: { href: "/commandos/settings/domains", label: "Domains" },
  },
  {
    key: "webhooks", name: "Webhooks & automations", group: "other", description: "Send signed webhooks and run email, in-app and WhatsApp actions when something happens.", usedBy: ["Automations"],
    fields: [], managedElsewhere: { href: "/commandos/settings/automations", label: "Automations" },
  },
  {
    key: "social-accounts", name: "Connected social accounts", group: "other", description: "Connect and manage your Facebook, Instagram, LinkedIn, YouTube and Google Business accounts.", usedBy: ["Social Media"],
    fields: [], managedElsewhere: { href: "/viralpulse-ai", label: "Social Media product" },
  },
];

export const providerByKey = new Map(CONNECTION_PROVIDERS.map((p) => [p.key, p]));


/**
 * Services SelfRun can provide to every company with its own keys (Platform Console → Integrations). A company that saves its own keys here
 * uses its own account; one that does not uses SelfRun's, counted against its plan. Email works the same way (see `email/index.ts`).
 * Payments and the social apps never fall back: money and publishing identities stay with the company.
 */
export const PLATFORM_FALLBACK: readonly string[] = ["openai", "elevenlabs", "twilio", "pagespeed", "turn", "google-service-account", "livekit"];
/** Hidden from a company's Integrations page: the automations tile has its own page. */
export const HIDDEN_FROM_COMPANIES: readonly string[] = ["webhooks"];
