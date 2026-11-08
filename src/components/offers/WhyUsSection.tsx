"use client";

import { Rocket, Handshake, Building2, Headphones } from "lucide-react";
import StatsBand from "@/components/sections/StatsBand";
import ChecklistGrid from "@/components/sections/ChecklistGrid";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

// Same figures already shown on /about/our-mission and /about/success-stories —
// reused verbatim here, never re-invented for this page.
// The figures are CMS text ("12+", "100%", "24/7"), written by the company itself; a stat with no value is not shown.
const parseStat = (raw: string): { value: number; suffix: string } | null => {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)(.*)$/);
  return m ? { value: Number(m[1]), suffix: m[2].trim() } : null;
};
const REAL_STATS = (tx: (key: string) => string) => ([
  { n: 1, label: tx("offers.whyBrandSection.projects-shipped"), icon: Rocket },
  { n: 2, label: tx("offers.whyBrandSection.client-satisfaction"), icon: Handshake },
  { n: 3, label: tx("offers.whyBrandSection.industries-served"), icon: Building2 },
  { n: 4, label: tx("offers.whyBrandSection.support-availability"), icon: Headphones },
]).flatMap(({ n, label, icon }) => {
  const stat = parseStat(tx(`offers.whyBrandSection.stat${n}.value`));
  return stat && label ? [{ ...stat, label, icon }] : [];
});

const TRUST_ITEMS = (tx: (key: string) => string) => ([
  { title: tx("offers.whyBrandSection.experienced-engineering-team"), description: tx("offers.whyBrandSection.senior-engineers-not-a-rotating-pool-of-") },
  { title: tx("offers.whyBrandSection.real-project-experience"), description: tx("offers.whyBrandSection.every-offer-is-backed-by-production-grad") },
  { title: tx("offers.whyBrandSection.senior-mentorship"), description: tx("offers.whyBrandSection.training-and-internship-programs-are-led") },
  { title: tx("offers.whyBrandSection.100-code-ownership"), description: tx("offers.whyBrandSection.full-source-and-ip-ownership-on-every-so") },
  { title: tx("offers.whyBrandSection.nda-protection"), description: tx("offers.whyBrandSection.your-project-details-and-data-stay-confi") },
  { title: tx("offers.whyBrandSection.transparent-engagement"), description: tx("offers.whyBrandSection.clear-scope-clear-pricing-clear-timeline") },
]);

export default function WhyUsSection() {
  const tx = useText();
  return (
    <>
      {REAL_STATS(tx).length > 0 && <StatsBand title={tx("offers.whyBrandSection.why-brand")} description={tx("offers.whyBrandSection.a-festival-discount-is-only-worth-it-if-")} stats={REAL_STATS(tx)} />}
      <ChecklistGrid
        id="why-us"
        title={tx("offers.whyBrandSection.built-for-trust-not-just-discounts")}
        description={tx("offers.whyBrandSection.a-steep-discount-can-make-anyone-pause-h")}
        items={TRUST_ITEMS(tx)}
        columns={3}
        tone="muted"
      />
    </>
  );
}
