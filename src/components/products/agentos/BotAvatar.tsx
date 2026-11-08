"use client";

import {
  Bot,
  Sparkles,
  Brain,
  MessageSquare,
  FileText,
  ClipboardList,
  Briefcase,
  Presentation,
  Phone,
  Calendar,
  Search,
  Lightbulb,
  PenLine,
  Code,
  ChartColumn,
  Shield,
  Users,
  Mail,
  Rocket,
  GraduationCap,
  Scale,
  Wallet,
  Building2,
  Globe,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { BotColor, BotIcon } from "@/lib/products/agentos/constants";

/** Icon key → component. A palette for bots to choose from — not a list of bots. */
export const BOT_ICON_COMPONENTS: Record<BotIcon, React.ComponentType<{ className?: string }>> = {
  bot: Bot,
  sparkles: Sparkles,
  brain: Brain,
  message: MessageSquare,
  "file-text": FileText,
  clipboard: ClipboardList,
  briefcase: Briefcase,
  presentation: Presentation,
  phone: Phone,
  calendar: Calendar,
  search: Search,
  lightbulb: Lightbulb,
  pen: PenLine,
  code: Code,
  chart: ChartColumn,
  shield: Shield,
  users: Users,
  mail: Mail,
  rocket: Rocket,
  graduation: GraduationCap,
  scale: Scale,
  wallet: Wallet,
  building: Building2,
  globe: Globe,
};

export const BOT_COLOR_CLASSES: Record<BotColor, string> = {
  indigo: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  sky: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
  emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  rose: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
  slate: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
  teal: "bg-teal-500/12 text-teal-600 dark:text-teal-300",
};

export function BotIconGlyph({ icon, className }: { icon: string; className?: string }) {
  const Icon = BOT_ICON_COMPONENTS[icon as BotIcon] ?? Bot;
  return <Icon className={className} />;
}

export default function BotAvatar({ icon, color, imageUrl, size = "md", className }: { icon: string; color: string; /** The agent's photo; falls back to icon + colour when absent or if it fails to load. */ imageUrl?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = { sm: "size-6 rounded-md", md: "size-9 rounded-xl", lg: "size-12 rounded-2xl" }[size];
  const glyph = { sm: "size-3.5", md: "size-4.5", lg: "size-6" }[size];
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(imageUrl) && failed !== imageUrl;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden", box, showImage ? "bg-muted" : (BOT_COLOR_CLASSES[color as BotColor] ?? BOT_COLOR_CLASSES.indigo), className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- an authenticated, already square-cropped photo from our own route
        <img src={imageUrl!} alt="" className="size-full object-cover" onError={() => setFailed(imageUrl!)} />
      ) : (
        <BotIconGlyph icon={icon} className={glyph} />
      )}
    </span>
  );
}
