"use client";

import Link from "next/link";
import { ChevronRight, TicketPercent } from "lucide-react";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { describeCouponDiscount, describeCouponDuration, type Coupon, type CouponStatus } from "@/lib/platform/billing/catalog-types";

export type CouponRow = Coupon & { status: CouponStatus; planNames: string };

export function CouponStatusBadge({ status }: { status: CouponStatus }) {
  if (status === "active") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Active</Badge>;
  if (status === "scheduled") return <Badge variant="outline">Scheduled</Badge>;
  if (status === "expired") return <Badge variant="secondary">Expired</Badge>;
  if (status === "used_up") return <Badge variant="secondary">Limit reached</Badge>;
  return <Badge variant="destructive">Inactive</Badge>;
}

export default function CouponsGrid({ rows, currency }: { rows: CouponRow[]; currency: string }) {
  const columns: AdminDataGridColumn<CouponRow>[] = [
    {
      key: "code",
      label: "Code",
      render: (row) => (
        <Link href={`/console/coupons/${row._id}`} className="block hover:underline">
          <span className="font-mono font-medium text-foreground">{row.code}</span>
          {row.description && <span className="block max-w-56 truncate text-xs">{row.description}</span>}
        </Link>
      ),
    },
    { key: "discount", label: "Discount", render: (row) => describeCouponDiscount(row, currency) },
    {
      key: "applies",
      label: "Applies to",
      render: (row) => (
        <span className="text-xs">
          {row.planNames} · {row.intervals.join(", ")}
          {row.firstTimeOnly && <span className="block">First-time only</span>}
        </span>
      ),
    },
    { key: "duration", label: "Duration", render: (row) => describeCouponDuration(row) },
    {
      key: "validity",
      label: "Valid",
      render: (row) => (
        <span className="text-xs">
          {row.validFrom ? formatDate(row.validFrom) : "Now"} → {row.validUntil ? formatDate(row.validUntil) : "No end"}
        </span>
      ),
    },
    {
      key: "redemptions",
      label: "Redemptions",
      cellClassName: "tabular-nums",
      render: (row) => (
        <span data-testid={`redemptions-${row.code}`}>
          {row.redeemedCount} / {row.maxRedemptions ?? "∞"}
        </span>
      ),
    },
    { key: "status", label: "Status", render: (row) => <CouponStatusBadge status={row.status} /> },
  ];

  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={rows.length}
      page={1}
      totalPages={1}
      emptyLabel="No coupons yet."
      filterTitle="Coupons"
      filterSubtitle={`${rows.length} coupon${rows.length === 1 ? "" : "s"}`}
      filterIcon={TicketPercent}
      rowActions={(row) => (
        <Link href={`/console/coupons/${row._id}`} aria-label={`Open ${row.code}`} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-4" />
        </Link>
      )}
    />
  );
}
