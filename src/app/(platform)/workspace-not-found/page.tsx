import type { Metadata } from "next";
import { headers } from "next/headers";
import { ArrowRight, Compass, Globe, Link2Off, PauseCircle, SearchCheck } from "lucide-react";
import ErrorScreen from "@/components/errors/ErrorScreen";
import { buttonVariants } from "@/components/ui/button";
import { saasSiteOrigin } from "@/lib/platform/saas/hosts";

/**
 * Shown (404) by the proxy for a host that no company owns — an unverified
 * custom domain, a mistyped subdomain, or a suspended workspace. Deliberately
 * reads nothing from the database: there is no company to read it for.
 */
export const metadata: Metadata = {
  title: "No workspace here",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const REASONS = [
  { icon: SearchCheck, text: "The address is mistyped. Check the spelling." },
  { icon: Link2Off, text: "A custom domain hasn’t been connected or verified yet." },
  { icon: PauseCircle, text: "The workspace was suspended or removed." },
];

export default async function WorkspaceNotFoundPage() {
  const host = (await headers()).get("host");
  const site = saasSiteOrigin(host);
  const shown = host?.replace(/:\d+$/, "") ?? null;

  return (
    <ErrorScreen
      code="404"
      gamePage="no-workspace"
      icon={<Globe className="size-6" />}
      title="No workspace here"
      actions={
        <>
          <a href={`${site}/signup`} className={buttonVariants({ size: "lg" })}>
            Create a workspace <ArrowRight className="size-4" data-icon="inline-end" />
          </a>
          <a href={`${site}/login`} className={buttonVariants({ size: "lg", variant: "outline" })}>
            <Compass className="size-4" data-icon="inline-start" /> Find your workspace
          </a>
        </>
      }
      footer={
        process.env.NODE_ENV !== "production" ? (
          <>
            Development: register a company at <code className="rounded bg-muted px-1 py-0.5">/signup</code>. Other hosts need a company
            address (<code className="rounded bg-muted px-1 py-0.5">&lt;slug&gt;.localhost</code>) or a verified domain.
          </>
        ) : (
          "Own this address? Finish connecting it from your workspace settings → Domains."
        )
      }
    >
      {shown ? (
        <p className="mb-5">
          <span className="inline-flex max-w-full items-center gap-2 truncate rounded-full border border-border bg-muted/60 px-3 py-1 font-mono text-[13px] text-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-destructive/70" />
            {shown}
          </span>
        </p>
      ) : null}
      <p>This address isn’t connected to an active workspace.</p>
      <ul className="mt-5 space-y-2.5 text-left">
        {REASONS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 px-3.5 py-2.5 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </ErrorScreen>
  );
}
