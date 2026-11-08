import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { List } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import BatchCalendar from "@/components/products/cohort-ai/BatchCalendar";
import { listBatchesForCalendar } from "@/lib/products/cohort-ai/batches";

export default async function BatchCalendarPage() {
  const batches = await listBatchesForCalendar();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Batches", href: "/cohort-ai/batches" }, { label: "Calendar" }]}
        title={<>Batch Calendar</>}
        description={<>Every batch by start date.</>}
        actions={<><Link href="/cohort-ai/batches" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <List className="size-3.5" data-icon="inline-start" />
          List view
        </Link></>}
      />

      <PanelListFilters>
<GlassCard interactive={false}>
        <CardContent className="py-5">
          <BatchCalendar
            batches={batches.map((b) => ({
              _id: b._id,
              batchCode: b.batchCode,
              name: b.name,
              programName: b.programName,
              startDate: b.startDate as string,
              endDate: b.endDate,
              status: b.status,
              enrolled: b.enrolled,
              capacity: b.capacity,
            }))}
          />
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
