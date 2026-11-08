"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import { buttonVariants } from "@/components/ui/button";

/** The audit log's Search & Filters — the same card every product uses (`PanelFilterBar`), reading and writing the URL. */
export default function AuditFilters({
  actions,
  entities,
  exportHref,
  searchPlaceholder = "Actor, SOP or details",
}: {
  values?: { search: string; action: string; entity: string; from: string; to: string; sop: string };
  actions: { value: string; label: string }[];
  entities: { value: string; label: string }[];
  exportHref: string | null;
  searchPlaceholder?: string;
}) {
  const qs = useSearchParams().toString();
  return (
    <PanelFilterBar
      title="Search & Filters"
      description="Find activity by who did it, what happened, which record and when"
      fields={[
        { key: "search", label: "Search", type: "search", placeholder: searchPlaceholder },
        { key: "action", label: "Action", type: "select", options: actions, allLabel: "All actions" },
        { key: "entity", label: "Entity", type: "select", options: entities, allLabel: "All entities" },
        { key: "from", label: "From", type: "date" },
        { key: "to", label: "To", type: "date" },
      ]}
      trailing={
        exportHref ? (
          <a href={`${exportHref}?format=csv&${qs}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" />
            CSV
          </a>
        ) : null
      }
    />
  );
}
