"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import OrgPicker from "@/components/platform/OrgPicker";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectSeparator } from "@/components/ui/select";
import { ACCOUNT_STATUSES } from "@/lib/security/account-status";
import type { OrgOption } from "@/lib/platform/organization/rules";

/** The People list's search and filters: person, department, team, designation, status. Everything is in the address, so a filtered list can be shared. */
const GROUPS: Record<string, string> = { "": "Everyone", all: "Everyone", working: "Can sign in", blocked: "Cannot sign in", left: "Left the company" };
const statusLabel = (v: string) => GROUPS[v] ?? ACCOUNT_STATUSES.find((s) => s.value === v)?.label ?? "Everyone";

export default function PeopleFilters({
  initial,
  org,
}: {
  initial: { search: string; status: string; department: string; team: string; designation: string; userType: string };
  org: { departments: OrgOption[]; teams: OrgOption[]; designations: OrgOption[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initial.search);

  function update(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) (v ? params.set(k, v) : params.delete(k));
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const t = setTimeout(() => { if (search !== initial.search) update({ search: search || undefined }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const field = "flex flex-col gap-1.5";
  const lab = "text-xs font-medium text-muted-foreground";
  return (
    <div className="flex w-full flex-wrap items-end gap-3">
      <div className={field}>
        <label htmlFor="people-search" className={lab}>Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="people-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or ID" className="h-9 w-56 rounded-xl border-border/50 bg-background pl-8 text-xs" />
        </div>
      </div>
      <div className={field}>
        <span className={lab}>Department</span>
        <OrgPicker kind="department" options={org.departments} value={initial.department} onChange={(v) => update({ department: v || undefined, team: undefined, designation: undefined })} noneLabel="All departments" className="h-9 w-44" />
      </div>
      <div className={field}>
        <span className={lab}>Team</span>
        <OrgPicker kind="team" options={org.teams} departmentId={initial.department} value={initial.team} onChange={(v) => update({ team: v || undefined })} noneLabel="All teams" className="h-9 w-40" />
      </div>
      <div className={field}>
        <span className={lab}>Designation</span>
        <OrgPicker kind="designation" options={org.designations} departmentId={initial.department} value={initial.designation} onChange={(v) => update({ designation: v || undefined })} noneLabel="All designations" className="h-9 w-48" />
      </div>
      <div className={field}>
        <span className={lab}>Status</span>
        <Select value={initial.status || "all"} onValueChange={(v) => update({ status: !v || v === "all" ? undefined : v })}>
          <SelectTrigger className="h-9 w-48 rounded-xl border-border/50 bg-background text-xs"><SelectValue>{statusLabel(initial.status)}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="working">Can sign in</SelectItem>
            <SelectItem value="blocked">Cannot sign in</SelectItem>
            <SelectItem value="left">Left the company</SelectItem>
            <SelectSeparator />
            {ACCOUNT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
