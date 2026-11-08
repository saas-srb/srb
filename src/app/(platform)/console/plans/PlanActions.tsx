"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CirclePause, CirclePlay, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { PlanMutationResult } from "@/lib/platform/billing/plans";
import { deletePlanAction, movePlanAction, setDefaultPlanAction, setPlanActiveAction } from "./actions";

/** A button that asks first, then runs a server action and refreshes the page. */
function Confirm({
  trigger,
  title,
  body,
  confirmLabel,
  destructive,
  run,
}: {
  trigger: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<PlanMutationResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setError(null);
      }}
    >
      <AlertDialogTrigger render={trigger as React.ReactElement} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await run();
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setOpen(false);
                toast.success(`${title.replace(/\?$/, "")} — done.`);
                router.refresh();
              })
            }
          >
            {pending ? "Saving…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Reorder, make default, activate/deactivate and delete — every change behind a confirm step except reordering. */
export default function PlanActions({
  planId,
  planName,
  active,
  isDefault,
  companies,
  first,
  last,
}: {
  planId: string;
  planName: string;
  active: boolean;
  isDefault: boolean;
  companies: number;
  first: boolean;
  last: boolean;
}) {
  const router = useRouter();
  const [moving, startMove] = useTransition();
  const companyText = `${companies} ${companies === 1 ? "company is" : "companies are"} on this plan`;

  const move = (direction: "up" | "down") =>
    startMove(async () => {
      const res = await movePlanAction(planId, direction);
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="icon-sm" aria-label={`Move ${planName} up`} disabled={first || moving} onClick={() => move("up")}>
        <ArrowUp className="size-3.5" />
      </Button>
      <Button type="button" variant="outline" size="icon-sm" aria-label={`Move ${planName} down`} disabled={last || moving} onClick={() => move("down")}>
        <ArrowDown className="size-3.5" />
      </Button>

      {active && !isDefault && (
        <Confirm
          trigger={
            <Button type="button" variant="outline" size="sm" aria-label={`Make ${planName} the default`}>
              <Star className="size-3.5" data-icon="inline-start" /> Make default
            </Button>
          }
          title={`Make ${planName} the default?`}
          body="New sign-ups will start their trial on this plan. Companies already subscribed are not affected."
          confirmLabel="Make default"
          run={() => setDefaultPlanAction(planId)}
        />
      )}

      {!isDefault &&
        (active ? (
          <Confirm
            trigger={
              <Button type="button" variant="outline" size="sm" aria-label={`Deactivate ${planName}`}>
                <CirclePause className="size-3.5" data-icon="inline-start" /> Deactivate
              </Button>
            }
            title={`Deactivate ${planName}?`}
            body={
              companies > 0
                ? `${companyText}. They keep it, at the price they bought, but no new company can choose it.`
                : "It disappears from pricing and checkout. No company is on it."
            }
            confirmLabel={companies > 0 ? `Deactivate (${companies} keep it)` : "Deactivate"}
            destructive
            run={() => setPlanActiveAction(planId, false, companies)}
          />
        ) : (
          <Confirm
            trigger={
              <Button type="button" variant="outline" size="sm" aria-label={`Activate ${planName}`}>
                <CirclePlay className="size-3.5" data-icon="inline-start" /> Activate
              </Button>
            }
            title={`Activate ${planName}?`}
            body="It will be shown on pricing and can be chosen for new subscriptions."
            confirmLabel="Activate"
            run={() => setPlanActiveAction(planId, true)}
          />
        ))}

      {!isDefault &&
        (companies > 0 ? (
          <span className="text-xs text-muted-foreground">Can&apos;t delete: {companyText}.</span>
        ) : (
          <Confirm
            trigger={
              <Button type="button" variant="ghost" size="sm" className="text-destructive" aria-label={`Delete ${planName}`}>
                <Trash2 className="size-3.5" data-icon="inline-start" /> Delete
              </Button>
            }
            title={`Delete ${planName}?`}
            body="This can't be undone. Only plans that no company has ever used can be deleted — otherwise deactivate it."
            confirmLabel="Delete plan"
            destructive
            run={() => deletePlanAction(planId)}
          />
        ))}
    </div>
  );
}
