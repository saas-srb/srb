"use client";

import type { ReactNode } from "react";
import ResourceForm, { type FieldSpec } from "@/components/products/spendiq/ResourceForm";
import { ASSET_CATEGORIES, DEPRECIATION_METHODS, SUPPORTED_CURRENCIES } from "@/lib/products/spendiq/constants";
import { saveAssetAction } from "@/app/(products)/spendiq/(protected)/(staff)/assets/actions";
import type { SerializedAsset } from "@/lib/products/spendiq/assets";

export default function AssetForm({
  asset,
  vendors,
  trigger,
}: {
  asset?: SerializedAsset;
  vendors: { _id: string; companyName: string }[];
  trigger: ReactNode;
}) {
  const fields: FieldSpec[] = [
    { name: "name", label: "Asset name", type: "text", required: true, full: true },
    { name: "category", label: "Category", type: "select", required: true, options: ASSET_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { name: "serialNumber", label: "Serial number", type: "text" },
    { name: "brand", label: "Brand", type: "text" },
    { name: "model", label: "Model", type: "text" },
    { name: "purchaseDate", label: "Purchase date", type: "date", required: true },
    { name: "purchaseCost", label: "Purchase cost", type: "number", min: 0, required: true },
    { name: "currency", label: "Currency", type: "select", options: SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c })) },
    { name: "vendorId", label: "Vendor", type: "select", options: [{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v._id, label: v.companyName }))] },
    { name: "warrantyExpiry", label: "Warranty expiry", type: "date" },
    { name: "officeLocation", label: "Office location", type: "text" },
    { name: "depreciationMethod", label: "Depreciation method", type: "select", options: DEPRECIATION_METHODS.map((m) => ({ value: m.value, label: m.label })) },
    { name: "usefulLifeYears", label: "Useful life (years)", type: "number", min: 1 },
    { name: "salvageValue", label: "Salvage value", type: "number", min: 0 },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const initial: Record<string, string> = asset
    ? {
        name: asset.name,
        category: asset.category,
        serialNumber: asset.serialNumber ?? "",
        brand: asset.brand ?? "",
        model: asset.model ?? "",
        purchaseDate: asset.purchaseDate,
        purchaseCost: String(asset.purchaseCost),
        currency: asset.currency,
        vendorId: asset.vendorId ?? "",
        warrantyExpiry: asset.warrantyExpiry ?? "",
        officeLocation: asset.officeLocation ?? "",
        depreciationMethod: asset.depreciationMethod,
        usefulLifeYears: String(asset.usefulLifeYears),
        salvageValue: String(asset.salvageValue),
        notes: asset.notes ?? "",
      }
    : { category: "Laptop", currency: "INR", depreciationMethod: "slm", usefulLifeYears: "5", salvageValue: "0", purchaseDate: new Date().toISOString().slice(0, 10) };

  return (
    <ResourceForm
      title={asset ? "Edit Asset" : "New Asset"}
      description="Physical company asset with purchase details and depreciation."
      fields={fields}
      initial={initial}
      editId={asset?._id}
      action={saveAssetAction}
      trigger={trigger}
    />
  );
}
