import { requireFmsPage } from "@/lib/fms-auth";
import { canViewFinancialStatements } from "@/lib/fms-roles";
import GstNav from "@/components/products/cashflow-ai/gst/GstNav";

// The sidebar is not the boundary: GST working is for roles that may see the books, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage(canViewFinancialStatements);
  return (
    <div className="space-y-4">
      <GstNav />
      {children}
    </div>
  );
}
