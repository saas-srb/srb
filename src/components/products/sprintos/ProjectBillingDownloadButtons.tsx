"use client";

import React from "react";
import { FileText, Receipt, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectBillingDownloadButtonsProps {
  projectId: string;
  projectCode?: string;
  variant?: "buttons" | "compact";
  size?: "xs" | "sm";
  className?: string;
}

export default function ProjectBillingDownloadButtons({
  projectId,
  projectCode,
  variant = "compact",
  size = "xs",
  className = "",
}: ProjectBillingDownloadButtonsProps) {
  const invoiceUrl = `/api/sprintos/projects/${encodeURIComponent(projectId)}/pdf?type=invoice`;
  const receiptUrl = `/api/sprintos/projects/${encodeURIComponent(projectId)}/pdf?type=receipt`;

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <a href={invoiceUrl} download={`Invoice-${projectCode || projectId}.pdf`} target="_blank" rel="noopener noreferrer">
          <Button
            size="xs"
            variant="outline"
            className="h-7 text-[11px] gap-1 border-primary/30 hover:border-primary hover:bg-primary/5 text-primary"
            title="Download Project Invoice PDF"
          >
            <FileText className="size-3" />
            <span>Invoice</span>
          </Button>
        </a>
        <a href={receiptUrl} download={`Receipt-${projectCode || projectId}.pdf`} target="_blank" rel="noopener noreferrer">
          <Button
            size="xs"
            variant="outline"
            className="h-7 text-[11px] gap-1 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
            title="Download Project Payment Receipt PDF"
          >
            <Receipt className="size-3" />
            <span>Receipt</span>
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <a href={invoiceUrl} download={`Invoice-${projectCode || projectId}.pdf`} target="_blank" rel="noopener noreferrer">
        <Button
          size={size}
          variant="outline"
          className="gap-1.5 font-medium border-primary/40 hover:border-primary hover:bg-primary/10 text-primary shadow-xs"
        >
          <FileText className="size-3.5" />
          <span>Project Invoice PDF</span>
          <Download className="size-3 opacity-60 ml-0.5" />
        </Button>
      </a>
      <a href={receiptUrl} download={`Receipt-${projectCode || projectId}.pdf`} target="_blank" rel="noopener noreferrer">
        <Button
          size={size}
          variant="outline"
          className="gap-1.5 font-medium border-emerald-500/40 hover:border-emerald-600 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs"
        >
          <Receipt className="size-3.5" />
          <span>Payment Receipt PDF</span>
          <Download className="size-3 opacity-60 ml-0.5" />
        </Button>
      </a>
    </div>
  );
}
