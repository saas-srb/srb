import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionCard } from "@/components/products/cybervault/DlmsUi";
import DlmsFilterBar, { type FilterField } from "@/components/products/cybervault/DlmsFilterBar";
import { LinksTable } from "@/components/products/cybervault/RecordTables";
import { LinkDialog } from "@/components/products/cybervault/RecordDialogs";
import { getViewer } from "@/lib/products/cybervault/viewer";
import { credentialOptions, listLinks } from "@/lib/products/cybervault/records";
import { buildVaultUi } from "@/lib/products/cybervault/ui";
import { EXPIRY_FILTERS, LINK_TYPES } from "@/lib/products/cybervault/constants";
import { SCOPE_OPTIONS, STATUS_OPTIONS, queryFrom, visibleClientOptions, type SearchParams } from "@/lib/products/cybervault/page";

export default async function UrlsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  const sp = await searchParams;
  const [rows, ui, clients, creds] = await Promise.all([listLinks(viewer, queryFrom(sp)), buildVaultUi(viewer), visibleClientOptions(viewer), credentialOptions(viewer)]);
  const fields: FilterField[] = [
    { key: "q", label: "Search", type: "search", placeholder: "Name, URL, account…" },
    { key: "scope", label: "Ownership", type: "select", options: SCOPE_OPTIONS, allLabel: "Company & clients" },
    { key: "client", label: "Client", type: "select", options: clients, allLabel: "All clients" },
    { key: "category", label: "Type", type: "select", options: LINK_TYPES, allLabel: "All types" },
    { key: "expiry", label: "Expiry", type: "select", options: EXPIRY_FILTERS, allLabel: "Any" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, allLabel: "Active" },
  ];
  const canAdd = ui.create && (ui.writeCompany || ui.clients.length > 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="URLs & Accounts"
        crumbs={[{ label: "URLs & Accounts" }]}
        description="Websites, admin products, hosting, Git, cloud, email, domains and government portals — each optionally linked to its credential."
        actions={canAdd && <LinkDialog ui={ui} credentials={creds} trigger={<Button size="sm"><Plus className="size-3.5" data-icon="inline-start" />Add URL / account</Button>} />}
      />
      <DlmsFilterBar fields={fields} values={{ q: sp.q ?? "", scope: sp.scope ?? "", client: sp.client ?? "", category: sp.category ?? "", expiry: sp.expiry ?? "", status: sp.status ?? "" }} />
      <SectionCard title={`${rows.length} record${rows.length === 1 ? "" : "s"}`}>
        <LinksTable rows={rows} ui={ui} credentials={creds} />
      </SectionCard>
    </div>
  );
}
