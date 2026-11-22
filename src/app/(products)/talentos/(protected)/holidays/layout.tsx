import { hrPage } from "@/lib/products/talentos/page-guard";

// The menu hides Holidays from people without it; a typed address shows the polite locked page.
export default async function HolidaysLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("holidays.view", "Holidays");
  if (g.locked) return g.locked;
  return children;
}
