import { notFound, redirect } from "next/navigation";
import OwnerVault, { type OwnerInfo } from "@/components/products/cybervault/OwnerVault";
import { getViewer, canReadScope } from "@/lib/products/cybervault/viewer";
import { getClient } from "@/lib/products/sprintos/clients";
import { getClientStatusMeta } from "@/lib/products/sprintos/constants";
import type { SearchParams } from "@/lib/products/cybervault/page";

export default async function ClientVaultPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  const { id } = await params;
  const sp = await searchParams;
  // Same 404 whether the client doesn't exist or the viewer isn't assigned to it.
  if (!canReadScope(viewer, "client", id)) notFound();
  const c = await getClient(id);
  if (!c) notFound();
  // Client details are read live from the PMS client master (`pms_clients`); DLMS only stores the id.
  const info: OwnerInfo = {
    title: c.companyName,
    subtitle: `${c.clientCode}${c.industry ? ` · ${c.industry}` : ""}`,
    badge: getClientStatusMeta(c.status).label,
    crumbs: [{ label: "Clients", href: "/cybervault/clients" }, { label: c.companyName }],
    notice: "Client details come from the client master (SprintOS).",
    lines: [
      ...(c.website ? [{ icon: "web" as const, text: c.website, href: /^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}` }] : []),
      ...(c.primaryContact.email ? [{ icon: "mail" as const, text: c.primaryContact.email }] : []),
      ...(c.primaryContact.phone ? [{ icon: "phone" as const, text: c.primaryContact.phone }] : []),
    ],
    details: [
      { label: "Client code", value: c.clientCode },
      ...(c.primaryContact.name ? [{ label: "Contact", value: c.primaryContact.name }] : []),
      ...(c.billing.city ? [{ label: "Location", value: [c.billing.city, c.billing.country].filter(Boolean).join(", ") }] : []),
      ...(c.notes ? [{ label: "Client notes", value: c.notes }] : []),
    ],
  };
  return <OwnerVault viewer={viewer} owner={{ scope: "client", clientId: id }} basePath={`/cybervault/clients/${id}`} info={info} sp={sp} />;
}
