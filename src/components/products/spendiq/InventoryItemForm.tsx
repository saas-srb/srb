"use client";

import type { ReactNode } from "react";
import ResourceForm, { type FieldSpec } from "@/components/products/spendiq/ResourceForm";
import { UNITS_OF_MEASURE } from "@/lib/products/spendiq/constants";
import { saveInventoryItemAction } from "@/app/(products)/spendiq/(protected)/(staff)/inventory/actions";
import type { SerializedInventoryItem } from "@/lib/products/spendiq/inventory";

export default function InventoryItemForm({
  item,
  vendors,
  trigger,
}: {
  item?: SerializedInventoryItem;
  vendors: { _id: string; companyName: string }[];
  trigger: ReactNode;
}) {
  const fields: FieldSpec[] = [
    { name: "name", label: "Item name", type: "text", required: true, full: true },
    { name: "category", label: "Category", type: "text", suggestions: ["Stationery", "IT Peripherals", "Cables", "Pantry", "Cleaning"] },
    { name: "uom", label: "Unit", type: "select", options: UNITS_OF_MEASURE.map((u) => ({ value: u, label: u })) },
    { name: "unitCost", label: "Unit cost", type: "number", min: 0 },
    { name: "minStock", label: "Minimum stock", type: "number", min: 0 },
    { name: "vendorId", label: "Preferred vendor", type: "select", options: [{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v._id, label: v.companyName }))] },
    { name: "location", label: "Storage location", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const initial: Record<string, string> = item
    ? {
        name: item.name,
        category: item.category ?? "",
        uom: item.uom,
        unitCost: String(item.unitCost),
        minStock: String(item.minStock),
        vendorId: item.vendorId ?? "",
        location: item.location ?? "",
        notes: item.notes ?? "",
      }
    : { uom: "pcs", unitCost: "0", minStock: "0" };

  return (
    <ResourceForm
      title={item ? "Edit Item" : "New Inventory Item"}
      description="Consumable stock item. Stock levels change via stock-in / stock-out transactions."
      fields={fields}
      initial={initial}
      editId={item?._id}
      action={saveInventoryItemAction}
      trigger={trigger}
    />
  );
}
