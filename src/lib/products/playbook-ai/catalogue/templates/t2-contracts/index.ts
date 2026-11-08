/** Batch T2: contracts. To add a part, create a file in this folder exporting a TemplateDef[] and list it here. */
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { CT_PROTECTION } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/protection";
import { CT_PEOPLE } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/people";
import { CT_COMMERCIAL } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/commercial";
import { CT_CLIENT } from "@/lib/products/playbook-ai/catalogue/templates/t2-contracts/client";

export const T2_CONTRACTS: TemplateDef[] = [...CT_CLIENT, ...CT_PROTECTION, ...CT_PEOPLE, ...CT_COMMERCIAL];
