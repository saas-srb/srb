"use client";

import { useLmsCan } from "@/components/products/dealflow-ai/LmsAccess";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { loginAsPortalUserAction, type ImpersonateTargetOptions } from "../impersonate-actions";

export interface LoginAsPortalUserButtonProps {
  externalUserId?: string;
  leadId?: string;
  applicationId?: string;
  studentId?: string;
  clientId?: string;
  email?: string;
  displayName?: string;
  /** Button style variant */
  variant?: "icon" | "full" | "dropdown-item";
}

export default function LoginAsPortalUserButton({
  externalUserId,
  leadId,
  applicationId,
  studentId,
  clientId,
  email,
  displayName,
  variant = "icon",
}: LoginAsPortalUserButtonProps) {
  const allowed = useLmsCan("IMPERSONATE");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  function handleClick(e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (isPending || clicked) return;
    setClicked(true);
    startTransition(async () => {
      const target: ImpersonateTargetOptions = {
        externalUserId,
        leadId,
        applicationId,
        studentId,
        clientId,
        email,
      };
      const result = await loginAsPortalUserAction(target);
      if (!result.ok) {
        toast.error(result.error);
        setClicked(false);
        return;
      }
      toast.success(
        displayName
          ? `Signed in as ${displayName}. Opening portal…`
          : "Signed in as portal user. Opening portal…"
      );
      router.push("/clientos");
    });
  }

  const elemId = `login-as-portal-user-${externalUserId || leadId || applicationId || studentId || clientId || email || "target"}`;

  if (variant === "dropdown-item") {
    if (!allowed) return null;

  return (
      <DropdownMenuItem onClick={handleClick} disabled={isPending || clicked}>
        {isPending || clicked ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LogIn className="size-3.5" />
        )}
        Login as Portal User
      </DropdownMenuItem>
    );
  }

  if (variant === "full") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending || clicked}
        id={elemId}
        title="Login to this user's portal account"
      >
        {isPending || clicked ? (
          <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
        ) : (
          <LogIn className="size-3.5" data-icon="inline-start" />
        )}
        Login as Portal User
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
      disabled={isPending || clicked}
      aria-label="Login as portal user"
      id={elemId}
      title="Login as this portal user"
    >
      {isPending || clicked ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogIn className="size-4" />
      )}
    </Button>
  );
}
