import { requireFmsPage } from "@/lib/fms-auth";
import { canViewBanking, canViewCommercialFinance, canViewFinancialStatements } from "@/lib/fms-roles";

// The sidebar is not the boundary: this page is for roles that may see banking or the books, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage((u) => canViewBanking(u) || canViewCommercialFinance(u) || canViewFinancialStatements(u));
  return children;
}
