"use client";

import { useTransition } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { switchPortalLeadAction } from "@/app/(products)/clientos/(app)/actions";

export interface LeadSummary {
  id: string;
  code: string;
  type: string;
  name: string;
  stageLabel: string;
  active: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  job_applicant: "Job Application",
  intern: "Internship",
  trainee: "Industrial Training",
  client: "Project",
};

export default function LeadSwitcher({ leads }: { leads: LeadSummary[] }) {
  const [pending, start] = useTransition();
  if (leads.length < 2) return null;
  const active = leads.find((l) => l.active) ?? leads[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground disabled:opacity-60"
        disabled={pending}
      >
        <span className="max-w-[9rem] truncate">{TYPE_LABEL[active.type] ?? active.type}</span>
        <span className="text-muted-foreground">· {active.stageLabel}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your requests</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {leads.map((l) => (
          <DropdownMenuItem
            key={l.id}
            onClick={() => start(() => switchPortalLeadAction(l.id).then(() => window.location.assign("/clientos")))}
            className="flex items-start gap-2"
          >
            <Check className={l.active ? "mt-0.5 size-4 shrink-0 text-primary" : "mt-0.5 size-4 shrink-0 opacity-0"} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{TYPE_LABEL[l.type] ?? l.type}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {l.code} · {l.stageLabel}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
