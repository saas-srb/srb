"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Activity, BadgeCheck, Briefcase, Calendar, KeyRound, Lock, Mail, Pencil, User, UserCheck, UserX } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import UserActivityTab from "./UserActivityTab";
import { setUserTypeAndNotesAction, resetAdminUserPasswordAction, resetAdminUserTwoFactorAction, getStatusHistoryAction } from "./actions";
import { canSignIn, statusMeta } from "@/lib/security/account-status";
import type { StatusEventRow } from "@/lib/products/commandos/account-status";
import type { PersonRow } from "@/lib/products/commandos/people-list";
import { formatDateTime } from "@/lib/utils";
import { USER_TYPES } from "@/lib/products/commandos/people-rules";

/** The person's page in a side panel: profile, status history and activity. Access is changed on the Edit page (the same three steps), not here. */
export default function PersonDrawer({
  person,
  open,
  onOpenChange,
  isDirector,
  currentAdminId,
  onChangeStatus,
}: {
  person: PersonRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDirector: boolean;
  currentAdminId: string;
  onChangeStatus: (p: PersonRow) => void;
}) {
  const [history, setHistory] = useState<StatusEventRow[] | null>(null);
  const [userType, setUserType] = useState<(typeof USER_TYPES)[number]>("employee");
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState("profile");
  const [pending, start] = useTransition();
  const id = person?._id;
  const statusKey = person?.status;

  useEffect(() => {
    if (!person) return;
    setUserType(person.userType || "employee");
    setNotes(person.notes ?? "");
    setTab("profile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (!open || !id) return;
    let live = true;
    setHistory(null);
    getStatusHistoryAction(id).then((h) => live && setHistory(h)).catch(() => live && setHistory([]));
    return () => { live = false; };
  }, [open, id, statusKey]);

  if (!person) return null;
  const active = canSignIn({ status: person.status, roles: ["x"] });
  const meta = statusMeta(person.status);
  const isSelf = person._id === currentAdminId;

  const saveProfile = () => start(async () => {
    const r = await setUserTypeAndNotesAction(person._id, userType, notes);
    if (r.ok) toast.success("Saved."); else toast.error(r.error ?? "Could not save.");
  });
  const resetPassword = () => {
    if (!confirm(`Generate a new temporary password for ${person.email}?`)) return;
    start(async () => {
      const r = await resetAdminUserPasswordAction(person._id);
      if (r.ok) toast.success(`New temporary password: ${r.tempPassword}`, { duration: 15000 }); else toast.error(r.error ?? "Could not reset the password.");
    });
  };
  const resetTwoFactor = () => {
    if (!confirm(`Switch off two-step sign-in for ${person.email}? They can set it up again afterwards.`)) return;
    start(async () => {
      const r = await resetAdminUserTwoFactorAction(person._id);
      if (r.ok) toast.success("Two-step sign-in is off for this person."); else toast.error(r.error ?? "Could not reset two-step sign-in.");
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border bg-muted/20 p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary" aria-hidden>{(person.name || person.email).slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-lg font-semibold">{person.name || person.email}</SheetTitle>
              <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="text-xs">{person.email}</span>
                {person.designations[0] && person.designations[0] !== "—" && <Badge variant="outline" className="gap-1 text-[10px]"><Briefcase className="size-3 text-primary" aria-hidden />{person.designations[0]}</Badge>}
                {person.employeeId && <Badge variant="outline" className="gap-1 text-[10px]"><BadgeCheck className="size-3 text-primary" aria-hidden />HR file in TalentOS</Badge>}
              </SheetDescription>
            </div>
            <Badge variant="outline" className={active ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-rose-500/20 bg-rose-500/10 text-rose-600"}>{meta.label}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/commandos/users/${person._id}/edit`} className={buttonVariants({ size: "sm" })}><Pencil className="size-3.5" data-icon="inline-start" />Edit details and access</Link>
            {isDirector && !isSelf && <Button type="button" variant="outline" size="sm" onClick={() => onChangeStatus(person)}>{active ? <UserX className="size-3.5" data-icon="inline-start" /> : <UserCheck className="size-3.5" data-icon="inline-start" />}Change status</Button>}
          </div>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border/40 px-6 py-3">
            <TabsList>
              <TabsTrigger value="profile"><User className="size-3.5" aria-hidden />Profile</TabsTrigger>
              <TabsTrigger value="activity"><Activity className="size-3.5" aria-hidden />Activity</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="profile" className="mt-0 space-y-5">
              <dl className="grid gap-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2">
                <Row icon={<Mail className="size-4" aria-hidden />} k="Email" v={person.email} />
                <Row icon={<Briefcase className="size-4" aria-hidden />} k="Department" v={person.departments.join(", ") || "—"} />
                <Row icon={<User className="size-4" aria-hidden />} k="Team" v={person.teams.join(", ") || "—"} />
                <Row icon={<Briefcase className="size-4" aria-hidden />} k="Designation" v={person.designations.join(", ") || "—"} />
                <Row icon={<Calendar className="size-4" aria-hidden />} k="Added" v={new Date(person.createdAt).toLocaleDateString()} />
                <Row icon={<Calendar className="size-4" aria-hidden />} k="Last sign-in" v={person.lastLoginAt ? formatDateTime(person.lastLoginAt) : "Never"} />
                <Row icon={<Lock className="size-4" aria-hidden />} k="Password" v={`${person.mustChangePassword ? "Must change at next sign-in" : "Set"}${person.locked ? " (locked)" : ""}`} />
                <Row icon={<KeyRound className="size-4" aria-hidden />} k="Products" v={person.isDirector ? "Every product (Director)" : `${person.productsCount} of ${person.productsTotal}`} />
              </dl>
              <div className="space-y-3 rounded-xl border bg-card p-4">
                <div>
                  <label htmlFor="pd-type" className="mb-1 block text-xs font-semibold">Type</label>
                  <select id="pd-type" value={userType} onChange={(e) => setUserType(e.target.value as typeof userType)} className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
                    {USER_TYPES.map((t) => <option key={t} value={t}>{t === "employee" ? "Employee" : t === "contractor" ? "Contractor or freelancer" : t === "partner" ? "External partner" : "System account"}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pd-notes" className="mb-1 block text-xs font-semibold">Notes</label>
                  <Textarea id="pd-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything the team should know about this person." />
                </div>
                <Button type="button" size="sm" onClick={saveProfile} disabled={pending}>Save</Button>
              </div>
              <div className="space-y-2 rounded-xl border bg-card p-4">
                <h4 className="text-sm font-semibold">Sign-in</h4>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={resetPassword} disabled={pending}>Reset password</Button>
                  {isDirector && <Button type="button" variant="outline" size="sm" onClick={resetTwoFactor} disabled={pending}>Reset two-step sign-in</Button>}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <h4 className="mb-2 text-sm font-semibold">Status history</h4>
                {history === null ? <p className="text-sm text-muted-foreground">Loading…</p> : history.length === 0 ? <p className="text-sm text-muted-foreground">No status changes yet.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {history.map((h, i) => <li key={i} className="flex flex-wrap gap-x-2"><span className="font-medium">{statusMeta(h.to).label}</span><span className="text-muted-foreground">{formatDateTime(h.at)}{h.reason ? ` · ${h.reason}` : ""}</span></li>)}
                  </ul>
                )}
              </div>
            </TabsContent>
            <TabsContent value="activity" className="mt-0"><UserActivityTab userEmail={person.email} /></TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Row({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-muted-foreground">{icon}</span><div className="min-w-0"><dt className="text-[11px] text-muted-foreground">{k}</dt><dd className="break-words text-xs font-medium">{v}</dd></div></div>;
}
