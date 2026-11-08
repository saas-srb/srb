/**
 * Backfills `subscription_events` for companies that have a subscription but
 * no history yet, so the revenue analytics (/console/revenue) aren't empty
 * after the first deploy. See `src/lib/platform/billing/backfill.ts` for what
 * gets written. Safe to re-run: companies with any history are skipped and
 * event ids are deterministic.
 *
 *   npx --yes tsx --require ./scripts/lib/next-server-shims.cjs --env-file=.env scripts/backfill-subscription-events.ts           # dry run
 *   npx --yes tsx --require ./scripts/lib/next-server-shims.cjs --env-file=.env scripts/backfill-subscription-events.ts --apply   # writes
 *
 * Uses the database in MONGODB_URI.
 */
import { clientPromise } from "@/lib/platform/tenancy/platform-db";
import { backfillSubscriptionEvents } from "@/lib/platform/billing/backfill";
import { formatMoney } from "@/lib/platform/billing/types";

const APPLY = process.argv.slice(2).includes("--apply");

async function main() {
  const tag = APPLY ? "" : "[dry run] ";
  const r = await backfillSubscriptionEvents({ apply: APPLY });
  console.log(`${tag}Scanned ${r.scanned} customer companies: ${r.companies} to backfill, ${r.skippedWithHistory} already have history, ${r.skippedNoSubscription} have no stored subscription.`);
  for (const e of r.planned) {
    console.log(`${tag}  ${e.companyName} (${e.companyId})  ${e.type.padEnd(13)} ${e.at.toISOString()}  ${e.planId}/${e.interval}  MRR ${formatMoney(e.mrr)}`);
  }
  if (APPLY) console.log(`Wrote ${r.written} of ${r.planned.length} events.`);
  else console.log(`${tag}${r.planned.length} events would be written. Re-run with --apply to write them.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (await clientPromise).close();
  });
