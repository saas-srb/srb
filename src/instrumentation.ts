/**
 * First start of a new deployment: when `SAAS_ADMIN_EMAIL` is set and the platform has no operator yet, create it (and
 * its first staff account) so sign-up and the Platform Console work without any setup command. Runs in the background and
 * never stops the server from starting.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // The encryption keyring first: with only MONGODB_URI and SAAS_HOSTS set, this is what opens every saved key and encrypted field.
  await import("@/lib/platform/keyring").then((m) => m.ensureKeyring()).catch((err) => console.error("[keyring] boot check failed", err));
  // Not on Vercel (which has its own cron): RUN_SCHEDULER=1 on one instance runs the scheduled jobs from inside the app.
  if (process.env.RUN_SCHEDULER === "1" && !process.env.VERCEL) void import("@/lib/cron/scheduler").then((m) => m.startScheduler()).catch((err) => console.error("[scheduler] could not start", err));
  // DealFlow tells the calling engine how to write call results back, honour its do-not-contact flag and recognise callers.
  void import("@/lib/dealflow-ai/call-hooks").catch((err) => console.error("[dealflow] could not register call hooks", err));
  // TalentOS and SprintOS do the same for their records.
  void import("@/lib/products/call-integrations").catch((err) => console.error("[calls] could not register product call hooks", err));
  // Copy whatever this environment provides and the database lacks into the database (never overwrites), so the next deployment needs nothing.
  if (process.env.VERCEL) void import("@/lib/platform/adopt").then((m) => m.adoptEnvironment({ trigger: "boot" })).then(() => import("@/lib/storage/blob-to-gridfs")).then((m) => m.ensureLegacyCopy()).catch((err) => console.error("[adopt] boot adoption failed", err instanceof Error ? err.message : err));
  // A deployment on a different Vercel project than the one last synced (an account move): bring that project's domains in line with the database.
  const gs = globalThis as { __domainSyncChecked?: boolean };
  if (!gs.__domainSyncChecked && process.env.VERCEL) {
    gs.__domainSyncChecked = true;
    void import("@/lib/platform/domains/sync/run").then((m) => m.maybeSyncOnProjectChange()).catch((err) => console.error("[domain-sync] boot check failed", err));
  }
  const email = process.env.SAAS_ADMIN_EMAIL?.trim();
  if (!email) {
    // No admin account given and no platform staff yet: log the one-time setup code for /setup (existing staff are never touched).
    void import("@/lib/platform/saas/first-run").then((m) => m.firstRunOpen()).catch(() => {});
    return;
  }
  // The dev server runs this once per compiler; one run per process is enough.
  const g = globalThis as { __saasBootstrapped?: boolean };
  if (g.__saasBootstrapped) return;
  g.__saasBootstrapped = true;
  void import("@/lib/platform/saas/bootstrap")
    .then(({ ensureOperator }) => ensureOperator({ email, password: process.env.SAAS_ADMIN_PASSWORD?.trim() || undefined }))
    .then((res) => {
      if (!res.created) return;
      console.log(`[saas] Platform operator "${res.companyName}" created with ${res.panelsAdded} products. Staff sign-in: ${res.email}`);
      if (res.temporaryPassword) console.log(`[saas] Temporary password (shown once, change it at first sign-in): ${res.temporaryPassword}`);
    })
    .catch((err) => console.error("[saas] could not set up the platform operator", err));
}
