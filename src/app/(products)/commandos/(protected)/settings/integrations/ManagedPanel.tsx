"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import CardTestButton from "./CardTestButton";

/** The panel of a service that is managed on its own page (payments, webhooks) or by SRB (file storage): what it is, a safe Test, and the way to its settings. */
export default function ManagedPanel({ provider, name, text, href, linkLabel }: { provider: string; name: string; text: string; href: string | null; linkLabel: string | null }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <CardTestButton provider={provider} name={name} />
        {href && linkLabel && <Link href={href} className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">{linkLabel} <ArrowUpRight className="size-3.5" aria-hidden /></Link>}
      </div>
    </div>
  );
}
