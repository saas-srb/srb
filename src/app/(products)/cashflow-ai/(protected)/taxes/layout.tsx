import { requireFmsPage } from "@/lib/fms-auth";
import { canViewFinancialStatements } from "@/lib/fms-roles";

// The sidebar is not the boundary: tax working is for roles that may see the books, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage(canViewFinancialStatements);
  return children;
}
