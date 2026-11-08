import { jsonForScript } from "@/lib/security/json-script";
import { saasOrigin } from "@/lib/platform/saas/request";

const URL_KEYS = new Set(["url", "item", "@id", "mainEntityOfPage", "image", "logo"]);

/** Search engines want absolute addresses: relative ones written by the page are completed with this site's origin. */
function absolute(v: unknown, origin: string, key = ""): unknown {
  if (typeof v === "string") return URL_KEYS.has(key) && v.startsWith("/") && !v.startsWith("//") ? `${origin}${v}` : v;
  if (Array.isArray(v)) return v.map((x) => absolute(x, origin, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, absolute(x, origin, k)]));
  return v;
}

/** One or more schema.org objects as JSON-LD, for Google rich results. */
export default async function JsonLd({ data }: { data: object | object[] }) {
  const origin = await saasOrigin();
  return (
    <>
      {(Array.isArray(data) ? data : [data]).map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(absolute(d, origin) as object) }} />
      ))}
    </>
  );
}
