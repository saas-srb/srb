import { requireFmsPage } from "@/lib/fms-auth";
import { canViewFinancialStatements } from "@/lib/fms-roles";
import ComplianceNav from "@/components/products/cashflow-ai/compliance/ComplianceNav";

// The sidebar is not the boundary: CA & Compliance is only for roles that may see the books, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage(canViewFinancialStatements);
  return (
    <div className="space-y-4">
      <ComplianceNav />
      {children}
    </div>
  );
}
