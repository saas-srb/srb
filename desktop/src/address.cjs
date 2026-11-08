"use strict";
/**
 * Turns whatever a person types into the address of their workspace's app, and checks it is really a SelfRun workspace.
 *   acme                      -> https://acme-app.<root>        (a workspace on the platform's own domain)
 *   acme.selfrunbusiness.com  -> https://acme-app.selfrunbusiness.com
 *   acme.com                  -> https://app.acme.com           (a company's own domain)
 *   https://app.acme.com/x    -> https://app.acme.com
 * `*.localhost` and `localhost` use http (development).
 */

const DEFAULT_ROOT = "selfrunbusiness.com";

function isLocal(host) {
  const h = host.replace(/:\d+$/, "");
  return h === "localhost" || h.endsWith(".localhost");
}

function cleanHost(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
}

/** Possible app origins for what was typed, best guess first. */
function candidates(input, rootDomain = DEFAULT_ROOT) {
  const host = cleanHost(input);
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/.test(host) || host.length > 253) return [];
  const proto = isLocal(host) ? "http" : "https";
  const root = String(rootDomain || DEFAULT_ROOT).toLowerCase();
  const bare = host.replace(/:\d+$/, "");
  const port = host.match(/:\d+$/)?.[0] ?? "";
  const out = [];
  const add = (h) => {
    const o = `${proto}://${h}`;
    if (!out.includes(o)) out.push(o);
  };

  if (!bare.includes(".")) {
    // A workspace name: its app address on the platform domain.
    add(`${bare}-app.${root}${port}`);
    return out;
  }
  if (bare.startsWith("app.") || bare.split(".")[0].endsWith("-app")) add(host);
  if (bare.endsWith(`.${root}`) && !bare.split(".")[0].endsWith("-app")) {
    const label = bare.slice(0, -(root.length + 1));
    if (!label.includes(".")) add(`${label}-app.${root}${port}`);
  }
  add(`app.${host}`);
  add(host);
  return out;
}

/** Asks the candidate for its desktop branding; resolves with the origin and branding of the first one that answers like a workspace. */
async function resolveWorkspace(input, { rootDomain, fetchJson }) {
  const tried = [];
  for (const origin of candidates(input, rootDomain)) {
    try {
      const brand = await fetchJson(`${origin}/api/desktop/branding`);
      if (brand && brand.app === "selfrun-desktop" && typeof brand.name === "string") return { ok: true, origin: brand.origin || origin, brand };
      tried.push(origin);
    } catch {
      tried.push(origin);
    }
  }
  return { ok: false, error: tried.length ? "That address isn't a workspace we recognise. Check the spelling, or ask your administrator for your app address." : "Enter your workspace name or address." };
}

module.exports = { DEFAULT_ROOT, candidates, resolveWorkspace, cleanHost, isLocal };
