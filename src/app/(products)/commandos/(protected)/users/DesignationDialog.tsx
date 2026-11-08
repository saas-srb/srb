"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DesignationSelect from "./DesignationSelect";
import type { CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";
import { changeDesignationAction } from "./actions";

/** Gives a person another designation: their access in every product follows it. */
export default function DesignationDialog({
  target,
  designations,
  canMakeDirector,
  onClose,
  onDone,
}: {
  target: { id: string; email: string; name: string; designationId: string | null; designation: string } | null;
  designations: CustomRoleView[];
  canMakeDirector: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    setValue(target?.designationId ?? "");
    setError(null);
  }, [target]);
  if (!target) return null;
  const same = value === (target.designationId ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change designation</DialogTitle>
          <DialogDescription>
            {target.name || target.email} is now <b>{target.designation}</b>. Their access in every product is recalculated from the new designation, and their HR file shows it too.
          </DialogDescription>
        </DialogHeader>
        <DesignationSelect value={value} onChange={setValue} designations={designations} canMakeDirector={canMakeDirector} />
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            type="button"
            disabled={pending || !value || same}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await changeDesignationAction(target.id, value);
                if (!r.ok) return setError(r.error ?? "Could not change the designation.");
                toast.success("Designation updated. Access now follows it.");
                onDone();
                onClose();
              })
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Save designation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
