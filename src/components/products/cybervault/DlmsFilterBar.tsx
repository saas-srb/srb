"use client";

import PanelFilterBar, { type PanelFilterField } from "@/components/platform/panel/PanelFilterBar";

export type FilterField = PanelFilterField | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; allLabel?: string; required?: boolean };

/**
 * The URL-driven filter bar, now the same Search & Filters card every product uses (`PanelFilterBar`). `values` is kept for
 * existing callers; the card reads the current values from the URL itself.
 */
export default function DlmsFilterBar({ fields }: { fields: FilterField[]; values?: Record<string, string> }) {
  return <PanelFilterBar fields={fields as PanelFilterField[]} />;
}
