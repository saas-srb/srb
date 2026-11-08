import { requireFmsPage } from "@/lib/fms-auth";
import { canViewCommercialFinance, canViewFinancialStatements } from "@/lib/fms-roles";

// The sidebar is not the boundary: "My work" is for roles that may see the books, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage((u) => canViewFinancialStatements(u) || canViewCommercialFinance(u));
  return children;
}
