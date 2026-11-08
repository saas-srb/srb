"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, RefreshCw, Star, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { platformDomainAction } from "./actions";

export interface DomainActionTarget {
  host: string;
  companyName: string;
  kind: "subdomain" | "custom";
  status: "pending" | "verified";
  isPrimary: boolean;
  removable: boolean;
  /** A local development address — nothing to attach. */
  localOnly: boolean;
}

/** Row actions for one domain (Domains & SSL, and the company detail page). */
export default function DomainActions({ domain }: { domain: DomainActionTarget }) {
  const router = useRouter();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();

  function run(op: "recheck" | "retry_attach" | "remove" | "set_primary") {
    start(async () => {
      const res = await platformDomainAction(domain.host, op);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      setConfirmRemove(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${domain.host}`} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onClick={() => run("recheck")}>
            <RefreshCw className="size-4" /> Re-check DNS &amp; SSL
          </DropdownMenuItem>
          {!domain.localOnly && (
            <DropdownMenuItem onClick={() => run("retry_attach")}>
              <UploadCloud className="size-4" /> Retry provider attach
            </DropdownMenuItem>
          )}
          {!domain.isPrimary && domain.status === "verified" && (
            <DropdownMenuItem onClick={() => run("set_primary")}>
              <Star className="size-4" /> Make primary
            </DropdownMenuItem>
          )}
          {domain.removable && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmRemove(true)}>
              <Trash2 className="size-4" /> Remove domain
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {domain.host}?</AlertDialogTitle>
            <AlertDialogDescription>
              {domain.companyName}&apos;s workspace stops answering on this address and it&apos;s detached from the hosting provider.
              {domain.isPrimary ? " Its automatic address becomes the primary one." : ""} The company can add it again from Settings → Domains.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run("remove")} disabled={pending}>
              {pending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
