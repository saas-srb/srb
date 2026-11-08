import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReturnStatusEditor from "@/components/products/cashflow-ai/income-tax/ReturnStatusEditor";
import NoticesManager from "@/components/products/cashflow-ai/income-tax/NoticesManager";
import ReturnFyPicker from "@/components/products/cashflow-ai/income-tax/ReturnFyPicker";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { financialYearOf, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { todayIst } from "@/lib/products/cashflow-ai/month-close/core";
import { getReturn } from "@/lib/products/cashflow-ai/income-tax/returns-store";
import { listNotices } from "@/lib/products/cashflow-ai/income-tax/notices-store";
import { auditStatusText, replyDueText, returnStatusText } from "@/lib/products/cashflow-ai/income-tax/registers-core";

function fyOptions(current: string, chosen: string): string[] {
  const start = Number(current.slice(0, 4));
  const list = Array.from({ length: 6 }, (_, i) => `${start - i}-${String((start - i + 1) % 100).padStart(2, "0")}`);
  return list.includes(chosen) ? list : [...list, chosen].sort().reverse();
}

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const sp = await searchParams;
  const today = todayIst();
  const fy = sp.fy && isFinancialYear(sp.fy) ? sp.fy : financialYearOf(today);
  const user = await getCurrentFmsUser();
  const canManage = !!user && canManageCompliance(user);
  const [ret, notices] = await Promise.all([getReturn(fy), listNotices()]);
  const openCount = notices.filter((n) => n.status === "open").length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Income tax", href: "/cashflow-ai/income-tax" }, { label: "Return, audit & notices" }]}
        title={<>Return, audit &amp; notices</>}
        description={<>Note down whether the income-tax return and tax audit for each year are done, and keep a list of notices from the tax department. This page only keeps track: the return, the audit and any reply to a notice are handled by you and your CA, and the dates here are the ones you type in.</>}
        actions={<ReturnFyPicker fy={fy} options={fyOptions(financialYearOf(today), fy)} />}
      />

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>
            Return and audit for {fy}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{returnStatusText(ret)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{auditStatusText(ret)}</p>
          <ReturnStatusEditor
            key={fy}
            fy={fy}
            canManage={canManage}
            today={today}
            initial={ret ? { formLabel: ret.formLabel, filedOn: ret.filedOn, acknowledgementNo: ret.acknowledgementNo, verifiedOn: ret.verifiedOn, auditApplicable: ret.auditApplicable, auditReportFiledOn: ret.auditReportFiledOn, auditUdin: ret.auditUdin, auditedBy: ret.auditedBy, note: ret.note } : null}
          />
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>
            Notices from the tax department
            <span className="ml-2 text-sm font-normal text-muted-foreground">{notices.length === 0 ? "" : `${openCount} open`}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Note each notice here with the reply-due date written on it. Responding is for you and your CA; this list only keeps track and counts the days from the date you type.</p>
          <NoticesManager
            canManage={canManage}
            today={today}
            notices={notices.map((n) => ({ id: n._id, type: n.type, reference: n.reference, fy: n.fy, receivedOn: n.receivedOn, responseDueOn: n.responseDueOn, status: n.status, amountDemanded: n.amountDemanded, note: n.note, dueText: replyDueText(n, today), events: n.events.map((e) => ({ id: e.id, date: e.date, text: e.text })) }))}
          />
        </CardContent>
      </GlassCard>
    </div>
  );
}
