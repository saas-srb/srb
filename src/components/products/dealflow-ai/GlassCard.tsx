import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The one card surface for the whole LMS / FMS product — matches the public
 * Services Listing card's shape: rounded-2xl · translucent bg · backdrop-blur.
 *
 * The outer wrapper fills its parent's height only where that is meant: as an item of a grid or of a flex row (cards of one row line up),
 * or as the only child (a single card filling its column). In a stacked column (`space-y-*`, several cards one under another) it keeps
 * its own height; a blanket `h-full` there made the first card as tall as the whole column and pushed the others far down the page.
 * Any `col-span-*` classes passed in `className` are automatically forwarded to the outer
 * grid item wrapper div so grid column positioning (`lg:col-span-2`, etc.) works properly.
 */
export default function GlassCard({
  className,
  containerClassName,
  interactive = true,
  ...props
}: React.ComponentProps<typeof Card> & { interactive?: boolean; containerClassName?: string }) {
  // Extract grid column classes to forward to outer grid wrapper div
  const colSpanClasses = className
    ?.split(" ")
    .filter((c) => c.includes("col-span"))
    .join(" ");

  const hasExplicitHeight = containerClassName?.includes("h-") || containerClassName?.includes("flex-1");

  return (
    <div className={cn("group/gcard relative w-full", !hasExplicitHeight && "[.grid>&]:h-full [.flex:not(.flex-col)>&]:h-full [&:only-child]:h-full", colSpanClasses, containerClassName)}>
      <Card
        className={cn(
          "lms-surface relative h-full w-full rounded-2xl border border-border/40 bg-background/95 shadow-none backdrop-blur-md transition-all duration-300 ease-out",
          "dark:bg-card/85",
          interactive && "group-hover/gcard:-translate-y-1",
          className
        )}
        {...props}
      />
    </div>
  );
}
