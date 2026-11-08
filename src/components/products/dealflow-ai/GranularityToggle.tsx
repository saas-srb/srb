"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
] as const;

export default function GranularityToggle({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setGranularity(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("granularity", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <PanelTabs label="Granularity" active={value} onSelect={setGranularity} tabs={OPTIONS.map((o) => ({ key: o.value, label: o.label }))} />
  );
}
