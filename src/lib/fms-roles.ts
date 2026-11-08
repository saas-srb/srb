/**
 * FMS (Finance Management System) role model. Like the HRMS, PMS, TMS and
 * PRMS products, FMS access is gated on the shared `admin_users.roles` array —
 * there is no separate FMS user store. An account can sign into `/cashflow-ai` only
 * if it carries at least one of these roles (see `verifyFmsCredentials` in
 * `fms-auth.ts`).
 *
 * `super_admin` is the same literal used by every other product and implicitly
 * grants full FMS access.
 *
 * Role set follows §35 of the FMS spec. Every FMS role here is a "staff"
 * role — Phase 1 has no employee self-service tier (that arrives with
 * Employee Expenses in a later phase).
 *
 * The capability predicates below are Super-Admin-override-aware: each
 * checks `RoleContext.permissionOverrides` before falling back to its
 * role-based default. See `src/lib/permission-overrides.ts`.
 */

import { resolvePermission, type RoleContext } from "@/lib/permission-overrides";

export const FMS_ROLES = [
  "super_admin",
  "fms_admin",
  "finance_manager",
  "accountant",
  "finance_executive",
  "payroll_accountant",
  "accounts_receivable",
  "accounts_payable",
  "auditor",
  "finance_read_only",
] as const;

export type FmsRole = (typeof FMS_ROLES)[number];

export const FMS_ROLE_META: Record<FmsRole, { label: string; description: string }> = {
  super_admin: {
    label: "Director",
    description: "Full access: transactions, receivables, payables, accounts, approvals and the audit log.",
  },
  fms_admin: {
    label: "Finance Admin",
    description: "Run all of CashFlow — transactions, customers, vendors, chart of accounts, settings and reports.",
  },
  finance_manager: {
    label: "Finance Manager",
    description: "Manage and approve transactions, receivables, payables and financial reports.",
  },
  accountant: {
    label: "Accountant",
    description: "Create and manage transactions and the chart of accounts. No approval authority.",
  },
  finance_executive: {
    label: "Finance Executive",
    description: "Day-to-day transaction entry and customer / vendor record keeping.",
  },
  payroll_accountant: {
    label: "Payroll Accountant",
    description: "Payroll-related transactions once the Payroll module ships.",
  },
  accounts_receivable: {
    label: "Accounts Receivable",
    description: "Customer invoices, receipts and receivables tracking.",
  },
  accounts_payable: {
    label: "Accounts Payable",
    description: "Vendor bills, payments and payables tracking.",
  },
  auditor: {
    label: "Auditor",
    description: "Read-only access to every financial record plus the full audit trail.",
  },
  finance_read_only: {
    label: "Finance Read Only",
    description: "View dashboards, transactions, customers and vendors. No create, edit or approve.",
  },
};

export function isFmsRole(value: unknown): value is FmsRole {
  return typeof value === "string" && (FMS_ROLES as readonly string[]).includes(value);
}

/** Normalises an arbitrary stored value into a clean, de-duplicated role list. */
export function normalizeFmsRoles(value: unknown): FmsRole[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isFmsRole)));
}

/** Can open the FMS product at `/cashflow-ai/*`. */
export function hasFmsAccess(roles: readonly string[] | undefined | null): boolean {
  return normalizeFmsRoles(roles).length > 0;
}

export function isFmsAdmin(user: RoleContext): boolean {
  return resolvePermission(user, "fms.isFmsAdmin", () => user.roles.includes("fms_admin"));
}

/** Create / edit transactions, customers-side and vendors-side financial records. */
export function canManageTransactions(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canManageTransactions", () =>
    isFmsAdmin(user) ||
    user.roles.includes("finance_manager") ||
    user.roles.includes("accountant") ||
    user.roles.includes("finance_executive") ||
    user.roles.includes("accounts_receivable") ||
    user.roles.includes("accounts_payable")
  );
}

/** Move a transaction through pending_approval -> approved / rejected. */
export function canApproveTransactions(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canApproveTransactions", () =>
    isFmsAdmin(user) || user.roles.includes("finance_manager")
  );
}

/** Edit the Chart of Accounts and other FMS settings. */
export function canManageAccounts(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canManageAccounts", () => isFmsAdmin(user) || user.roles.includes("accountant"));
}

