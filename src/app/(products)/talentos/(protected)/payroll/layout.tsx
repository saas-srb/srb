import { hrPage } from "@/lib/products/talentos/page-guard";

// Payroll for everyone: the person's own pay (salary.view) and, for people who run payroll, the runs (payroll.view). The menu hides it from people with neither;
// each run page checks payroll.view itself, so a typed address shows the polite locked page.
export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage(["salary.view", "payroll.view"], "Payroll");
  if (g.locked) return g.locked;
  return children;
}
