import "server-only";
import { can, type DlmsViewer } from "@/lib/products/cybervault/viewer";
import { LIMITS } from "@/lib/products/cybervault/constants";
import { isEncryptionConfigured } from "@/lib/products/cybervault/crypto";
import { listClientRefs } from "@/lib/products/cybervault/access";
import type { VaultUi } from "@/components/products/cybervault/vault-types";

export async function buildVaultUi(viewer: DlmsViewer): Promise<VaultUi> {
  const writeCompany = viewer.companyAccess && can(viewer, "MANAGE_COMPANY");
  const mayWriteClients = can(viewer, "MANAGE_CLIENTS");
  const all = mayWriteClients ? await listClientRefs() : [];
  const allowed = viewer.seesAll ? all : all.filter((c) => viewer.clientIds.includes(c._id));
  return {
    create: can(viewer, "CREATE"),
    edit: can(viewer, "EDIT"),
    del: can(viewer, "DELETE"),
    reveal: can(viewer, "REVEAL"),
    manageDocs: can(viewer, "MANAGE_DOCUMENTS"),
    download: can(viewer, "DOWNLOAD"),
    writeCompany,
    writeClients: !mayWriteClients ? [] : viewer.seesAll ? "all" : viewer.clientIds,
    clients: allowed.map((c) => ({ value: c._id, label: c.companyName })),
    revealSeconds: LIMITS.revealSeconds,
    encryptionReady: isEncryptionConfigured(),
  };
}
