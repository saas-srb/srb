import { hiddenProducts } from "@/lib/platform/products/visible";
import { notFound, redirect } from "next/navigation";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { parsePbFilters } from "@/lib/products/playbook-ai/dashboard/filters";
import { loadDashboard } from "@/lib/products/playbook-ai/dashboard/fetch";
import { resolveRange } from "@/lib/products/playbook-ai/dashboard/ranges";
import { getBrand } from "@/lib/products/playbook-ai/brand/store";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import DashboardView, { type BrandStatusItem } from "@/components/products/playbook-ai/dashboard/DashboardView";
import { pbDoc } from "@/lib/playbook-access";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = await getPbActor();
  if (!actor) redirect("/playbook-ai/login");
  const range = resolveRange(sp.range, Date.now(), { from: sp.from, to: sp.to });
  const [data, brand, company] = await Promise.all([loadDashboard(actor, range, parsePbFilters(sp)), getBrand().catch(() => null), loadCompanyValues().catch(() => ({} as Record<string, unknown>))]);
  if (!data) notFound();

  const has = (k: string) => typeof company[k] === "string" && String(company[k]).trim() !== "";
  const items: BrandStatusItem[] = [
    { label: "Company details block on page 1", ok: !!brand?.identity.show, hint: "Switch it on in Brand & Letterhead." },
    { label: "Logo uploaded", ok: !!brand?.logo.assetId, hint: "Upload your logo so it prints on page 1." },
    { label: "Registered address", ok: has("company.address"), hint: "Add it to the company profile." },
    { label: "GSTIN", ok: has("company.gstin"), hint: "Add the GSTIN to the company profile." },
    { label: "Phone and website", ok: has("company.phone") && has("company.website"), hint: "Add them to the company profile." },
  ];
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  // Signing figures come from ContractFlow.
  const signing = !(await hiddenProducts()).has("lpms");
  const shown = signing ? data : { ...data, tiles: data.tiles.filter((t) => !["sent", "signed", "turnaround", "completion"].includes(t.key)) };
  return <DashboardView signing={signing} data={shown} brand={items} canCreate={pbDoc(actor, "CREATE")} csvHref={`/api/playbook-ai/dashboard/export?${qs.toString()}`} custom={range.key === "custom" ? { from: sp.from ?? "", to: sp.to ?? "" } : undefined} />;
}
