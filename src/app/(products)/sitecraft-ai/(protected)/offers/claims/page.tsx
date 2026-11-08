import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listClaims } from "@/lib/offers/claims";
import { getAudienceLabel } from "@/lib/offers/constants";
import { getCategoryLabel } from "@/lib/categories";
import { formatDateTime, formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offer Claims · Festival Offers" };

export default async function OfferClaimsPage() {
  const claims = await listClaims({}, 200);

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Festival Offers", href: "/sitecraft-ai/offers" }, { label: "Claims" }]}
        title={<>Offer claims</>}
        description={<>Every submission also created a real lead — open{" "}
          <Link href="/dealflow-ai/submissions" className="text-primary hover:underline">
            Submissions
          </Link>{" "}
          for the full contact record and follow-up workflow.</>}
      />

      <PanelListFilters>
<GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Claimed</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Audience</th>
                <th className="py-2 pr-3 font-medium">Coupon</th>
                <th className="py-2 pr-3 font-medium">Final price</th>
                <th className="py-2 font-medium">Lead</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(c.createdAt)}</td>
                  <td className="py-2 pr-3 text-foreground">{getCategoryLabel(c.category)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{getAudienceLabel(c.audience)}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{c.couponCode ?? "—"}</td>
                  <td className="py-2 pr-3 text-foreground">
                    {c.pricing.finalPrice != null ? formatCurrency(c.pricing.finalPrice, c.pricing.currency) : "Custom Quote"}
                  </td>
                  <td className="py-2">
                    <Link href={`/dealflow-ai/submissions/${c.category}`} className="text-xs text-primary hover:underline">
                      View in Submissions
                    </Link>
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No offer claims yet.
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
