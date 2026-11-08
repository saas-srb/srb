/**
 * How each MongoDB collection is treated by the company-scoped data layer
 * (`scoped-db.ts`). Every collection is company-scoped by default — a
 * collection only escapes scoping by being listed in GLOBAL_COLLECTIONS, so
 * forgetting to classify a new collection fails safe (isolated), never open.
 */

/** Platform-level collections: shared by every company, never scoped. */
export const GLOBAL_COLLECTIONS = new Set<string>([
  "companies",
  "company_domains",
  "email_sender_domains", // which company owns which sending domain (the email provider account is shared)
  "platform_settings",
  "pending_signups",
  "signup_attempts",
  "login_handoffs",
  // Billing (platform-level: the platform bills companies)
  "billing_plans",
  "saas_invoices",
  "billing_webhook_events",
  "subscription_events",
  "billing_coupons",
  "billing_coupon_redemptions",
  "billing_addons",
  // Platform administration
  "platform_audit_log",
  "status_incidents", // the public status page's incident record (platform-wide)
  "platform_roles",
  "platform_panels", // the Product Registry (names, descriptions, global on/off)
  // Help & Support Center: the platform's own cross-company service (rows carry their companyId; see lib/resolveiq/db.ts)
  "support_requests",
  "support_messages",
  "support_articles",
  "support_config",
  "support_counters",
  // The mini-game on the 404 / no-workspace / maintenance pages: one row per player per scope (a company, or "global"); see lib/game/scores.ts
  "game_scores",
  // Desktop app builds: the platform's build pipeline (rows carry their companyId; see lib/apps/store.ts)
  "app_builds",
  // Scheduled jobs: the run history and the locks that keep two servers from running one job at once (see lib/cron/runner.ts)
  "cron_runs",
  "cron_locks",
  // Prompt management: platform-wide overrides of the AI prompts, their version history and use counters (see lib/prompts/)
  "prompt_overrides",
  "prompt_versions",
  "prompt_stats",
  "tax_rulebook", // the law's numbers for a company's accounts (TDS sections, income-tax rates, advance-tax dates, filing dates), one document per financial year, published by the platform for every company (see lib/products/cashflow-ai/rulebook/rules-store.ts)
  "payroll_statutory_rates", // the law's payroll figures (tax slabs, PF, ESI, professional tax …), published by the platform for every company (see lib/products/talentos/payroll/rates-store.ts)
  "stamp_rulebook", // stamp duty by state / union territory and instrument, published by the platform and never authoritative until a reviewer confirms each entry (see lib/products/contractflow-ai/stamp/)
  "cron_settings", // per-job pause / schedule override, and who is alerted when one fails
  // The SaaS product website: demo requests and contact messages from visitors who are not (yet) a company
  "saas_inquiries",
]);

/**
 * Company-scoped collections whose `_id` is a fixed, meaningful key rather
 * than a random id — counters (`_id: "project"`), settings singletons
 * (`_id: "main"`), sweep throttles (`_id: "notification_sweep"`), date-keyed
 * rollups, theme keys, idempotency keys. Two companies would collide on the
 * same `_id` in a shared collection, so the scoped layer stores these as
 * `<companyId>::<key>` and strips the prefix again on the way out; callers
 * keep using the bare key.
 */
export const KEYED_COLLECTIONS = new Set<string>([
  // Sequence counters
  "hrms_counters",
  "pms_counters",
  "prms_counters",
  "tms_counters",
  "fms_counters",
  "cms_counters",
  "chat_counters",
  "ots_counters",
  "portal_counters",
  "seo_counters",
  "sop_counters",
  "cf_counters", // ContractFlow sequences, `_id` = <series>:<financial year> (see lib/products/contractflow-ai/cf-collections.ts)
  "pb_counters", // Playbook document numbering series, `_id` = <series>:<financial year> (see lib/products/playbook-ai/pb-collections.ts)
  // Settings / config singletons
  "aibots_settings",
  "cms_settings",
  "web_push_settings",
  "company_prompt_overrides", // a company's own wording of an AI prompt, `_id` = the prompt key (see lib/prompts/company-store.ts)
  "notification_rules", // the Notification center: one rule per event, `_id` = the event key
  "email_sender", // the company's own sending address (`_id: "main"`)
  "pwa_settings",
  "dlms_settings",
  "hrms_settings",
  "hrms_company",
  "hrms_payroll_config",
  "fms_payment_controls", // limits and approval rules for money leaving the company (see lib/products/cashflow-ai/payment-controls.ts)
  "ots_settings",
  "pms_settings",
  "prms_settings",
  "seo_settings",
  "smms_settings",
  "sop_settings",
  "cf_settings", // ContractFlow settings singleton (`_id: "main"`)
  "pb_settings", // Playbook settings singleton (`_id: "main"`)
  "pb_brand", // a company's letterhead and brand for documents (`_id: "main"`)
  "training_settings",
  "fms_tax_config",
  "fms_compliance_profile", // what the company says about itself so the filing calendar holds only what applies (`_id: "main"`, see lib/products/cashflow-ai/compliance/filings.ts)
  "fms_work_plan", // when the company switched "My work" on (`_id: "main"`, see lib/products/cashflow-ai/work/store.ts)
  "fms_accrual_settings", // the switch to accrual books and where revenue / cost is booked (`_id: "main"`, see lib/products/cashflow-ai/accrual/settings.ts)
  "ai_chatbot_config",
  // Sweep throttles
  "hrms_meta",
  "pms_meta",
  "prms_meta",
  "tms_meta",
  "chat_meta",
  // Date-keyed analytics rollups
  "chat_daily_rollup",
  "voice_analytics",
  "seo_search_daily",
  "seo_traffic_daily",
  // Keyed documents
  "cms_theme",
  "cms_forms", // _id = form key ("contact")
  "seo_page_content", // _id = page path
  "seo_sitemaps", // _id = URL
  "seo_search_rows", // _id = row index ("0", "1", …)
  "smms_integrations", // _id = provider ("meta", …)
  "aibots_bots", // the built-in "general" bot has a fixed _id
  "wallet_idempotency_locks",
  "fms_idempotency_keys",
  "billing_usage", // _id = <metric>:<yyyy-mm>
  "platform_payment_accounts", // _id = provider ("razorpay")
  "workspace_connections", // _id = provider key (Workspace → Settings → Integrations)
  "website_generation", // _id = "ai-website" (the AI website's state and plan)
  "lead_categories", // _id = "config" (the company's enquiry categories)
]);

export const KEY_SEPARATOR = "::";

export function isGlobalCollection(name: string): boolean {
  return GLOBAL_COLLECTIONS.has(name);
}

export function isKeyedCollection(name: string): boolean {
  return KEYED_COLLECTIONS.has(name);
}
