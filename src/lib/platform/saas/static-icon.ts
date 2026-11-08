import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { onSaasHost } from "@/lib/platform/saas/request";

/** On the product's own hosts: the file from /public/selfrun/logo as a response (null elsewhere, where the company's own icon is drawn). */
export async function productIconResponse(publicPath: string, contentType: string): Promise<Response | null> {
  if (!(await onSaasHost())) return null;
  const body = await readFile(path.join(process.cwd(), "public", publicPath)).catch(() => null);
  return body ? new Response(new Uint8Array(body), { headers: { "content-type": contentType, "cache-control": "public, max-age=3600" } }) : null;
}
