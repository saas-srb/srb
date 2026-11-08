"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2 } from "lucide-react";
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
import ClientForm from "@/components/products/sprintos/ClientForm";
import { deleteClientAction } from "@/app/(products)/sprintos/(protected)/(staff)/clients/actions";
import type { SerializedClient } from "@/lib/products/sprintos/clients";

export default function ClientActions({ client }: { client: SerializedClient }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteClientAction(client._id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete client.");
        return;
      }
      toast.success("Client deleted");
      router.push("/sprintos/clients");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <ClientForm
        client={client}
        trigger={
          <Button type="button" variant="outline" size="sm">
            <Pencil className="size-3.5" data-icon="inline-start" />
            Edit
          </Button>
        }
      />
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Trash2 className="size-3.5" data-icon="inline-start" />}
              Delete
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {client.companyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is blocked while any project still belongs to this client. Otherwise it is soft-deleted and kept for audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
