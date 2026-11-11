/**
 * The platform's own hosts, derived from SAAS_HOSTS and the root domain (never typed in): the bare root, `www.`, `app.` and the wildcard
 * `*.<root>`. Pure. The bare root redirects to `www.` (the usual setup); every other host is served directly.
 */

export interface PlatformHost {
  host: string;
  role: "root" | "www" | "app" | "wildcard";
  /** The host this one redirects to (the bare root redirects to www). */
  redirectTo?: string;
}

const clean = (h: string): string | null => {
  const host = h.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(host) && host.includes(".") && !host.endsWith(".localhost") ? host : null;
};

export function platformHostPlan(saasHosts: string | undefined | null, root: string | null | undefined): PlatformHost[] {
  const out = new Map<string, PlatformHost>();
  const add = (p: PlatformHost) => out.has(p.host) || out.set(p.host, p);
  for (const raw of (saasHosts ?? "").split(",")) {
    const h = clean(raw);
    if (!h) continue;
    const bare = h.replace(/^www\./, "");
    add({ host: bare, role: "root", redirectTo: `www.${bare}` });
    add({ host: `www.${bare}`, role: "www" });
    add({ host: `app.${bare}`, role: "app" });
  }
  const r = root ? clean(root) : null;
  if (r && !r.endsWith(".vercel.app")) add({ host: `*.${r}`, role: "wildcard" });
  return [...out.values()];
}
