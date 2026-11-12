import "server-only";
import { ensureKeyring } from "@/lib/platform/keyring";
import { operatorExists } from "@/lib/platform/saas/first-run";
import { loadIntegrationsDoc } from "@/lib/platform/integrations/store";
import { domainConfigFrom } from "@/lib/platform/integrations/resolve";
import { checkVercelAccess, withDiscoveredTeam } from "@/lib/platform/domains/vercel";
import { wildcardSubdomainsEnabled, platformRootDomain } from "@/lib/platform/tenancy/provisioning";
import { getDomainSyncOverview } from "@/lib/platform/domains/sync/run";
import { getConfig } from "@/lib/platform/config/store";
import { createBlobStoreApi } from "@/lib/storage/blob-migrate-run";
import { adoptedCount } from "@/lib/platform/adopt";
import { legacyCopyStatus } from "@/lib/storage/blob-to-gridfs";

/**
 * "Setup status": what a deployment on a (new) Vercel account works out by itself and the one thing it cannot (an API token of that
 * account). Read-only; the only outside calls are two cheap probes (the Vercel project and the Blob store).
 */

export interface SetupItem {
  id: string;
  title: string;
  state: "ok" | "action" | "warn";
  /** Done by the app without anyone doing anything. */
  automatic: boolean;
  detail: string;
}

const item = (id: string, title: string, state: SetupItem["state"], automatic: boolean, detail: string): SetupItem => ({ id, title, state, automatic, detail });

