import Link from "next/link";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import ChecklistItemRow from "@/components/products/cashflow-ai/compliance/ChecklistItemRow";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { COMPLIANCE_SECTIONS, OWNER_LABELS, computeProgress, itemKey, type ItemStatus } from "@/lib/products/cashflow-ai/compliance/catalog";
import { listItemStates } from "@/lib/products/cashflow-ai/compliance/tracker";
import { gatherFacts } from "@/lib/products/cashflow-ai/compliance/facts";
import { evaluateSignals } from "@/lib/products/cashflow-ai/compliance/auto-core";
import { todayDateString } from "@/lib/products/talentos/time";

export default async function ChecklistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageCompliance(user) : false;
  const [states, facts] = await Promise.all([listItemStates(), gatherFacts(todayDateString())]);
  const signals = evaluateSignals(facts);
  const progress = computeProgress(new Map([...states].map(([k, v]) => [k, v.status])));
  const only = COMPLIANCE_SECTIONS.find((s) => s.key === sp.section);
  const sections = only ? [only] : COMPLIANCE_SECTIONS;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "CA & Compliance", href: "/cashflow-ai/compliance" }, { label: "Checklist" }]}
        title={<>CA Checklist</>}
        description={<>Every job your accounts team and CA should be doing, in the same order as the CA checklist. Set each one to To do, In progress, Done or Not applicable. Where the books can confirm an item (or show a problem with it) you will see a green or amber note; it never changes your status by itself. Tap a line to name who is responsible and where the proof is saved.</>}
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/cashflow-ai/compliance/checklist" className={`rounded-full border px-3 py-1 ${!only ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>All sections</Link>
        {COMPLIANCE_SECTIONS.map((s) => (
          <Link key={s.key} href={`/cashflow-ai/compliance/checklist?section=${s.key}`} className={`rounded-full border px-3 py-1 ${only?.key === s.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            {s.number}. {s.title.split(" and ")[0].split(",")[0]}
          </Link>
        ))}
      </div>

      {sections.map((s) => {
        const p = progress.find((x) => x.sectionKey === s.key)!;
        return (
          <GlassCard key={s.key} interactive={false}>
            <CardContent className="p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold">{s.number}. {s.title}</h2>
                <span className="text-xs text-muted-foreground">{p.done} of {p.applicable} done · {p.percent}%</span>
              </div>
              <p className="text-sm text-muted-foreground">{s.summary}</p>
              <p className="mb-2 mt-1 text-xs text-muted-foreground">
                Usually handled by: {OWNER_LABELS[s.owner]}
                {s.href && <> · <Link href={s.href} className="text-primary hover:underline">Open in CashFlow</Link></>}
              </p>
              <ul>
                {s.items.map((title, i) => {
                  const key = itemKey(s.key, i);
                  const st = states.get(key);
                  return <ChecklistItemRow key={key} itemKey={key} title={title} status={(st?.status ?? "todo") as ItemStatus} owner={st?.owner ?? ""} note={st?.note ?? ""} canManage={canManage} signal={signals.get(key)} />;
                })}
              </ul>
            </CardContent>
          </GlassCard>
        );
      })}
    </div>
  );
}
