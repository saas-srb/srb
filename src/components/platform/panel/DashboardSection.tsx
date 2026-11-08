import { cn } from "@/lib/utils";

/**
 * A titled group on a dashboard (heading + its KPIs / charts).
 * Spans full width so that cards and sections align with the page header and filter bars across all products.
 */
export default function DashboardSection({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("w-full space-y-3", className)}>
      {children}
    </section>
  );
}
