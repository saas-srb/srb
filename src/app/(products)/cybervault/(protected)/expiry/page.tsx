import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import { PageHeader, SectionCard, EmptyState } from "@/components/products/cybervault/DlmsUi";
import DlmsFilterBar, { type FilterField } from "@/components/products/cybervault/DlmsFilterBar";
import FeedList from "@/components/products/cybervault/FeedList";
import { getViewer } from "@/lib/products/cybervault/viewer";
import { getExpiryBoard } from "@/lib/products/cybervault/overview";
import { getSettings } from "@/lib/products/cybervault/settings";
import { RECORD_TYPES, RECORD_TYPE_LABEL } from "@/lib/products/cybervault/constants";
import { SCOPE_OPTIONS, visibleClientOptions, type SearchParams } from "@/lib/products/cybervault/page";

export default async function ExpiryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  const sp = await searchParams;
  const type = (RECORD_TYPES as readonly string[]).includes(sp.type ?? "") && sp.type !== "note" ? sp.type : undefined;
  const [board, clients, settings] = await Promise.all([
    getExpiryBoard(viewer, { scope: sp.scope === "company" || sp.scope === "client" ? sp.scope : undefined, clientId: sp.client || undefined, type, status: sp.status === "archived" || sp.status === "all" ? sp.status : undefined }),
    visibleClientOptions(viewer),
    getSettings(),
  ]);
  const fields: FilterField[] = [
    { key: "scope", label: "Ownership", type: "select", options: SCOPE_OPTIONS, allLabel: "Company & clients" },
    { key: "client", label: "Client", type: "select", options: clients, allLabel: "All clients" },
    { key: "type", label: "Record type", type: "select", options: RECORD_TYPES.filter((t) => t !== "note").map((r) => ({ value: r, label: RECORD_TYPE_LABEL[r] })), allLabel: "All types" },
  ];
  const nothing = board.expired.length + board.expiring.length + board.later.length === 0;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Expiry & Alerts"
        crumbs={[{ label: "Expiry & Alerts" }]}
        description={`Credentials, documents (certificates, licences, agreements) and URLs/accounts (domains, hosting) by expiry. “Expiring soon” means within ${settings.warnDays} days.`}
      />
      <DlmsFilterBar fields={fields} values={{ scope: sp.scope ?? "", client: sp.client ?? "", type: type ?? "" }} />
      <KpiGrid>
        <KpiCard label="Expired" value={board.expired.length} icon={<CalendarClock className="size-4" />} tone={board.expired.length > 0 ? "down" : undefined} />
        <KpiCard label={`Expiring in ${settings.warnDays} days`} value={board.expiring.length} icon={<CalendarClock className="size-4" />} />
        <KpiCard label="Later" value={board.later.length} icon={<CalendarClock className="size-4" />} />
      </KpiGrid>
      {nothing ? (
        <SectionCard title="No expiry dates">
          <EmptyState icon={<CalendarClock className="size-5" />} title="Nothing is being tracked yet">
            Add an expiry date to a <Link href="/cybervault/credentials" className="text-primary underline">credential</Link>, <Link href="/cybervault/documents" className="text-primary underline">document</Link> or <Link href="/cybervault/urls" className="text-primary underline">URL / account</Link> and it appears here.
          </EmptyState>
        </SectionCard>
      ) : (
        <>
          <SectionCard title={`Expired (${board.expired.length})`}><FeedList items={board.expired} show="expiry" empty="Nothing has expired." /></SectionCard>
          <SectionCard title={`Expiring soon (${board.expiring.length})`}><FeedList items={board.expiring} show="expiry" empty={`Nothing expires in the next ${settings.warnDays} days.`} /></SectionCard>
          <SectionCard title={`Later (${board.later.length})`}><FeedList items={board.later} show="expiry" empty="Nothing further out." /></SectionCard>
        </>
      )}
    </div>
  );
}
