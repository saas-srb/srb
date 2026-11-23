import { pmsPage } from "@/lib/products/sprintos/page-guard";

// The menu hides this section from people without it; a typed address shows the polite locked page.
export default async function CalendarLayout({ children }: { children: React.ReactNode }) {
  const g = await pmsPage("calendar.view", "Calendar");
  if (!g.user) return g.locked;
  return children;
}
