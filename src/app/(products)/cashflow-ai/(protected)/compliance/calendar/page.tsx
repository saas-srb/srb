import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddFilingForm, CalendarSetupPanel, FilingRowActions } from "@/components/products/cashflow-ai/compliance/FilingActions";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance, canViewFinancialStatements } from "@/lib/fms-roles";
import { getComplianceProfile, listFilings } from "@/lib/products/cashflow-ai/compliance/filings";
import { FILING_CATEGORIES, currentFilingYear, filingState, isFilingYear, type FilingDisplayState } from "@/lib/products/cashflow-ai/compliance/filings-core";
import { loadRulebook } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import { todayDateString } from "@/lib/products/talentos/time";

const STATE_BADGE: Record<FilingDisplayState, { label: string; cls: string }> = {
  overdue: { label: "Overdue", cls: "bg-destructive/15 text-destructive" },
  due_soon: { label: "Due within 7 days", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  upcoming: { label: "Upcoming", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  no_date: { label: "Date needed", cls: "bg-muted text-muted-foreground" },
  filed: { label: "Filed", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  not_applicable: { label: "Not applicable", cls: "bg-muted text-muted-foreground" },
};

function fmt(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function dateNote(f: { generated?: boolean; dueDateConfirmed: boolean; dateCheckedOn?: string | null; dateEditedByHand?: boolean; dateHistory?: { from: string }[] }) {
  if (!f.generated) return f.dueDateConfirmed ? " (confirmed by CA)" : " (not yet confirmed by CA)";
  const moved = f.dateHistory?.length ? `, moved from ${fmt(f.dateHistory[f.dateHistory.length - 1].from)}` : "";
  if (f.dateEditedByHand) return " (date set by you)";
  return f.dueDateConfirmed ? ` (checked by the platform${f.dateCheckedOn ? ` on ${fmt(f.dateCheckedOn)}` : ""}${moved})` : ` (usual date, not yet checked by the platform${moved})`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageCompliance(user) : false;
  const canView = canManage || (user ? canViewFinancialStatements(user) : false);
  const today = todayDateString();
  const { fy: fyParam } = await searchParams;
  const fy = fyParam && isFilingYear(fyParam) ? fyParam : currentFilingYear(today);
  const [filings, profile, rulebook] = await Promise.all([listFilings(), getComplianceProfile(), loadRulebook(fy)]);
  const rows = filings.map((f) => ({ f, state: filingState(f, today) }));
  const order: Record<FilingDisplayState, number> = { overdue: 0, due_soon: 1, upcoming: 2, no_date: 3, filed: 4, not_applicable: 5 };
  rows.sort((a, b) => order[a.state] - order[b.state] || (a.f.dueDate ?? "9999").localeCompare(b.f.dueDate ?? "9999"));
  const catLabel = (v: string) => FILING_CATEGORIES.find((c) => c.value === v)?.label ?? v;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "CA & Compliance", href: "/cashflow-ai/compliance" }, { label: "Filing calendar" }]}
        title={<>Filing Calendar</>}
        description={<>Every return, payment and form with its due date and proof of filing. Due dates come from the platform&apos;s tax rulebook for the year, so you do not need to look them up or type them.</>}
      />

      <div
        className={`rounded-lg border p-3 text-sm ${rulebook.confirmed ? "border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300" : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}
      >
        {rulebook.confirmed
          ? `The due dates for FY ${fy} were checked by the platform${rulebook.confirmedAt ? ` on ${fmt(rulebook.confirmedAt.slice(0, 10))}` : ""}.`
          : `The due dates for FY ${fy} have not been checked against the latest government notification yet. They are the usual dates and may change. Use “Update dates” later to pick up any change.`}
      </div>

      {canView && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Which of these apply to you?</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <CalendarSetupPanel profile={profile} defaultFy={fy} canManage={canManage} />
          </CardContent>
        </GlassCard>
      )}

      {canManage && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Add a filing of your own</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">For anything the calendar above does not cover, such as a licence renewal.</p>
            <AddFilingForm />
          </CardContent>
        </GlassCard>
      )}

      <GlassCard interactive={false}>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No filings yet.{canManage ? " Answer the questions above, then tap “Fill in my filing calendar”." : ""}</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {rows.map(({ f, state }) => (
                <li key={f._id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.name}</span>
                      {f.form && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{f.form}</span>}
                      <Badge className={STATE_BADGE[state].cls}>{STATE_BADGE[state].label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {catLabel(f.category)}{f.period ? ` · ${f.period}` : ""}
                      {f.dueDate ? ` · due ${fmt(f.dueDate)}${dateNote(f)}` : " · no due date yet"}
                      {f.owner ? ` · ${f.owner}` : ""}
                      {f.status === "filed" && f.filedOn ? ` · filed ${fmt(f.filedOn)}${f.ackNumber ? `, ack ${f.ackNumber}` : ""}` : ""}
                    </p>
                  </div>
                  <FilingRowActions id={f._id} dueDate={f.dueDate ?? ""} dueDateConfirmed={f.dueDateConfirmed} filed={f.status === "filed"} canManage={canManage} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
