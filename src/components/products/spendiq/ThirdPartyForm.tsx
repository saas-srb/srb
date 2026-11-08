"use client";

import type { ReactNode } from "react";
import ResourceForm, { type FieldSpec } from "@/components/products/spendiq/ResourceForm";
import { BILLING_CYCLES, RESOURCE_STATUSES, SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { saveThirdPartyAction } from "@/app/(products)/spendiq/(protected)/(staff)/third-party/actions";
import type { ThirdPartyService } from "@/lib/products/spendiq/third-party-services";

export default function ThirdPartyForm({
  row,
  vendors,
  trigger,
}: {
  row?: ThirdPartyService;
  vendors: { _id: string; companyName: string }[];
  trigger: ReactNode;
}) {
  const fields: FieldSpec[] = [
    { name: "name", label: "Service name", type: "text", required: true, full: true },
    { name: "serviceType", label: "Service type", type: "text", suggestions: ["Security", "Internet Provider", "Recruitment", "Marketing Agency", "Legal", "CA", "AMC"] },
    { name: "provider", label: "Provider", type: "text" },
    { name: "cost", label: "Cost", type: "number", min: 0 },
    { name: "billingCycle", label: "Billing cycle", type: "select", options: BILLING_CYCLES.map((b) => ({ value: b.value, label: b.label })) },
    { name: "currency", label: "Currency", type: "select", options: SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c })) },
    { name: "renewalDate", label: "Renewal date", type: "date" },
    { name: "vendorId", label: "Vendor", type: "select", options: [{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v._id, label: v.companyName }))] },
    { name: "status", label: "Status", type: "select", options: RESOURCE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { name: "autoRenew", label: "Auto-renew", type: "checkbox" },
    { name: "slaSummary", label: "SLA summary", type: "textarea" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const initial: Record<string, string | boolean> = row
    ? {
        name: row.name,
        serviceType: row.serviceType,
        provider: row.provider,
        cost: String(row.cost),
        billingCycle: row.billingCycle,
        currency: row.currency,
        renewalDate: row.renewalDate ?? "",
        vendorId: row.vendorId ?? "",
        status: row.status,
        autoRenew: row.autoRenew,
        slaSummary: row.slaSummary ?? "",
        notes: row.notes ?? "",
      }
    : { billingCycle: "monthly", currency: "INR", status: "active" };

  return (
    <ResourceForm
      title={row ? "Edit Service" : "New Third-Party Service"}
      description="Outsourced service with SLA summary and renewal date."
      fields={fields}
      initial={initial}
      editId={row?._id}
      action={saveThirdPartyAction}
      trigger={trigger}
    />
  );
}
