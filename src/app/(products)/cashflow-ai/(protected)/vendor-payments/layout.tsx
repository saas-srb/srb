import { requireFmsPage } from "@/lib/fms-auth";
import { canViewCommercialFinance } from "@/lib/fms-access";

// The sidebar is not the boundary: this section is only for people who may see commercial finance, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage((u) => canViewCommercialFinance(u));
  return children;
}
