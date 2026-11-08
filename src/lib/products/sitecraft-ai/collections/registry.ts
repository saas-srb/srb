import { SITE_COLLECTIONS } from "./defs";
import { productsCollection } from "./products-def";
import type { CollectionDef, CollectionKey } from "./types";

/** All collections — for server code and the admin. Client code imports only the definitions it needs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous record types
export const COLLECTIONS: Record<CollectionKey, CollectionDef<any, any>> = { ...SITE_COLLECTIONS, products: productsCollection };
