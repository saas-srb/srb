/** Client-safe description of what the current viewer may do — computed on the server (`lib/cybervault/ui.ts`), used to show/hide controls. The server re-checks everything. */
export interface VaultUi {
  create: boolean;
  edit: boolean;
  del: boolean;
  reveal: boolean;
  manageDocs: boolean;
  download: boolean;
  writeCompany: boolean;
  /** Client ids the viewer may write to, or "all". */
  writeClients: "all" | string[];
  /** Clients selectable as an owner in a form (already limited to what the viewer may write). */
  clients: { value: string; label: string }[];
  revealSeconds: number;
  encryptionReady: boolean;
}

export function canWriteRow(ui: VaultUi, scope: "company" | "client", clientId: string | null): boolean {
  if (scope === "company") return ui.writeCompany;
  return ui.writeClients === "all" ? true : clientId !== null && ui.writeClients.includes(clientId);
}

/** When set, forms are pre-filled with this owner and the owner picker is hidden (client/company profile pages). */
export interface LockedOwner {
  scope: "company" | "client";
  clientId: string | null;
}
