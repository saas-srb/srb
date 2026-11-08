"use client";

import { usePanelLabel, usePanels } from "@/components/platform/PanelsProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Wallet,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  RotateCcw,
  FileCheck2,
  ArrowLeftRight,
  ShoppingCart,
  FolderKanban,
  Users,
  GraduationCap,
  Landmark,
  CreditCard,
  Building2,
  Scale,
  BarChart3,
  Settings,
  Send,
  CalendarCheck,
  Percent,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { FmsRole } from "@/lib/fms-roles";
import { canManageAccounts, canViewAuditLog, canViewBanking, canViewCommercialFinance, canViewFinancialStatements, canViewPayrollFinance } from "@/lib/fms-roles";

function NavLink({
  href,
  label,
  icon: Icon,
  exact = false,
  collapsed = false,
  badge,
  onNavigate,
  matches,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  collapsed?: boolean;
  badge?: string | number;
  onNavigate?: () => void;
  /** Other places that belong under this item, so it stays lit while you are inside any of them. */
  matches?: string[];
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : [href, ...(matches ?? [])].some((p) => pathname === p || pathname?.startsWith(`${p}/`));

  const inner = (
    <>
      {active && (
        <motion.span
          layoutId="fms-nav-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-secondary/10"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <Icon className="relative size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && <span className="relative truncate">{label}</span>}
      {!collapsed && badge !== undefined && (
        <span className="relative ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          {badge}
        </span>
      )}
    </>
  );

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active ? "text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
      )}
    >
      {inner}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) return <div className="mt-4 mb-1 border-t border-border/50" />;
  return (
    <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</div>
  );
}

export default function FmsSidebar({
  roles,
  permissionOverrides,
  onNavigate,
  collapsed = false,
}: {
  roles: FmsRole[];
  permissionOverrides?: Record<string, boolean>;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const panels = usePanels();
  const panelLabel = usePanelLabel();
  const roleCtx = { roles, permissionOverrides };
  const nav = (props: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
    badge?: string | number;
    matches?: string[];
  }) => <NavLink {...props} collapsed={collapsed} onNavigate={onNavigate} />;

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      {/* ── MAIN ── */}
      {nav({ href: "/cashflow-ai", label: "Dashboard", icon: LayoutDashboard, exact: true })}

      {/* ── PRODUCTS ── */}
      <SectionLabel collapsed={collapsed}>Products</SectionLabel>
      {panels.prms?.available !== false && nav({ href: "/cashflow-ai/products/prms", label: panelLabel("prms", "SpendIQ Product"), icon: ShoppingCart })}
      {panels.pms?.available !== false && nav({ href: "/cashflow-ai/products/pms", label: panelLabel("pms", "SprintOS Product"), icon: FolderKanban })}
      {canViewPayrollFinance(roleCtx) && panels.hrms?.available !== false && nav({ href: "/cashflow-ai/products/hrms", label: panelLabel("hrms", "TalentOS Product"), icon: Users })}
      {panels.tms?.available !== false && nav({ href: "/cashflow-ai/products/tms", label: panelLabel("tms", "Cohort AI Product"), icon: GraduationCap })}

      {/* ── ACCOUNTS: eight places, in the order a company uses them. Everything else is one click inside these (see docs/accounts-simplification.md). ── */}
      <SectionLabel collapsed={collapsed}>Accounts</SectionLabel>
      {(canViewFinancialStatements(roleCtx) || canViewCommercialFinance(roleCtx)) && nav({ href: "/cashflow-ai/work", label: "My work", icon: ListChecks, matches: ["/cashflow-ai/work"] })}
      {canViewCommercialFinance(roleCtx) && nav({ href: "/cashflow-ai/receivables", label: "Money in", icon: ArrowDownLeft, matches: ["/cashflow-ai/invoices", "/cashflow-ai/receipts", "/cashflow-ai/credit-notes", "/cashflow-ai/refunds", "/cashflow-ai/customers", "/cashflow-ai/payment-links", "/cashflow-ai/payments"] })}
      {canViewCommercialFinance(roleCtx) && nav({ href: "/cashflow-ai/payouts", label: "Money out", icon: Send, matches: ["/cashflow-ai/bills", "/cashflow-ai/payables", "/cashflow-ai/vendor-payments", "/cashflow-ai/vendors", "/cashflow-ai/debit-notes", "/cashflow-ai/employee-expenses", "/cashflow-ai/advances", "/cashflow-ai/reimbursements", "/cashflow-ai/salary-payments"] })}
      {(canViewBanking(roleCtx) || canViewCommercialFinance(roleCtx) || canViewFinancialStatements(roleCtx)) && nav({ href: "/cashflow-ai/banking", label: "Bank & cash", icon: Landmark, matches: ["/cashflow-ai/transactions", "/cashflow-ai/bank-accounts", "/cashflow-ai/cash-accounts", "/cashflow-ai/bank-reconciliation", "/cashflow-ai/cash-reconciliation", "/cashflow-ai/settlements", "/cashflow-ai/beneficiaries", "/cashflow-ai/transfers"] })}
      {canViewFinancialStatements(roleCtx) && nav({ href: "/cashflow-ai/taxes", label: "Taxes", icon: Percent, matches: ["/cashflow-ai/gst", "/cashflow-ai/tds", "/cashflow-ai/income-tax"] })}
      {(canViewFinancialStatements(roleCtx) || canViewCommercialFinance(roleCtx)) && nav({ href: "/cashflow-ai/closing", label: "Month & year-end", icon: CalendarCheck, matches: ["/cashflow-ai/month-close", "/cashflow-ai/compliance", "/cashflow-ai/party-reconciliation", "/cashflow-ai/vendor-controls"] })}
      {canViewFinancialStatements(roleCtx) && nav({ href: "/cashflow-ai/reports/financial-summary", label: "Reports", icon: BarChart3, matches: ["/cashflow-ai/reports", "/cashflow-ai/trial-balance", "/cashflow-ai/general-ledger"] })}
    </nav>
  );
}
