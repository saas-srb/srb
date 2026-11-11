export const DEMO_ACCESS = {
  // Neutral placeholders for the first server render only: the browser replaces them with `demo.<this site>` (see buildDemoUrls). No real host is named here.
  website: "https://demo.invalid/",
  workspace: "https://demo-app.invalid/",
  email: "admin@example.com",
  password: "Admin#2026pw",
} as const;

const SLUG = "demo";

/**
 * The demo website and demo workspace addresses for the host the visitor is on: `demo.<domain>` and `demo-app.<domain>`.
 * Only the product's own leading name (www., app., demo., demo-app.) is removed from the current host, never an arbitrary label, so
 * `selfrunbusiness.com` gives `demo.selfrunbusiness.com` (not `demo.com`). A host that cannot carry subdomains (a preview address) falls back to
 * paths on the same host.
 */
export function buildDemoUrls(): { website: string; workspace: string } {
  const fallback = { website: "/", workspace: "/commandos/login?demo=1" };
  if (typeof window === "undefined") return fallback;
  const { hostname, port, protocol } = window.location;
  const p = port && port !== "80" && port !== "443" ? `:${port}` : "";
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
  if (!local && hostname.endsWith(".vercel.app")) return fallback;
  const root = local ? "localhost" : hostname.replace(/^(www|app|demo|demo-app)\./, "");
  if (!local && !/^[^.]+\.[^.]+/.test(root)) return fallback; // not a real domain, e.g. a bare "com"
  return { website: `${protocol}//${SLUG}.${root}${p}/`, workspace: `${protocol}//${SLUG}-app.${root}${p}/commandos/login?demo=1` };
}
