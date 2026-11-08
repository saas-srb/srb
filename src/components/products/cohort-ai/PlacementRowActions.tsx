"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlacementForm from "@/components/products/cohort-ai/PlacementForm";
import { deletePlacementAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/placements/actions";
import type { SerializedPlacementRecord } from "@/lib/products/cohort-ai/placements";

export default function PlacementRowActions({
  record,
  students,
  programs,
}: {
  record: SerializedPlacementRecord;
  students: { _id: string; fullName: string; studentCode: string }[];
  programs: { _id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deletePlacementAction(record._id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete.");
        return;
      }
      toast.success("Placement removed");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <PlacementForm
        record={record}
        students={students}
        programs={programs}
        trigger={<Button type="button" variant="ghost" size="sm">Edit</Button>}
      />
      <Button type="button" variant="ghost" size="icon-xs" disabled={pending} onClick={remove} aria-label="Delete placement">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </Button>
    </div>
  );
}
