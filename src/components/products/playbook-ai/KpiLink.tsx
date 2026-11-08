import Link from "next/link";
import type { ReactNode } from "react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";

/** A KpiCard that navigates to the matching filtered list when clicked. */
export default function KpiLink({ href, ...props }: { href: string } & React.ComponentProps<typeof KpiCard>) {
  return (
    <Link href={href} className="group block h-full w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label={`${props.label}: open list`}>
      <KpiCard {...props} />
    </Link>
  );
}

export type { ReactNode };
