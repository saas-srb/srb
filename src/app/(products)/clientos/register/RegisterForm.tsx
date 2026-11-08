"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Info } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import BrandMark from "@/components/BrandMark";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useReferralCode } from "@/lib/useReferralCode";
import { portalRegisterAction, type PortalRegisterState } from "./actions";
import { BrandName } from "@/components/platform/BrandProvider";

const initial: PortalRegisterState = {};

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(portalRegisterAction, initial);
  const [show, setShow] = useState(false);
  const referralCode = useReferralCode();
  const emailId = useId();
  const phoneId = useId();
  const pwId = useId();
  const confirmId = useId();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
      <GlassCard>
        <CardHeader>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary lg:hidden">
            <BrandMark className="size-4 shrink-0" />
            <BrandName /> <span className="text-foreground">Portal</span>
          </div>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>We&apos;ll match you to your application, enrolment or company.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-secondary-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Use the <strong>exact email and phone number</strong> you gave <BrandName />. Your role is detected automatically.
          </div>
          <form action={formAction} className="space-y-4" noValidate>
            {referralCode && <input type="hidden" name="referralCode" value={referralCode} />}
            <div className="space-y-1.5">
              <Label htmlFor={emailId}>Email</Label>
              <Input id={emailId} name="email" type="email" required autoComplete="email" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={phoneId}>Phone number</Label>
              <Input id={phoneId} name="phone" type="tel" required autoComplete="tel" placeholder="+91 …" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={pwId}>Password</Label>
              <div className="relative">
                <Input id={pwId} name="password" type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" className="pr-9" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShow((v) => !v)}
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  aria-label={show ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={confirmId}>Confirm password</Label>
              <Input id={confirmId} name="confirm" type={show ? "text" : "password"} required minLength={8} autoComplete="new-password" />
            </div>
            {state?.error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            New to <BrandName />?{" "}
            <Link href="/clientos/join" className="font-medium text-primary hover:underline">Join here</Link>
            {" · "}Already registered?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </GlassCard>
    </motion.div>
  );
}
