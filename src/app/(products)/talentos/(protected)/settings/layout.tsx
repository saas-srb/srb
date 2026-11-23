import { hrPage } from "@/lib/products/talentos/page-guard";

// The settings address only forwards to the Director-only workspace settings; the polite locked page shows for anyone without settings.view.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const g = await hrPage("settings.view", "Settings");
  if (g.locked) return g.locked;
  return children;
}
