"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, Trash2, UserMinus, UserPlus } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { coversPermissions } from "@/lib/platform/console/permissions";
import { assignRoleAction, deleteRoleAction, invitePlatformUserAction, revokeAccessAction, revokeInviteAction, saveRoleAction, type UsersActionResult } from "./actions";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  roleId: string;
  roleName: string;
  legacy: boolean;
  grantedAt: string | null;
  lastLoginAt: string | null;
}
interface RoleRow {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  builtIn: boolean;
  users: number;
}
interface Group {
  area: string;
  permissions: { key: string; label: string }[];
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

export default function UsersAndRoles(props: {
  initialTab: "users" | "roles";
  currentUserId: string;
  currentPermissions: string[];
  canManage: boolean;
  users: UserRow[];
  roles: RoleRow[];
  eligible: { id: string; email: string; name: string | null }[];
  invites: { id: string; email: string; name: string; roleId: string | null; expiresAt: string }[];
  presets: { value: string; label: string }[];
  groups: Group[];
}) {
  const { canManage, currentPermissions, roles } = props;
  const router = useRouter();
  const [tab, setTab] = useState(props.initialTab);
  const [pending, start] = useTransition();
  const [confirmRevoke, setConfirmRevoke] = useState<UserRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RoleRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | "new" | null>(null);
  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name ?? "—";
  const grantable = roles.filter((r) => coversPermissions(currentPermissions, r.permissions));

  function run(fn: () => Promise<UsersActionResult>, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      after?.();
      router.refresh();
    });
  }

  function switchTab(v: string) {
    setTab(v as "users" | "roles");
    const url = new URL(window.location.href);
    if (v === "roles") url.searchParams.set("tab", "roles");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={switchTab}>
      <TabsList className="self-start">
        <TabsTrigger value="users" id="tab-users">
          Users ({props.users.length})
        </TabsTrigger>
        <TabsTrigger value="roles" id="tab-roles">
          Roles ({roles.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="users" className="space-y-4">
        <GlassCard interactive={false}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base">Platform users</CardTitle>
                <CardDescription>Accounts in your own company that can open the Platform Console. Directors without a role keep full access until you give them one.</CardDescription>
              </div>
              {canManage && (
                <Button type="button" id="add-platform-user" onClick={() => setAddOpen(true)}>
                  <UserPlus className="size-4" data-icon="inline-start" /> Add user
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {props.users.map((u) => {
                const canTouch = canManage && coversPermissions(currentPermissions, u.legacy ? ["*"] : (roles.find((r) => r.id === u.roleId)?.permissions ?? ["*"]));
                return (
                  <li key={u.id} data-platform-user={u.email} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {u.name || u.email}
                        {u.id === props.currentUserId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                        {u.name ? `${u.email} · ` : ""}
                        {u.lastLoginAt ? `last sign-in ${formatDateTime(u.lastLoginAt)}` : "never signed in"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {u.legacy && (
                        <Badge variant="outline" title="Director with no platform role assigned — full access, as before roles existed.">
                          Legacy Director
                        </Badge>
                      )}
                      {canTouch ? (
                        <select
                          aria-label={`Role for ${u.email}`}
                          className={cn(selectClass, "w-44")}
                          value={u.legacy ? "" : u.roleId}
                          disabled={pending}
                          onChange={(e) => e.target.value && run(() => assignRoleAction(u.id, e.target.value))}
                        >
                          {u.legacy && <option value="">Platform Owner (legacy)</option>}
                          {grantable.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant="secondary">{u.roleName}</Badge>
                      )}
                      {canTouch && (
                        <Button type="button" size="sm" variant="outline" aria-label={`Revoke ${u.email}`} onClick={() => setConfirmRevoke(u)} disabled={pending}>
                          <UserMinus className="size-3.5" data-icon="inline-start" /> Revoke
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </GlassCard>

        {props.invites.length > 0 && (
          <GlassCard interactive={false}>
            <CardHeader>
              <CardTitle className="text-base">Invitations waiting</CardTitle>
              <CardDescription>They get their platform role when they accept.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {props.invites.map((i) => (
                  <li key={i.id} data-platform-invite={i.email} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{i.name || i.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {i.email} · {roleName(i.roleId)} · expires {formatDate(i.expiresAt)}
                      </p>
                    </div>
                    {canManage && (
                      <Button type="button" size="sm" variant="outline" onClick={() => run(() => revokeInviteAction(i.id))} disabled={pending}>
                        Withdraw
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </GlassCard>
        )}
      </TabsContent>

      <TabsContent value="roles" className="space-y-4">
        <GlassCard interactive={false}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base">Roles</CardTitle>
                <CardDescription>Built-in roles can&apos;t be changed or deleted. Create a custom role for anything in between.</CardDescription>
              </div>
              {canManage && (
                <Button type="button" id="new-role" onClick={() => setEditing("new")}>
                  <Plus className="size-4" data-icon="inline-start" /> New role
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {roles.map((r) => {
                const canEdit = canManage && !r.builtIn && coversPermissions(currentPermissions, r.permissions);
                return (
                  <li key={r.id} data-platform-role={r.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                        <ShieldCheck className="size-4 text-muted-foreground" />
                        {r.name}
                        {r.builtIn && <Badge variant="outline">Built-in</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.description ? `${r.description} · ` : ""}
                        {r.permissions.includes("*") ? "All permissions" : `${r.permissions.length} permission${r.permissions.length === 1 ? "" : "s"}`} · {r.users} user{r.users === 1 ? "" : "s"}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)} disabled={pending}>
                          <Pencil className="size-3.5" data-icon="inline-start" /> Edit
                        </Button>
                        <Button type="button" size="sm" variant="outline" aria-label={`Delete ${r.name}`} onClick={() => setConfirmDelete(r)} disabled={pending}>
                          <Trash2 className="size-3.5" data-icon="inline-start" /> Delete
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </GlassCard>
      </TabsContent>

      {addOpen && (
        <AddUserDialog
          eligible={props.eligible}
          roles={grantable}
          presets={props.presets}
          allowAdminPreset={currentPermissions.includes("*")}
          pending={pending}
          onClose={() => setAddOpen(false)}
          onSubmit={(fn) => run(fn, () => setAddOpen(false))}
        />
      )}

      {editing && (
        <RoleDialog
          role={editing === "new" ? null : editing}
          groups={props.groups}
          currentPermissions={currentPermissions}
          pending={pending}
          onClose={() => setEditing(null)}
          onSubmit={(id, input) => run(() => saveRoleAction(id, input), () => setEditing(null))}
        />
      )}

      <AlertDialog open={confirmRevoke !== null} onOpenChange={(o) => !o && !pending && setConfirmRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {confirmRevoke?.email}?</AlertDialogTitle>
            <AlertDialogDescription>They lose access to the Platform Console at once. Their company account and everything else they can use stays as it is.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => confirmRevoke && run(() => revokeAccessAction(confirmRevoke.id), () => setConfirmRevoke(null))}>
              {pending ? "Working…" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && !pending && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the {confirmDelete?.name} role?</AlertDialogTitle>
            <AlertDialogDescription>{confirmDelete?.users ? "Give its users another role first — a role that's in use can't be deleted." : "Nobody has this role, so nothing else changes."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => confirmDelete && run(() => deleteRoleAction(confirmDelete.id), () => setConfirmDelete(null))}>
              {pending ? "Working…" : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}

function AddUserDialog({
  eligible,
  roles,
  presets,
  allowAdminPreset,
  pending,
  onClose,
  onSubmit,
}: {
  eligible: { id: string; email: string; name: string | null }[];
  roles: RoleRow[];
  presets: { value: string; label: string }[];
  allowAdminPreset: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (fn: () => Promise<UsersActionResult>) => void;
}) {
  const [mode, setMode] = useState<"existing" | "invite">(eligible.length ? "existing" : "invite");
  const [userId, setUserId] = useState(eligible[0]?.id ?? "");
  const [roleId, setRoleId] = useState(roles.find((r) => r.id === "viewer")?.id ?? roles[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("developer");
  const presetOptions = presets.filter((p) => allowAdminPreset || p.value !== "admin");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "existing") onSubmit(() => assignRoleAction(userId, roleId));
    else onSubmit(() => invitePlatformUserAction({ email, name, preset, roleId }));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add a platform user</DialogTitle>
            <DialogDescription>Give someone in your company access, or invite a new teammate by email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-4">
            <div role="radiogroup" aria-label="How to add" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["existing", "Existing team member"],
                  ["invite", "Invite by email"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={cn("cursor-pointer rounded-xl border p-2.5 text-center text-sm font-medium", mode === value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                  <input type="radio" name="addMode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>

            {mode === "existing" ? (
              <div className="space-y-1.5">
                <Label htmlFor="pu-existing">Team member</Label>
                {eligible.length ? (
                  <select id="pu-existing" className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)} required>
                    {eligible.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ? `${u.name} — ${u.email}` : u.email}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-muted-foreground">Everyone in your company already has access. Invite someone by email instead.</p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="pu-email">Email</Label>
                  <Input id="pu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pu-name">Name</Label>
                  <Input id="pu-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pu-preset">Team role in your company</Label>
                  <select id="pu-preset" className={selectClass} value={preset} onChange={(e) => setPreset(e.target.value)}>
                    {presetOptions.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pu-role">Platform role</Label>
              <select id="pu-role" className={selectClass} value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" id="pu-submit" disabled={pending || (mode === "existing" && !eligible.length)}>
              {pending ? "Working…" : mode === "existing" ? "Give access" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({
  role,
  groups,
  currentPermissions,
  pending,
  onClose,
  onSubmit,
}: {
  role: RoleRow | null;
  groups: Group[];
  currentPermissions: string[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (id: string | null, input: { name: string; description: string; permissions: string[] }) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const toggle = (key: string) =>
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-w-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(role?.id ?? null, { name, description, permissions: [...perms] });
          }}
        >
          <DialogHeader>
            <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
            <DialogDescription>Managing an area includes viewing it. You can only grant permissions you have yourself.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="role-name">Name</Label>
                <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-desc">Description</Label>
                <Input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
              </div>
            </div>
            {groups.map((g) => (
              <fieldset key={g.area} className="space-y-2">
                <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.area}</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {g.permissions.map((p) => {
                    const allowed = coversPermissions(currentPermissions, [p.key]);
                    return (
                      <label key={p.key} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm", allowed ? "cursor-pointer hover:bg-muted/40" : "opacity-50")}>
                        <input type="checkbox" id={`perm-${p.key}`} className="mt-0.5 size-4 accent-primary" checked={perms.has(p.key)} onChange={() => toggle(p.key)} disabled={!allowed} />
                        <span className="min-w-0">
                          <span className="block text-foreground">{p.label}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">{p.key}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <DialogFooter className="sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" id="role-save" disabled={pending}>
              {pending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
