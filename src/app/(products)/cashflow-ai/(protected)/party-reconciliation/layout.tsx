import { requireFmsPage } from "@/lib/fms-auth";
import { canViewCommercialFinance, canViewFinancialStatements } from "@/lib/fms-access";

// The sidebar is not the boundary: customer and vendor balances are only for roles that may see the books, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage((u) => canViewCommercialFinance(u) || canViewFinancialStatements(u));
  return children;
}
