/** Batch T4: vendor, pre-sale and finance. To add a part, create a file in this folder exporting a TemplateDef[] and list it here. */
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { PS_DOCS } from "@/lib/products/playbook-ai/catalogue/templates/t4-vendor-presale-finance/presale";
import { FN_DOCS } from "@/lib/products/playbook-ai/catalogue/templates/t4-vendor-presale-finance/finance";
import { VN_DOCS } from "@/lib/products/playbook-ai/catalogue/templates/t4-vendor-presale-finance/vendor";

export const T4_VENDOR_PRESALE_FINANCE: TemplateDef[] = [...VN_DOCS, ...PS_DOCS, ...FN_DOCS];
