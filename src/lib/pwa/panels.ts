import "server-only";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import { whiteLabelProductName } from "@/lib/platform/panels/types";

/** The products this company can open from the app (switched on for it), for choosing a start page and shortcuts. */
export interface AppPanelOption {
  key: string;
  name: string;
  shortName: string;
  route: string;
}

const EXCLUDED = new Set(["website", "platform"]);

export async function availableAppPanels(): Promise<AppPanelOption[]> {
  const [panels, off] = await Promise.all([listPanels(), currentCompanyId().then((id) => unavailablePanelKeys(id)).catch(() => new Set<string>())]);
  return panels
    .filter((p) => p.active && !EXCLUDED.has(p.key) && !off.has(p.key))
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ key: p.key, name: whiteLabelProductName(p.name), shortName: whiteLabelProductName(p.shortName || p.name), route: p.route || `/${p.key}` }));
}
