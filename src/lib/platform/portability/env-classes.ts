/**
 * The portability table in code: every environment variable the app reads, and what happens to it when the app is deployed on a new
 * Vercel account with only MONGODB_URI and SAAS_HOSTS. A test (`scripts/test-portability.ts`) fails when `src` reads a variable that is
 * not listed here, so a new variable can never silently break a move.
 *
 *   bootstrap         needed before the database can be read (the only two a deployment must have)
 *   adopted           copied into the database the first time it is seen (`adopt/`), then served from there
 *   deployment-bound  belongs to one deployment/account; never copied (read fresh from each deployment's own environment)
 *   optional          tuning or branding with a default; safe to be absent or different
 */
export type EnvClass = "bootstrap" | "adopted" | "deployment-bound" | "optional";

const list = (cls: EnvClass, names: string): [string, EnvClass][] => names.split(/\s+/).filter(Boolean).map((n) => [n, cls]);

export const ENV_CLASSES: Record<string, EnvClass> = Object.fromEntries([
  ...list("bootstrap", "MONGODB_URI SAAS_HOSTS"),
  ...list("deployment-bound", "CRON_SECRET SAAS_ADMIN_EMAIL SAAS_ADMIN_PASSWORD VERCEL VERCEL_URL VERCEL_PROJECT_ID VERCEL_TEAM_ID VERCEL_API_URL NODE_ENV NEXT_RUNTIME PORT RUN_SCHEDULER PLATFORM_WILDCARD_SUBDOMAINS PLATFORM_ENCRYPTION_KEY"),
  ...list(
    "adopted",
    `PLATFORM_ENCRYPTION_KEY_PREVIOUS SMMS_ENCRYPTION_KEY_PREVIOUS HRMS_ENCRYPTION_KEY FMS_ENCRYPTION_KEY DLMS_ENCRYPTION_KEY SMMS_ENCRYPTION_KEY
     VERCEL_API_TOKEN PLATFORM_ROOT_DOMAIN RESEND_API_KEY EMAIL_PROVIDER EMAIL_FROM DOMAIN_PROVIDER
     BLOB_READ_WRITE_TOKEN BLOB_STORE_ID BLOB_WEBHOOK_PUBLIC_KEY
     GITHUB_DISPATCH_TOKEN GITHUB_REPOSITORY GITHUB_WORKFLOW_FILE GITHUB_WORKFLOW_REF GITHUB_API_URL DESKTOP_BUILD_SECRET DESKTOP_RELEASES_REPO
     RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET RAZORPAY_BILLING_WEBHOOK_SECRET RAZORPAY_ACCOUNT_NUMBER HRMS_PAYOUT_PROVIDER
     API_TRANSPORT_SECRET LEADS_API_SECRET HRMS_API_SECRET PMS_API_SECRET INDEXING_API_SECRET CHATBOT_ADMIN_API_SECRET WALLET_CRON_SECRET
     OPENAI_CHATBOT_VECTOR_STORE_ID SMMS_PUBLIC_BASE_URL CHATBOT_CRAWL_BASE_URL`,
  ),
  ...list(
    "optional",
    `AI_WEBSITE_ON_SIGNUP ALLOW_LOCAL_APP_BUILDS BING_SITE_VERIFICATION CHATBOT_IP_SALT FFMPEG_PATH GOOGLE_SITE_VERIFICATION IMAGE_FONT_DIR PLAYBOOK_FONT_DIR
     LINKEDIN_API_VERSION MESSENGER_CALL_MAX META_ADS_GRAPH_VERSION META_GRAPH_VERSION PANEL_AI_MODEL PAYMENT_CODE_DISABLED REQUIRE_PRIVILEGED_MFA
     SAAS_HELLO_EMAIL SAAS_OFFER_ENDS_AT SAAS_OPERATOR_NAME SAAS_PRIVACY_EMAIL SAAS_SALES_EMAIL SAAS_SECURITY_EMAIL SAAS_SOCIAL_URLS SAAS_SUPPORT_EMAIL SAAS_TWITTER_HANDLE
     SECURITY_STRICT SESSION_BIND_IP TWO_STEP_PROMPT TWO_STEP_SKIP_HOURS WEBSITE_AI_FALLBACK_MODEL WEBSITE_AI_IMAGE_MODEL WEBSITE_AI_MIN_TOKENS WEBSITE_AI_MODEL`,
  ),
]);

/** Adopted variables handled by their own rule (integrations document, keyring) rather than the generic overlay. */
export const INTEGRATION_ENV = new Set(["RESEND_API_KEY", "EMAIL_PROVIDER", "EMAIL_FROM", "DOMAIN_PROVIDER", "PLATFORM_ROOT_DOMAIN", "VERCEL_API_TOKEN"]);
/** Legacy per-product encryption keys: copied into the keyring as extra versions (`previous` ones are kept for decrypting only). */
export const KEYRING_ENV: Record<string, { purpose: string | null; previous: boolean }> = {
  HRMS_ENCRYPTION_KEY: { purpose: "hrms", previous: false },
  FMS_ENCRYPTION_KEY: { purpose: "fms", previous: false },
  DLMS_ENCRYPTION_KEY: { purpose: "dlms", previous: false },
  SMMS_ENCRYPTION_KEY: { purpose: "smms", previous: false },
  SMMS_ENCRYPTION_KEY_PREVIOUS: { purpose: "smms", previous: true },
  PLATFORM_ENCRYPTION_KEY_PREVIOUS: { purpose: null, previous: true },
};

/** The adopted variables the generic overlay stores (everything adopted that has no rule of its own; registry keys are added at run time). */
export const OVERLAY_ENV: string[] = Object.entries(ENV_CLASSES)
  .filter(([n, c]) => c === "adopted" && !INTEGRATION_ENV.has(n) && !(n in KEYRING_ENV))
  .map(([n]) => n);
