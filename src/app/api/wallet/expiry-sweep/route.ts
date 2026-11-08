import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { runExpirySweep } from "@/lib/wallet/expiry";
import { cronRoute } from "@/lib/cron/runner";

/**
 * Scheduled job "wallet-expiry" (see `src/lib/cron/registry.ts`): expires reward credits and sends expiring-soon warnings for every company.
 * The scheduler authenticates with `CRON_SECRET` (Vercel Cron) or, for another scheduler (GitHub Actions, cron-job.org), `WALLET_CRON_SECRET`.
 * A signed-in LMS manager can also run it for their own company only. Wallet correctness never depends on this running (expiry is also
 * reconciled on every read/spend); it just makes it timely and sends the warnings.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const scheduled = cronRoute("wallet-expiry", { extraSecrets: [process.env.WALLET_CRON_SECRET] });

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return scheduled(req);
  if (!(await requireLms("MANAGE_WALLET"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runExpirySweep());
}
export const GET = POST;
