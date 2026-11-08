"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import MultiPicker from "@/components/products/playbook-ai/MultiPicker";
import { saveAccessAction, saveSettingsAction } from "@/app/(products)/cybervault/(protected)/actions";

export function DlmsSettingsForm({ warnDays, alertsEnabled }: { warnDays: number; alertsEnabled: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState(String(warnDays));
  const [alerts, setAlerts] = useState(alertsEnabled);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await saveSettingsAction({ warnDays: Number(days), alertsEnabled: alerts });
          if (!res.ok) toast.error(res.error);
          else {
            toast.success("Settings saved");
            router.refresh();
          }
        });
      }}
    >
      <div className="w-44 space-y-1.5">
        <Label htmlFor="warn-days">“Expiring soon” window (days)</Label>
        <Input id="warn-days" type="number" min={1} max={365} required value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
        Send daily expiry alerts to CyberVault managers &amp; admins
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
      </Button>
    </form>
  );
}

export interface AccessUser {
  id: string;
  label: string;
  email: string;
  roleLabel: string;
  seesAll: boolean;
  companyAccess: boolean;
  clientIds: string[];
}

function AccessRow({ user, clients }: { user: AccessUser; clients: { id: string; label: string }[] }) {
  const router = useRouter();
  const [company, setCompany] = useState(user.companyAccess);
  const [ids, setIds] = useState(user.clientIds);
  const [pending, startTransition] = useTransition();
  const dirty = company !== user.companyAccess || ids.length !== user.clientIds.length || ids.some((i) => !user.clientIds.includes(i));
  return (
    <li className="space-y-2 rounded-2xl border border-border/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user.label}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
        </div>
        <Badge variant="outline">{user.roleLabel}</Badge>
      </div>
      {user.seesAll ? (
        <p className="text-xs text-muted-foreground">Full access — this role sees the company vault and every client.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={company} onChange={(e) => setCompany(e.target.checked)} />
            Can open the Company Vault
          </label>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Assigned clients</p>
            <MultiPicker options={clients.map((c) => ({ id: c.id, label: c.label }))} value={ids} onChange={setIds} placeholder="Search clients…" />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={pending || !dirty}
              onClick={() =>
                startTransition(async () => {
                  const res = await saveAccessAction(user.id, { companyAccess: company, clientIds: ids });
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success(`Access updated for ${user.label}`);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save access"}
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

export function AccessManager({ users, clients }: { users: AccessUser[]; clients: { id: string; label: string }[] }) {
  if (users.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No accounts have a CyberVault role yet. Grant one under Admin → Users.</p>;
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {users.map((u) => (
        <AccessRow key={u.id} user={u} clients={clients} />
      ))}
    </ul>
  );
}
