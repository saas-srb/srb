import "server-only";
import { can, canType, type DlmsViewer } from "@/lib/products/cybervault/viewer";
import { LIMITS, RECORD_TYPES } from "@/lib/products/cybervault/constants";
import { isEncryptionConfigured } from "@/lib/products/cybervault/crypto";
import { listClientRefs } from "@/lib/products/cybervault/access";
import type { VaultUi } from "@/components/products/cybervault/vault-types";

/** What the viewer may do, per record type, as plain flags for the screens. Hiding is never the boundary: every action and route re-checks. */
export async function buildVaultUi(viewer: DlmsViewer): Promise<VaultUi> {
  const writeCompany = viewer.companyAccess && can(viewer, "company.view") && can(viewer, "company.manage");
  const mayWriteClients = can(viewer, "clients.view") && can(viewer, "clients.manage");
  const all = mayWriteClients ? await listClientRefs() : [];
  const allowed = viewer.seesAll ? all : all.filter((c) => viewer.clientIds.includes(c._id));
  const types = Object.fromEntries(RECORD_TYPES.map((t) => [t, { view: canType(viewer, t, "view"), create: canType(viewer, t, "create"), edit: canType(viewer, t, "edit"), del: canType(viewer, t, "delete") }])) as VaultUi["types"];
  return {
    types,
    reveal: can(viewer, "credentials.reveal"),
    download: can(viewer, "documents.download"),
    writeCompany,
    writeClients: !mayWriteClients ? [] : viewer.seesAll ? "all" : viewer.clientIds,
    clients: allowed.map((c) => ({ value: c._id, label: c.companyName })),
    revealSeconds: LIMITS.revealSeconds,
    encryptionReady: isEncryptionConfigured(),
  };
}
