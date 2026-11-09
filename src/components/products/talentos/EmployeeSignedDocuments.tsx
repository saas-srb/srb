import { listEmployeeContractDocs } from "@/lib/products/contractflow-ai/seal-public";
import { ITEM_KIND_INFO, isItemKind } from "@/lib/products/playbook-ai/items-types";

/** Signed and issued documents from ContractFlow for one employee (SOP acknowledgements, KPI sheets, letters). Download goes through an access-checked route. */
export default async function EmployeeSignedDocuments({ employeeId, title = "Signed documents" }: { employeeId: string; title?: string }) {
  const docs = await listEmployeeContractDocs(employeeId).catch(() => null);
  return (
    <section className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
      <h2 className="text-sm font-bold">{title}</h2>
      <p className="text-xs text-muted-foreground">Documents sent through ContractFlow and signed. The signed copy can be downloaded by the employee and by HR.</p>
      {docs === null ? <p className="mt-3 text-sm text-muted-foreground">These documents could not be loaded right now.</p>
        : docs.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No signed documents yet.</p>
        : (
          <ul className="mt-3 divide-y divide-border/50 text-sm">
            {docs.map((d) => (
              <li key={d.cloneId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium">{d.title}</span> <span className="text-muted-foreground">· {isItemKind(d.kind) ? ITEM_KIND_INFO[d.kind].singular : "Document"} · signed {new Date(d.signedAt ?? Date.now()).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}</span></span>
                {d.hasSignedCopy ? <a className="text-primary underline-offset-2 hover:underline" href={`/api/talentos/employee-signed/${d.cloneId}`}>Download signed PDF</a> : <span className="text-xs text-muted-foreground">Signed copy is being prepared</span>}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
