"use client";

import type { ReactNode } from "react";
import ResourceForm, { type FieldSpec } from "@/components/products/spendiq/ResourceForm";
import { INFRA_RESOURCE_TYPES, BILLING_CYCLES, RESOURCE_STATUSES, SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { saveInfrastructureAction } from "@/app/(products)/spendiq/(protected)/(staff)/infrastructure/actions";
import type { InfrastructureResource } from "@/lib/products/spendiq/infrastructure";

export default function InfrastructureForm({
  row,
  vendors,
  trigger,
}: {
  row?: InfrastructureResource;
  vendors: { _id: string; companyName: string }[];
  trigger: ReactNode;
}) {
  const fields: FieldSpec[] = [
    { name: "name", label: "Name", type: "text", required: true, full: true },
    { name: "provider", label: "Provider", type: "text", suggestions: ["AWS", "Azure", "GCP", "DigitalOcean", "Hetzner", "Cloudflare"] },
    { name: "resourceType", label: "Resource type", type: "select", options: INFRA_RESOURCE_TYPES.map((t) => ({ value: t, label: t })) },
    { name: "region", label: "Region", type: "text" },
    { name: "cost", label: "Cost", type: "number", min: 0 },
    { name: "billingCycle", label: "Billing cycle", type: "select", options: BILLING_CYCLES.map((b) => ({ value: b.value, label: b.label })) },
    { name: "currency", label: "Currency", type: "select", options: SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c })) },
    { name: "renewalDate", label: "Renewal date", type: "date" },
    { name: "vendorId", label: "Vendor", type: "select", options: [{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v._id, label: v.companyName }))] },
    { name: "status", label: "Status", type: "select", options: RESOURCE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { name: "autoRenew", label: "Auto-renew", type: "checkbox" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const initial: Record<string, string | boolean> = row
    ? {
        name: row.name,
        provider: row.provider,
        resourceType: row.resourceType,
        region: row.region ?? "",
        cost: String(row.cost),
        billingCycle: row.billingCycle,
        currency: row.currency,
        renewalDate: row.renewalDate ?? "",
        vendorId: row.vendorId ?? "",
        status: row.status,
        autoRenew: row.autoRenew,
        notes: row.notes ?? "",
      }
    : { billingCycle: "monthly", currency: "INR", status: "active", resourceType: "Cloud Server" };

  return (
    <ResourceForm
      title={row ? "Edit Resource" : "New Infrastructure Resource"}
      description="Server, hosting, domain, SSL or storage resource with a renewal date."
      fields={fields}
      initial={initial}
      editId={row?._id}
      action={saveInfrastructureAction}
      trigger={trigger}
    />
  );
}
