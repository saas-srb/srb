import { CYBERVAULT_MICRO } from "./cybervault";
import { RANKMAX_MICRO } from "./rankmax";
import { AGENTOS_MICRO } from "./agentos";
import type { MicroFeature } from "./types";
export * from "./types";

/** The micro catalogue: every feature of every FINISHED product (see docs/people-access-v2.md for which). A product is finished when this list has it. */
export const MICRO: MicroFeature[] = [...CYBERVAULT_MICRO, ...RANKMAX_MICRO, ...AGENTOS_MICRO];

const BY_KEY = new Map(MICRO.map((m) => [m.key, m]));
const BY_PRODUCT = new Map<string, MicroFeature[]>();
for (const m of MICRO) BY_PRODUCT.set(m.product, [...(BY_PRODUCT.get(m.product) ?? []), m]);

export const FINISHED_PRODUCTS: string[] = [...BY_PRODUCT.keys()];
export const isFinished = (product: string) => BY_PRODUCT.has(product);
export const microByKey = (key: string) => BY_KEY.get(key);
export const microOf = (product: string): MicroFeature[] => BY_PRODUCT.get(product) ?? [];
