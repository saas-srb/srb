"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Gift } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useReferralCode } from "@/lib/useReferralCode";
import { formatCredits } from "@/lib/wallet/constants";
import { portalJoinAction, type PortalJoinState } from "./actions";

const initial: PortalJoinState = {};

const TYPES = [
  { value: "student", label: "Student — courses & training" },
  { value: "intern", label: "Intern — internship program" },
  { value: "client", label: "Client / Business — projects & services" },
  { value: "job_seeker", label: "Job seeker / Hiring" },
];

export default function JoinForm({ initialCode, referrerName, welcomeBonus, codeRejected }: { initialCode: string; referrerName: string | null; welcomeBonus: number; codeRejected: boolean }) {
  const [state, formAction, pending] = useActionState(portalJoinAction, initial);
  const stored = useReferralCode();
  const [code, setCode] = useState(initialCode);
  const fe = state.fieldErrors ?? {};

  // The server already resolved `?ref=`/cookie; fall back to localStorage-only capture (e.g. cookies blocked) once on mount.
  useEffect(() => {
    if (!initialCode && stored) setCode(stored); // eslint-disable-line react-hooks/set-state-in-effect
  }, [stored, initialCode]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-sm">
      <GlassCard>
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>
            Already have one?{" "}
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referrerName && (
            <div className="mb-4 flex gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground">
              <Gift className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>
                <strong>{referrerName}</strong> invited you.{welcomeBonus > 0 && <> Join to earn a welcome bonus of up to <strong>{formatCredits(welcomeBonus)}</strong>.</>}
              </span>
            </div>
          )}
          {codeRejected && <p className="mb-4 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">That referral link isn&apos;t active right now, but you can still join.</p>}
          <form action={formAction} className="space-y-3" noValidate>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input name="name" required autoComplete="name" />
              {fe.name && <p className="text-xs text-destructive">{fe.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input name="email" type="email" required autoComplete="email" />
              {fe.email && <p className="text-xs text-destructive">{fe.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input name="phone" type="tel" required autoComplete="tel" placeholder="+91 …" />
              {fe.phone && <p className="text-xs text-destructive">{fe.phone}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>I am a…</Label>
              <select name="accountType" required defaultValue="" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring">
                <option value="" disabled>Choose one</option>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {fe.accountType && <p className="text-xs text-destructive">{fe.accountType}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
                {fe.password && <p className="text-xs text-destructive">{fe.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Confirm</Label>
                <Input name="confirm" type="password" required autoComplete="new-password" />
                {fe.confirm && <p className="text-xs text-destructive">{fe.confirm}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Referral code (optional)</Label>
              <Input name="referralCode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono uppercase" maxLength={10} />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="terms" className="mt-0.5" />
              <span>I agree to the <a href="/about/terms-and-conditions" className="underline">terms</a>. Credits are promotional and have no cash value.</span>
            </label>
            {fe.terms && <p className="text-xs text-destructive">{fe.terms}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
            </Button>
          </form>
        </CardContent>
      </GlassCard>
    </motion.div>
  );
}
