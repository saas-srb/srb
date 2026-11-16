import "server-only";
import { canUseSrb, providerByKey } from "@/lib/platform/connections/catalog";
import { cardStatus, usedByProducts, STATUS_LABEL, type CardStatus } from "@/lib/platform/connections/cards";
import { noteFor } from "@/lib/platform/connections/summary-note";

export { noteFor };
import { platformServiceReady } from "@/lib/platform/connections/platform-services";
import { getConnectionView, type ConnectionView } from "@/lib/platform/connections/store";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

/**
 * The status of ONE connection for the current company, worked out the same way everywhere: the Integrations cards, the read-only summaries inside
 * product settings ("Manage in CommandOS") and the Product settings cards all call this.
 */
export interface ConnectionSummaryData {
  key: string;
  name: string;
  status: CardStatus;
  label: string;
  note: string;
  canSrb: boolean;
  srbReady: boolean;
  usedBy: string[];
  href: string;
}

export const integrationHref = (provider: string) => `/commandos/settings/integrations?open=${encodeURIComponent(provider)}`;

export async function connectionStatus(provider: string, view?: ConnectionView | null): Promise<{ status: CardStatus; canSrb: boolean; srbReady: boolean; view: ConnectionView | null }> {
  const canSrb = canUseSrb(provider);
  const srbReady = canSrb ? await platformServiceReady(provider) : false;
  const v = view === undefined ? await getConnectionView(provider) : view;
  const status = cardStatus({ canSrb, srbReady, mode: v?.saved ? v.mode : "srb", hasOwnKeys: Boolean(v?.saved), lastTestOk: v?.lastTest ? v.lastTest.ok : null });
  return { status, canSrb, srbReady, view: v };
}

export async function connectionSummary(provider: string): Promise<ConnectionSummaryData | null> {
  const p = providerByKey.get(provider);
  if (!p) return null;
  const [{ status, canSrb, srbReady, view }, registry, unavailable] = await Promise.all([connectionStatus(provider), listPanels(), currentCompanyId().then(unavailablePanelKeys)]);
  return { key: provider, name: p.name, status, label: STATUS_LABEL[status], note: noteFor(status, canSrb, view?.lastTest?.message), canSrb, srbReady, usedBy: usedByProducts(provider, registry, unavailable), href: integrationHref(provider) };
}
