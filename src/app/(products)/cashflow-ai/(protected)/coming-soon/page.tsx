import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Construction } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";

export default async function FmsComingSoonPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; item?: string }>;
}) {
  const sp = await searchParams;
  const section = sp.section || "CashFlow";
  const item = sp.item || "This section";

  return (
    <div className="space-y-4">
      <PanelPageHeader breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: section }, { label: item }]} title={<>{item}</>} description={<>Coming soon to the finance product.</>} />
      <GlassCard>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Construction className="size-10 text-muted-foreground/60" />
          <p className="text-base font-semibold text-foreground">{item} is coming soon</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {section} is on the CashFlow roadmap but hasn&apos;t shipped yet. Phase 1 covers the finance dashboard,
            transactions, customers, vendors, the chart of accounts and the audit log — everything else lights up
            in a later phase.
          </p>
        </CardContent>
      </GlassCard>
    </div>
  );
}
