"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus, Undo2, Wrench, Archive, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { SerializedAsset } from "@/lib/products/spendiq/assets";
import {
  assignAssetAction,
  returnAssetAction,
  changeAssetStatusAction,
} from "@/app/(products)/spendiq/(protected)/(staff)/assets/actions";

export default function AssetWorkflow({
  asset,
  employees,
}: {
  asset: SerializedAsset;
  employees: { _id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [empId, setEmpId] = useState("");
  const [note, setNote] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(ok);
      setNote("");
      setEmpId("");
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label>Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition, reason…" />
        </div>

        {(asset.status === "in_stock" || asset.status === "under_repair") && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>Assign to</Label>
              <Select value={empId} onValueChange={(v) => setEmpId(v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pending || !empId}
              onClick={() => run(() => assignAssetAction(asset._id, empId, employees.find((e) => e._id === empId)?.name ?? "", note), "Asset assigned")}
            >
              <UserPlus className="size-3.5" data-icon="inline-start" />
              Assign
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {asset.status === "assigned" && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => returnAssetAction(asset._id, note), "Asset returned to stock")}>
              <Undo2 className="size-3.5" data-icon="inline-start" />
              Return to stock
            </Button>
          )}
          {asset.status !== "under_repair" && asset.status !== "retired" && asset.status !== "lost" && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => changeAssetStatusAction(asset._id, "under_repair", note), "Sent for repair")}>
              <Wrench className="size-3.5" data-icon="inline-start" />
              Send for repair
            </Button>
          )}
          {asset.status !== "retired" && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => changeAssetStatusAction(asset._id, "retired", note), "Asset retired")}>
              <Archive className="size-3.5" data-icon="inline-start" />
              Retire
            </Button>
          )}
          {asset.status !== "lost" && asset.status !== "retired" && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => changeAssetStatusAction(asset._id, "lost", note), "Marked lost")}>
              <AlertTriangle className="size-3.5 text-destructive" data-icon="inline-start" />
              Mark lost
            </Button>
          )}
        </div>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </CardContent>
    </GlassCard>
  );
}
