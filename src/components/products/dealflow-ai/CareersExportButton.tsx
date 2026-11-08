"use client";

import { useLmsCan } from "@/components/products/dealflow-ai/LmsAccess";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export interface CareersExportFilterParams {
  search?: string;
  status?: string;
  position?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: string;
  ids?: string[];
}

export default function CareersExportButton({ params, label = "Export CSV" }: { params: CareersExportFilterParams; label?: string }) {
  const allowed = useLmsCan("EXPORT_DATA");
  if (!allowed) return null;
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.position) query.set("position", params.position);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortDir) query.set("sortDir", params.sortDir);
  if (params.ids && params.ids.length > 0) query.set("ids", params.ids.join(","));

  return (
    <a
      href={`/api/dealflow-ai/careers/export?${query.toString()}`}
      className={buttonVariants({ variant: "outline", size: "sm", className: "transition-transform duration-200 hover:scale-105" })}
    >
      <Download className="size-3.5" data-icon="inline-start" />
      {label}
    </a>
  );
}
