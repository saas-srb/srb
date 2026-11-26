import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LockedPage from "@/components/products/commandos/LockedPage";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { listDirectors, openRequestFor } from "@/lib/products/commandos/access-requests";
import { cleanLabel } from "@/lib/products/commandos/access-requests-rules";
import { loadNavContext } from "@/lib/products/commandos/access";
import { NAV_ITEMS, stateOf } from "@/lib/products/commandos/nav";
import { PRODUCTS, productName } from "@/lib/access/catalogue";
import { requestAccessAction } from "./actions";

export const metadata: Metadata = { title: "No access", robots: { index: false, follow: false } };

/** Opened from a locked sidebar item or by typing a locked address: same shell, no redirect to sign-in, no 404. */
export default async function LockedRoute({ searchParams }: { searchParams: Promise<{ item?: string; product?: string; feature?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  const item = sp.item ? NAV_ITEMS.find((i) => i.key === sp.item) : undefined;
  let title = "This page";
  let description: string | null = null;
  let area: string | null = null;
  let itemKey = "";
  let product: string | undefined;
  if (item) {
    const ctx = await loadNavContext(user);
    if (stateOf(item, ctx) === "open") redirect(item.href);
    itemKey = item.key;
    const meta = ctx.panels?.[item.module ?? item.panel ?? ""];
    title = ((item.section === "panels" || item.section === "support") && meta ? meta.name : item.title ?? item.label);
    description = (item.section === "panels" || item.section === "support") && meta ? meta.description : item.description ?? null;
    area = item.section === "company" ? "Company settings" : meta?.name ?? null;
  } else if (sp.product && (PRODUCTS as string[]).includes(sp.product)) {
    product = sp.product;
    title = cleanLabel(sp.feature) || productName(sp.product);
    area = productName(sp.product);
  }
  const [directors, asked] = await Promise.all([listDirectors(), openRequestFor(user.id, itemKey, title)]);
  async function request(input: { message: string }) {
    "use server";
    return requestAccessAction({ itemKey, product, label: title, message: input.message });
  }
  return <LockedPage title={title} description={description} area={area} directors={directors.map(({ name, email }) => ({ name, email }))} alreadyAsked={Boolean(asked)} request={request} />;
}
