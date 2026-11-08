import type { Metadata } from "next";
import { ObjectId } from "mongodb";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import SecuritySections from "../../settings/security/SecuritySections";

export const metadata: Metadata = { title: "Security & sessions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Everyone's own devices and sign-in history (the company Security page shows the same for the Director, next to company-wide numbers). */
export default async function SessionsPage() {
  const user = await requireWorkspaceAccess("account.sessions");
  return (
    <div className="space-y-4 p-1">
      <PanelPageHeader breadcrumbs={[{ label: "Account" }, { label: "Security & sessions" }]} title={<>Security &amp; sessions</>} description={<>Where you&apos;re signed in, and your sign-in history.</>} />
      <SecuritySections adminId={new ObjectId(user.id)} email={user.email} />
    </div>
  );
}
