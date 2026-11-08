"use client";

import type { ReactNode } from "react";
import ResourceForm, { type FieldSpec } from "@/components/products/spendiq/ResourceForm";
import { BILLING_CYCLES, RESOURCE_STATUSES, SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { saveSubscriptionAction } from "@/app/(products)/spendiq/(protected)/(staff)/subscriptions/actions";
import type { SoftwareSubscription } from "@/lib/products/spendiq/software-subscriptions";

export default function SubscriptionForm({
  row,
  vendors,
  employees,
  trigger,
}: {
  row?: SoftwareSubscription;
  vendors: { _id: string; companyName: string }[];
  employees: { _id: string; name: string }[];
  trigger: ReactNode;
}) {
  const fields: FieldSpec[] = [
    { name: "serviceName", label: "Service name", type: "text", required: true, full: true, suggestions: ["OpenAI", "ElevenLabs", "Figma", "GitHub", "Google Workspace", "Slack", "Notion", "Vercel", "AWS", "Azure"] },
    { name: "provider", label: "Provider", type: "text" },
    { name: "licenseCount", label: "License count", type: "number", min: 1 },
    { name: "cost", label: "Cost", type: "number", min: 0 },
    { name: "billingCycle", label: "Billing cycle", type: "select", options: BILLING_CYCLES.map((b) => ({ value: b.value, label: b.label })) },
    { name: "currency", label: "Currency", type: "select", options: SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c })) },
    { name: "renewalDate", label: "Renewal date", type: "date" },
    { name: "ownerEmployeeId", label: "Owner", type: "select", options: [{ value: "", label: "None" }, ...employees.map((e) => ({ value: e._id, label: e.name }))] },
    { name: "vendorId", label: "Vendor", type: "select", options: [{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v._id, label: v.companyName }))] },
    { name: "status", label: "Status", type: "select", options: RESOURCE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { name: "autoRenew", label: "Auto-renew", type: "checkbox" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const initial: Record<string, string | boolean> = row
    ? {
        serviceName: row.serviceName,
        provider: row.provider,
        licenseCount: String(row.licenseCount),
        cost: String(row.cost),
        billingCycle: row.billingCycle,
        currency: row.currency,
        renewalDate: row.renewalDate ?? "",
        ownerEmployeeId: row.ownerEmployeeId ?? "",
        ownerName: row.ownerName ?? "",
        vendorId: row.vendorId ?? "",
        status: row.status,
        autoRenew: row.autoRenew,
        notes: row.notes ?? "",
      }
    : { billingCycle: "monthly", currency: "INR", status: "active", licenseCount: "1" };

  // Resolve owner name from the picker at submit time.
  const action = async (input: Record<string, unknown>, id?: string) => {
    const ownerName = employees.find((e) => e._id === input.ownerEmployeeId)?.name ?? "";
    return saveSubscriptionAction({ ...input, ownerName }, id);
  };

  return (
    <ResourceForm
      title={row ? "Edit Subscription" : "New Subscription"}
      description="SaaS subscription with license count, billing cycle and renewal date."
      fields={fields}
      initial={initial}
      editId={row?._id}
      action={action}
      trigger={trigger}
    />
  );
}
