import { requireFmsPage } from "@/lib/fms-auth";
import { canViewFinancialStatements } from "@/lib/fms-roles";

// The sidebar is not the boundary: this section is only for roles that may see it, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage(canViewFinancialStatements);
  return children;
}