/** Read the FMS audit trail. */
export function canViewAuditLog(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canViewAuditLog", () => isFmsAdmin(user) || user.roles.includes("auditor"));
}

/** View FMS reports & the dashboard's full detail. */
export function canViewReports(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canViewReports", () =>
    isFmsAdmin(user) ||
    user.roles.includes("finance_manager") ||
    user.roles.includes("auditor") ||
    user.roles.includes("accounts_receivable") ||
    user.roles.includes("accounts_payable")
  );
}

/** Salary payments, payroll runs and the HR payroll view — HR pay data is for payroll / senior finance and auditors only. */
export function canViewPayrollFinance(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canViewPayrollFinance", () =>
    isFmsAdmin(user) ||
    user.roles.includes("finance_manager") ||
    user.roles.includes("accountant") ||
    user.roles.includes("payroll_accountant") ||
    user.roles.includes("auditor")
  );
}

/** Customers, vendors, invoices, bills and payments — everyone in FMS except an account that only holds the payroll-only role. */
export function canViewCommercialFinance(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canViewCommercialFinance", () => user.roles.some((r) => r !== "payroll_accountant" && (FMS_ROLES as readonly string[]).includes(r)));
}

/** Bank & cash reconciliation. */
export function canViewBanking(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canViewBanking", () => canReconcile(user) || canManageBanking(user) || user.roles.includes("auditor"));
}

/** Financial statements and the ledger (P&L, balance sheet, cash flow, trial balance, general ledger). */
export function canViewFinancialStatements(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canViewFinancialStatements", () => canViewReports(user) || user.roles.includes("accountant"));
}

/** Enter/match bank statement lines and record cash counts (§20/§21, FMS_RECONCILE). */
export function canReconcile(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canReconcile", () =>
    isFmsAdmin(user) || user.roles.includes("finance_manager") || user.roles.includes("accountant")
  );
}

/** Create/edit bank & cash accounts and record transfers (§19/§21, FMS_BANK). */
export function canManageBanking(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canManageBanking", () => isFmsAdmin(user) || user.roles.includes("finance_manager"));
}

/** Edit the tax-rate config (§25, Phase 7). */
export function canManageTaxConfig(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canManageTaxConfig", () => isFmsAdmin(user));
}

/** Define fiscal periods and close/reopen them — posts real closing journal entries (§39, Phase 7). */
export function canManageFiscalPeriods(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canManageFiscalPeriods", () => isFmsAdmin(user));
}

/** Tick off checklist items and keep the filing calendar (CA & Compliance). Viewing needs `canViewFinancialStatements`. */
export function canManageCompliance(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canManageCompliance", () =>
    isFmsAdmin(user) || user.roles.includes("finance_manager") || user.roles.includes("accountant")
  );
}

export function canManagePaymentLinks(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canManagePaymentLinks", () =>
    isFmsAdmin(user) ||
    user.roles.includes("finance_manager") ||
    user.roles.includes("accounts_receivable")
  );
}

export function canRefundPayments(user: RoleContext): boolean {
  return resolvePermission(user, "fms.canRefundPayments", () =>
    isFmsAdmin(user) || user.roles.includes("finance_manager")
  );
}

/**
 * Who may move a refund from one status to the next. DECIDING a request (approve it, or turn it down) belongs to the approver; RUNNING it
 * (processing, completed — which posts the money-out entry — or failing one already approved) belongs to whoever may refund payments.
 * Asking for a refund stays with `canManageTransactions`, so an accountant can raise one and a finance manager decides and pays it.
 */
export function canMoveRefund(user: RoleContext, from: string, to: string): boolean {
  const decision = from === "requested" && (to === "approved" || to === "failed");
  return decision ? canApproveTransactions(user) : canRefundPayments(user);
}

export function primaryFmsRoleLabel(roles: readonly FmsRole[]): string {
  if (roles.includes("super_admin")) return FMS_ROLE_META.super_admin.label;
  for (const r of FMS_ROLES) {
    if (r !== "super_admin" && roles.includes(r)) return FMS_ROLE_META[r].label;
  }
  return "No Access";
}
