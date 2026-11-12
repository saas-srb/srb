"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { saveCompanySecondStepPolicyAction, saveSecondStepPolicyAction } from "./actions";
import type { SecondStepPolicy } from "@/lib/security/second-step";

/** Sign-in security policy: which methods are allowed, whether admins must use a second step, trusted devices, how long a re-authentication stays fresh. */
export default function SecondStepPolicyForm({ initial, canManage, canCompanies }: { initial: SecondStepPolicy; canManage: boolean; canCompanies: boolean }) {
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  const [company, setCompany] = useState("");
  const box = (k: "emailAllowed" | "requireForAdmins" | "trustDeviceAllowed", label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={p[k]} disabled={!canManage} onChange={(e) => setP({ ...p, [k]: e.target.checked })} />{label}</label>
  );
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Sign-in security policy</CardTitle>
        <CardDescription>The platform default for second-step sign-in. A company can have its own override below.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {box("emailAllowed", "Allow email codes (as a method and as the fallback when an authenticator can't be checked)")}
        {box("requireForAdmins", "Require a second step for admins")}
        {box("trustDeviceAllowed", "Let people choose \"trust this device\" (off by default)")}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Trust for (days) <Input type="number" min={1} max={90} value={p.trustDeviceDays} disabled={!canManage} onChange={(e) => setP({ ...p, trustDeviceDays: Number(e.target.value) })} className="w-20" /></label>
          <label className="flex items-center gap-2">Re-confirm window (minutes) <Input type="number" min={1} max={60} value={p.reauthMinutes} disabled={!canManage} onChange={(e) => setP({ ...p, reauthMinutes: Number(e.target.value) })} className="w-20" /></label>
        </div>
        <Button size="sm" disabled={!canManage || pending} onClick={() => start(async () => { const r = await saveSecondStepPolicyAction(p); if (r.ok) { setP(r.policy); toast.success("Saved."); } else toast.error(r.error); })}>Save policy</Button>
        {canCompanies && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Company override</p>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Company slug or id" value={company} onChange={(e) => setCompany(e.target.value)} className="w-56" />
              <Button size="sm" variant="outline" disabled={pending || !company} onClick={() => start(async () => { const r = await saveCompanySecondStepPolicyAction({ company, patch: p }); if (r.ok) toast.success("Override saved for that company."); else toast.error(r.error); })}>Apply the values above to this company</Button>
              <Button size="sm" variant="ghost" disabled={pending || !company} onClick={() => start(async () => { const r = await saveCompanySecondStepPolicyAction({ company, patch: null }); if (r.ok) toast.success("Back to the platform default."); else toast.error(r.error); })}>Remove override</Button>
            </div>
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
