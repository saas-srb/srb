import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import UsageRuleForm from "@/components/products/dealflow-ai/wallet/UsageRuleForm";

export const metadata = { title: "New usage rule · Wallet" };

export default function NewUsageRulePage() {
  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Usage rules", href: "/sitecraft-ai/wallet/usage-rules" }, { label: "New" }]}
        title={<>New usage rule</>}
      />
<div className="relative mx-auto max-w-2xl space-y-4">
      <GlassCard><CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader><CardContent><UsageRuleForm /></CardContent></GlassCard>
    </div>
</div>
  );
}
