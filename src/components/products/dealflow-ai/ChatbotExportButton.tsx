"use client";

import { useLmsCan } from "@/components/products/dealflow-ai/LmsAccess";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export interface ChatbotExportParams {
  search?: string;
  device?: string;
  sourcePage?: string;
  dateFrom?: string;
  dateTo?: string;
  ids?: string[];
}

export default function ChatbotExportButton({
  params,
  label = "Export CSV",
  endpoint = "/api/dealflow-ai/chatbot/conversations/export",
}: {
  params: ChatbotExportParams;
  label?: string;
  endpoint?: string;
}) {
  const allowed = useLmsCan("EXPORT_DATA");
  if (!allowed) return null;
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.device) query.set("device", params.device);
  if (params.sourcePage) query.set("sourcePage", params.sourcePage);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  if (params.ids && params.ids.length > 0) query.set("ids", params.ids.join(","));

  return (
    <a
      href={`${endpoint}?${query.toString()}`}
      className={buttonVariants({
        variant: "outline",
        size: "sm",
        className: "transition-transform duration-200 hover:scale-105",
      })}
    >
      <Download className="size-3.5" data-icon="inline-start" />
      {label}
    </a>
  );
}
