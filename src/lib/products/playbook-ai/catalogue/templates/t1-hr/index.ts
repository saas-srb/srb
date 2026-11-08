/** Batch T1: HR lifecycle. To add a part, create a file in this folder exporting a TemplateDef[] and list it here. */
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { HR_ONBOARDING } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/onboarding";
import { HR_PROBATION } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/probation";
import { HR_DISCIPLINE } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/discipline";
import { HR_EXIT } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/exit";
import { HR_POLICIES } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/policies";
import { HR_RECRUITMENT } from "@/lib/products/playbook-ai/catalogue/templates/t1-hr/recruitment";

export const T1_HR: TemplateDef[] = [...HR_RECRUITMENT, ...HR_ONBOARDING, ...HR_PROBATION, ...HR_DISCIPLINE, ...HR_EXIT, ...HR_POLICIES];
