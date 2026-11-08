"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { INDIAN_STATES } from "@/lib/products/talentos/payroll/rates";
import { HOLIDAY_TYPES } from "@/lib/products/talentos/holiday-types";
import { formatDate } from "@/lib/utils";
import { saveHolidayAction, deleteHolidayAction } from "@/app/(products)/talentos/(protected)/holidays/actions";

interface HolidayRow {
  _id: string;
  date: string;
  name: string;
  type: string;
  states?: string[];
}

const typeLabel = (v: string) => HOLIDAY_TYPES.find((t) => t.value === v)?.label ?? v;

export default function HolidayManager({
  holidays,
  years,
  activeYear,
  canManage,
}: {
  holidays: HolidayRow[];
  years: number[];
  activeYear: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HolidayRow | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<{ date: string; name: string; type: string; states: string[] }>({ date: "", name: "", type: "public", states: [] });

  const yearOptions = Array.from(new Set([activeYear, activeYear + 1, new Date().getUTCFullYear(), ...years])).sort((a, b) => b - a);

  function setYear(y: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", y);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function openCreate() {
    setEditing(null);
    setForm({ date: `${activeYear}-01-01`, name: "", type: "public", states: [] });
    setErrors({});
    setOpen(true);
  }
  function openEdit(h: HolidayRow) {
    setEditing(h);
    setForm({ date: h.date, name: h.name, type: h.type, states: h.states ?? [] });
    setErrors({});
    setOpen(true);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await saveHolidayAction(form, editing?._id);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Holiday saved");
      setOpen(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteHolidayAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete.");
        return;
      }
      toast.success("Holiday removed");
      router.refresh();
    });
  }

  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Year</Label>
          <Select value={String(activeYear)} onValueChange={(v) => v && setYear(v)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-3.5" data-icon="inline-start" />
            Add Holiday
          </Button>
        )}
      </div>

      <GlassCard interactive={false}>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Applies to</TableHead>
                {canManage && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No holidays for {activeYear}.</TableCell>
                </TableRow>
              )}
              {holidays.map((h) => (
                <TableRow key={h._id}>
                  <TableCell className="whitespace-nowrap font-medium">{formatDate(h.date)}</TableCell>
                  <TableCell>{h.name}</TableCell>
                  <TableCell>
                    <Badge className="bg-secondary/60 text-secondary-foreground">{typeLabel(h.type)}</Badge>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={(h.states ?? []).join(", ")}>
                    {h.states?.length ? h.states.join(", ") : "All states"}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(h)} aria-label={`Edit ${h.name}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${h.name}`} disabled={pending}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {h.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Removing a holiday changes how attendance and leave days are calculated for that date going forward.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(h._id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{editing ? "Edit" : "Add"} Holiday</SheetTitle>
            <SheetDescription>Holidays are excluded from attendance and leave day counts.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} aria-invalid={!!errors.date || undefined} />
              {err("date")}
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-invalid={!!errors.name || undefined} />
              {err("name")}
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => v && setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOLIDAY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("type")}
            </div>
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <p className="text-xs text-muted-foreground">Leave all unticked if every employee gets it. Tick states for a holiday only some states observe; it then counts for employees who work in those states.</p>
              <div className="max-h-48 overflow-y-auto rounded-md border p-2">
                {INDIAN_STATES.map((st) => (
                  <label key={st} className="flex items-center gap-2 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      checked={form.states.includes(st)}
                      onChange={(e) => setForm((f) => ({ ...f, states: e.target.checked ? [...f.states, st] : f.states.filter((x) => x !== st) }))}
                    />
                    {st}
                  </label>
                ))}
              </div>
              {err("states")}
            </div>
            <Button type="button" onClick={submit} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
