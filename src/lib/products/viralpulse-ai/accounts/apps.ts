import "server-only";
import { connectionValues } from "@/lib/platform/connections/resolve";
import type { ConnectionProvider } from "./types";

/** The company's own developer app for a provider (Platform Console > Connections), or null. SelfRun has no shared app. */
export interface AppCreds {
  id: string;
  secret: string;
}

export async function oauthApp(p: ConnectionProvider): Promise<AppCreds | null> {
  const v = await connectionValues(p);
  const id = p === "meta" ? v?.appId : v?.clientId;
  const secret = p === "meta" ? v?.appSecret : v?.clientSecret;
  return id && secret ? { id, secret } : null;
}

export async function providerConfigured(p: ConnectionProvider): Promise<boolean> {
  return (await oauthApp(p)) !== null;
}
