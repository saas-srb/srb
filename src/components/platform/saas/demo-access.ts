export const DEMO_ACCESS = {
  website: "https://demo.selfrunbusiness.com/",
  workspace: "https://demo-app.selfrunbusiness.com/",
  email: "admin@example.com",
  password: "Admin#2026pw",
} as const;

const SLUG = "demo";

/**
 * The demo website and demo workspace addresses for the host the visitor is on: `demo.<domain>` and `demo-app.<domain>`.
 * Only the product's own leading name (www., app., demo., demo-app.) is removed from the current host, never an arbitrary label, so
 * `selfrunbusiness.com` gives `demo.selfrunbusiness.com` (not `demo.com`). A host that cannot carry subdomains (a preview address) uses
 * the production demo addresses above.
 */
export function buildDemoUrls(): { website: string; workspace: string } {
  const fallback = { website: DEMO_ACCESS.website, workspace: `${DEMO_ACCESS.workspace}commandos/login?demo=1` };
  if (typeof window === "undefined") return fallback;
  const { hostname, port, protocol } = window.location;
  const p = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
  if (!local && hostname.endsWith(".vercel.app")) return fallback;
  const root = local ? "localhost" : hostname.replace(/^(www|app|demo|demo-app)\./, "");
  if (!local && !/^[^.]+\.[^.]+/.test(root)) return fallback; // not a real domain, e.g. a bare "com"
  return { website: `${protocol}//${SLUG}.${root}${p}/`, workspace: `${protocol}//${SLUG}-app.${root}${p}/commandos/login?demo=1` };
}
