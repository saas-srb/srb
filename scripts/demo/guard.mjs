// Safety guard for demo seeders that write fake business data (hand-written copy, invented metrics, demo logins with a known password).
// They may only run against a company that was explicitly flagged as the demo company (`companies.isDemo`, set by
// scripts/mark-demo-company.mjs) and never in a production environment. Pure functions so a test can exercise every refusal.

/** True when the environment looks like production (Vercel production/preview, or NODE_ENV=production). */
export function isProductionEnv(env = process.env) {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview" || env.VERCEL === "1";
}

/**
 * Throws unless `company` is flagged demo, is not the platform operator, and the environment is not production.
 * `DEMO_SEED_ALLOW_PRODUCTION` is intentionally NOT honoured: there is no override.
 */
export function assertDemoTarget(company, env = process.env, what = "demo data") {
  if (isProductionEnv(env)) throw new Error(`Refusing to seed ${what}: this looks like a production environment (NODE_ENV/VERCEL).`);
  if (!company || typeof company !== "object") throw new Error(`Refusing to seed ${what}: no target company was given.`);
  if (company.isPlatformOwner) throw new Error(`Refusing to seed ${what}: "${company.slug}" is the platform operator company.`);
  if (company.isDemo !== true) throw new Error(`Refusing to seed ${what}: company "${company.slug ?? "?"}" is not flagged as a demo company. Run: node --env-file=.env.local scripts/mark-demo-company.mjs ${company.slug ?? "<slug>"}`);
}
