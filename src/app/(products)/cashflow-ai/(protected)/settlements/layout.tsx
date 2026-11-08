import { requireFmsPage } from "@/lib/fms-auth";
import { canViewBanking } from "@/lib/fms-roles";

// The sidebar is not the boundary: settlements are for roles that may see the banking side, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage(canViewBanking);
  return children;
}
