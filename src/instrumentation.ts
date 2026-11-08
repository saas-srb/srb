/**
 * First start of a new deployment: when `SAAS_ADMIN_EMAIL` is set and the platform has no operator yet, create it (and
 * its first staff account) so sign-up and the Platform Console work without any setup command. Runs in the background and
 * never stops the server from starting.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Not on Vercel (which has its own cron): RUN_SCHEDULER=1 on one instance runs the scheduled jobs from inside the app.
  if (process.env.RUN_SCHEDULER === "1" && !process.env.VERCEL) void import("@/lib/cron/scheduler").then((m) => m.startScheduler()).catch((err) => console.error("[scheduler] could not start", err));
  // DealFlow tells the calling engine how to write call results back, honour its do-not-contact flag and recognise callers.
  void import("@/lib/dealflow-ai/call-hooks").catch((err) => console.error("[dealflow] could not register call hooks", err));
  // TalentOS and SprintOS do the same for their records.
  void import("@/lib/products/call-integrations").catch((err) => console.error("[calls] could not register product call hooks", err));
  const email = process.env.SAAS_ADMIN_EMAIL?.trim();
  if (!email) return;
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
