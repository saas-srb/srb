import { SettingsGridSkeleton } from "@/components/settings/SettingsGrid";

export default function Loading() {
  return <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background"><SettingsGridSkeleton /></div>;
}
