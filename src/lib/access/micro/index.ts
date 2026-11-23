import { CYBERVAULT_MICRO } from "./cybervault";
import { RANKMAX_MICRO } from "./rankmax";
import { AGENTOS_MICRO } from "./agentos";
import { EVALIQ_MICRO } from "./evaliq";
import { VIRALPULSE_MICRO } from "./viralpulse";
import { CONTRACTFLOW_MICRO } from "./contractflow";
import { SITECRAFT_MICRO } from "./sitecraft";
import { DEALFLOW_MICRO } from "./dealflow";
import { CASHFLOW_MICRO } from "./cashflow";
import { HUDDLE_MICRO } from "./huddle";
import { TALENTOS_MICRO } from "./talentos";
import { SPRINTOS_MICRO } from "./sprintos";
import { SPENDIQ_MICRO } from "./spendiq";
import { COHORTAI_MICRO } from "./cohortai";
import { PLAYBOOK_MICRO } from "./playbook";
import { DATABRAIN_MICRO } from "./databrain";
import type { MicroFeature } from "./types";
export * from "./types";

/** The micro catalogue: every feature of every FINISHED product (see docs/people-access-v2.md for which). A product is finished when this list has it. */
export const MICRO: MicroFeature[] = [...CYBERVAULT_MICRO, ...RANKMAX_MICRO, ...AGENTOS_MICRO, ...EVALIQ_MICRO, ...VIRALPULSE_MICRO, ...CONTRACTFLOW_MICRO, ...SITECRAFT_MICRO, ...DEALFLOW_MICRO, ...CASHFLOW_MICRO, ...HUDDLE_MICRO, ...TALENTOS_MICRO, ...SPRINTOS_MICRO, ...SPENDIQ_MICRO, ...COHORTAI_MICRO, ...PLAYBOOK_MICRO, ...DATABRAIN_MICRO];

const BY_KEY = new Map(MICRO.map((m) => [m.key, m]));
const BY_PRODUCT = new Map<string, MicroFeature[]>();
for (const m of MICRO) BY_PRODUCT.set(m.product, [...(BY_PRODUCT.get(m.product) ?? []), m]);

export const FINISHED_PRODUCTS: string[] = [...BY_PRODUCT.keys()];
export const isFinished = (product: string) => BY_PRODUCT.has(product);
export const microByKey = (key: string) => BY_KEY.get(key);
export const microOf = (product: string): MicroFeature[] => BY_PRODUCT.get(product) ?? [];
