import { prmsPage } from "@/lib/products/spendiq/page-guard";

// One Expenses section for everyone: the person's own, or everyone's for the staff tier. The menu hides it from people without it; a typed address shows the polite locked page.
export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  const g = await prmsPage("expenses.view", "Expenses");
  if (!g.user) return g.locked;
  return children;
}
