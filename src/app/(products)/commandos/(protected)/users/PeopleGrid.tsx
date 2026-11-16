"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Eye, Pencil, KeyRound, UserCog, Plus, Lock, Users, CheckCircle2, XCircle, BadgeCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import AdminDataGrid, { type AdminDataGridColumn, type BulkActionsContext } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDateTime } from "@/lib/utils";
import { canSignIn, statusMeta, type StatusTone } from "@/lib/security/account-status";
import type { PersonRow } from "@/lib/products/commandos/people-list";
import { resetAdminUserPasswordAction } from "./actions";
import StatusDialog, { type StatusTarget } from "./StatusDialog";
import BulkAccessDialog, { type BulkTarget } from "./BulkAccessDialog";
import TempPasswordDialog from "./TempPasswordDialog";
import PersonDrawer from "./PersonDrawer";

const TONES: Record<StatusTone, string> = {
  green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  blue: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  amber: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400",
  red: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  muted: "bg-muted text-muted-foreground border-border",
};

function RowMenu({ row, isSelf, isDirector, onView, onStatus, onTemp }: { row: PersonRow; isSelf: boolean; isDirector: boolean; onView: (r: PersonRow) => void; onStatus: (r: PersonRow) => void; onTemp: (i: { email: string; tempPassword: string }) => void }) {
  const [pending, start] = useTransition();
  const reset = () => start(async () => {
    const r = await resetAdminUserPasswordAction(row._id);
    if (!r.ok || !r.tempPassword) toast.error(r.error ?? "Could not reset the password."); else onTemp({ email: row.email, tempPassword: r.tempPassword });
  });
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${row.name || row.email}`}><MoreHorizontal className="size-4" /></Button>} />
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onClick={() => onView(row)}><Eye className="size-3.5" />View person</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/commandos/users/${row._id}/edit`} />}><Pencil className="size-3.5" />Edit details and access</DropdownMenuItem>
          <DropdownMenuItem onClick={reset} disabled={pending}><KeyRound className="size-3.5" />Reset password</DropdownMenuItem>
          {isDirector && (<><DropdownMenuSeparator /><DropdownMenuItem onClick={() => onStatus(row)} disabled={isSelf}><UserCog className="size-3.5" />Change status…</DropdownMenuItem></>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function PeopleGrid({
  rows, total, page, totalPages, sortBy, sortDir, filters, hasActiveFilters, currentAdminId, isDirector,
}: {
  rows: PersonRow[]; total: number; page: number; totalPages: number; sortBy: string; sortDir: "asc" | "desc"; filters?: React.ReactNode; hasActiveFilters?: boolean; currentAdminId: string; isDirector: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<PersonRow | null>(null);
  const [statusFor, setStatusFor] = useState<StatusTarget[] | null>(null);
  const [bulkFor, setBulkFor] = useState<BulkTarget[] | null>(null);
  const [temp, setTemp] = useState<{ email: string; tempPassword: string } | null>(null);
  const toTarget = (r: PersonRow): StatusTarget => ({ id: r._id, email: r.email, name: r.name, status: r.status });

  const columns: AdminDataGridColumn<PersonRow>[] = [
    {
      key: "person", label: "Person", sortable: true,
      render: (r) => (
        <button type="button" onClick={() => setDetail(r)} className="flex items-center gap-2 text-left hover:underline">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>{(r.name || r.email).slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-medium">{r.name || r.email}{r.locked && <Lock className="size-3 text-destructive" aria-label="Locked" />}{r._id === currentAdminId && <Badge variant="outline" className="h-4 px-1 text-[9px]">You</Badge>}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{r.email}{r.employeeId ? "" : ""}</span>
            {r.employeeId && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><BadgeCheck className="size-2.5 text-primary" aria-hidden />HR file</span>}
          </span>
        </button>
      ),
    },
    { key: "department", label: "Department", render: (r) => <span className="text-xs">{r.departments.join(", ") || "—"}</span> },
    { key: "team", label: "Team", render: (r) => <span className="text-xs">{r.teams.join(", ") || "—"}</span> },
    { key: "designation", label: "Designation", render: (r) => <Badge variant="outline" className={`text-[10px] font-medium ${r.isDirector ? "border-primary/30 bg-primary/10 text-primary" : ""}`}>{r.designations[0] ?? "—"}{r.designations.length > 1 ? ` +${r.designations.length - 1}` : ""}</Badge> },
    {
      key: "status", label: "Status",
      render: (r) => {
        const m = statusMeta(r.status);
        return <Badge variant="secondary" className={`text-[10px] font-medium ${TONES[m.tone]}`}><span className="flex items-center gap-1">{canSignIn({ status: r.status, roles: ["x"] }) ? <CheckCircle2 className="size-3" aria-hidden /> : <XCircle className="size-3" aria-hidden />}{m.label}</span></Badge>;
      },
    },
    { key: "products", label: "Products", render: (r) => <span className="text-xs">{r.isDirector ? "All" : `${r.productsCount} of ${r.productsTotal}`}</span> },
    { key: "lastLoginAt", label: "Last sign-in", sortable: true, render: (r) => (r.lastLoginAt ? <span className="text-xs">{formatDateTime(r.lastLoginAt)}</span> : <span className="text-xs text-muted-foreground">Never</span>) },
  ];

  return (
    <>
      <AdminDataGrid
        columns={columns}
        rows={rows}
        getRowId={(r) => r._id}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        emptyLabel="No one matches these filters."
        filters={filters}
        filterTitle="Search & Filters"
        filterSubtitle="Find people by name, department, team, designation or status"
        filterIcon={Users}
        hasActiveFilters={hasActiveFilters}
        toolbarExtra={<Link href="/commandos/users/new" className={buttonVariants({ size: "sm" })}><Plus className="size-3.5" data-icon="inline-start" />Add a person</Link>}
        rowActions={(r) => <RowMenu row={r} isSelf={r._id === currentAdminId} isDirector={isDirector} onView={setDetail} onStatus={(x) => setStatusFor([toTarget(x)])} onTemp={setTemp} />}
        renderBulkActions={(ctx: BulkActionsContext) => (
          <>
            <a href={`/api/commandos/users/export?ids=${encodeURIComponent(ctx.selectedIds.join(","))}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">Export</a>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setBulkFor(rows.filter((r) => ctx.selectedIds.includes(r._id)).map((r) => ({ id: r._id, name: r.name || r.email })))}><Users className="size-3.5" />Give access to selected</Button>
            {isDirector && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setStatusFor(rows.filter((r) => ctx.selectedIds.includes(r._id) && r._id !== currentAdminId).map(toTarget))}><UserCog className="size-3.5" />Change status of selected</Button>}
          </>
        )}
      />
      <PersonDrawer person={detail} open={detail !== null} onOpenChange={(o) => !o && setDetail(null)} isDirector={isDirector} currentAdminId={currentAdminId} onChangeStatus={(p) => { setDetail(null); setStatusFor([toTarget(p)]); }} />
      <BulkAccessDialog targets={bulkFor} people={rows.map((r) => ({ id: r._id, name: r.name || r.email, isDirector: r.roles.includes("super_admin") }))} onClose={() => setBulkFor(null)} onDone={() => router.refresh()} />
      <StatusDialog targets={statusFor} onClose={() => setStatusFor(null)} onDone={() => router.refresh()} />
      <TempPasswordDialog info={temp} onClose={() => setTemp(null)} />
    </>
  );
}
