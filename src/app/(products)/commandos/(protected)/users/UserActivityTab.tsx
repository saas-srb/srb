"use client";

import { usePanelLabel } from "@/components/platform/PanelsProvider";

import { useEffect, useState } from "react";
import { getUserActivityAction } from "./actions";
import type { AdminActivityRow } from "@/lib/products/commandos/activity-log";
import { activityModuleLabel } from "@/lib/products/commandos/activity-log-shared";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Clock } from "lucide-react";

export default function UserActivityTab({ userEmail }: { userEmail: string }) {
  const panelLabel = usePanelLabel();
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<AdminActivityRow[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getUserActivityAction(userEmail).then((res) => {
      if (active) {
        setActivities(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [userEmail]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-xs">Loading activity trail…</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2 border rounded-xl bg-muted/10">
        <Activity className="size-8 opacity-40" />
        <p className="text-sm font-medium text-foreground">No Activity Recorded</p>
        <p className="text-xs max-w-xs">No recent actions logged for {userEmail} across platform modules.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Showing last {activities.length} activity log entries</p>
      </div>

      <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
        {activities.map((item) => (
          <div key={item._id} className="relative flex items-start gap-3 rounded-lg border bg-card p-3 text-xs">
            <div className="absolute -left-4 top-3.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />

            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0">
                    {panelLabel(item.module, activityModuleLabel(item.module))}
                  </Badge>
                  <span className="font-semibold text-foreground">{item.action}</span>
                  {item.entity && <span className="text-muted-foreground font-mono">({item.entity})</span>}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                  <Clock className="size-3" />
                  {new Date(item.createdAt).toLocaleString()}
                </div>
              </div>

              {item.entityLabel && (
                <p className="font-medium text-foreground text-xs mt-0.5">{item.entityLabel}</p>
              )}

              {item.summary && <p className="text-muted-foreground text-[11px] leading-relaxed">{item.summary}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
