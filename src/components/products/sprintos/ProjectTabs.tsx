"use client";

import { usePathname } from "next/navigation";
import PanelTabs from "@/components/platform/panel/PanelTabs";

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/sprintos/projects/${projectId}`;
  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/board`, label: "Board" },
    { href: `${base}/tasks`, label: "Tasks" },
    { href: `${base}/timeline`, label: "Timeline" },
    { href: `${base}/documents`, label: "Files" },
  ];

  const active = tabs.find((t) => (t.exact ? pathname === t.href : pathname?.startsWith(t.href)) && (t.exact || t.href !== base))?.href ?? base;
  return <PanelTabs tabs={tabs.map((t) => ({ key: t.href, label: t.label, href: t.href }))} active={active} label="Project sections" />;
}
