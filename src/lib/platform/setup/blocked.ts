import "server-only";

/**
 * STAFF-ONLY: does a host still answer from a Vercel project that Vercel has disabled? Vercel answers such a host with HTTP 402 and the header
 * `x-vercel-error: DEPLOYMENT_DISABLED`. That means the host is still attached to an old (blocked) project and must be moved to this one.
 */
export function isDeploymentDisabled(status: number, header: string | null | undefined): boolean {
  return status === 402 && /DEPLOYMENT_DISABLED/i.test(header ?? "");
}

const cache = new Map<string, { at: number; disabled: boolean }>();

export async function hostIsDisabled(host: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 300_000) return hit.disabled;
  let disabled = false;
  try {
    const res = await fetchFn(`https://${host}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
    disabled = isDeploymentDisabled(res.status, res.headers.get("x-vercel-error"));
  } catch {
    /* unreachable is not the same as disabled */
  }
  cache.set(host, { at: Date.now(), disabled });
  return disabled;
}

/** Which of `hosts` (up to 8) answer 402 DEPLOYMENT_DISABLED. */
export async function disabledHosts(hosts: string[], fetchFn?: typeof fetch): Promise<string[]> {
  const sample = [...new Set(hosts)].slice(0, 8);
  const res = await Promise.all(sample.map(async (h) => ((await hostIsDisabled(h, fetchFn)) ? h : null)));
  return res.filter((h): h is string => !!h);
}

export const DISABLED_NOTE = "The previous Vercel project is disabled by Vercel (hosts still attached to it answer HTTP 402). Move these hosts to this project: release them in the old project, or publish the verification (TXT) record shown for each in Domains & SSL.";
