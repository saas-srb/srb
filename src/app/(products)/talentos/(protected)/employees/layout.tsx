import { hrPage } from "@/lib/products/talentos/page-guard";

// People you manage (or everyone): the menu hides Employees from people without that scope; a person's own profile is the Profile page.
export default async function EmployeesLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage(["employees.team", "employees.all"], "Employees");
  if (g.locked) return g.locked;
  return children;
}
