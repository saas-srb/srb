/**
 * Every scheduled job the platform runs (pure; the one list). `vercel.json` is generated from it (`npm run cron:sync`), the in-app scheduler
 * reads it, the Platform Console's Scheduled jobs page shows it, and a test fails if any of them disagree with the routes on disk.
 * Times are UTC. To add a job: add it here, add its runner in `jobs.ts` and a route that is `cronRoute("<key>")`, then run the sync.
 */

export interface CronJob {
  key: string;
  name: string;
  description: string;
  /** The route that runs it (called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`). */
  path: string;
  /** Five-field cron expression, UTC. */
  schedule: string;
  /** The product it belongs to (panel key), or "platform" for SelfRun's own jobs. */
  product: string;
  scope: "platform" | "each company";
  /** The longest it is allowed to run, in seconds (also how long its lock is held). */
  maxDurationSec: number;
  /** Other things that also run it, so it keeps working if the schedule is late. */
  alsoRunsOn?: string;
  /** Where a company changes what this job does for it, if it can. */
  configure?: { label: string; href: string };
  /** Runs more often than daily: Vercel's Hobby plan only accepts daily schedules, so this needs Pro (or the in-app scheduler). */
  frequent?: boolean;
}

export const CRON_JOBS: CronJob[] = [
  {
    key: "backups", name: "Backups & data lifecycle", product: "workspace", scope: "each company", path: "/api/backup/cron", schedule: "30 1 * * *", maxDurationSec: 300,
    description: "Makes the weekly backup for each company that is due, removes old backups, and deletes the companies whose 30-day deletion period has ended.",
    configure: { label: "Backups & data", href: "/commandos/settings/backups" },
  },
  {
    key: "wallet-expiry", name: "Wallet expiry", product: "lms", scope: "each company", path: "/api/wallet/expiry-sweep", schedule: "30 2 * * *", maxDurationSec: 300,
    description: "Expires reward credits that have passed their date and warns people whose credits are about to expire.",
    alsoRunsOn: "Every wallet read or spend (expiry is also settled then); a signed-in manager can run it for their own company.",
  },
  {
    key: "playbook", name: "Procedure reminders", product: "sop", scope: "each company", path: "/api/playbook-ai/cron", schedule: "0 3 * * *", maxDurationSec: 300,
    description: "Moves procedures through their date-driven statuses (review due, expired) and sends acknowledgement reminders.",
    configure: { label: "PlayBook settings", href: "/playbook-ai/settings" },
  },
  {
    key: "rankmax", name: "SEO housekeeping", product: "seo", scope: "each company", path: "/api/rankmax-ai/cron", schedule: "30 3 * * *", maxDurationSec: 300,
    description: "Syncs Search Console and Analytics, runs the scheduled website audit, re-checks backlinks on Mondays and flags big ranking drops, for the companies that turned those on.",
    configure: { label: "RankMax settings", href: "/rankmax-ai/settings" },
  },
  {
    key: "cybervault", name: "Vault expiry alerts", product: "dlms", scope: "each company", path: "/api/cybervault/cron", schedule: "0 4 * * *", maxDurationSec: 300,
    description: "Tells the vault's owners about credentials and documents that have expired or are about to.",
    configure: { label: "CyberVault settings", href: "/cybervault/settings" },
  },
  {
    key: "viralpulse-publisher", name: "Scheduled posts", product: "smms", scope: "each company", path: "/api/viralpulse-ai/publisher/cron", schedule: "30 7 * * *", maxDurationSec: 300,
    description: "Publishes approved scheduled posts that are due, retries failed publishes with backoff, checks media the platforms are still processing, reminds publishers about due posts nobody approved and ads due to go live.",
    alsoRunsOn: "Right after Publish now (in the background).",
    configure: { label: "ViralPulse settings", href: "/viralpulse-ai/settings" },
  },
  {
    key: "viralpulse-ugc", name: "AI UGC videos", product: "smms", scope: "each company", path: "/api/viralpulse-ai/ugc/cron", schedule: "0 8 * * *", maxDurationSec: 300,
    description: "Submits and checks the scene renders of AI UGC videos that were approved, retries failed scenes with backoff, downloads finished clips and joins them into the final video.",
    alsoRunsOn: "Right after a video is approved (the browser does not have to stay open).",
    configure: { label: "ViralPulse settings", href: "/viralpulse-ai/settings" },
  },
  {
    key: "viralpulse-ads", name: "Paid ads status and results", product: "smms", scope: "each company", path: "/api/viralpulse-ai/ads/cron", schedule: "30 8 * * *", maxDurationSec: 300,
    description: "Reads the status of every launched Meta campaign, ad set and ad, tells the admins when Meta disapproves an ad, pauses a campaign, restricts the ad account or the account's spend limit is nearly used, and saves the daily results (impressions, clicks, spend, conversions) for the analytics pages.",
    configure: { label: "ViralPulse campaigns", href: "/viralpulse-ai/campaigns" },
  },
  {
    key: "viralpulse-metrics", name: "Social post and account results", product: "smms", scope: "each company", path: "/api/viralpulse-ai/metrics/cron", schedule: "0 9 * * *", maxDurationSec: 300,
    description: "Reads the real numbers from Instagram, Facebook, YouTube, LinkedIn and X for every connected account (reach, views, likes, comments, shares, saves, followers, watch time) and for the posts published through ViralPulse once a day; keeps daily history for growth charts and tells the admins when an account's numbers stop updating.",
    configure: { label: "Analytics", href: "/viralpulse-ai/analytics?tab=accounts" },
  },
  {
    key: "viralpulse-accounts", name: "Connected account checks", product: "smms", scope: "each company", path: "/api/viralpulse-ai/accounts/cron", schedule: "30 9 * * *", maxDurationSec: 300,
    description: "Renews social logins that are about to expire, asks Meta, Google, LinkedIn and X whether each login is still valid and what it allows, updates each account's status and warns the admins before a login expires (14, 7, 3 and 1 days ahead), when it has expired or been revoked, or when a permission is missing.",
    configure: { label: "Connected accounts", href: "/viralpulse-ai/settings/accounts" },
  },
  {
    key: "evaliq", name: "Test deadlines", product: "ots", scope: "each company", path: "/api/evaliq/cron", schedule: "0 5 * * *", maxDurationSec: 300,
    description: "Finishes timed-out test attempts, expires missed assignments, sends opens-soon / due-soon / expired notices and releases results after a test closes.",
    alsoRunsOn: "Page loads in EvalIQ (throttled).",
    configure: { label: "EvalIQ settings", href: "/evaliq/settings" },
  },
  {
    key: "domains", name: "Custom domain re-check", product: "platform", scope: "each company", path: "/api/platform/domains/cron", schedule: "30 5 * * *", maxDurationSec: 300,
    description: "Re-checks every company's pending custom domains so they go live as soon as their DNS is right.",
    configure: { label: "Custom domains", href: "/commandos/settings/domains" },
  },
  {
    key: "trials", name: "Trial reminders & expiry", product: "platform", scope: "platform", path: "/api/platform/billing/trials/cron", schedule: "0 6 * * *", maxDurationSec: 300,
    description: "Emails trial reminders at the platform's reminder days and moves ended trials on (the workspace locks until a plan is subscribed).",
    configure: { label: "Plan & billing", href: "/commandos/settings/billing" },
  },
  {
    key: "subscriptions", name: "Subscription renewals & dunning", product: "platform", scope: "platform", path: "/api/platform/billing/subscriptions/cron", schedule: "0 6 * * *", maxDurationSec: 300,
    description: "Moves past-due subscriptions through grace to suspended, handles missed renewals and closes expired trials.",
    configure: { label: "Plan & billing", href: "/commandos/settings/billing" },
  },
  {
    key: "notifications", name: "Time-based notifications", product: "workspace", scope: "each company", path: "/api/notify/cron", schedule: "15 6 * * *", maxDurationSec: 300,
    description: "Overdue invoices, stale leads, expiring documents, ending offers and HR, project, procurement and training deadlines: tells people even if nobody opened the product. Also sends announcements a company scheduled that have come due.",
    alsoRunsOn: "Opening the product (each product runs its own sweep, throttled; every notification dedupes per day). Scheduled announcements are sent the moment anyone opens the workspace, and by this job at least once a day.",
    configure: { label: "Notification center", href: "/commandos/settings/notifications" },
  },
  {
    key: "agentos-calls", name: "Scheduled voice calls", product: "aibots", scope: "each company", path: "/api/agentos/cron", schedule: "0 10 * * *", maxDurationSec: 300,
    description: "Dials the voice calls people scheduled when they are due (re-checking the calling hours, do-not-call list and limits at that moment, never retrying by itself), and collects the results of calls whose results haven't arrived.",
    alsoRunsOn: "ElevenLabs' post-call webhook delivers results as soon as a call ends; this job is the safety net.",
    configure: { label: "Call settings", href: "/agentos/settings" },
  },
  {
    key: "meetings", name: "Meeting reminders & summaries", product: "lms", scope: "each company", path: "/api/dealflow-ai/meetings/cron", schedule: "30 10 * * *", maxDurationSec: 300,
    description: "Reminds staff 60 and 10 minutes before a meeting, ends meetings nobody closed, and writes the summary and action items of ended meetings.",
    alsoRunsOn: "Opening an ended meeting's page (the summary is written then if the job has not yet).",
  },
  {
    key: "apps", name: "App builds", product: "platform", scope: "platform", path: "/api/apps/builds/cron", schedule: "0 7 * * *", maxDurationSec: 300,
    description: "Hands over desktop-app builds that were requested while no build service was connected, and fails builds that never finished. It never starts a build by itself.",
    configure: { label: "Apps & downloads", href: "/commandos/settings/apps" },
  },
];

export const CRON_BY_KEY = new Map(CRON_JOBS.map((j) => [j.key, j]));

/** What `vercel.json` should hold, in registry order. */
export const vercelCrons = (): { path: string; schedule: string }[] => CRON_JOBS.map((j) => ({ path: j.path, schedule: j.schedule }));
