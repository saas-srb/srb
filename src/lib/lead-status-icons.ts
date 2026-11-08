import { Sparkles, Clock, CheckCircle, XCircle, type LucideIcon } from "lucide-react";
import type { LeadStatus } from "@/lib/lead-status";

/** Mirrors CAREER_STATUS_ICONS' icon language so the same status concept
 * (new / in-progress / done / rejected) reads the same icon across the
 * leads pipeline and the careers pipeline. */
export const LEAD_STATUS_ICONS: Record<LeadStatus, LucideIcon> = {
  new: Sparkles,
  in_progress: Clock,
  completed: CheckCircle,
  rejected: XCircle,
};
