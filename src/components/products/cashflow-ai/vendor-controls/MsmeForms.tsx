"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveMsmeAction, saveMsmeDaysAction } from "@/app/(products)/cashflow-ai/(protected)/vendor-controls/actions";

const field = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

export function MsmeDaysForm({ current, canEdit }: { current: number | null; canEdit: boolean }) {
  const [days, setDays] = useState(current === null ? "" : String(current));
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await saveMsmeDaysAction(days);
            if (r.ok) toast.success(days.trim() === "" ? "Cleared: shown as not confirmed" : "Saved");
            else toast.error(r.error);
          } catch {
            toast.error("Could not save. Please try again.");
          }
        });
      }}
    >
      <label className="text-xs text-muted-foreground">Days to pay an MSME vendor, from the bill date
        <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} disabled={!canEdit} placeholder="Not confirmed" className={`${field} mt-1 block w-40`} />
      </label>
      {canEdit && <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>}
      <span className="max-w-md text-xs text-muted-foreground">Enter what your CA confirms for your company (the agreed days, or the days the law allows). Until you do, no bill is judged late.</span>
    </form>
  );
}

export function MsmeVendorForm({ vendors }: { vendors: { id: string; name: string; category?: string; udyam?: string | null }[] }) {
  const [vendorId, setVendorId] = useState("");
  const [category, setCategory] = useState("micro");
  const [udyam, setUdyam] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await saveMsmeAction(vendorId, category, udyam);
            if (r.ok) toast.success("MSME status saved");
            else toast.error(r.error);
          } catch {
            toast.error("Could not save. Please try again.");
          }
        });
      }}
    >
      <label className="text-xs text-muted-foreground">Vendor
        <select required value={vendorId} onChange={(e) => {
          setVendorId(e.target.value);
          const v = vendors.find((x) => x.id === e.target.value);
          if (v?.category) setCategory(v.category);
          setUdyam(v?.udyam ?? "");
        }} className={`${field} mt-1 block max-w-64`}>
          <option value="" disabled>Choose…</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">Size
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} mt-1 block`}>
          <option value="micro">Micro enterprise</option>
          <option value="small">Small enterprise</option>
          <option value="medium">Medium enterprise</option>
          <option value="none">Not an MSME</option>
        </select>
      </label>
      {category !== "none" && (
        <label className="text-xs text-muted-foreground">Udyam registration number
          <input value={udyam} onChange={(e) => setUdyam(e.target.value)} placeholder="UDYAM-MH-01-1234567" maxLength={40} className={`${field} mt-1 block w-52`} />
        </label>
      )}
      <Button type="submit" size="sm" disabled={pending || !vendorId}>{pending ? "Saving…" : "Save"}</Button>
    </form>
  );
}
