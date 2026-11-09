/**
 * Template batches. Adding batch T2..T5 = add a folder with an index.ts exporting a TemplateDef[] and one line here.
 * Nothing else changes: the registry, search, validator tests and the Library read this list.
 */
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { T4_VENDOR_PRESALE_FINANCE } from "@/lib/products/playbook-ai/catalogue/templates/t4-vendor-presale-finance";
import { T3_OPERATIONS } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations";
import { T2_CONTRACTS } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts";
import { T1_HR } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr";
import { enrich } from "@/lib/products/playbook-ai/catalogue/templates/enrich";
import { T5_TRAINING_MARKETING_LEGAL } from "@/lib/products/playbook-ai/catalogue/templates/t5-training-marketing-legal";

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
  { id: "T1", label: "HR and employee lifecycle", categories: ["hr"], complete: true, templates: T1_HR.map(enrich) },
  { id: "T2", label: "Contracts", categories: ["ct"], complete: true, templates: T2_CONTRACTS.map(enrich) },
  { id: "T3", label: "Management, operations, IT and security", categories: ["mg", "op", "it"], complete: true, templates: T3_OPERATIONS.map(enrich) },
  { id: "T4", label: "Vendor, pre-sale and finance", categories: ["vn", "ps", "fn"], complete: true, templates: T4_VENDOR_PRESALE_FINANCE.map(enrich) },
  { id: "T5", label: "Training, marketing and compliance/legal", categories: ["tr", "mk", "lg"], complete: true, templates: T5_TRAINING_MARKETING_LEGAL.map(enrich) },
];

export const ALL_TEMPLATES: TemplateDef[] = TEMPLATE_BATCHES.flatMap((b) => b.templates);
