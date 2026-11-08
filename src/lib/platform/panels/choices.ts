import "server-only";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import { whiteLabelProductName } from "@/lib/platform/panels/types";

export interface PanelChoice {
  key: string;
  label: string;
  description: string;
  core: boolean;
}

/**
 * The products this company can choose from (onboarding, plan & settings screens): the code-level module list with the
 * Product Registry's names and descriptions applied, minus anything the platform switched off for everyone or for this company
 * (`includeUnavailable` keeps them — for the Platform Console's plan and add-on editors).
 */
export async function listPanelChoices(opts: { includeUnavailable?: boolean } = {}): Promise<PanelChoice[]> {
  const [registry, off] = await Promise.all([listPanels(), opts.includeUnavailable ? Promise.resolve(new Set<string>()) : currentCompanyId().then(unavailablePanelKeys)]);
  const planModules = new Set<string>(MODULES.map((m) => m.key));
  // Every product the registry lists. Core products, and products that aren't plan modules (Help & Support, the public website),
  // are always on for a company; the rest can be chosen / included in plans.
  return registry
    .filter((p) => !off.has(p.key))
    .map((p) => ({ key: p.key, label: opts.includeUnavailable ? p.name : whiteLabelProductName(p.name), description: p.description, core: p.core || !planModules.has(p.key) }));
}

/** Registry name per module key — for admin screens that list modules (plans, add-ons, companies). */
export async function panelLabels(): Promise<Map<string, string>> {
  const registry = await listPanels();
  const labels = new Map<string, string>(MODULES.map((m) => [m.key, m.label]));
  for (const p of registry) labels.set(p.key, p.name);
  return labels;
}
