import { notFound } from "next/navigation";
import ShellHarness from "./ShellHarness";
import { resolveNav, type NavContext } from "@/lib/products/commandos/nav";

/**
 * Development-only: the Workspace sidebar for a Director, a person with partial access and a person with none, a locked page and a product
 * sidebar (404 in production). `?view=director|partial|none|locked|product`. Used by scripts/shot-shell.ts.
 */
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const view = ["director", "partial", "none", "locked", "product"].includes(sp.view ?? "") ? (sp.view as string) : "director";
  const roles = view === "director" ? ["super_admin"] : view === "partial" ? ["pms_manager", "fms_admin"] : [];
  const ctx: NavContext = { user: { roles, permissionOverrides: null }, platformAccess: false, unavailablePanels: new Set(), panels: {} };
  const nav = resolveNav(ctx).sections;
  const titles: Record<string, string> = { director: "Director", partial: "A person with some products (SprintOS and CashFlow)", none: "A person with no products", locked: "A locked page, inside the same shell", product: "TalentOS sidebar for an employee (not staff)" };
  return <ShellHarness view={view} nav={nav} title={titles[view]} />;
}
