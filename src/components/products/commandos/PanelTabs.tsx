import Link from "next/link";

/** Tabs inside a side panel: plain links (`?open=x&tab=y`), so each tab is a real address and works without scripts. */
export default function PanelTabs({ tabs, active, hrefFor }: { tabs: { key: string; label: string }[]; active: string; hrefFor: (tab: string) => string }) {
  return (
    <nav aria-label="Sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border pb-px">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={hrefFor(t.key)}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium ${t.key === active ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
