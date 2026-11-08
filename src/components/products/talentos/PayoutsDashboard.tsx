"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Send, CheckCheck, Download, ChevronLeft, ChevronRight, Search, Clock, Loader, CircleCheck, CircleX, Ban, Banknote } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import PayoutStatusBadge from "@/components/products/talentos/PayoutStatusBadge";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import PayoutRowActions from "@/components/products/talentos/PayoutRowActions";
import { PAYOUT_STATUSES } from "@/lib/products/talentos/payout-status";

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="size-4" />,
  initiated: <Send className="size-4" />,
  processing: <Loader className="size-4" />,
  paid: <CircleCheck className="size-4" />,
  failed: <CircleX className="size-4" />,
  cancelled: <Ban className="size-4" />,
};
import { monthLabelLong } from "@/lib/products/talentos/payroll-status";
import { formatCurrency } from "@/lib/utils";
import { bulkInitiatePayoutsAction, reconcilePayoutsAction } from "@/app/(products)/talentos/(protected)/(staff)/payroll/actions";

interface Payout {
  _id: string;
  runId: string;
  month: string;
  employeeName: string;
  employeeCode: string;
  netPayable: number;
  paymentAmount: number;
  bankAccountMasked: string;
  bankName: string | null;
  status: string;
  paymentProvider: "manual" | "razorpay";
  utr: string | null;
  failureReason: string | null;
  reconciledAt: string | null;
}

export default function PayoutsDashboard({
  items,
  total,
  page,
  totalPages,
  byStatus,
  months,
  departments,
  filters,
}: {
  items: Payout[];
  total: number;
  page: number;
  totalPages: number;
  byStatus: Record<string, { count: number; amount: number }>;
  months: string[];
  departments: { _id: string; name: string }[];
  filters: { month: string; status: string; department: string; q: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startNav] = useTransition();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(filters.q);

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    startNav(() => router.replace(`${pathname}?${params.toString()}`));
  }

  function pageHref(target: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(target));
    return `${pathname}?${params.toString()}`;
  }

  const [code, setCode] = useState("");
  const initiable = items.filter((p) => p.status === "pending");
  const reconcilable = items.filter((p) => p.status === "paid" && !p.reconciledAt);

  function bulkInitiate() {
    const ids = Array.from(selected).filter((id) => initiable.some((p) => p._id === id));
    if (ids.length === 0) return;
    startTransition(async () => {
      const r = await bulkInitiatePayoutsAction(ids, code);
      toast[r.error ? "warning" : "success"](`${r.initiated ?? 0} initiated${r.error ? ` · ${r.error}` : ""}`);
      setSelected(new Set());
      setCode("");
      router.refresh();
    });
  }
  function bulkReconcile() {
    const ids = Array.from(selected).filter((id) => reconcilable.some((p) => p._id === id));
    if (ids.length === 0) return;
    startTransition(async () => {
      const r = await reconcilePayoutsAction(ids);
      toast.success(`${r.reconciled ?? 0} reconciled`);
      setSelected(new Set());
      router.refresh();
    });
  }

  const reportHref = `/api/talentos/payroll/payouts/report?${new URLSearchParams(
    Object.fromEntries(Object.entries({ month: filters.month, status: filters.status, department: filters.department, q: filters.q }).filter(([, v]) => v))
  ).toString()}`;

  return (
    <div className="space-y-4">
      <KpiGrid cols={6}>
        {PAYOUT_STATUSES.map((s) => (
          <KpiCard
            key={s.value}
            label={s.label}
            value={byStatus[s.value]?.count ?? 0}
            accent={s.value === "paid"}
            icon={STATUS_ICON[s.value]}
          />
        ))}
      </KpiGrid>

      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Banknote className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Search &amp; Filters</h3>
              <p className="text-xs text-muted-foreground">Narrow down payouts by month, status, department, or search</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Month</label>
            <Select value={filters.month || "all"} onValueChange={(v) => setParam("month", !v || v === "all" ? undefined : (v as string))}>
              <SelectTrigger className="h-9 w-40 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{monthLabelLong(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={filters.status || "all"} onValueChange={(v) => setParam("status", !v || v === "all" ? undefined : (v as string))}>
              <SelectTrigger className="h-9 w-36 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PAYOUT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Department</label>
            <Select value={filters.department || "all"} onValueChange={(v) => setParam("department", !v || v === "all" ? undefined : (v as string))}>
              <SelectTrigger className="h-9 w-44 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setParam("q", q || undefined);
              }}
              className="relative"
            >
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, code, UTR" className="h-9 w-48 rounded-xl border-border/50 bg-background pl-8 focus-visible:border-primary focus-visible:ring-primary/40" />
            </form>
          </div>
          <a href={reportHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" />
            Report
          </a>
        </div>
      </div>

      {selected.size > 0 && (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button type="button" size="sm" disabled={pending} onClick={bulkInitiate}>
              <Send className="size-3.5" data-icon="inline-start" />
              Initiate
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={bulkReconcile}>
              <CheckCheck className="size-3.5" data-icon="inline-start" />
              Reconcile
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardContent className="max-h-[60vh] overflow-auto">
          {initiable.length > 0 && <div className="mb-3 max-w-md"><PaymentCodeField value={code} onChange={setCode} /></div>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Employee</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>UTR</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">No payouts match these filters.</TableCell>
                </TableRow>
              )}
              {items.map((p) => (
                <TableRow key={p._id}>
                  <TableCell>
                    {(p.status === "pending" || (p.status === "paid" && !p.reconciledAt)) && (
                      <Checkbox
                        checked={selected.has(p._id)}
                        onCheckedChange={() =>
                          setSelected((prev) => {
                            const n = new Set(prev);
                            if (n.has(p._id)) n.delete(p._id);
                            else n.add(p._id);
                            return n;
                          })
                        }
                        aria-label={`Select ${p.employeeName}`}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{p.employeeName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.employeeCode}</div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/talentos/payroll/${p.month}`} className="text-muted-foreground hover:underline">{p.month}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="font-mono text-xs">{p.bankAccountMasked}</div>
                    <div className="text-[11px]">{p.bankName ?? "—"}</div>
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">{formatCurrency(p.paymentAmount)}</TableCell>
                  <TableCell>
                    <PayoutStatusBadge status={p.status} />
                    {p.reconciledAt && <div className="text-[11px] text-muted-foreground">reconciled</div>}
                    {p.status === "failed" && p.failureReason && (
                      <div className="mt-0.5 max-w-40 truncate text-[11px] text-destructive">{p.failureReason}</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.utr ?? "—"}</TableCell>
                  <TableCell>
                    <PayoutRowActions payout={{ _id: p._id, status: p.status, employeeName: p.employeeName, provider: p.paymentProvider }} code={code} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages} · {total} total</span>
          <div className="flex gap-2">
            <Link href={pageHref(Math.max(page - 1, 1))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined}>
              <ChevronLeft className="size-3.5" data-icon="inline-start" />
              Previous
            </Link>
            <Link href={pageHref(Math.min(page + 1, totalPages))} className={buttonVariants({ variant: "outline", size: "sm" })} aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined}>
              Next
              <ChevronRight className="size-3.5" data-icon="inline-end" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
