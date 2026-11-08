"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export default function DeleteEntityButton({
  label,
  confirmText,
  onDelete,
  redirectTo,
}: {
  label: string;
  confirmText: string;
  onDelete: () => Promise<{ error?: string }>;
  redirectTo?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function confirm() {
    start(async () => {
      const res = await onDelete();
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${label} deleted.`);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive">
            <Trash2 className="size-3.5" /> Delete
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>{confirmText}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel render={<Button variant="outline">Cancel</Button>} />
          <AlertDialogAction
            render={
              <Button variant="destructive" onClick={confirm} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
              </Button>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
