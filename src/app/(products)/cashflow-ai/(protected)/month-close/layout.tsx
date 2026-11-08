import { requireFmsPage } from "@/lib/fms-auth";
import { canViewFinancialStatements } from "@/lib/fms-roles";

// The sidebar is not the boundary: the month close shows the whole books, so only roles that may see them, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage(canViewFinancialStatements);
  return children;
}
