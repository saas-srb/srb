/**
 * Client-safe constants for the Documents listing — split out of
 * `documents.ts` for the same reason as `activity-log-shared.ts`: that file
 * has `import "server-only"` and imports several server-only data modules,
 * so pulling any export from it into a "use client" component poisons the
 * whole client bundle. Nothing here touches the database — safe to import
 * from client components.
 */

export const DOCUMENT_MODULES = ["pms", "hrms", "portal"] as const;
export type DocumentModule = (typeof DOCUMENT_MODULES)[number];

const MODULE_LABELS: Record<DocumentModule, string> = {
  pms: "SprintOS",
  hrms: "TalentOS",
  portal: "ClientOS",
};

export function documentModuleLabel(module: string): string {
  return MODULE_LABELS[module as DocumentModule] ?? module;
}
