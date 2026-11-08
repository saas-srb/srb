"use client";

import type { ReactNode } from "react";
import ResourceForm, { type FieldSpec } from "@/components/products/spendiq/ResourceForm";
import { CONTRACT_TYPES, RESOURCE_STATUSES, SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { saveContractAction } from "@/app/(products)/spendiq/(protected)/(staff)/contracts/actions";
import type { Contract } from "@/lib/products/spendiq/contracts";

export default function ContractForm({
  row,
  vendors,
  trigger,
}: {
  row?: Contract;
  vendors: { _id: string; companyName: string }[];
  trigger: ReactNode;
}) {
  const fields: FieldSpec[] = [
    { name: "title", label: "Contract title", type: "text", required: true, full: true },
    { name: "contractType", label: "Type", type: "select", options: CONTRACT_TYPES.map((t) => ({ value: t, label: t })) },
    { name: "vendorId", label: "Vendor", type: "select", options: [{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v._id, label: v.companyName }))] },
    { name: "startDate", label: "Start date", type: "date", required: true },
    { name: "endDate", label: "End date", type: "date", required: true },
    { name: "renewalDate", label: "Renewal reminder date", type: "date" },
    { name: "value", label: "Contract value", type: "number", min: 0 },
    { name: "currency", label: "Currency", type: "select", options: SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c })) },
    { name: "status", label: "Status", type: "select", options: RESOURCE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { name: "autoRenew", label: "Auto-renew", type: "checkbox" },
    { name: "slaSummary", label: "SLA summary", type: "textarea" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const initial: Record<string, string | boolean> = row
    ? {
        title: row.title,
        contractType: row.contractType,
        vendorId: row.vendorId ?? "",
        startDate: row.startDate,
        endDate: row.endDate,
        renewalDate: row.renewalDate ?? "",
        value: String(row.value),
        currency: row.currency,
        status: row.status,
        autoRenew: row.autoRenew,
        slaSummary: row.slaSummary ?? "",
        notes: row.notes ?? "",
      }
    : { contractType: "AMC", currency: "INR", status: "active", startDate: new Date().toISOString().slice(0, 10) };

  return (
    <ResourceForm
      title={row ? "Edit Contract" : "New Contract"}
      description="Maintenance / service contract with dates, SLA and renewal reminder."
      fields={fields}
      initial={initial}
      editId={row?._id}
      action={saveContractAction}
      trigger={trigger}
    />
  );
}
