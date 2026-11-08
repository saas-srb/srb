import "server-only";
import { getConfig } from "@/lib/platform/config/store";

/**
 * The Vercel Blob token saved in Platform Console → Integrations → File storage, as the options every `@vercel/blob` call takes.
 * Empty when nothing is saved, so the SDK falls back to the `BLOB_READ_WRITE_TOKEN` environment variable.
 */
export async function blobAuth(): Promise<{ token?: string }> {
  const token = await getConfig("BLOB_READ_WRITE_TOKEN");
  return token ? { token } : {};
}

export async function blobTokenConfigured(): Promise<boolean> {
  return Boolean(await getConfig("BLOB_READ_WRITE_TOKEN"));
}
