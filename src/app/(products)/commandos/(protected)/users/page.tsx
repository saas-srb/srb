import { isDirector } from "@/lib/access/director";
import Link from "next/link";
import { Users, UserCheck, UserX, Armchair, Plus } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import { buttonVariants } from "@/components/ui/button";
import { countSeatsUsed } from "@/lib/platform/billing/enforce";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { listPeople } from "@/lib/products/commandos/people-list";
import { loadOrgOptions } from "@/lib/platform/organization/options";
import { ACCOUNT_STATUS_VALUES, type AccountStatus } from "@/lib/security/account-status";
import type { StatusFilter } from "@/lib/products/commandos/admin-users";
import PeopleGrid from "./PeopleGrid";
import PeopleFilters from "./PeopleFilters";
import AccessRequestsPanel from "./AccessRequestsPanel";
import { listAccessRequests } from "@/lib/products/commandos/access-requests";
import { formatDateTime } from "@/lib/utils";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; department?: string; team?: string; designation?: string; userType?: "employee" | "contractor" | "partner" | "system"; sortBy?: string; sortDir?: string }>;
}) {
  // The page needs the manage-users feature, the same one the actions check.
  const admin = await requireWorkspaceAccess("company.users");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status: StatusFilter | undefined = sp.status === "working" || sp.status === "blocked" || sp.status === "left" || (ACCOUNT_STATUS_VALUES as readonly string[]).includes(sp.status ?? "") ? (sp.status as AccountStatus | "working" | "blocked" | "left") : undefined;
  const sortBy = sp.sortBy === "email" || sp.sortBy === "lastLoginAt" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const requests = await listAccessRequests("open", 20);
  const [list, org, seatsUsed, entitlements] = await Promise.all([
    listPeople({ page, pageSize: 20, search: sp.search, status, departmentId: sp.department || undefined, teamId: sp.team || undefined, designationId: sp.designation || undefined, userType: sp.userType, sortBy, sortDir }),
    loadOrgOptions(),
    countSeatsUsed(),
    getEntitlements(),
  ]);
  const seatLimit = entitlements.limits.seats;
  const hasActiveFilters = Boolean(sp.search || status || sp.department || sp.team || sp.designation || sp.userType);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "People & access" }]}
        title={<>People &amp; access</>}
        description={<>Everyone who can sign in, where they work, and which products and features they can use.</>}
        actions={<Link href="/commandos/users/new" className={buttonVariants({ size: "sm" })}><Plus className="size-3.5" data-icon="inline-start" />Add a person</Link>}
      />

      {seatLimit === 1 && (
        <div role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Your plan is for <strong>one person</strong>: no other users can be added. <Link href="/commandos/settings/billing" className="font-medium underline">Upgrade your plan</Link> to add your team.
        </div>
      )}

      <AccessRequestsPanel rows={requests.map((r) => ({ id: r._id, userId: r.userId, who: r.name || r.email, email: r.email, label: r.label, message: r.message, at: formatDateTime(r.createdAt.toISOString()) }))} />

      <PanelListFilters>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="People" value={list.total} accent icon={<Users className="size-4" />} />
          <KpiCard label="Can sign in" value={list.activeCount} icon={<UserCheck className="size-4" />} />
          <KpiCard label="Cannot sign in" value={list.deactivatedCount + 0} tone={list.deactivatedCount > 0 ? "down" : undefined} icon={<UserX className="size-4" />} />
          <KpiCard label="Seats used" value={`${seatsUsed} / ${seatLimit === null ? "Unlimited" : seatLimit}`} icon={<Armchair className="size-4" />} />
        </div>
        <div className="min-w-0 max-w-full"><PeopleGrid
          rows={list.items}
          total={list.total}
          page={page}
          totalPages={list.totalPages}
          sortBy={sortBy}
          sortDir={sortDir}
          hasActiveFilters={hasActiveFilters}
          currentAdminId={admin.id}
          isDirector={isDirector(admin)}
          filters={<PeopleFilters initial={{ search: sp.search ?? "", status: status ?? "", department: sp.department ?? "", team: sp.team ?? "", designation: sp.designation ?? "", userType: sp.userType ?? "" }} org={org} />}
        />
        </div>
      </PanelListFilters>
    </div>
  );
}
