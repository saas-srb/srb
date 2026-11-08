"use client";

import { useState, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import PanelTabs from "@/components/platform/panel/PanelTabs";

export interface TabDef {
  key: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
  hint?: string;
}

export default function Tabs({
  tabs,
  initial,
  syncParam,
}: {
  tabs: TabDef[];
  initial?: string;
  /** When set, the active tab is mirrored to this URL search param so it
   *  survives a server re-render (e.g. a nested control calling router.replace). */
  syncParam?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstEnabled = tabs.find((t) => !t.disabled)?.key ?? tabs[0]?.key;
  const [active, setActive] = useState(
    initial && tabs.some((t) => t.key === initial && !t.disabled) ? initial : firstEnabled
  );

  function select(key: string) {
    setActive(key);
    if (syncParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set(syncParam, key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }

  return (
    <div className="space-y-4">
      <PanelTabs
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, disabled: t.disabled, title: t.disabled ? t.hint : undefined, icon: t.disabled ? <span className="text-[10px] uppercase tracking-wide">Phase 2</span> : undefined }))}
        active={active}
        onSelect={select}
      />
      <div>{tabs.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
