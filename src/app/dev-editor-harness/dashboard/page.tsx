import { notFound } from "next/navigation";
import { AlertTriangle, UserCheck, Users } from "lucide-react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import ExecutiveSection from "@/components/products/commandos/ExecutiveSection";
import DashboardView from "@/components/products/playbook-ai/dashboard/DashboardView";
import { parsePbFilters } from "@/lib/products/playbook-ai/dashboard/filters";
import { buildDashboard } from "@/lib/products/playbook-ai/dashboard/compute";
import { DAY_MS, istDayStart, resolveRange } from "@/lib/products/playbook-ai/dashboard/ranges";
import type { ActivityRow, AiRunRow, DashDocStatus, DashSendStatus, DashboardInput, DocRow, ExportRow, SendRow } from "@/lib/products/playbook-ai/dashboard/types";

/**
 * Development-only: the real dashboard view over SEEDED sample rows (a fixed pseudo-random generator), so the layout can be checked in a
 * browser without sign-in or data. The seeded rows exist only here; the product page reads the company's own data. 404 in production.
 * `?empty=1` shows the empty state. Used by scripts/shot-dashboard.ts.
 */
export const dynamic = "force-dynamic";

function seeded(): DashboardInput {
  let s = 20261109;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const now = Date.now();
  const today = istDayStart(now);
  const users = [["u1", "Priya Nair"], ["u2", "Ravi Menon"], ["u3", "Asha Rao"], ["u4", "Vijay Pal"]] as const;
  const depts = ["Human Resources", "Finance", "Sales", "Operations", "Legal", "IT"];
  const cats = ["Human Resources", "Contracts", "Finance", "Operations", "Compliance", "Sales"];
  const tpls: [string, string][] = [["ct.msa", "Master services agreement"], ["hr.offer", "Offer letter"], ["ct.nda_mutual", "Mutual NDA"], ["sop.hr.recruitment", "Recruitment and Selection"], ["kpi.sales-executive", "Sales Executive KPI Sheet"], ["ct.freelancer", "Freelancer agreement"]];
  const docs: DocRow[] = [], sends: SendRow[] = [], ai: AiRunRow[] = [], exports: ExportRow[] = [], activity: ActivityRow[] = [];
  for (let i = 0; i < 160; i++) {
    const ageDays = Math.floor(Math.pow(rnd(), 1.5) * 100);
    const kind = pick(["sop", "document", "document", "document", "kpi"] as const);
    const [uid] = pick([...users]);
    const t = pick(tpls);
    const status: DashDocStatus = pick(["draft", "draft", "issued", "issued", "approved", "in_review"]);
    const created = today - ageDays * DAY_MS + Math.floor(rnd() * 20) * 3_600_000;
    const doc: DocRow = {
      id: `d${i}`, title: kind === "sop" ? `${t[1]} SOP ${i}` : `${t[1]} ${i}`, kind, status, createdAt: created, updatedAt: created + Math.floor(rnd() * Math.max(ageDays, 1)) * DAY_MS * 0.7, createdBy: uid,
      department: pick(depts), category: pick(cats), templateId: rnd() < 0.7 ? t[0] : null, templateName: t[1], versionSeq: pick([0, 0, 1, 1, 2, 3, 5, 7]), legalPending: rnd() < 0.05, reviewedAt: kind === "sop" && rnd() < 0.5 ? created - 380 * DAY_MS : created,
    };
    docs.push(doc);
    if (rnd() < 0.55) {
      const sentAt = created + Math.floor(rnd() * 5) * DAY_MS;
      if (sentAt < now) {
        const r = rnd();
        const status2: DashSendStatus = r < 0.5 ? "signed" : r < 0.7 ? "viewed" : r < 0.85 ? "sent" : r < 0.93 ? "partially_signed" : "expired";
        const signedAt = status2 === "signed" ? Math.min(sentAt + (0.3 + rnd() * rnd() * 14) * DAY_MS, now) : null;
        sends.push({ id: `s${i}`, documentId: doc.id, cloneId: `c${i}`, title: doc.title, sentAt, viewedAt: status2 === "sent" || status2 === "expired" ? null : sentAt + 0.2 * DAY_MS, signedAt, status: status2, sentBy: uid, partyName: pick(["Northwind Demo", "Asha Rao", "Ravi Menon", "Orbit Software"]), partyType: pick(["client", "employee", "employee", "vendor"]) });
      }
    }
    if (rnd() < 0.5) ai.push({ at: created + 3_600_000, userId: uid, documentId: doc.id, inputTokens: 800 + Math.floor(rnd() * 3000), outputTokens: 200 + Math.floor(rnd() * 900), status: rnd() < 0.9 ? "proposed" : "failed" });
    if (rnd() < 0.6) exports.push({ at: created + 2 * 3_600_000, format: rnd() < 0.65 ? "pdf" : "docx", actorId: uid });
    if (i < 14) activity.push({ at: now - i * 5_400_000, actorId: uid, actor: users.find((u) => u[0] === uid)![1], action: "edit", summary: pick(["edited", "saved a version of", "sent for signature:", "issued"]) + " " + doc.title, documentId: doc.id });
  }
  return { docs, sends, ai, exports, activity, names: Object.fromEntries(users) };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string; empty?: string; from?: string; to?: string; mine?: string; ref?: string; [k: string]: string | undefined }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const now = Date.now();
  const range = resolveRange(sp.range, now, { from: sp.from, to: sp.to });
  const input: DashboardInput = sp.empty ? { docs: [], sends: [], ai: [], exports: [], activity: [], names: {} } : seeded();
  const data = buildDashboard(input, range, { all: !sp.mine, userId: "u1" }, now, parsePbFilters(sp));
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {sp.ref && (
        <ExecutiveSection title="Platform User KPIs (the existing card, for comparison)">
          <KpiGrid>
            <KpiCard label="Total Users" value={42} accent icon={<Users className="size-4" />} />
            <KpiCard label="Active Users" value={37} tone="up" icon={<UserCheck className="size-4" />} />
            <KpiCard label="Inactive Users" value={5} tone="down" icon={<AlertTriangle className="size-4" />} />
          </KpiGrid>
        </ExecutiveSection>
      )}
      <DashboardView data={data} rangeHrefBase="/dev-editor-harness/dashboard" canCreate csvHref="#" custom={range.key === "custom" ? { from: sp.from ?? "", to: sp.to ?? "" } : undefined}
        brand={[{ label: "Company details block on page 1", ok: true, hint: "" }, { label: "Logo uploaded", ok: false, hint: "Upload your logo so it prints on page 1." }, { label: "Registered address", ok: true, hint: "" }, { label: "GSTIN", ok: false, hint: "Add the GSTIN to the company profile." }, { label: "Phone and website", ok: true, hint: "" }]} />
    </div>
  );
}
