import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import SectionsManager, { type SectionRow } from "@/components/products/cashflow-ai/tds/SectionsManager";
import RulebookSections, { type RulebookCard } from "@/components/products/cashflow-ai/tds/RulebookSections";
import { requireFmsPage } from "@/lib/fms-auth";
import { canManageCompliance, canViewFinancialStatements } from "@/lib/fms-roles";
import { listSections, sectionMap } from "@/lib/products/cashflow-ai/tds/store";
import { SECTION_CATALOG, financialYearOf } from "@/lib/products/cashflow-ai/tds/core";
import { loadRulebook } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { userNames } from "@/lib/products/playbook-ai/people";

export default async function TdsSettingsPage() {
  const user = await requireFmsPage(canViewFinancialStatements);
  const fy = financialYearOf(istToday());
  const [rulebook, map, sections] = await Promise.all([loadRulebook(fy), sectionMap(fy), listSections()]);
  const names = await userNames(sections.map((s) => s.confirmedBy).filter((v): v is string => !!v));
  const lawCodes = new Set(rulebook.tds.map((r) => r.code.toUpperCase()));

  const cards: RulebookCard[] = rulebook.tds.map((r) => {
    const c = map.get(r.code.toUpperCase());
    return { code: r.code, label: r.label, covers: r.covers, rate: c?.rate ?? r.rate, noPanRate: c ? c.noPanRate : r.noPanRate, singleThreshold: c ? c.singleThreshold : r.singleThreshold, annualThreshold: c ? c.annualThreshold : r.annualThreshold, active: c?.active !== false, ownFigures: c?.basis === "override" };
  });
  // The advanced editor lists only the company's own figures: overrides and sections the rulebook does not have. A plain on/off row has no numbers to show.
  const rows: SectionRow[] = sections
    .filter((s) => s.override === true || !lawCodes.has(s.code.toUpperCase()))
    .map((s) => ({
      code: s.code,
      label: s.label,
      rate: s.rate,
      singleThreshold: s.singleThreshold,
      annualThreshold: s.annualThreshold,
      noPanRate: s.noPanRate,
      confirmed: s.confirmed,
      active: s.active,
      note: s.note,
      confirmedAt: s.confirmedAt ? s.confirmedAt.toISOString().slice(0, 10) : null,
      confirmedBy: s.confirmedBy ? names.get(s.confirmedBy) ?? null : null,
      overridesLaw: lawCodes.has(s.code.toUpperCase()),
    }));
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "TDS", href: "/cashflow-ai/tds" }, { label: "Sections & rates" }]}
        title={<>TDS sections that apply to your company</>}
        description={<>Tick the sections you pay under. The rates and limits are the platform&apos;s, for financial year {fy}; you do not enter them.</>}
      />
      <RulebookSections
        fy={fy}
        cards={cards}
        canChange={canManageCompliance(user)}
        confirmed={rulebook.confirmed}
        confirmedAt={rulebook.confirmedAt ? rulebook.confirmedAt.slice(0, 10) : null}
        confirmedBy={rulebook.confirmedBy}
      />
      <details className="group rounded-xl border border-border/60 p-4">
        <summary className="cursor-pointer text-sm font-medium">Advanced: set my own rate (only if your CA gives you a special certificate)</summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Figures you enter here replace the platform&apos;s for that section. Use this only for a special case, such as a lower-deduction certificate from the tax department. Most companies never need it.</p>
          <SectionsManager rows={rows} catalog={SECTION_CATALOG} canChange={canManageCompliance(user)} />
        </div>
      </details>
    </div>
  );
}
