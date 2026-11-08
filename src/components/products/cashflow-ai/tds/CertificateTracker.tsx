"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearCertificateAction, recordCertificateAction } from "@/app/(products)/cashflow-ai/(protected)/tds/certificates/actions";

export interface TrackerRow {
  vendorId: string;
  vendorName: string;
  pan: string | null;
  section: string;
  billCount: number;
  deducted: number;
  certificate: { issuedOn: string; certificateNumber: string; note: string | null } | null;
}

const inr = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const th = "px-2 py-1.5 text-left font-medium whitespace-nowrap";
const td = "px-2 py-1.5 align-top";

function Row({ r, fy, quarter, canManage, today }: { r: TrackerRow; fy: string; quarter: number; canManage: boolean; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issuedOn, setIssuedOn] = useState(today);
  const [number, setNumber] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const key = { vendorId: r.vendorId, section: r.section, fy, quarter };

  function save() {
    start(async () => {
      try {
        const res = await recordCertificateAction({ ...key, issuedOn, certificateNumber: number, note: note.trim() || null });
        if (res.ok) {
          setOpen(false);
          toast.success("Certificate marked as issued.");
          router.refresh();
        } else toast.error(res.error);
      } catch {
        toast.error("Could not save. Please try again.");
      }
    });
  }
  function clear() {
    if (!window.confirm(`Remove the "issued" mark for ${r.vendorName}, section ${r.section}?`)) return;
    start(async () => {
      try {
        const res = await clearCertificateAction(key);
        if (res.ok) router.refresh();
        else toast.error(res.error);
      } catch {
        toast.error("Could not clear. Please try again.");
      }
    });
  }

  return (
    <>
      <tr className="border-b border-border/30">
        <td className={td}>{r.vendorName}</td>
        <td className={`${td} font-mono text-xs`}>{r.pan ?? "—"}</td>
        <td className={td}>{r.section}</td>
        <td className={`${td} text-right tabular-nums`}>{inr(r.deducted)}</td>
        <td className={td}>
          {r.certificate ? (
            <span>
              Issued {dmy(r.certificate.issuedOn)}, no. <span className="font-mono text-xs">{r.certificate.certificateNumber}</span>
              {r.certificate.note ? <span className="block text-xs text-muted-foreground">{r.certificate.note}</span> : null}
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">Not issued yet</span>
          )}
        </td>
        <td className={`${td} text-right`}>
          {canManage &&
            (r.certificate ? (
              <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={pending}>Clear</Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>Mark as issued</Button>
            ))}
        </td>
      </tr>
      {open && !r.certificate && (
        <tr className="border-b border-border/30 bg-muted/30">
          <td colSpan={6} className="px-2 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-muted-foreground">Date issued<Input type="date" value={issuedOn} max={today} onChange={(e) => setIssuedOn(e.target.value)} className="mt-1 w-44" /></label>
              <label className="text-xs text-muted-foreground">Certificate number<Input value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} className="mt-1 w-52" /></label>
              <label className="text-xs text-muted-foreground">Note (optional)<Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="mt-1 w-64" /></label>
              <Button type="button" onClick={save} disabled={pending}>Save</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function CertificateTracker({ rows, fy, quarter, canManage, today }: { rows: TrackerRow[]; fy: string; quarter: number; canManage: boolean; today: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No tax was deducted in this quarter, so there are no certificates to track.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border/60 text-xs text-muted-foreground">
          <tr>
            <th className={th}>Vendor</th>
            <th className={th}>PAN</th>
            <th className={th}>Section</th>
            <th className={`${th} text-right`}>Tax deducted</th>
            <th className={th}>Certificate</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>{rows.map((r) => <Row key={`${r.vendorId}|${r.section}`} r={r} fy={fy} quarter={quarter} canManage={canManage} today={today} />)}</tbody>
      </table>
    </div>
  );
}
