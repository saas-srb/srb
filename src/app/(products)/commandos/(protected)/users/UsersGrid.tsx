"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MoreHorizontal,
  ShieldCheck,
  KeyRound,
  UserCog,
  UserCheck,
  BriefcaseBusiness,
  Plus,
  Lock,
  SlidersHorizontal,
  Eye,
  CheckCircle2,
  XCircle,
  BadgeCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import AdminDataGrid, { type AdminDataGridColumn, type BulkActionsContext } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDate, formatDateTime } from "@/lib/utils";
import { roleLabelsForRoles } from "@/lib/products/commandos/role-catalog";
import { getPanelAccessSummary, type AdminUserRow } from "@/lib/products/commandos/admin-users-shared";
import { resetAdminUserPasswordAction } from "./actions";
import { canSignIn, statusMeta, type StatusTone } from "@/lib/security/account-status";
import StatusDialog, { type StatusTarget } from "./StatusDialog";
import DesignationDialog from "./DesignationDialog";
import type { CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";
import RoleEditorSheet from "./RoleEditorSheet";
import PermissionOverridesSheet from "./PermissionOverridesSheet";
import CreateUserSheet from "./CreateUserSheet";
import TempPasswordDialog from "./TempPasswordDialog";
import UserDetailDrawer from "./UserDetailDrawer";

const TONES: Record<StatusTone, string> = {
  green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  blue: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
  red: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  muted: "bg-muted text-muted-foreground border-border",
};

function RowActions({
  row,
  currentAdminId,
  isDirector,
  onViewDetail,
  onEditRoles,
  onEditPermissions,
  onTempPassword,
  onChangeStatus,
  onChangeDesignation,
}: {
  row: AdminUserRow;
  currentAdminId: string;
  isDirector: boolean;
  onViewDetail: (row: AdminUserRow) => void;
  onEditRoles: (row: AdminUserRow) => void;
  onEditPermissions: (row: AdminUserRow) => void;
  onTempPassword: (info: { email: string; tempPassword: string }) => void;
  onChangeStatus: (row: AdminUserRow) => void;
  onChangeDesignation: (row: AdminUserRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isSelf = row._id === currentAdminId;

  function resetPassword() {
    startTransition(async () => {
      const result = await resetAdminUserPasswordAction(row._id);
      if (!result.ok || !result.tempPassword) toast.error(result.error ?? "Could not reset password.");
      else onTempPassword({ email: row.email, tempPassword: result.tempPassword });
    });
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Row actions">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onViewDetail(row)}>
            <Eye className="size-3.5" />
            View person
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onChangeDesignation(row)} disabled={isSelf && row.designationId === "director"}>
            <BriefcaseBusiness className="size-3.5" />
            Change designation
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEditRoles(row)}>
            <ShieldCheck className="size-3.5" />
            Edit roles
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEditPermissions(row)}>
            <SlidersHorizontal className="size-3.5" />
            Edit permissions
          </DropdownMenuItem>
          <DropdownMenuItem onClick={resetPassword} disabled={isPending}>
            <KeyRound className="size-3.5" />
            Reset password
          </DropdownMenuItem>
          {isDirector && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onChangeStatus(row)} disabled={isSelf}>
                <UserCog className="size-3.5" />
                Change status…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BulkActions({ ctx, onChangeStatus }: { ctx: BulkActionsContext; onChangeStatus?: () => void }) {
  return (
    <>
      <a
        href={`/api/commandos/users/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
      >
        Export
      </a>
      {onChangeStatus && (
        <Button type="button" variant="outline" size="sm" onClick={onChangeStatus} className="h-8 text-xs gap-1.5">
          <UserCog className="size-3.5" />
          Change status of selected
        </Button>
      )}
    </>
  );
}

export default function UsersGrid({
  rows,
  total,
  page,
  totalPages,
  sortBy,
  sortDir,
  filters,
  hasActiveFilters,
  currentAdminId,
  isDirector,
  customRoles,
  planName,
  seatLimit,
}: {
  rows: AdminUserRow[];
  total: number;
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
  currentAdminId: string;
  isDirector: boolean;
  customRoles: CustomRoleView[];
  planName: string | null;
  seatLimit: number | null;
}) {
  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);
  const [editRolesFor, setEditRolesFor] = useState<AdminUserRow | null>(null);
  const [editPermissionsFor, setEditPermissionsFor] = useState<AdminUserRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFor, setStatusFor] = useState<StatusTarget[] | null>(null);
  const [designationFor, setDesignationFor] = useState<AdminUserRow | null>(null);
  const router = useRouter();
  const toTarget = (r: AdminUserRow): StatusTarget => ({ id: r._id, email: r.email, name: r.name, status: r.status });
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ email: string; tempPassword: string } | null>(null);

  const columns: AdminDataGridColumn<AdminUserRow>[] = [
    {
      key: "email",
      label: "Account",
      render: (row) => (
        <div
          className="flex items-center gap-2 cursor-pointer hover:underline"
          onClick={() => setDetailUser(row)}
        >
          <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
            {(row.name || row.email).slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-foreground text-xs">{row.name || row.email}</p>
              {row.locked && <Lock className="size-3 text-destructive" />}
              {row._id === currentAdminId && <Badge variant="outline" className="h-4 px-1 text-[9px]">You</Badge>}
            </div>
            {row.name && <p className="text-[10px] text-muted-foreground">{row.email}</p>}
            {row.employeeId && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <BadgeCheck className="size-2.5 text-primary" /> HR file linked
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "designation",
      label: "Designation",
      render: (row) => (
        <Badge variant="outline" className={`text-[10px] font-medium ${row.designationId === "director" ? "border-primary/30 bg-primary/10 text-primary" : ""}`}>
          {row.designation}
        </Badge>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const meta = statusMeta(row.status);
        return (
          <div className="space-y-0.5">
            <Badge variant="secondary" className={`text-[10px] font-medium ${TONES[meta.tone]}`}>
              <span className="flex items-center gap-1">
                {canSignIn({ status: row.status, roles: ["x"] }) ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />} {meta.label}
              </span>
            </Badge>
            {row.lastWorkingDay && <p className="text-[10px] text-muted-foreground">Last day {formatDate(row.lastWorkingDay)}</p>}
          </div>
        );
      },
    },
    {
      key: "userType",
      label: "Category",
      render: (row) => (
        <Badge variant="outline" className="capitalize text-[10px] font-normal">
          {row.userType || "employee"}
        </Badge>
      ),
    },
    {
      key: "roles",
      label: "Product Access & Roles",
      render: (row) => {
        if (row.roles.length === 0) {
          return <span className="text-xs text-muted-foreground italic">No Active Roles</span>;
        }
        const panels = getPanelAccessSummary(row);
        const activePanels = panels.filter((p) => p.hasAccess);
        const overrideCount = Object.keys(row.permissionOverrides).length;

        return (
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1">
              {activePanels.map((p) => (
                <Badge key={p.key} variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                  {p.name.replace(" Product", "")}
                </Badge>
              ))}
              {overrideCount > 0 && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-amber-600 dark:text-amber-400">
                  +{overrideCount} override{overrideCount > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground truncate max-w-xs">
              {roleLabelsForRoles(row.roles).slice(0, 3).join(", ")}
              {row.roles.length > 3 && ` +${row.roles.length - 3} more`}
            </div>
          </div>
        );
      },
    },
    {
      key: "mustChangePassword",
      label: "Password",
      render: (row) => (row.mustChangePassword ? <Badge variant="outline" className="text-[10px]">Temp</Badge> : <span className="text-xs text-muted-foreground">Set</span>),
    },
    { key: "createdAt", label: "Created", sortable: true, render: (row) => formatDate(row.createdAt) },
    {
      key: "lastLoginAt",
      label: "Last login",
      sortable: true,
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="text-muted-foreground text-xs">Never</span>),
    },
  ];

  return (
    <>
      <AdminDataGrid
        columns={columns}
        rows={rows}
        getRowId={(row) => row._id}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        emptyLabel="No accounts match these filters."
        filters={filters}
        filterTitle="User Directory Filters"
        filterSubtitle="Search and narrow the platform-wide user roster"
        filterIcon={Users}
        hasActiveFilters={hasActiveFilters}
        toolbarExtra={
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)} className="h-8 text-xs gap-1.5">
            <Plus className="size-3.5" data-icon="inline-start" />
            New User Account
          </Button>
        }
        rowActions={(row) => (
          <RowActions
            row={row}
            currentAdminId={currentAdminId}
            isDirector={isDirector}
            onChangeStatus={(r) => setStatusFor([toTarget(r)])}
            onChangeDesignation={setDesignationFor}
            onViewDetail={setDetailUser}
            onEditRoles={setEditRolesFor}
            onEditPermissions={setEditPermissionsFor}
            onTempPassword={setTempPasswordInfo}
          />
        )}
        renderBulkActions={(ctx) => <BulkActions ctx={ctx} onChangeStatus={isDirector ? () => setStatusFor(rows.filter((r) => ctx.selectedIds.includes(r._id) && r._id !== currentAdminId).map(toTarget)) : undefined} />}
      />

      <UserDetailDrawer
        user={detailUser}
        open={detailUser !== null}
        onOpenChange={(open) => !open && setDetailUser(null)}
        isDirector={isDirector}
        onChangeStatus={(u) => { setDetailUser(null); setStatusFor([toTarget(u)]); }}
        onChangeDesignation={(u) => { setDetailUser(null); setDesignationFor(u); }}
        currentAdminId={currentAdminId}
        onOpenRoleEditor={(u) => {
          setDetailUser(null);
          setEditRolesFor(u);
        }}
      />

      <StatusDialog targets={statusFor} onClose={() => setStatusFor(null)} onDone={() => router.refresh()} />
      <DesignationDialog target={designationFor ? { id: designationFor._id, email: designationFor.email, name: designationFor.name, designationId: designationFor.designationId, designation: designationFor.designation } : null} designations={customRoles} canMakeDirector={isDirector} onClose={() => setDesignationFor(null)} onDone={() => router.refresh()} />

      <RoleEditorSheet
        key={`roles-${editRolesFor?._id ?? "none"}`}
        userId={editRolesFor?._id ?? null}
        userEmail={editRolesFor?.email ?? null}
        initialRoles={editRolesFor?.manualRoles ?? []}
        customRoles={customRoles.filter((r) => r.id !== editRolesFor?.designationId)}
        initialCustomRoleIds={editRolesFor?.customRoleIds ?? []}
        currentAdminId={currentAdminId}
        open={editRolesFor !== null}
        onOpenChange={(open) => !open && setEditRolesFor(null)}
      />

      <PermissionOverridesSheet
        key={`permissions-${editPermissionsFor?._id ?? "none"}`}
        userId={editPermissionsFor?._id ?? null}
        userEmail={editPermissionsFor?.email ?? null}
        userRoles={editPermissionsFor?.roles ?? []}
        initialOverrides={editPermissionsFor?.manualOverrides ?? {}}
        hasCustomRoles={(editPermissionsFor?.customRoleIds ?? []).length > 0}
        open={editPermissionsFor !== null}
        onOpenChange={(open) => !open && setEditPermissionsFor(null)}
      />

      <CreateUserSheet
        customRoles={customRoles}
        isDirector={isDirector}
        planName={planName}
        seatLimit={seatLimit}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(email, tempPassword) => setTempPasswordInfo({ email, tempPassword })}
      />

      <TempPasswordDialog info={tempPasswordInfo} onClose={() => setTempPasswordInfo(null)} />
    </>
  );
}
