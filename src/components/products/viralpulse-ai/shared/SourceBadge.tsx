import { Bot, CloudDownload, FileSpreadsheet, Pencil, Upload, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";

/** Where a number or asset came from. Shown next to metrics and assets so nobody mistakes typed-in data for synced data. */
export type DataSource = "synced" | "manual" | "imported" | "ai" | "uploaded" | "estimate";

const META: Record<DataSource, { label: string; icon: typeof Bot; cls: string }> = {
  synced: { label: "Synced from platform", icon: CloudDownload, cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  manual: { label: "Typed in by hand", icon: Pencil, cls: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  imported: { label: "Imported file", icon: FileSpreadsheet, cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  ai: { label: "AI generated", icon: Bot, cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  uploaded: { label: "Uploaded", icon: Upload, cls: "bg-muted text-muted-foreground" },
  estimate: { label: "Estimate", icon: Calculator, cls: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
};

export default function SourceBadge({ source, at, label, className }: { source: DataSource; /** When it was synced / entered, ISO or Date. Shown as a date. */ at?: string | Date | null; label?: string; className?: string }) {
  const m = META[source];
  const Icon = m.icon;
  const when = at ? new Date(at) : null;
  const whenText = when && !Number.isNaN(when.getTime()) ? when.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", m.cls, className)} title={whenText ? `${label ?? m.label} · ${whenText}` : (label ?? m.label)}>
      <Icon className="size-3" aria-hidden />
      {label ?? m.label}
      {whenText && <span className="font-normal opacity-80">{`· ${whenText}`}</span>}
    </span>
  );
}
