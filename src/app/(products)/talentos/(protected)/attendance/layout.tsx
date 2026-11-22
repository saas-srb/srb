import { hrPage } from "@/lib/products/talentos/page-guard";

// One Attendance section for everyone. The menu hides it from people without it; a typed address shows the polite locked page.
export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("attendance.view", "Attendance");
  if (g.locked) return g.locked;
  return children;
}
