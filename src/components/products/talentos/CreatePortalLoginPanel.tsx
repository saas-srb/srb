"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, RotateCcw, Trash2, Copy } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDateTime } from "@/lib/utils";
import {
  createEmployeeLoginAction,
  resetEmployeeLoginAction,
  revokeEmployeeLoginAction,
} from "@/app/(products)/talentos/(protected)/(staff)/employees/[id]/actions";

interface Status {
  hasLogin: boolean;
  email: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

function randomPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 30])
    .join("");
}

export default function CreatePortalLoginPanel({
  employeeId,
  workEmail,
  status,
}: {
  employeeId: string;
  workEmail: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(workEmail);
  const [password, setPassword] = useState(randomPassword());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<string | null>(null);

  function create() {
    setErrors({});
    startTransition(async () => {
      const result = await createEmployeeLoginAction(employeeId, { email, tempPassword: password });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      setRevealed(result.tempPassword ?? password);
      toast.success("Portal login created");
      router.refresh();
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetEmployeeLoginAction(employeeId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not reset.");
        return;
      }
      setRevealed(result.tempPassword ?? null);
      toast.success("Temporary password set");
      router.refresh();
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeEmployeeLoginAction(employeeId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not revoke.");
        return;
      }
      setRevealed(null);
      toast.success("Login revoked");
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Employee Portal Login
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {revealed && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium text-foreground">Temporary password — share it securely, shown once:</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="rounded bg-background px-2 py-1 font-mono text-sm">{revealed}</code>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  navigator.clipboard.writeText(revealed);
                  toast.success("Copied");
                }}
                aria-label="Copy"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">The employee must change it on first sign-in.</p>
          </div>
        )}

        {status.hasLogin ? (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Sign-in email</p>
              <p className="font-medium text-foreground">{status.email}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {status.mustChangePassword
                ? "Awaiting first sign-in / password change."
                : status.lastLoginAt
                  ? `Last signed in ${formatDateTime(status.lastLoginAt)}`
                  : "Never signed in."}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={reset} disabled={pending}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" data-icon="inline-start" />}
                Reset Password
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button type="button" variant="ghost" size="sm" disabled={pending}>
                      <Trash2 className="size-3.5" data-icon="inline-start" />
                      Revoke
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke portal access?</AlertDialogTitle>
                    <AlertDialogDescription>The login is deleted and all their portal sessions end. You can create a new one later.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={revoke}>Revoke</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Sign-in email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email || undefined} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Temporary password</Label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" aria-invalid={!!errors.tempPassword || undefined} />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(randomPassword())}>
                  Regenerate
                </Button>
              </div>
              {errors.tempPassword && <p className="text-xs text-destructive">{errors.tempPassword}</p>}
            </div>
            <Button type="button" onClick={create} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Create Login"}
            </Button>
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
