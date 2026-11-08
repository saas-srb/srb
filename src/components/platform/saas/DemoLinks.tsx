"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, SquareArrowOutUpRight } from "lucide-react";
import { DEMO_ACCESS, buildDemoUrls } from "@/components/platform/saas/demo-access";

/** Primary CTA: "Open live demo workspace" + "Or preview the public website first" */
export function DemoWorkspaceCta() {
  const [urls, setUrls] = useState<{ website: string; workspace: string }>({ website: DEMO_ACCESS.website, workspace: DEMO_ACCESS.workspace });
  useEffect(() => { setUrls(buildDemoUrls()); }, []);
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <a
        href={urls.workspace}
        target="_blank"
        rel="noopener noreferrer"
        className="group/cta inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-4 text-sm font-bold text-background shadow-xl shadow-foreground/15 transition-all hover:scale-[1.02] active:scale-95"
      >
        Open live demo workspace
        <SquareArrowOutUpRight className="h-4 w-4 transition-transform group-hover/cta:-translate-y-0.5 group-hover/cta:translate-x-0.5" />
      </a>
      <a href={urls.website} target="_blank" rel="noopener noreferrer" className="sr-link">
        Or preview the public website first
      </a>
    </div>
  );
}

/** Window bar hostname display */
export function DemoWindowHost() {
  const [host, setHost] = useState(new URL(DEMO_ACCESS.workspace).hostname);
  useEffect(() => { setHost(new URL(buildDemoUrls().workspace).hostname); }, []);
  return <span className="sr-mono ml-2 truncate text-xs text-muted-foreground">{host}</span>;
}

/** "Open live workspace" button on Path 1 card */
export function DemoWorkspaceLink() {
  const [urls, setUrls] = useState<{ website: string; workspace: string }>({ website: DEMO_ACCESS.website, workspace: DEMO_ACCESS.workspace });
  useEffect(() => { setUrls(buildDemoUrls()); }, []);
  return (
    <a
      href={urls.workspace}
      target="_blank"
      rel="noopener noreferrer"
      className="group/cta mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-background px-5 py-2.5 text-sm font-semibold transition-all hover:border-primary/40 hover:text-primary active:scale-[0.98]"
    >
      Open live workspace
      <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5" />
    </a>
  );
}

/** "View public website" button on Path 2 card */
export function DemoWebsiteLink() {
  const [urls, setUrls] = useState<{ website: string; workspace: string }>({ website: DEMO_ACCESS.website, workspace: DEMO_ACCESS.workspace });
  useEffect(() => { setUrls(buildDemoUrls()); }, []);
  return (
    <a
      href={urls.website}
      target="_blank"
      rel="noopener noreferrer"
      className="group/cta mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-background px-5 py-2.5 text-sm font-semibold transition-all hover:border-primary/40 hover:text-primary active:scale-[0.98]"
    >
      View public website
      <ExternalLink className="h-4 w-4 transition-transform group-hover/cta:-translate-y-0.5 group-hover/cta:translate-x-0.5" />
    </a>
  );
}
