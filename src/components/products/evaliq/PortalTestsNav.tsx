import PanelTabs from "@/components/platform/panel/PanelTabs";

/** Tab strip for the Portal's Tests area (My Tests · My Results · Certificates). */
export default function PortalTestsNav({ active }: { active: "tests" | "results" | "certificates" }) {
  const tabs = [
    { key: "tests", label: "My Tests", href: "/clientos/tests" },
    { key: "results", label: "My Results", href: "/clientos/tests/results" },
    { key: "certificates", label: "Certificates", href: "/clientos/tests/certificates" },
  ] as const;
  return <PanelTabs tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: t.href }))} active={active} />;
}
