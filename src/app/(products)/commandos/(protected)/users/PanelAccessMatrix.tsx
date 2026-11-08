"use client";

import { usePanels } from "@/components/platform/PanelsProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPanelAccessSummary, type AdminUserRow } from "@/lib/products/commandos/admin-users-shared";
import { roleLabel } from "@/lib/products/commandos/role-catalog";
import {
  ShieldCheck,
  Users,
  Briefcase,
  Layers,
  GraduationCap,
  DollarSign,
  MessageSquare,
  BookOpen,
  CheckCircle2,
  XCircle,
  Edit,
  UserCheck,
  LayoutDashboard,
  BookText,
  SearchCheck,
  Vault,
  Bot,
  Megaphone,
  Sparkles,
  FileCheck2,
} from "lucide-react";

const MODULE_ICONS: Record<string, React.ReactNode> = {
  admin: <ShieldCheck className="size-5 text-primary" />,
  hrms: <Users className="size-5 text-brand-deep" />,
  pms: <Briefcase className="size-5 text-primary" />,
  prms: <Layers className="size-5 text-brand-deep" />,
  tms: <GraduationCap className="size-5 text-primary" />,
  fms: <DollarSign className="size-5 text-brand-deep" />,
  sop: <BookText className="size-5 text-primary" />,
  seo: <SearchCheck className="size-5 text-brand-deep" />,
  dlms: <Vault className="size-5 text-primary" />,
  aibots: <Bot className="size-5 text-brand-deep" />,
  intelligence: <Sparkles className="size-5 text-primary" />,
  smms: <Megaphone className="size-5 text-primary" />,
  ots: <FileCheck2 className="size-5 text-brand-deep" />,
  messenger: <MessageSquare className="size-5 text-primary" />,
  lms: <BookOpen className="size-5 text-brand-deep" />,
  portal: <UserCheck className="size-5 text-primary" />,
  workspace: <LayoutDashboard className="size-5 text-brand-deep" />,
};

export default function PanelAccessMatrix({
  user,
  onEditRoles,
}: {
  user: AdminUserRow;
  onEditRoles?: () => void;
}) {
  const registry = usePanels();
  // Names come from the Product Registry so this matches every other listing.
  const summary = getPanelAccessSummary(user).map((p) => ({ ...p, name: registry[p.key]?.name ?? p.name }));
  // Every product in the registry gets a row. Products with no role of their own (Help & Support, the public website) are open to everyone.
  const shown = new Set(summary.map((p) => p.key));
  const everyone = new Set(["support", "website"]);
  const panels = [
    ...summary,
    ...Object.values(registry)
      .filter((p) => !shown.has(p.key))
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ key: p.key, name: p.name, hasAccess: everyone.has(p.key) || user.roles.includes("super_admin"), roles: [] as string[], isSuperAdmin: user.roles.includes("super_admin") })),
  ];
  const overrideKeys = Object.keys(user.permissionOverrides);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Product Access Overview</h3>
          <p className="text-xs text-muted-foreground">
            Access is automatically determined by assigned roles across every product.
          </p>
        </div>
        {onEditRoles && (
          <Button variant="outline" size="sm" onClick={onEditRoles} className="h-8 gap-1.5 text-xs">
            <Edit className="size-3.5" />
            Manage Roles
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {panels.map((p) => {
          const icon = MODULE_ICONS[p.key] ?? <Layers className="size-5 text-muted-foreground" />;
          const moduleOverrides = overrideKeys.filter((k) => k.startsWith(`${p.key}.`));

          return (
            <div
              key={p.key}
              className={`flex flex-col justify-between rounded-xl border p-3.5 transition-colors ${
                p.hasAccess
                  ? "border-border/80 bg-card hover:border-primary/40"
                  : "border-border/40 bg-muted/20 opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg border border-border/50 bg-background p-2">{icon}</div>
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{p.name}</h4>
                    {p.isSuperAdmin ? (
                      <span className="text-[11px] text-amber-500 font-medium">Bypassed by Director</span>
                    ) : p.roles.length > 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        {p.roles.length} role{p.roles.length > 1 ? "s" : ""} assigned
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No roles assigned</span>
                    )}
                  </div>
                </div>

                <Badge
                  variant={p.hasAccess ? "default" : "secondary"}
                  className={`capitalize font-medium text-[11px] ${
                    p.hasAccess
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.hasAccess ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3 text-emerald-500" />
                      Granted
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <XCircle className="size-3 text-muted-foreground" />
                      No Access
                    </span>
                  )}
                </Badge>
              </div>

              {p.roles.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-border/50 flex flex-wrap gap-1">
                  {p.roles.map((r) => (
                    <Badge key={r} variant="outline" className="text-[10px] font-normal py-0 px-2 bg-background">
                      {roleLabel(r)}
                    </Badge>
                  ))}
                </div>
              )}

              {moduleOverrides.length > 0 && (
                <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">
                  ⚡ {moduleOverrides.length} permission override{moduleOverrides.length > 1 ? "s" : ""} active
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
