import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "info", label: "Basic Information" },
  { key: "config", label: "Configure" },
  { key: "sections", label: "Sections & Questions" },
  { key: "preview", label: "Preview" },
  { key: "publish", label: "Publish" },
] as const;

/** Create Test wizard — UGC-style step nav. Server component (no "use client"). */
export default function TestStepper({
  testId,
  current,
  published,
}: {
  testId: string | null;
  current: (typeof STEPS)[number]["key"];
  published?: boolean;
}) {
  const idx = STEPS.findIndex((s) => s.key === current);

  const href = (k: string): string | null => {
    if (!testId) return null;
    if (k === "preview") return `/evaliq/tests/${testId}/preview`;
    if (k === "publish") return `/evaliq/tests/${testId}`;
    return `/evaliq/tests/${testId}/edit?step=${k}`;
  };

  return (
    <nav
      aria-label="Test creation progress"
      className="rounded-2xl border border-primary/15 bg-background/90 p-3 shadow-sm backdrop-blur-xl dark:bg-[#080711]/95"
    >
      <ol className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {STEPS.map((s, i) => {
          const done = i < idx || (s.key === "publish" && !!published);
          const active = i === idx;
          const url = href(s.key);
          const clickable = done && url;

          const inner = (
            <>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "truncate text-xs font-semibold",
                  active ? "text-primary" : "text-muted-foreground",
                  !active && "max-sm:hidden",
                )}
              >
                {s.label}
              </span>
            </>
          );

          return (
            <li
              key={s.key}
              className="flex min-w-0 flex-1 items-center gap-1"
              aria-current={active ? "step" : undefined}
            >
              {clickable ? (
                <Link
                  href={clickable}
                  className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-3"
                >
                  {inner}
                </Link>
              ) : (
                <span
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 sm:px-3",
                    active && "bg-primary/10 dark:bg-violet-500/15",
                    !done && !active && "opacity-60",
                  )}
                >
                  {inner}
                </span>
              )}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="h-px min-w-3 flex-1 bg-border dark:bg-white/15"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
