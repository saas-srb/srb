"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, UserCheck } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { advanceLeadStageAction, assignLeadToMeAction } from "../actions";

interface StageDef {
  key: string;
  label: string;
  terminal: "won" | "lost" | null;
}

export default function LeadStageControl({
  leadId,
  currentStageKey,
  currentStageLabel,
  status,
  ownerStaffId,
  workflow,
  nextStages,
}: {
  leadId: string;
  type: string;
  currentStageKey: string;
  currentStageLabel: string;
  status: string;
  ownerStaffId: string | null;
  workflow: StageDef[];
  nextStages: { key: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string>("");
  const happyPath = workflow.filter((w) => !w.terminal);
  const curIdx = happyPath.findIndex((w) => w.key === currentStageKey);

  function advance() {
    if (!target) return;
    start(async () => {
      const res = await advanceLeadStageAction(leadId, target);
      if (res.error) return void toast.error(res.error);
      toast.success("Stage updated — the portal and notifications are in sync.");
      setTarget("");
    });
  }

  function toggleOwner() {
    start(async () => {
      const res = await assignLeadToMeAction(leadId, Boolean(ownerStaffId));
      if (res.error) return void toast.error(res.error);
      toast.success(ownerStaffId ? "Unassigned." : "Assigned to you.");
    });
  }

  return (
    <GlassCard>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Lifecycle</CardTitle>
        <Button size="sm" variant="outline" onClick={toggleOwner} disabled={pending}>
          <UserCheck className="size-3.5" />
          {ownerStaffId ? "Unassign" : "Assign to me"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {happyPath.map((w, i) => (
            <span key={w.key} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  w.key === currentStageKey
                    ? "bg-primary text-primary-foreground"
                    : i < curIdx
                      ? "bg-green-500/15 text-green-600 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {i < curIdx && <Check className="mr-0.5 inline size-3" />}
                {w.label}
              </span>
              {i < happyPath.length - 1 && <ChevronRight className="size-3 text-muted-foreground/50" />}
            </span>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          Current: <span className="font-semibold text-foreground">{currentStageLabel}</span>
          {status !== "open" && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize">{status}</span>}
        </p>

        {nextStages.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={target} onValueChange={(v) => setTarget(v ?? "")}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Move to stage…" />
              </SelectTrigger>
              <SelectContent>
                {nextStages.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={advance} disabled={!target || pending}>
              Advance
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This lead has reached a terminal stage.</p>
        )}
      </CardContent>
    </GlassCard>
  );
}
