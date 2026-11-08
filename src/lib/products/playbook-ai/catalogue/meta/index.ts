/** All catalogue metadata, in plan order. One file per category; add a type by adding a row to its category file. */
import type { CatalogueMeta } from "@/lib/products/playbook-ai/catalogue/types";
import { HR_META } from "@/lib/products/playbook-ai/catalogue/meta/hr";
import { MG_META } from "@/lib/products/playbook-ai/catalogue/meta/mg";
import { OP_META } from "@/lib/products/playbook-ai/catalogue/meta/op";
import { IT_META } from "@/lib/products/playbook-ai/catalogue/meta/it";
import { VN_META } from "@/lib/products/playbook-ai/catalogue/meta/vn";
import { PS_META } from "@/lib/products/playbook-ai/catalogue/meta/ps";
import { CT_META } from "@/lib/products/playbook-ai/catalogue/meta/ct";
import { TR_META } from "@/lib/products/playbook-ai/catalogue/meta/tr";
import { MK_META } from "@/lib/products/playbook-ai/catalogue/meta/mk";
import { FN_META } from "@/lib/products/playbook-ai/catalogue/meta/fn";
import { LG_META } from "@/lib/products/playbook-ai/catalogue/meta/lg";

export const ALL_META: CatalogueMeta[] = [
  ...HR_META,
  ...MG_META,
  ...OP_META,
  ...IT_META,
  ...VN_META,
  ...PS_META,
  ...CT_META,
  ...TR_META,
  ...MK_META,
  ...FN_META,
  ...LG_META,
];
