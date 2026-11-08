import "server-only";
import type { Styles } from "@react-pdf/renderer";

/**
 * A React-PDF style sheet re-evaluated on every access. A document's styles read
 * the CURRENT company's theme colours (`PDF_COLORS`), which only exist while a
 * PDF is being rendered — a sheet built once at module load would freeze
 * whichever company rendered first. (`StyleSheet.create` is an identity
 * function in React-PDF, so the plain object is all a sheet ever was.)
 */
export function lazyStyles<const T extends Styles>(factory: () => T): T {
  return new Proxy({} as T, {
    get: (_t, key) => (factory() as Record<PropertyKey, unknown>)[key],
    ownKeys: () => Reflect.ownKeys(factory()),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}
