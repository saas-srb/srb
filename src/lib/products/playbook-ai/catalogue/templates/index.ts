/**
 * Template batches. Adding batch T2..T5 = add a folder with an index.ts exporting a TemplateDef[] and one line here.
 * Nothing else changes: the registry, search, validator tests and the Library read this list.
 */
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { T2_CONTRACTS } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts";
import { T1_HR } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr";

export interface TemplateBatch {
  id: string;
  label: string;
  /** Catalogue categories this batch is meant to cover (the test checks full coverage for finished batches). */
  categories: readonly string[];
  /** True once the batch covers every type in its categories. */
  complete: boolean;
  templates: TemplateDef[];
}

export const TEMPLATE_BATCHES: TemplateBatch[] = [
  { id: "T1", label: "HR and employee lifecycle", categories: ["hr"], complete: true, templates: T1_HR },
  { id: "T2", label: "Contracts", categories: ["ct"], complete: true, templates: T2_CONTRACTS },
];

export const ALL_TEMPLATES: TemplateDef[] = TEMPLATE_BATCHES.flatMap((b) => b.templates);
