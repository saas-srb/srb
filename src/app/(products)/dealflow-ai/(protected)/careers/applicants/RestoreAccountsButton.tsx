"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { repairPortalAccountsAction } from "./repair-actions";

/** Brings back the portal accounts of applicants already on file, so they can sign in (Forgot password) and staff can open their portal. */
export default function RestoreAccountsButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      title="Creates the portal account for every applicant who is on file but cannot sign in. They set their own password with Forgot password (email + phone)."
      onClick={() =>
        start(async () => {
          const res = await repairPortalAccountsAction();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          const r = res.result;
          const fixed = r.recreated + r.relinked + r.provisioned;
          if (fixed === 0 && r.failed === 0) toast.success("Every applicant already has a portal account.");
          else toast.success(`${fixed} portal account${fixed === 1 ? "" : "s"} restored${r.failed ? ` · ${r.failed} could not be (missing email)` : ""}.`);
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />} Restore portal accounts
    </Button>
  );
}
