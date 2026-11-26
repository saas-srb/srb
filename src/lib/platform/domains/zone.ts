/**
 * Reading a host against its DNS zone (the domain bought at a registrar). Pure and client-safe: the Domains page uses it
 * to say what to type in a DNS panel, the server to pick the right record.
 */

/** Second-level endings under a two-letter country code: `acme.co.in` is a domain, not a subdomain of `co.in`. */
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu", "firm", "gen", "ind", "res", "nic", "mil", "or", "ne", "me"]);

const endingLength = (labels: readonly string[]): number => (labels.length >= 2 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 2 : 1);

/** Whether the host is only an ending (`co.in`), which nobody owns. */
export function isDomainEnding(host: string): boolean {
  const labels = host.split(".");
  return labels.length <= endingLength(labels);
}

/** The registered domain a host belongs to: `app.acme.co.in` → `acme.co.in`. */
export function zoneOf(host: string): string {
  const labels = host.split(".");
  return labels.slice(-(endingLength(labels) + 1)).join(".");
}

/** What goes in a DNS panel's Name box for a host: the part before the domain, or `@` for the domain itself. */
export function relativeName(host: string, zone: string = zoneOf(host)): string {
  if (host === zone) return "@";
  return host.endsWith(`.${zone}`) ? host.slice(0, -(zone.length + 1)) : host;
}

/** The domain itself or its `www.`: the addresses a business's website usually lives on. */
export function isWebsiteAddress(host: string): boolean {
  const name = relativeName(host);
  return name === "@" || name === "www";
}
