/**
 * The hosts on which the SaaS product itself is served, as opposed to a customer's own domain. Configured with
 * `SAAS_HOSTS` (comma separated). Two surfaces, never mixed:
 *  - the SITE hosts (`selfrunbusiness.com`, `www.…`) serve only the product website: marketing pages, sign-up, login entry;
 *  - the APP hosts (`app.<site host>`, e.g. `app.selfrunbusiness.com`) serve the products of the operator company (Platform Console,
 *    Workspace, every other product) and no website.
 * In development `localhost` and `saas.localhost` count as site hosts (so `npm run dev` shows the product website) and
 * `app.localhost` / `app.saas.localhost` as app hosts; a customer is `<slug>.localhost` (site) and `<slug>-app.localhost` (products).
 */

function normalize(h: string): string | null {
  const host = h.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(host) && host.length <= 253 ? host : null;
}

export function saasHosts(env: Record<string, string | undefined> = process.env): Set<string> {
  const out = new Set<string>();
  for (const raw of (env.SAAS_HOSTS ?? "").split(",")) {
    const h = normalize(raw);
    if (!h) continue;
    out.add(h);
    out.add(h.startsWith("www.") ? h.slice(4) : `www.${h}`);
  }
  // Only SAAS_HOSTS defines the product's hosts. Vercel's production-domain variable is deliberately NOT used: it names one of the
  // project's domains (possibly a customer's own domain attached to the project), so trusting it would serve the product website there.
  if (env.NODE_ENV !== "production") {
    out.add("localhost");
    out.add("saas.localhost");
  }
  return out;
}

export function isSaasHost(host: string | null | undefined): boolean {
  const h = host ? normalize(host) : null;
  return h !== null && saasHosts().has(h);
}

/** The host's canonical name without `www.` or `app.` (for contact addresses and absolute URLs). */
export function saasCanonicalHost(host: string | null | undefined): string {
  const h = host ? normalize(host) : null;
  if (h && saasAppHosts().has(h)) return h.replace(/^app\./, "");
  return (h ?? "saas.localhost").replace(/^www\./, "");
}

/** The app (products) hosts of the SaaS product: `app.` + every site host without `www.`. */
export function saasAppHosts(env: Record<string, string | undefined> = process.env): Set<string> {
  const out = new Set<string>();
  for (const h of saasHosts(env)) if (!h.startsWith("www.")) out.add(`app.${h}`);
  return out;
}

export function isSaasAppHost(host: string | null | undefined): boolean {
  const h = host ? normalize(host) : null;
  return h !== null && saasAppHosts().has(h);
}

/** The product's first configured site host, www-less (what `app.` is added to when there is no request to ask). */
export function primarySaasHost(env: Record<string, string | undefined> = process.env): string {
  for (const raw of (env.SAAS_HOSTS ?? "").split(",")) {
    const h = normalize(raw);
    if (h) return h.replace(/^www\./, "");
  }
  return "localhost";
}

function originFor(bare: string, hostHint: string | null | undefined): string {
  const local = bare === "localhost" || bare.endsWith(".localhost");
  const port = local ? (hostHint?.match(/:(\d+)$/)?.[1] ?? process.env.PORT ?? "3000") : "";
  return `${local ? "http" : "https"}://${bare}${port ? `:${port}` : ""}`;
}

/** `https://app.selfrunbusiness.com`-style origin of the product's products (dev: `http://app.localhost:3000`). */
export function saasAppOrigin(hostHint?: string | null): string {
  const h = hostHint ? normalize(hostHint) : null;
  const base = h && (isSaasHost(h) || isSaasAppHost(h)) ? saasCanonicalHost(h) : primarySaasHost();
  return originFor(`app.${base}`, hostHint);
}

/** `https://selfrunbusiness.com`-style origin of the product's website, from any of its hosts. */
export function saasSiteOrigin(hostHint?: string | null): string {
  const h = hostHint ? normalize(hostHint) : null;
  const base = h && (isSaasHost(h) || isSaasAppHost(h)) ? saasCanonicalHost(h) : primarySaasHost();
  return originFor(base, hostHint);
}
