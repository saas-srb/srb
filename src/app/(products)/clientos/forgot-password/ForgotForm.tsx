"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { motion } from "framer-motion";
import { Loader2, KeyRound } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { portalForgotAction, type ForgotState } from "./actions";

const initial: ForgotState = { step: "identify" };

export default function ForgotForm() {
  const [state, formAction, pending] = useActionState(portalForgotAction, initial);
  const emailId = useId();
  const phoneId = useId();
  const pwId = useId();
  const confirmId = useId();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
      <GlassCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="size-4" />
            {state.step === "reset" ? "Set a new password" : "Reset your password"}
          </CardTitle>
          <CardDescription>
            {state.step === "reset"
              ? "Identity confirmed. Choose a new password."
              : "Confirm the email and phone number on file — no email link needed."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.step === "identify" ? (
            <form action={formAction} className="space-y-4" noValidate>
              <input type="hidden" name="intent" value="identify" />
              <div className="space-y-1.5">
                <Label htmlFor={emailId}>Email</Label>
                <Input id={emailId} name="email" type="email" required defaultValue={state.email} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={phoneId}>Phone number</Label>
                <Input id={phoneId} name="phone" type="tel" required defaultValue={state.phone} />
              </div>
              {state.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
              </Button>
            </form>
          ) : (
            <form action={formAction} className="space-y-4" noValidate>
              <input type="hidden" name="intent" value="reset" />
              <input type="hidden" name="email" value={state.email} />
              <input type="hidden" name="phone" value={state.phone} />
              <div className="space-y-1.5">
                <Label htmlFor={pwId}>New password</Label>
                <Input id={pwId} name="password" type="password" required minLength={8} autoComplete="new-password" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={confirmId}>Confirm new password</Label>
                <Input id={confirmId} name="confirm" type="password" required minLength={8} autoComplete="new-password" />
              </div>
              {state.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
              </Button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </GlassCard>
    </motion.div>
  );
}
