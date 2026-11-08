import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getSignupMode } from "@/lib/platform/settings";
import { listAwaitingApproval } from "@/lib/platform/signup";
import { companyBaseUrl } from "@/lib/platform/tenancy/provisioning";
import { requestOrigin } from "@/lib/platform/request";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ApprovalQueue from "./ApprovalQueue";

export const metadata: Metadata = { title: "Sign-ups & approvals" };

const MODE_LABEL = { open: "Open", approval: "Approval required", closed: "Closed" } as const;

export default async function ConsoleSignupsPage() {
  const user = await requirePlatformPermission("signups.read");
  const canManage = can(user, "signups.manage");
  const [mode, requests, { host }] = await Promise.all([getSignupMode(), listAwaitingApproval(), requestOrigin()]);
  const addressOf = Object.fromEntries(requests.map((r) => [r.slug, companyBaseUrl(r.slug, host).replace(/^https?:\/\//, "")]));

  return (
    <div className="space-y-6 p-1">
        <PlatformPageHeader title="Sign-ups & approvals" description="Control who can sign up, and decide on requests waiting for approval." />
        <PanelListFilters>
<GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Who can create a company</CardTitle>
            <CardDescription>
              <Badge variant="outline" className="mr-1.5">{MODE_LABEL[mode]}</Badge>
              The sign-up mode is now set in{" "}
              <Link href="/console/settings#signup-mode" className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
                <Settings2 className="size-3.5" /> Platform settings
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </GlassCard>
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Waiting for approval</CardTitle>
            <CardDescription>
              People who confirmed their email while approval was required. Requests expire after 30 days.
              {mode !== "approval" && requests.length > 0 && " Approval isn't required right now, but these earlier requests still need a decision."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApprovalQueue requests={requests} addressOf={addressOf} canManage={canManage} />
          </CardContent>
        </GlassCard>
</PanelListFilters>
    </div>
  );
}
