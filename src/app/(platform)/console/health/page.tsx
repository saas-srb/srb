import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import SetupStatusCard from "@/components/platform/SetupStatusCard";
import { can, requirePlatformAccess } from "@/lib/platform/console/access";
import HealthActions from "./HealthActions";
import { legacyCopyStatus } from "@/lib/storage/blob-to-gridfs";

export const metadata: Metadata = { title: "Health" };
export const dynamic = "force-dynamic";

export default async function PlatformHealthPage() {
  const user = await requirePlatformAccess();
  const copy = await legacyCopyStatus().catch(() => ({ state: "no-blob" as const, listed: 0, inDatabase: 0, remaining: 0, failed: 0, bytes: 0, error: null, finishedAt: null }));
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Health" description="Portability: what a deployment on another Vercel account finds by itself, and what it still needs." crumbs={[{ label: "Administration" }]} />
      <SetupStatusCard />
      <HealthActions initial={copy} canManage={can(user, "integrations.manage")} />
      <p className="text-sm text-muted-foreground">To test a new deployment against a throwaway database from your computer: <code>PORTABILITY_MONGODB_URI=… npm run portability:check</code> (see docs/migrate-vercel-account.md).</p>
    </div>
  );
}
