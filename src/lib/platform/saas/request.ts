import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { isSaasAppHost, isSaasHost, saasCanonicalHost } from "@/lib/platform/saas/hosts";
import { resolveHostInfo } from "@/lib/platform/tenancy/companies";

/** The Host of the current request, or null outside a request (static build, script). */
export async function requestHostOrNull(): Promise<string | null> {
  try {
    return (await headers()).get("host");
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

/** Whether the current request is for one of the SaaS product's own hosts (its website or its products) rather than a customer's. */
export async function onSaasHost(): Promise<boolean> {
  const host = await requestHostOrNull();
  return isSaasHost(host) || isSaasAppHost(host);
}

/** Whether the current request is for the product's app host (`app.…`). */
export async function onSaasAppHost(): Promise<boolean> {
  return isSaasAppHost(await requestHostOrNull());
}

/** `https://selfrunbusiness.com`-style origin of the SaaS product for the current request. */
export async function saasOrigin(): Promise<string> {
  const host = await requestHostOrNull();
  const bare = saasCanonicalHost(host);
  const local = bare === "localhost" || bare.endsWith(".localhost");
  const port = local && host?.includes(":") ? `:${host.split(":")[1]}` : "";
  return `${local ? "http" : "https"}://${bare}${port}`;
}

/** Whether the current request is for any company's PRODUCTS host (a customer's `<slug>-app…`/`app.…` or the product's `app.…`). */
export async function onAppSurface(): Promise<boolean> {
  const host = await requestHostOrNull();
  if (isSaasAppHost(host)) return true;
  return (await resolveHostInfo(host).catch(() => null))?.surface === "app";
}
