import "server-only";
import { effectiveLinkedinVersion } from "@/lib/products/viralpulse-ai/linkedin-version";
import { getSettings } from "@/lib/products/viralpulse-ai/settings";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** The `Linkedin-Version` header to send: Settings override, else LINKEDIN_API_VERSION, else the verified default. */
export async function linkedinVersion(): Promise<string> {
  return effectiveLinkedinVersion((await getSettings()).linkedinVersion).version;
}
