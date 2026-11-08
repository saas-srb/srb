import React from "react";
import * as LucideIcons from "lucide-react";

export function DynamicIcon({ name, className = "size-5" }: { name?: string; className?: string }) {
  if (!name) return <LucideIcons.Sparkles className={className} />;

  // Normalize name
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, "");
  // Find in Lucide icons
  const iconsMap = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const IconComponent = iconsMap[cleanName] || iconsMap[name] || LucideIcons.Sparkles;

  return <IconComponent className={className} />;
}
