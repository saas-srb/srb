import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionCard, Notice } from "@/components/products/cybervault/DlmsUi";
import DlmsFilterBar, { type FilterField } from "@/components/products/cybervault/DlmsFilterBar";
import { CredentialsTable } from "@/components/products/cybervault/RecordTables";
import { CredentialDialog } from "@/components/products/cybervault/RecordDialogs";
import { getViewer } from "@/lib/products/cybervault/viewer";
import { listCredentials } from "@/lib/products/cybervault/records";
import { buildVaultUi } from "@/lib/products/cybervault/ui";
import { CREDENTIAL_TYPES, EXPIRY_FILTERS } from "@/lib/products/cybervault/constants";
import { SCOPE_OPTIONS, STATUS_OPTIONS, queryFrom, visibleClientOptions, type SearchParams } from "@/lib/products/cybervault/page";

export default async function CredentialVaultPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  const sp = await searchParams;
  const [rows, ui, clients] = await Promise.all([listCredentials(viewer, queryFrom(sp)), buildVaultUi(viewer), visibleClientOptions(viewer)]);
  const fields: FilterField[] = [
    { key: "q", label: "Search", type: "search", placeholder: "Name, username, URL…" },
    { key: "scope", label: "Ownership", type: "select", options: SCOPE_OPTIONS, allLabel: "Company & clients" },
    { key: "client", label: "Client", type: "select", options: clients, allLabel: "All clients" },
    { key: "category", label: "Account type", type: "select", options: CREDENTIAL_TYPES, allLabel: "All types" },
    { key: "expiry", label: "Expiry", type: "select", options: EXPIRY_FILTERS, allLabel: "Any" },
    { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, allLabel: "Active" },
  ];
  const canAdd = ui.create && (ui.writeCompany || ui.clients.length > 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Credential Vault"
        crumbs={[{ label: "Credential Vault" }]}
        description="Company and client logins. Passwords are encrypted, masked by default, and every reveal or copy is logged."
        actions={canAdd && <CredentialDialog ui={ui} trigger={<Button size="sm"><Plus className="size-3.5" data-icon="inline-start" />Add credential</Button>} />}
      />
      {!ui.encryptionReady && <Notice tone="warn"><strong>Encryption key missing.</strong> Set <code>PLATFORM_ENCRYPTION_KEY</code> on the server before storing passwords — until then passwords cannot be saved.</Notice>}
      <DlmsFilterBar fields={fields} values={{ q: sp.q ?? "", scope: sp.scope ?? "", client: sp.client ?? "", category: sp.category ?? "", expiry: sp.expiry ?? "", status: sp.status ?? "" }} />
      <SectionCard title={`${rows.length} credential${rows.length === 1 ? "" : "s"}`}>
        <CredentialsTable rows={rows} ui={ui} />
      </SectionCard>
    </div>
  );
}
