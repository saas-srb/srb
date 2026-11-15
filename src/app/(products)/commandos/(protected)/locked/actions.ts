"use server";

import { requestOrigin } from "@/lib/platform/request";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { NAV_ITEMS } from "@/lib/products/commandos/nav";
import { PRODUCTS } from "@/lib/access/catalogue";
import { createAccessRequest, type RequestResult } from "@/lib/products/commandos/access-requests";
import { cleanLabel, type LockedTarget } from "@/lib/products/commandos/access-requests-rules";

/** Asks the company's Directors for access to a locked item. The label and product are checked here, never trusted from the page. */
export async function requestAccessAction(input: { itemKey?: string; product?: string; label?: string; message?: string }): Promise<RequestResult> {
  const user = await getCurrentHubUser();
  if (!user) return { ok: false, error: "Sign in again to send a request." };
  const key = typeof input?.itemKey === "string" ? input.itemKey : "";
  const item = key ? NAV_ITEMS.find((i) => i.key === key) : undefined;
  const product = typeof input?.product === "string" && (PRODUCTS as string[]).includes(input.product) ? input.product : null;
  if (!item && !product) return { ok: false, error: "Unknown item." };
  const target: LockedTarget = { itemKey: item?.key ?? "", label: item ? item.title ?? item.label : cleanLabel(input?.label) || product!, product: item ? null : product, description: null };
  const { origin } = await requestOrigin();
  return createAccessRequest({ id: user.id, email: user.email, name: (user as { name?: string }).name }, target, input?.message, origin);
}
