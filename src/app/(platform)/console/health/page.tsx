import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import SetupStatusCard from "@/components/platform/SetupStatusCard";
import { can, requirePlatformAccess } from "@/lib/platform/console/access";
import HealthActions from "./HealthActions";
import KeyManagement from "./KeyManagement";
import SecondStepPolicyForm from "./SecondStepPolicyForm";
import { getSecondStepPolicy } from "@/lib/security/second-step-server";
import ResetNeededList from "./ResetNeededList";
import { listTwoStepResetNeeded } from "@/lib/platform/two-step-alerts";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { computeKeyHealth } from "@/lib/platform/keyring/manage";
import { legacyCopyStatus } from "@/lib/storage/blob-to-gridfs";

export const metadata: Metadata = { title: "Health" };
export const dynamic = "force-dynamic";

export default async function PlatformHealthPage() {
  const user = await requirePlatformAccess();
  const keyHealth = await computeKeyHealth();
  const flagged = await listTwoStepResetNeeded();
  const names = new Map((await (await getPlatformDb()).collection<{ _id: string; name: string }>("companies").find({ _id: { $in: flagged.map((f) => f.companyId) } }, { projection: { name: 1 } }).toArray()).map((c) => [c._id, c.name]));
  const copy = await legacyCopyStatus().catch(() => ({ state: "no-blob" as const, listed: 0, inDatabase: 0, remaining: 0, failed: 0, bytes: 0, error: null, finishedAt: null }));
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Health" description="Portability: what a deployment on another Vercel account finds by itself, and what it still needs." crumbs={[{ label: "Administration" }]} />
      <SetupStatusCard />
      <ResetNeededList canReset={can(user, "companies.manage")} rows={flagged.map((f) => ({ id: f._id, companyId: f.companyId, companyName: names.get(f.companyId) ?? f.companyId, email: f.email, maskedEmail: f.email, firstSeenAt: f.firstSeenAt.toISOString(), seen: f.seen }))} />
      <SecondStepPolicyForm initial={await getSecondStepPolicy("")} canManage={can(user, "integrations.manage")} canCompanies={can(user, "companies.manage")} />
      <KeyManagement health={keyHealth} isOwner={user.platform.permissions.includes("*")} canResetUsers={can(user, "companies.manage")} />
      <HealthActions initial={copy} canManage={can(user, "integrations.manage")} />
      <p className="text-sm text-muted-foreground">To test a new deployment against a throwaway database from your computer: <code>PORTABILITY_MONGODB_URI=… npm run portability:check</code> (see docs/migrate-vercel-account.md).</p>
    </div>
  );
}
