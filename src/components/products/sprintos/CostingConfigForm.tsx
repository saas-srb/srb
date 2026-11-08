"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { saveCostingConfigAction } from "@/app/(products)/sprintos/(protected)/(staff)/costing/actions";

export default function CostingConfigForm({
  projectId,
  currency,
  config,
  trigger,
}: {
  projectId: string;
  currency: string;
  config: { contractValue: number | null; otherCosts: number; defaultCostRate: number; defaultBillRate: number };
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  function onOpenChange(next: boolean) {
    if (next) {
      setForm({
        contractValue: config.contractValue != null ? String(config.contractValue) : "",
        otherCosts: String(config.otherCosts),
        defaultCostRate: String(config.defaultCostRate),
        defaultBillRate: String(config.defaultBillRate),
      });
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveCostingConfigAction(projectId, form);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Costing inputs saved");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Costing Inputs</SheetTitle>
          <SheetDescription>All figures in {currency}. Rates are per hour.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Contract value</Label>
            <Input type="number" min={0} value={form.contractValue ?? ""} onChange={(e) => setForm((f) => ({ ...f, contractValue: e.target.value }))} placeholder="Defaults to the project budget" />
            {err("contractValue")}
          </div>
          <div className="space-y-1.5">
            <Label>Other (non-labour) costs</Label>
            <Input type="number" min={0} value={form.otherCosts ?? ""} onChange={(e) => setForm((f) => ({ ...f, otherCosts: e.target.value }))} />
            {err("otherCosts")}
          </div>
          <div className="space-y-1.5">
            <Label>Default cost rate / hr</Label>
            <Input type="number" min={0} value={form.defaultCostRate ?? ""} onChange={(e) => setForm((f) => ({ ...f, defaultCostRate: e.target.value }))} />
            <p className="text-xs text-muted-foreground">Used when a team member has no cost rate of their own.</p>
            {err("defaultCostRate")}
          </div>
          <div className="space-y-1.5">
            <Label>Default billing rate / hr</Label>
            <Input type="number" min={0} value={form.defaultBillRate ?? ""} onChange={(e) => setForm((f) => ({ ...f, defaultBillRate: e.target.value }))} />
            {err("defaultBillRate")}
          </div>
          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
