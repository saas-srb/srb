import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import RewardRuleForm from "@/components/products/dealflow-ai/wallet/RewardRuleForm";

export const metadata = { title: "New reward rule · Wallet" };

export default function NewRewardRulePage() {
  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Reward rules", href: "/sitecraft-ai/wallet/rules" }, { label: "New" }]}
        title={<>New reward rule</>}
      />
<div className="relative mx-auto max-w-2xl space-y-4">
      <GlassCard><CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader><CardContent><RewardRuleForm /></CardContent></GlassCard>
    </div>
</div>
  );
}
