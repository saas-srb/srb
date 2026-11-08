import { Bot, Brain, Building2, Check, ShoppingCart, Clock, FileText, Globe, GraduationCap, Layers, Lock, Megaphone, MessageSquare, Plug, Rocket, Search, Shield, Target, Users, Wallet, Workflow, Zap, BookOpen, BarChart3, type LucideIcon } from "lucide-react";
import type { IconKey } from "@/lib/platform/saas/content";

const MAP: Record<IconKey, LucideIcon> = {
  bolt: Zap, brain: Brain, users: Users, wallet: Wallet, layers: Layers, shield: Shield, globe: Globe, chart: BarChart3, workflow: Workflow,
  chat: MessageSquare, file: FileText, target: Target, cart: ShoppingCart, book: BookOpen, megaphone: Megaphone, search: Search, bot: Bot,
  lock: Lock, clock: Clock, plug: Plug, rocket: Rocket, check: Check, building: Building2, graduation: GraduationCap,
};

export default function Icon({ name, className = "size-5" }: { name: IconKey; className?: string }) {
  const C = MAP[name] ?? Zap;
  return <C className={className} aria-hidden />;
}
