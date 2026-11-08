import type { LucideIcon } from "lucide-react";

/** The centered `SectionHeader` every bespoke homepage section opens with. */
export interface HomeSectionHeaderProps {
  eyebrow: string;
  headerIcon: LucideIcon;
  heading: string;
  accent?: string;
  description: string;
}
