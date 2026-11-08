"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { saveSectionAction, removeSectionAction, clearSectionOverrideAction } from "@/app/(products)/cashflow-ai/(protected)/tds/settings/actions";

export interface SectionRow {
  code: string;
  label: string;
  rate: number | null;
  singleThreshold: number | null;
  annualThreshold: number | null;
  noPanRate: number | null;
  confirmed: boolean;
  active: boolean;
  note: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  /** The section is also in the platform's rulebook, so these figures replace the platform's. */
  overridesLaw?: boolean;
}

const inr = new Intl.NumberFormat("en-IN");
const money = (v: number | null) => (v === null ? "Not entered" : `₹${inr.format(v)}`);
const pct = (v: number | null) => (v === null ? "Not entered" : `${v}%`);
const str = (v: number | null) => (v === null ? "" : String(v));

const blank = { code: "", label: "", rate: "", singleThreshold: "", annualThreshold: "", noPanRate: "", confirmed: false, active: true, override: true, note: "" };

export default function SectionsManager({ rows, catalog, canChange }: { rows: SectionRow[]; catalog: { code: string; name: string; covers: string }[]; canChange: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openNew() {
    setEditing(null);
    setForm(blank);
    setErrors({});
    setOpen(true);
  }
  function openEdit(r: SectionRow) {
    setEditing(r.code);
    setForm({ code: r.code, label: r.label, rate: str(r.rate), singleThreshold: str(r.singleThreshold), annualThreshold: str(r.annualThreshold), noPanRate: str(r.noPanRate), confirmed: r.confirmed, active: r.active, override: true, note: r.note ?? "" });
    setErrors({});
    setOpen(true);
  }
  // Fills only the code and name: the numbers always come from the CA.
  function pick(code: string | null) {
    const c = catalog.find((x) => x.code === code);
    if (!c) return;
    setForm((f) => ({ ...f, code: c.code === "OTHER" ? "" : c.code, label: c.code === "OTHER" ? "" : c.name }));
  }

  function save() {
    setErrors({});
    startTransition(async () => {
      const res = await saveSectionAction(form);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
        return;
      }
      toast.success("Section saved");
      setOpen(false);
      router.refresh();
    });
  }
  function remove(code: string) {
    if (!window.confirm(`Remove section ${code}? Bills that already use it stop you from doing this.`)) return;
    startTransition(async () => {
      const res = await removeSectionAction(code);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Section removed");
      router.refresh();
    });
  }

  function platformFigures(code: string) {
    if (!window.confirm(`Go back to the platform's figures for ${code}? Your own figures for it are no longer used.`)) return;
    startTransition(async () => {
      const res = await clearSectionOverrideAction(code);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("The platform's figures apply again");
      router.refresh();
    });
  }

  const picked = catalog.find((c) => c.code === form.code);
  const field = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <>
      <GlassCard interactive={false}>
        <div className="flex items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">{rows.length === 0 ? "You have not set any figures of your own." : `${rows.length} section${rows.length === 1 ? "" : "s"} with your own figures.`}</p>
          {canChange ? (
            <Button type="button" size="sm" onClick={openNew}><Plus className="size-3.5" data-icon="inline-start" />Add section</Button>
          ) : (
            <p className="text-xs text-muted-foreground">You can view these settings; changing them needs the compliance permission.</p>
          )}
        </div>
        {rows.length > 0 && (
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Section</th>
                  <th className="py-2 pr-3 font-medium">Rate</th>
                  <th className="py-2 pr-3 font-medium">Single-payment limit</th>
                  <th className="py-2 pr-3 font-medium">Yearly limit</th>
                  <th className="py-2 pr-3 font-medium">Rate without PAN</th>
                  <th className="py-2 pr-3 font-medium">Checked by your CA</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  {canChange && <th className="py-2" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b border-border/40 align-top">
                    <td className="py-2 pr-3"><div className="font-medium">{r.code}{r.overridesLaw && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(replaces the platform&apos;s figures)</span>}</div><div className="text-xs text-muted-foreground">{r.label}</div></td>
                    <td className="py-2 pr-3 tabular-nums">{pct(r.rate)}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(r.singleThreshold)}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(r.annualThreshold)}</td>
                    <td className="py-2 pr-3 tabular-nums">{pct(r.noPanRate)}</td>
                    <td className="py-2 pr-3">
                      {r.confirmed ? (
                        <div><Badge>Confirmed</Badge><div className="mt-1 text-xs text-muted-foreground">{[r.confirmedBy, r.confirmedAt?.split("-").reverse().join("-")].filter(Boolean).join(" on ")}</div></div>
                      ) : (
                        <Badge variant="outline">Not confirmed</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3">{r.active ? "In use" : <span className="text-muted-foreground">Switched off</span>}</td>
                    {canChange && (
                      <td className="py-2 text-right whitespace-nowrap">
                        {r.overridesLaw && <Button type="button" size="sm" variant="outline" onClick={() => platformFigures(r.code)} disabled={pending}>Use platform figures</Button>}
                        <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(r)} aria-label={`Edit ${r.code}`}><Pencil className="size-3.5" /></Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => remove(r.code)} disabled={pending} aria-label={`Remove ${r.code}`}><Trash2 className="size-3.5" /></Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{editing ? `Edit section ${editing}` : "Add a TDS section"}</SheetTitle>
            <SheetDescription>Enter the numbers your CA gave you. Leave a box empty if your CA has not given it; it is then treated as not entered, not as zero.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!editing && (
              <div className="space-y-1.5">
                <Label>Pick from the list (optional)</Label>
                <Select value="" onValueChange={pick}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Choose a common section" /></SelectTrigger>
                  <SelectContent>
                    {catalog.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}: {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{picked ? picked.covers : "This fills only the code and the name. The rate and limits always come from your CA."}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Section code *</Label>
                <Input value={form.code} onChange={(e) => set("code", e.target.value)} disabled={!!editing} placeholder="194J" />
                {field("code")}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Professional or technical fees" />
                {field("label")}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rate (%)</Label>
                <Input inputMode="decimal" value={form.rate} onChange={(e) => set("rate", e.target.value)} />
                {field("rate")}
              </div>
              <div className="space-y-1.5">
                <Label>Rate if vendor has no PAN (%)</Label>
                <Input inputMode="decimal" value={form.noPanRate} onChange={(e) => set("noPanRate", e.target.value)} />
                {field("noPanRate")}
              </div>
              <div className="space-y-1.5">
                <Label>Single-payment limit (₹)</Label>
                <Input inputMode="decimal" value={form.singleThreshold} onChange={(e) => set("singleThreshold", e.target.value)} />
                <p className="text-xs text-muted-foreground">Deduct only when one bill is above this.</p>
                {field("singleThreshold")}
              </div>
              <div className="space-y-1.5">
                <Label>Yearly limit (₹)</Label>
                <Input inputMode="decimal" value={form.annualThreshold} onChange={(e) => set("annualThreshold", e.target.value)} />
                <p className="text-xs text-muted-foreground">Deduct once the year&apos;s total to one vendor is above this.</p>
                {field("annualThreshold")}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note for your CA file (optional)</Label>
              <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Who agreed these numbers, and on what basis" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={form.confirmed} onCheckedChange={(v) => set("confirmed", v === true)} className="mt-0.5" />
              <span>Confirmed by my CA<span className="block text-xs text-muted-foreground">Until ticked, every check built on these numbers is marked indicative.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={form.active} onCheckedChange={(v) => set("active", v === true)} className="mt-0.5" />
              <span>In use<span className="block text-xs text-muted-foreground">Untick to stop offering this section on new bills without losing it.</span></span>
            </label>
            <Button type="button" onClick={save} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save section"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
