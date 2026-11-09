/** Batch T3: management, operations, IT and security. To add a part, create a file in this folder exporting a TemplateDef[] and list it here. */
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { MG_GOVERNANCE } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/management2";
import { OP_DOCS } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/operations";
import { IT_DOCS } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/it";
import { MG_PROJECTS } from "@/lib/products/playbook-ai/catalogue/templates/t3-operations/management";

export const T3_OPERATIONS: TemplateDef[] = [...MG_PROJECTS, ...MG_GOVERNANCE, ...OP_DOCS, ...IT_DOCS];
