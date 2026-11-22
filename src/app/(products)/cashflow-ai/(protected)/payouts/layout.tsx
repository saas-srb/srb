import { requireFmsPage } from "@/lib/fms-auth";
import { fmsCan } from "@/lib/fms-access";

// The sidebar is not the boundary: this section is only for people who hold its feature, whatever URL is typed.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFmsPage((u) => fmsCan(u, "payouts.view"));
  return children;
}
