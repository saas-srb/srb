import { Sparkles, Clock, Star, CalendarClock, CheckCircle, Award, XCircle, type LucideIcon } from "lucide-react";
import type { CareerApplicationStatus } from "@/lib/career-application-status";

export const CAREER_STATUS_ICONS: Record<CareerApplicationStatus, LucideIcon> = {
  new: Sparkles,
  under_review: Clock,
  shortlisted: Star,
  interview_scheduled: CalendarClock,
  selected: CheckCircle,
  hired: Award,
  rejected: XCircle,
};

/** Chart accent per status — brand coral + blue, with green kept for the two
 * "won" stages and destructive red for rejected. Intermediate stages are
 * blue/coral tints so charts stay on the brand palette. */
export const CAREER_STATUS_COLORS: Record<CareerApplicationStatus, string> = {
  new: "var(--brand-deep)",
  under_review: "color-mix(in srgb, var(--brand-deep) 65%, white)",
  shortlisted: "var(--primary)",
  interview_scheduled: "var(--brand-gradient)",
  selected: "#1baf7a",
  hired: "#0ca30c",
  rejected: "#d03b3b",
};
