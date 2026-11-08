"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, KeyRound, Copy, Check } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createStudentLoginAction,
  resetStudentLoginAction,
  revokeStudentLoginAction,
} from "@/app/(products)/cohort-ai/(protected)/(staff)/students/actions";

export default function StudentLoginPanel({
  studentId,
  defaultEmail,
  status,
}: {
  studentId: string;
  defaultEmail: string;
  status: { hasLogin: boolean; email: string | null; mustChangePassword: boolean; lastLoginAt: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(defaultEmail);
  const [temp, setTemp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string; tempPassword?: string }>, ok: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      if (result.tempPassword) setTemp(result.tempPassword);
      toast.success(ok);
      router.refresh();
    });
  }

  function copy() {
    if (!temp) return;
    navigator.clipboard.writeText(temp).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Portal Login</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status.hasLogin ? (
          <>
            <p className="text-muted-foreground">
              Login: <span className="font-medium text-foreground">{status.email}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {status.mustChangePassword ? "Temporary password not yet changed." : "Password set by the student."}
              {status.lastLoginAt ? ` Last sign-in ${new Date(status.lastLoginAt).toLocaleDateString("en-US")}.` : " Never signed in."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => resetStudentLoginAction(studentId), "Password reset")}>
                {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <KeyRound className="size-3.5" data-icon="inline-start" />}
                Reset password
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => revokeStudentLoginAction(studentId), "Login revoked")}>
                Revoke login
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Login email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@example.com" />
            </div>
            <Button type="button" size="sm" disabled={pending || !email} onClick={() => run(() => createStudentLoginAction(studentId, email), "Portal login created")}>
              {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <KeyRound className="size-3.5" data-icon="inline-start" />}
              Create portal login
            </Button>
          </>
        )}

        {temp && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-medium text-foreground">Temporary password — share it securely, shown once:</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="rounded bg-background px-2 py-1 font-mono text-sm">{temp}</code>
              <Button type="button" variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy password">
                {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
