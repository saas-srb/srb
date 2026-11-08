import { Filter } from "lucide-react";

/** The Search & Filters card chrome shared with `PanelFilterBar`, for filter controls that manage their own state. */
export default function FilterCardShell({
  title = "Search & Filters",
  description,
  children,
}: {
  title?: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-3 border-b border-border/40 pb-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Filter className="size-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}
