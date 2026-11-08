import { redirect } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionCard } from "@/components/products/cybervault/DlmsUi";
import DlmsFilterBar, { type FilterField } from "@/components/products/cybervault/DlmsFilterBar";
import { DocumentsTable } from "@/components/products/cybervault/RecordTables";
import { DocumentDialog } from "@/components/products/cybervault/RecordDialogs";
import { getViewer } from "@/lib/products/cybervault/viewer";
import { listDocuments } from "@/lib/products/cybervault/records";
import { buildVaultUi } from "@/lib/products/cybervault/ui";
import { DOCUMENT_CATEGORIES, EXPIRY_FILTERS } from "@/lib/products/cybervault/constants";
import { SCOPE_OPTIONS, STATUS_OPTIONS, queryFrom, visibleClientOptions, type SearchParams } from "@/lib/products/cybervault/page";

export default async function DocumentVaultPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  const sp = await searchParams;
  const [rows, ui, clients] = await Promise.all([listDocuments(viewer, queryFrom(sp)), buildVaultUi(viewer), visibleClientOptions(viewer)]);
  const fields: FilterField[] = [
    { key: "q", label: "Search", type: "search", placeholder: "Name, description, file…" },
    { key: "scope", label: "Ownership", type: "select", options: SCOPE_OPTIONS, allLabel: "Company & clients" },
    { key: "client", label: "Client", type: "select", options: clients, allLabel: "All clients" },
    { key: "category", label: "Category", type: "select", options: DOCUMENT_CATEGORIES, allLabel: "All categories" },
    { key: "expiry", label: "Expiry", type: "select", options: EXPIRY_FILTERS, allLabel: "Any" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, allLabel: "Active" },
  ];
  const canAdd = ui.manageDocs && (ui.writeCompany || ui.clients.length > 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Document Vault"
        crumbs={[{ label: "Document Vault" }]}
        description="Agreements, KYC, certificates and other files — stored privately, versioned, and only reachable through this product."
        actions={canAdd && <DocumentDialog ui={ui} trigger={<Button size="sm"><Upload className="size-3.5" data-icon="inline-start" />Upload document</Button>} />}
      />
      <DlmsFilterBar fields={fields} values={{ q: sp.q ?? "", scope: sp.scope ?? "", client: sp.client ?? "", category: sp.category ?? "", expiry: sp.expiry ?? "", status: sp.status ?? "" }} />
      <SectionCard title={`${rows.length} document${rows.length === 1 ? "" : "s"}`}>
        <DocumentsTable rows={rows} ui={ui} />
      </SectionCard>
    </div>
  );
}
