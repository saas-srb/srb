import { requireFmsPage } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";

// The sidebar is not the boundary: only roles that may add or change vendor records and payments see vendor bank checks, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage(canManageTransactions);
  return children;
}
