import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchCoupons } from "@/lib/offers/coupons";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coupons · Festival Offers" };

export default async function CouponsPage() {
  const { items } = await searchCoupons({ pageSize: 100 });

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Festival Offers", href: "/sitecraft-ai/offers" }, { label: "Coupons" }]}
        title={<>Coupons</>}
        actions={<><Link href="/sitecraft-ai/offers/coupons/new" className={buttonVariants({ size: "sm" })}>
          New coupon
        </Link></>}
      />

      <PanelListFilters>
<GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="py-2 pr-3 font-medium">Discount</th>
                <th className="py-2 pr-3 font-medium">Usage</th>
                <th className="py-2 pr-3 font-medium">Window</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-mono font-semibold text-foreground">{c.code}</span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {c.discountType === "percentage" ? `${c.discountAmount}%` : `₹${c.discountAmount.toLocaleString("en-IN")}`}
                    {c.maxDiscountCap != null && ` (cap ₹${c.maxDiscountCap.toLocaleString("en-IN")})`}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {c.usageCount}
                    {c.usageLimit != null ? ` / ${c.usageLimit}` : ""}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {formatDateTime(c.startDate)} → {formatDateTime(c.endDate)}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        c.isActive
                          ? "rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400"
                          : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                      }
                    >
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/sitecraft-ai/offers/coupons/${c._id}`} className="text-xs text-primary hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No coupons yet.{" "}
                    <Link href="/sitecraft-ai/offers/coupons/new" className="text-primary hover:underline">
                      Create one
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
