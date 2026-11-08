import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import UsageRuleForm from "@/components/products/dealflow-ai/wallet/UsageRuleForm";
import DeleteEntityButton from "@/components/products/dealflow-ai/offers/DeleteEntityButton";
import { getUsageRule, serializeUsageRule } from "@/lib/wallet/usage-rules";
import { USAGE_MODULE_LABELS, AUDIENCE_LABELS } from "@/lib/wallet/constants";
import { deleteUsageRuleAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditUsageRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rule = await getUsageRule(id);
  if (!rule) notFound();
  const title = `${USAGE_MODULE_LABELS[rule.module]} · ${AUDIENCE_LABELS[rule.appliesToRole]}`;
  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Usage rules", href: "/sitecraft-ai/wallet/usage-rules" }, { label: title }]}
        title={<>{title}</>}
        actions={<><DeleteEntityButton label="rule" confirmText="Credits fall back to the default for this module (Festival Offers: allowed up to 100%; others: not allowed)." onDelete={deleteUsageRuleAction.bind(null, id)} redirectTo="/sitecraft-ai/wallet/usage-rules" /></>}
      />
<div className="relative mx-auto max-w-2xl space-y-4">
      <GlassCard><CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader><CardContent><UsageRuleForm rule={serializeUsageRule(rule)} /></CardContent></GlassCard>
    </div>
</div>
  );
}
