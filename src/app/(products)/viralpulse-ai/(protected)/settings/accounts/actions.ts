"use server";

import { run } from "@/lib/products/viralpulse-ai/run";
import { SmmsInputError, type SmmsViewer } from "@/lib/products/viralpulse-ai/viewer";
import { disconnectConnection, setAccountClient, setAccountDefault, setAccountEnabled, testAccount } from "@/lib/products/viralpulse-ai/accounts/service";

/** Connected-accounts mutations. Each re-checks MANAGE_INTEGRATIONS from the session; account ids are looked up inside the signed-in company only. */

const actor = (v: SmmsViewer) => ({ userId: v.userId, email: v.email });
const id = (v: unknown): string => {
  if (typeof v !== "string" || v.length === 0 || v.length > 200) throw new SmmsInputError("Unknown account.");
  return v;
};

export async function setAccountEnabledAction(accountId: string, enabled: boolean) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    await setAccountEnabled(id(accountId), Boolean(enabled), actor(v));
    return {};
  });
}

export async function setAccountDefaultAction(accountId: string) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    await setAccountDefault(id(accountId), actor(v));
    return {};
  });
}

export async function setAccountClientAction(accountId: string, client: string) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    await setAccountClient(id(accountId), typeof client === "string" ? client : "", actor(v));
    return {};
  });
}

export async function disconnectConnectionAction(connectionId: string) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    const r = await disconnectConnection(id(connectionId), actor(v));
    return { revokedAtProvider: r.revokedAtProvider };
  });
}

export async function testAccountAction(accountId: string) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    const r = await testAccount(id(accountId), actor(v));
    return { passed: r.ok, detail: r.detail };
  });
}
