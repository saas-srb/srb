import { Code, Bot, GraduationCap, Users, Award, TrendingUp, Layers, type LucideIcon } from "lucide-react";
import type { CategorySlug } from "@/lib/categories";

const BUILT_IN: Record<string, LucideIcon> = {
  "software-development": Code,
  "digital-marketing": TrendingUp,
  "ai-automations": Bot,
  "industrial-training": GraduationCap,
  "resource-augmentation": Users,
  "internship-program": Award,
};

export const CATEGORY_ICONS = BUILT_IN as Record<CategorySlug, LucideIcon>;

/**
 * The icon for a lead category. A company can define its own categories (any slug), so an unknown slug must never produce an
 * undefined component — that crashes the whole page. Known slugs keep their icon; others are matched by keyword, else a neutral one.
 */
export function iconForCategory(slug: string): LucideIcon {
  const known = BUILT_IN[slug];
  if (known) return known;
  const s = slug.toLowerCase();
  if (/(software|develop|web|app|code|it)/.test(s)) return Code;
  if (/(market|seo|ads|sales|growth)/.test(s)) return TrendingUp;
  if (/(ai|automation|bot)/.test(s)) return Bot;
  if (/(train|course|educat|learn|school|class)/.test(s)) return GraduationCap;
  if (/(intern|career|job|hire)/.test(s)) return Award;
  if (/(staff|resource|team|people|consult)/.test(s)) return Users;
  return Layers;
}
