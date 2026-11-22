import { microOf } from "./index";

/**
 * STAGED conversion of a staff-style product (TalentOS, then SprintOS, SpendIQ, CohortAI, Playbook). The micro catalogue of the product is complete from the start
 * (so the People & access screens, the adapter and the derived legacy roles already speak micro features); the CODE is converted one module at a time.
 * While a module is pending its pages still call the old role-file functions, which stay correct because every micro feature names the legacy capabilities
 * it needs (`legacy[]`) and the adapter derives the old roles from the person's micro features (parity: 0 widened / 0 withheld in the product's own files).
 * A module is converted when ALL of its pages, actions, routes, exports and Ask-AI tools check its micro features and its "Me" pages are scope-aware normal pages.
 * The product's Ask-AI panel joins FINISHED_PANELS only when `pending` is empty (the test fails otherwise). Never leave a module half converted at the end of a run.
 */
export interface StagedProduct {
  /** The Ask-AI panel id that joins FINISHED_PANELS when the product is fully converted. */
  panel: string;
  /** Modules (as named in the micro catalogue) whose code is fully converted. */
  converted: string[];
  /** Modules still on the old role-file checks. */
  pending: string[];
}

export const STAGED: Record<string, StagedProduct> = {
  talentos: {
    panel: "hrms",
    converted: ["Leave", "Attendance", "Requests", "Holidays"],
    pending: ["Dashboard", "Employees", "Documents", "Payroll", "Recruitment", "Settings"],
  },
};

export const isStaged = (product: string) => product in STAGED;
export const pendingModules = (product: string): string[] => STAGED[product]?.pending ?? [];
/** The micro features of the modules that are converted (what the coverage test enforces so far). */
export const convertedFeatures = (product: string) => microOf(product).filter((m) => STAGED[product]?.converted.includes(m.module));
