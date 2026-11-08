"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PROJECT_STATUSES, PROJECT_STATUS_TRANSITIONS, type ProjectStatus } from "@/lib/products/sprintos/constants";
import { changeStatusAction } from "@/app/(products)/sprintos/(protected)/projects/actions";

export default function ProjectStatusControl({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<ProjectStatus>(status);

  const allowed = new Set<ProjectStatus>([status, ...PROJECT_STATUS_TRANSITIONS[status]]);
  const options = PROJECT_STATUSES.filter((s) => allowed.has(s.value));

  function change(next: string | null) {
    if (!next) return;
    const target = next as ProjectStatus;
    if (target === value) return;
    const prev = value;
    setValue(target);
    startTransition(async () => {
      const result = await changeStatusAction(projectId, target);
      if (!result.ok) {
        setValue(prev);
        toast.error(result.error ?? "Could not change status.");
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={change} disabled={pending}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
