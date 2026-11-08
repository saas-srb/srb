import { unstable_cache } from "next/cache";
import { currentCompanyId, runAsCompany } from "@/lib/platform/tenancy/context";

/**
 * `unstable_cache`, per company. The company is resolved OUTSIDE the cached
 * function (request APIs like `headers()` aren't allowed inside it) and
 * passed in as the first argument, so it's part of every cache key — one
 * company's cached content can never be served to another. Inside, the
 * loader runs in that company's scope, so its `getDb()` calls stay scoped.
 */
export function companyCache<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  options: { tags?: string[]; revalidate?: number | false },
): (...args: A) => Promise<R> {
  const cached = unstable_cache((companyId: string, ...args: A) => runAsCompany(companyId, () => fn(...args)), keyParts, options);
  return async (...args: A) => cached(await currentCompanyId(), ...args);
}