export async function getSetupStatus(): Promise<SetupItem[]> {
  const out: SetupItem[] = [];
  const ring = await ensureKeyring();
  const unverified = ring.versions.filter((v) => v.verification === "unverified").length;
  const mismatch = ring.mismatch?.unopenable ?? 0;
  out.push(
    ring.state === "ok" && mismatch > 0
      ? item("keyring", "Encryption keys", "action", false, `KEY MISMATCH: ${mismatch} stored secret(s) can't be opened with this deployment's keys (${unverified} stored key(s) are unverified). Deploy once in the project that has the original PLATFORM_ENCRYPTION_KEY, or use Console, Health, "Add previous encryption key". Nobody is locked out: recovery codes, email codes and a staff reset work meanwhile.`)
      : ring.state === "ok"
      ? item("keyring", "Encryption keys", "ok", true, `Stored safely in the database (${ring.versions.length} version${ring.versions.length === 1 ? "" : "s"}); no PLATFORM_ENCRYPTION_KEY needed on a new deployment.`)
      : ring.state === "needs_old_key"
        ? item("keyring", "Encryption keys", "action", false, ring.message ?? "Provide the old PLATFORM_ENCRYPTION_KEY once.")
        : ring.state === "cannot_unwrap"
          ? item("keyring", "Encryption keys", "warn", false, ring.message ?? "The stored keys can't be opened with the current database URI.")
          : item("keyring", "Encryption keys", "warn", false, ring.message ?? "The keyring could not be read yet."),
  );
  out.push(
    (await operatorExists().catch(() => false))
      ? item("admin", "Platform admin", "ok", true, "Existing platform staff keep working; the environment never overwrites them.")
      : item("admin", "Platform admin", "action", false, "No platform admin yet: open /setup on your site and use the setup code from the deployment log."),
  );

  const resetNeeded = await import("@/lib/platform/two-step-alerts").then((m) => m.listTwoStepResetNeeded(100)).catch(() => []);
  if (resetNeeded.length) out.push(item("twostep", "Two-step reset needed", "action", false, `${resetNeeded.length} person(s) can't use their authenticator on this deployment and were offered recovery options. Reset them in Console, Health ("Two-step reset needed").`));
  const meta = await import("@/lib/platform/keyring/manage").then((m) => m.keyMeta()).catch(() => null);
  out.push(meta?.backedUpAt ? item("keybackup", "Encryption key backed up", "ok", false, `Yes, last shown ${new Date(meta.backedUpAt).toLocaleDateString()}.`) : item("keybackup", "Encryption key backed up", "warn", false, "No. In Console, Health, \"Encryption key backup\" show the key once and keep it in a password manager."));

  const doc = await loadIntegrationsDoc();
  const cfg = domainConfigFrom(doc);
  const project = cfg.vercel?.project ?? process.env.VERCEL_PROJECT_ID?.trim() ?? null;
  out.push(item("project", "Vercel project", project ? "ok" : "warn", true, project ? `Detected automatically: ${project}${process.env.VERCEL_URL ? ` (${process.env.VERCEL_URL})` : ""}.` : "Not detected. On Vercel, turn on \"Automatically expose System Environment Variables\" in Project → Settings → Environment Variables."));

  if (!cfg.vercel) {
    out.push(item("token", "Vercel API token", "action", false, "The one thing that needs a person: create an API token in the NEW Vercel account (avatar → Settings → Tokens) and paste it in Integrations → Domains & hosting (or set VERCEL_API_TOKEN). Domain sync then runs by itself."));
  } else {
    const vc = await withDiscoveredTeam(cfg.vercel);
    const access = await checkVercelAccess(vc);
    out.push(access.ok ? item("token", "Vercel API token", "ok", false, `Works for project "${access.projectName}".`) : item("token", "Vercel API token", "action", false, `This token cannot use the current Vercel project, so it most likely belongs to another Vercel account (${access.error}). Create a token in THIS account once and paste it in Integrations → Domains & hosting. The saved earlier-account token stays in use only for releasing hosts and copying DNS records.`));
  }

  const sync = await getDomainSyncOverview().catch(() => null);
  if (sync?.run) {
    const c = sync.run.counts;
    out.push(item("sync", "Domain sync", sync.run.status === "failed" ? "warn" : c.failed || c.ownedElsewhere ? "warn" : "ok", true, `${sync.run.status === "running" ? "Running" : "Last run " + sync.run.status}: ${c.attached} attached, ${c.ownedElsewhere} owned elsewhere, ${c.failed} failed.`));
  } else out.push(item("sync", "Domain sync", cfg.vercel ? "warn" : "action", true, cfg.vercel ? "Has not run yet; it starts by itself (or press Sync all domains now)." : "Starts automatically as soon as a Vercel token exists."));

  // Hosts that still answer from a disabled previous Vercel project (402 DEPLOYMENT_DISABLED): staff-only.
  try {
    const { summarizeHosts } = await import("@/lib/platform/domains/sync/store");
    const { disabledHosts, DISABLED_NOTE } = await import("@/lib/platform/setup/blocked");
    const { problems } = await summarizeHosts(8);
    const bad = await disabledHosts(problems.map((p) => p.host));
    if (bad.length) out.push(item("previous-project", "Previous Vercel project disabled", "action", false, `${DISABLED_NOTE} Affected: ${bad.join(", ")}.`));
  } catch {
    /* an informational probe never breaks the page */
  }
  const smsMod = await import("@/lib/security/sms-otp");
  const smsP = await smsMod.smsProvider().catch(() => null);
  const smsPolicy = await import("@/lib/security/second-step-server").then((m) => m.getSecondStepPolicy("")).catch(() => null);
  out.push(smsPolicy?.smsAllowed ? (smsP ? item("sms", "SMS sign-in codes", smsP.dlt ? "ok" : "warn", false, smsP.dlt ? "On. Twilio and the India DLT fields are set." : "On, but the India DLT fields are missing, so +91 numbers can't be used.") : item("sms", "SMS sign-in codes", "warn", false, "Allowed in the policy but no Twilio SMS sender is configured, so nobody can use it.")) : item("sms", "SMS sign-in codes", "ok", true, smsP ? "Ready; turn on \"SMS codes allowed\" in Console, Health when you want it." : "Off (needs Twilio and, for India, the DLT fields in Integrations)."));
  const miss = await import("@/lib/platform/setup/missing").then((m) => m.missingSettings()).catch(() => []);
  const missing = miss.filter((m) => !m.configured);
  if (missing.length) out.push(item("missing", "Missing settings", "action", false, `${missing.length} setting(s) are empty: ${missing.map((m) => m.title).join(", ")}. Open Console, Health, Missing settings for where to fill each in and a Test.`));
  const adopted = await adoptedCount().catch(() => 0);
  out.push(item("adopted", "Adopted from environment", "ok", true, `${adopted} setting${adopted === 1 ? "" : "s"} adopted from environment variables into the database; a new deployment finds them there.`));

  const forced = (process.env.PLATFORM_WILDCARD_SUBDOMAINS ?? "").trim();
  const wildcard = wildcardSubdomainsEnabled();
  out.push(item("wildcard", "Wildcard addresses", wildcard ? "ok" : "warn", !forced, wildcard ? (forced ? "Forced on by PLATFORM_WILDCARD_SUBDOMAINS." : `Detected: *.${platformRootDomain()} is on the project.`) : `*.${platformRootDomain()} is not on this project. Add it in Vercel (root domain DNS must be at this account); until then each company's two addresses are attached one by one.`));

  const backend = ((await getConfig("FILE_BACKEND").catch(() => null)) ?? "").trim().toLowerCase() === "blob" ? "Vercel Blob" : "the database (GridFS)";
  const copy = await legacyCopyStatus().catch(() => null);
  const blobToken = await getConfig("BLOB_READ_WRITE_TOKEN").catch(() => null);
  let blobProbe = "";
  let blobBad = false;
  if (blobToken) {
    try {
      await createBlobStoreApi(blobToken).list(null, 1);
    } catch (err) {
      blobBad = true;
      blobProbe = ` The saved Blob store can't be reached (${err instanceof Error ? err.message.slice(0, 100) : "error"}); files not yet copied into the database stay unavailable until a working token is saved.`;
    }
  }
  const remaining = copy?.remaining ?? 0;
  out.push(
    item(
      "files",
      "File storage",
      blobBad || (copy && copy.failed > 0) ? "warn" : remaining > 0 || copy?.state === "running" ? "warn" : "ok",
      true,
      `New files go to ${backend}, which travels with the database. ${copy && copy.state !== "no-blob" && copy.state !== "idle" ? `Old Blob files: ${copy.inDatabase}/${copy.listed} copied into the database, ${remaining} remaining.` : blobToken ? "Old Blob files: not scanned yet (starts by itself)." : "No Blob store is used."}${blobProbe}`,
    ),
  );

  const cronSecret = Boolean(process.env.CRON_SECRET) || Boolean(await getConfig("CRON_SECRET").catch(() => null));
  out.push(item("cron", "Scheduled jobs", "ok", true, cronSecret ? "A cron secret is set." : "No CRON_SECRET: Vercel's own cron calls are accepted, limited to one run per half interval, and the database lease still applies."));
  return out;
}
