import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { LEGAL_TEMPLATES } from "@/lib/products/playbook-ai/catalogue/templates/t5-training-marketing-legal/legal";
import { MARKETING_TEMPLATES } from "@/lib/products/playbook-ai/catalogue/templates/t5-training-marketing-legal/marketing";
import { TRAINING_TEMPLATES } from "@/lib/products/playbook-ai/catalogue/templates/t5-training-marketing-legal/training";

/** Batch T5: training (10), marketing (11), compliance and legal (11). */
export const T5_TRAINING_MARKETING_LEGAL: TemplateDef[] = [...TRAINING_TEMPLATES, ...MARKETING_TEMPLATES, ...LEGAL_TEMPLATES];
