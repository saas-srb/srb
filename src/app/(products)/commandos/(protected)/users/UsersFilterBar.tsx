"use client";

import { usePanels } from "@/components/platform/PanelsProvider";
import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Filter, ShieldCheck, Layers, UserCheck, CheckCircle2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { ACCOUNT_STATUSES } from "@/lib/security/account-status";

export default function UsersFilterBar({
  initialSearch,
  initialRole,
  initialPanel,
  initialStatus,
  initialUserType,
  initialDesignation,
  designations,
}: {
  initialDesignation: string;
  designations: { id: string; name: string; department: string }[];
  initialSearch: string;
  initialRole: string;
  initialPanel: string;
  initialStatus: string;
  initialUserType: string;
}) {
  // Product names come from the Product Registry, like every other listing.
  const allPanels = usePanels();
  const panelOptions = Object.values(allPanels)
    .sort((a, b) => a.order - b.order);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(initialSearch);

  function updateParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== initialSearch) updateParams({ search: searchInput || undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="flex items-center gap-3 flex-wrap w-full">
      {/* Search Input */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email, notes, ID..."
            className="h-9 w-56 pl-8 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"
          />
        </div>
      </div>

      {/* Product Filter Dropdown */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Product Access</label>
        <Select
          value={initialPanel || "all"}
          onValueChange={(val: string | null) => updateParams({ panel: !val || val === "all" ? undefined : val })}
        >
          <SelectTrigger className="w-44 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <Layers className="size-3.5 mr-1.5 text-primary shrink-0" />
            <SelectValue placeholder="All Products" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">All Products</SelectItem>
            <SelectItem value="admin">Director (full access)</SelectItem>
            {panelOptions.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Account Status Filter */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Status</label>
        <Select
          value={initialStatus || "all"}
          onValueChange={(val: string | null) => updateParams({ status: !val || val === "all" ? undefined : val })}
        >
          <SelectTrigger className="w-44 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="working">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3" /> Can sign in</span>
            </SelectItem>
            <SelectItem value="blocked">
              <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400"><XCircle className="size-3" /> Cannot sign in</span>
            </SelectItem>
            <SelectItem value="left">Left the company</SelectItem>
            <SelectSeparator />
            {ACCOUNT_STATUSES.map((st) => (
              <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Designation Filter */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Designation</label>
        <Select
          value={initialDesignation || "all"}
          onValueChange={(val: string | null) => updateParams({ designation: !val || val === "all" ? undefined : val })}
        >
          <SelectTrigger className="w-48 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <SelectValue placeholder="All designations" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">All designations</SelectItem>
            <SelectItem value="director">Director</SelectItem>
            {[...new Set(designations.map((d) => d.department))].sort().map((dep) => (
              <SelectGroup key={dep}>
                <SelectSeparator />
                <SelectLabel>{dep}</SelectLabel>
                {designations.filter((d) => d.department === dep).sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* User Category Filter */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Category</label>
        <Select
          value={initialUserType || "all"}
          onValueChange={(val: string | null) => updateParams({ userType: !val || val === "all" ? undefined : val })}
        >
          <SelectTrigger className="w-40 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="employee">Employee (Internal)</SelectItem>
            <SelectItem value="contractor">Contractor / Freelancer</SelectItem>
            <SelectItem value="partner">External Partner</SelectItem>
            <SelectItem value="system">System Account</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Granular Role Filter */}
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">Specific Role</label>
        <Select
          value={initialRole || "all"}
          onValueChange={(val: string | null) => updateParams({ role: !val || val === "all" ? undefined : val })}
        >
          <SelectTrigger className="w-44 h-9 text-xs rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40">
            <ShieldCheck className="size-3.5 mr-1 text-muted-foreground shrink-0" />
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="super_admin">Director</SelectItem>
            {ROLE_GROUPS.map((g) => (
              <SelectGroup key={g.module}>
                <SelectSeparator />
                <SelectLabel>{allPanels[g.panel]?.name ?? g.module}</SelectLabel>
                {g.roles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
