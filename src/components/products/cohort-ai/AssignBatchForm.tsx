"use client";

import { useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { assignBatchAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/students/actions";

export interface AssignProgram {
  _id: string;
  name: string;
}
export interface AssignBatch {
  _id: string;
  programId: string;
  label: string;
  full: boolean;
  seatsLeft: number;
}

export default function AssignBatchForm({
  studentId,
  programs,
  batches,
  trigger,
}: {
  studentId: string;
  programs: AssignProgram[];
  batches: AssignBatch[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [programId, setProgramId] = useState(programs[0]?._id ?? "");
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const programBatches = useMemo(() => batches.filter((b) => b.programId === programId), [batches, programId]);

  function onOpenChange(next: boolean) {
    if (next) {
      setProgramId(programs[0]?._id ?? "");
      setBatchId("");
      setError(null);
    }
    setOpen(next);
  }

  function submit() {
    setError(null);
    if (!programId || !batchId) {
      setError("Pick a program and a batch.");
      return;
    }
    startTransition(async () => {
      const result = await assignBatchAction(studentId, programId, batchId);
      if (!result.ok) {
        setError(result.error ?? result.fieldErrors?.batchId ?? "Could not assign.");
        toast.error(result.error ?? result.fieldErrors?.batchId ?? "Could not assign.");
        return;
      }
      toast.success("Student enrolled in batch");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Assign to Batch</SheetTitle>
          <SheetDescription>Enrol this student in a batch. Seat availability is enforced.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Program *</Label>
            <Select value={programId} onValueChange={(v) => { setProgramId(v ?? ""); setBatchId(""); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a program" /></SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Batch *</Label>
            {programBatches.length === 0 ? (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                No open batches for this program.
              </p>
            ) : (
              <Select value={batchId} onValueChange={(v) => setBatchId(v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a batch" /></SelectTrigger>
                <SelectContent>
                  {programBatches.map((b) => (
                    <SelectItem key={b._id} value={b._id} disabled={b.full}>
                      {b.label} {b.full ? "· Full" : `· ${b.seatsLeft} left`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="button" onClick={submit} disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Enrol student"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
