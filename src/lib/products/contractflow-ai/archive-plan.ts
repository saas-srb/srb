import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";

/**
 * Dry-run report for the earlier ContractFlow data (`lpms_*`). It only READS: nothing is moved, rewritten or deleted, and no `cf_*`
 * collection is created. The owner decides later whether old documents are imported into the vault as "imported, unsigned" or stay
 * as a read-only archive; until then the old data is kept exactly as it is and the old pages keep reading it.
 */

export const LPMS_COLLECTIONS = [
  "lpms_documents",
  "lpms_document_versions",
  "lpms_approvals",
  "lpms_signatures",
  "lpms_audit",
  "lpms_templates",
  "lpms_maker_types",
  "lpms_workflows",
  "lpms_categories",
  "lpms_variable_cache",
] as const;

export interface LpmsArchiveCompanyPlan {
  companyId: string;
  counts: Record<string, number>;
  documentsByStatus: Record<string, number>;
  /** Old signature requests that have at least one signer marked signed: evidence that must never be lost. */
  signedSignatureRequests: number;
  /** What would happen to each collection if the owner approves a migration. Descriptive only. */
  proposal: { collection: string; rows: number; action: "import_to_vault_as_unsigned" | "keep_read_only_archive" | "drop_candidate_after_owner_decision"; note: string }[];
}

export interface LpmsArchivePlan {
  dryRun: true;
  /** Always 0: this function performs no writes. */
  writes: 0;
  generatedAt: string;
  companies: LpmsArchiveCompanyPlan[];
  totals: Record<string, number>;
}

const PROPOSAL: Record<string, { action: LpmsArchiveCompanyPlan["proposal"][number]["action"]; note: string }> = {
  lpms_documents: { action: "import_to_vault_as_unsigned", note: "Each document would appear in the vault as 'imported, unsigned' with its dates; the original row stays untouched." },
  lpms_document_versions: { action: "keep_read_only_archive", note: "Version history stays where it is, linked from the imported item." },
  lpms_approvals: { action: "keep_read_only_archive", note: "Approval history is evidence; kept." },
  lpms_signatures: { action: "keep_read_only_archive", note: "Old signature requests were never delivered to signers; kept as records." },
  lpms_audit: { action: "keep_read_only_archive", note: "Audit rows are never deleted." },
  lpms_templates: { action: "keep_read_only_archive", note: "Authoring moved to Playbook AI; templates are not migrated automatically." },
  lpms_maker_types: { action: "keep_read_only_archive", note: "Document types are replaced by Playbook document types." },
  lpms_workflows: { action: "keep_read_only_archive", note: "Kept for the approvals already started." },
  lpms_categories: { action: "keep_read_only_archive", note: "Kept." },
  lpms_variable_cache: { action: "drop_candidate_after_owner_decision", note: "A cache that expires on its own; holds no records of value." },
};

export async function planLpmsArchive(opts: { companyId?: string } = {}): Promise<LpmsArchivePlan> {
  const db = await getPlatformDb();
  const match = opts.companyId ? { $match: { companyId: opts.companyId } } : { $match: {} };
  const byCompany = new Map<string, LpmsArchiveCompanyPlan>();
  const get = (id: string) => {
    let c = byCompany.get(id);
    if (!c) {
      c = { companyId: id, counts: Object.fromEntries(LPMS_COLLECTIONS.map((n) => [n, 0])), documentsByStatus: {}, signedSignatureRequests: 0, proposal: [] };
      byCompany.set(id, c);
    }
    return c;
  };
  for (const name of LPMS_COLLECTIONS) {
    const rows = await db.collection(name).aggregate<{ _id: string | null; n: number }>([match, { $group: { _id: "$companyId", n: { $sum: 1 } } }]).toArray();
    for (const r of rows) get(String(r._id ?? "(none)")).counts[name] = r.n;
  }
  const statuses = await db.collection("lpms_documents").aggregate<{ _id: { c: string | null; s: string | null }; n: number }>([match, { $group: { _id: { c: "$companyId", s: "$status" }, n: { $sum: 1 } } }]).toArray();
  for (const r of statuses) get(String(r._id.c ?? "(none)")).documentsByStatus[String(r._id.s ?? "unknown")] = r.n;
  const signed = await db.collection("lpms_signatures").aggregate<{ _id: string | null; n: number }>([match, { $match: { "signers.status": "signed" } }, { $group: { _id: "$companyId", n: { $sum: 1 } } }]).toArray();
  for (const r of signed) get(String(r._id ?? "(none)")).signedSignatureRequests = r.n;

  const companies = [...byCompany.values()].sort((a, b) => a.companyId.localeCompare(b.companyId));
  const totals: Record<string, number> = Object.fromEntries(LPMS_COLLECTIONS.map((n) => [n, 0]));
  for (const c of companies) {
    for (const n of LPMS_COLLECTIONS) {
      totals[n] += c.counts[n];
      c.proposal.push({ collection: n, rows: c.counts[n], ...PROPOSAL[n] });
    }
  }
  return { dryRun: true, writes: 0, generatedAt: new Date().toISOString(), companies, totals };
}
