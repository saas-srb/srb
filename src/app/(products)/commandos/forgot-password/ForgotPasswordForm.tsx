"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { forgotPasswordAction, type ForgotState } from "./actions";

const initial: ForgotState = {};

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <GlassCard>
      <CardHeader>
        <CardTitle className="text-xl">Forgot your password?</CardTitle>
        <CardDescription>Enter the email address of your account and we will send you a link to choose a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        {state.done ? (
          <div className="space-y-3" role="status">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600"><MailCheck className="size-4" />Check your email</p>
            <p className="text-sm text-muted-foreground">If that address has an account, a link is on its way. It works once and expires in 30 minutes. Nothing arrived? Check spam, or ask your workspace administrator.</p>
            <Link href="/commandos/login" className="text-sm font-medium text-primary hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input id="forgot-email" name="email" type="email" required autoComplete="email" autoFocus maxLength={200} />
            </div>
            {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Send reset link"}</Button>
            <p className="text-center text-sm"><Link href="/commandos/login" className="text-muted-foreground hover:underline">Back to sign in</Link></p>
          </form>
        )}
      </CardContent>
    </GlassCard>
  );
}
