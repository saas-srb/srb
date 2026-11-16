/**
 * Every API route handler and server-action file must have a recognised access check (see `scripts/test-guard-sweep.ts`) OR be listed here with the
 * reason it is open. This is the PERMANENT guard against a new unguarded route: the sweep test fails when a file is in neither place.
 * Paths are relative to `src/app`. Reviewed by reading each file (P8-A, 2026-11-17).
 */
export type OpenKind = "public-page-asset" | "pre-session-flow" | "provider-webhook" | "public-form" | "public-widget" | "legacy-redirect" | "guarded-by-wrapper";

export const OPEN_ROUTES: Record<string, { kind: OpenKind; reason: string }> = {
  // ── Static or public assets ──
  "(platform)/saas/og/route.tsx": { kind: "public-page-asset", reason: "Social preview image of the public marketing site." },
  ".well-known/security.txt/route.ts": { kind: "public-page-asset", reason: "Well-known file for researchers." },
  "favicon.ico/route.ts": { kind: "public-page-asset", reason: "The site icon: a public static image." },
  "llms.txt/route.ts": { kind: "public-page-asset", reason: "Public site description for crawlers and assistants." },
  "manifest.webmanifest/route.ts": { kind: "public-page-asset", reason: "App manifest (name and icons only)." },
  "pwa/icons/[file]/route.tsx": { kind: "public-page-asset", reason: "App icons: public static images." },
  "robots.txt/route.ts": { kind: "public-page-asset", reason: "Crawler rules: public by definition." },
  // ── Before there is a session ──
  "(platform)/saas/actions.ts": { kind: "public-form", reason: "Public marketing inquiry form: only the platform host, honeypot field, rate limited." },
  "(platform)/signup/actions.ts": { kind: "pre-session-flow", reason: "Company sign-up before any account exists." },
  "(products)/clientos/forgot-password/actions.ts": { kind: "pre-session-flow", reason: "Client portal password reset request." },
  "(products)/clientos/join/actions.ts": { kind: "pre-session-flow", reason: "Client portal invitation acceptance (token)." },
  "(products)/clientos/register/actions.ts": { kind: "pre-session-flow", reason: "Client portal registration." },
  "(products)/commandos/forgot-password/actions.ts": { kind: "pre-session-flow", reason: "Workspace password reset request." },
  "(products)/commandos/invite/actions.ts": { kind: "pre-session-flow", reason: "Invitation acceptance (token)." },
  "(products)/commandos/reset-password/actions.ts": { kind: "pre-session-flow", reason: "Password reset with a token." },
  "(products)/commandos/verify-email/confirm/route.ts": { kind: "pre-session-flow", reason: "Email verification link (token)." },
  "api/reactivation/route.ts": { kind: "public-form", reason: "Reactivation request from a suspended company's address: same-origin only, rate limited, company taken from the host." },
  // ── Called by a provider, which proves itself ──
  "(products)/api/agentos/twilio/status/route.ts": { kind: "provider-webhook", reason: "Twilio: company from an opaque token and a valid X-Twilio-Signature, else a bare 403 (calls/conference.ts)." },
  "(products)/api/agentos/twilio/transcription/route.ts": { kind: "provider-webhook", reason: "Twilio: same token and signature check." },
  "(products)/api/agentos/twilio/voice/route.ts": { kind: "provider-webhook", reason: "Twilio: same token and signature check." },
  "(products)/api/agentos/voice/webhook/route.ts": { kind: "provider-webhook", reason: "ElevenLabs post-call webhook: HMAC over the body with the company's secret." },
  "(products)/api/cashflow-ai/webhooks/[provider]/[companyId]/route.ts": { kind: "provider-webhook", reason: "Payment provider webhook: signature verified in the handler." },
  "(products)/api/cashflow-ai/webhooks/[provider]/route.ts": { kind: "provider-webhook", reason: "Payment provider webhook: signature verified in the handler." },
  "(products)/api/talentos/payroll/webhook/[companyId]/route.ts": { kind: "provider-webhook", reason: "Payout provider webhook: signature verified in the handler." },
  "(products)/api/talentos/payroll/webhook/route.ts": { kind: "provider-webhook", reason: "Payout provider webhook: signature verified in the handler." },
  // ── Public widgets, forms and shared links for a company's visitors ──
  "(products)/agentos-public/embed.js/route.ts": { kind: "public-widget", reason: "The chatbot embed script (no data)." },
  "(products)/api/agentos-public/avatar/[botId]/route.ts": { kind: "public-widget", reason: "A bot's public avatar image." },
  "api/viralpulse-ai/brochure/event/route.ts": { kind: "public-widget", reason: "Brochure view/click beacon from a public brochure." },
  "api/viralpulse-ai/brochure/lead/route.ts": { kind: "public-widget", reason: "Lead form on a public brochure." },
  "api/viralpulse-ai/vcard/[id]/pdf/route.ts": { kind: "public-widget", reason: "Published visiting cards only; a draft needs a signed-in person of the company (fixed in P8-A: it used to serve drafts to anyone)." },
  "api/viralpulse-ai/vcard/event/route.ts": { kind: "public-widget", reason: "Visiting card view/save beacon from the public card." },
  "sign/[token]/document/route.ts": { kind: "public-widget", reason: "A signer opens the document with their unguessable token; the token is checked and every refusal is logged." },
  // ── Old addresses that only redirect ──
  "(products)/viralpulse-ai/ai/route.ts": { kind: "legacy-redirect", reason: "Old address: redirects to the new page, which has its own guard." },
  "(products)/viralpulse-ai/media/route.ts": { kind: "legacy-redirect", reason: "Old address: redirects to the new page, which has its own guard." },
  // ── Guarded by a project wrapper the pattern scan cannot see (each wrapper resolves the signed-in person and checks a feature) ──
  "(products)/agentos/(protected)/chat-call-actions.ts": { kind: "guarded-by-wrapper", reason: "runCallAction / loadCallForViewer resolve the session viewer; the chat must be the person's own." },
  "(products)/evaliq/take/actions.ts": { kind: "guarded-by-wrapper", reason: "resolveTaker: the staff session needs TAKE_TEST, a candidate needs a portal session; no one else gets a taker." },
  "(products)/resolveiq/actions.ts": { kind: "guarded-by-wrapper", reason: "getCompanyCaller: the signed-in person of the company, else 'Please sign in again'." },
};
