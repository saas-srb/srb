"use client";

import { useState, useTransition } from "react";
import { LogOut, MonitorSmartphone, ShieldCheck, UserCog } from "lucide-react";
import AccountDrawer, { type AccountView } from "@/components/platform/panel/AccountDrawer";
import { useSidebarCollapse } from "@/components/products/dealflow-ai/SidebarCollapseContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface UnifiedProfileMenuProps {
  email?: string;
  name?: string;
  roleLabel?: string;
  roles?: string[];
  createdAt?: string;
  lastLoginAt?: string | null;
  /** Where the account lives for a person without a Workspace account (the Client Portal); everyone else gets the side product. */
  profileHref?: string;
  onLogout?: () => void;
  panelName?: string;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "user";
  const words = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Info";
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function initialsFor(emailOrName: string) {
  const clean = emailOrName.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
  return (clean.slice(0, 2) || "IN").toUpperCase();
}

/** The only two navigation entries of the sidebar user block; everything else a product offers lives in its sidebar. */
const MENU = [
  { key: "sessions", label: "Sessions & Devices", icon: MonitorSmartphone },
  { key: "profile", label: "Profile & Settings", icon: UserCog },
] as const;

export default function UnifiedProfileMenu({
  email = "",
  name,
  roleLabel = "Administrator",
  roles = ["admin"],
  createdAt,
  lastLoginAt = null,
  profileHref = "/commandos/settings",
  onLogout,
}: UnifiedProfileMenuProps) {
  const { collapsed } = useSidebarCollapse();
  const [isPending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<AccountView | null>(null);
  const [lastView, setLastView] = useState<AccountView>("profile");
  const openDrawer = (v: AccountView) => {
    setLastView(v);
    setDrawer(v);
  };

  const displayName = name || nameFromEmail(email);
  const initials = initialsFor(email);

  const isSuperAdmin =
    !roleLabel ||
    roleLabel === "Workspace User" ||
    roleLabel.toLowerCase().includes("super") ||
    roleLabel.toLowerCase().includes("admin") ||
    roles?.some((r) =>
      ["super_admin", "admin", "owner", "user"].includes(String(r).toLowerCase()) ||
      String(r).toLowerCase().includes("admin")
    );
  const finalRoleLabel = isSuperAdmin ? "Director" : (roleLabel || "Director");

  const handleLogout = () => {
    if (onLogout) {
      startTransition(() => {
        onLogout();
      });
    }
  };

  return (
    <div className="shrink-0 border-t border-border/60 p-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-all hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            collapsed && "justify-center px-0"
          )}
        >
          <Avatar className="size-8.5 shrink-0 ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-foreground">
                {displayName}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {finalRoleLabel}
              </span>
            </span>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" side="top" className="w-68 p-1.5 shadow-2xl backdrop-blur-xl">
          {/* Section 1: User Information Header */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-3 p-2 font-normal">
              <Avatar className="size-10 shrink-0 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary/15 text-sm font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground leading-tight">
                  {displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground leading-tight">
                  {email}
                </p>
                <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-primary">
                  <ShieldCheck className="size-3.5" />
                  <span>{finalRoleLabel}</span>
                </div>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          {/* Section 2: Menu Items */}
          <DropdownMenuSeparator className="my-1" />
          {MENU.map(({ label, icon: Icon, key }) => (
            <DropdownMenuItem key={key} onClick={() => openDrawer(key)} className="cursor-pointer py-1.5 text-xs font-medium">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </DropdownMenuItem>
          ))}

          {/* Section 3: Logout */}
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem
            variant="destructive"
            disabled={isPending}
            onClick={handleLogout}
            className="cursor-pointer py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 focus:bg-rose-500/10"
          >
            <LogOut className="size-4 shrink-0" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AccountDrawer
        open={drawer !== null}
        view={drawer ?? lastView}
        onViewChange={openDrawer}
        onClose={() => setDrawer(null)}
        email={email}
        displayName={displayName}
        initials={initials}
        roleLabel={finalRoleLabel}
        roles={roles}
        createdAt={createdAt}
        lastLoginAt={lastLoginAt}
        fallbackHref={profileHref}
      />
    </div>
  );
}
