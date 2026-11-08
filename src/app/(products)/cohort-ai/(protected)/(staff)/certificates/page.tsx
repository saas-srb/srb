import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Plus, BadgeCheck, GraduationCap, Briefcase, Ban } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import CertificateIssueForm from "@/components/products/cohort-ai/CertificateIssueForm";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canIssueCertificates } from "@/lib/tms-roles";
import { listCertificates, countCertificates } from "@/lib/products/cohort-ai/certificates";
import { listStudentOptions } from "@/lib/products/cohort-ai/students";
import { listProgramOptions } from "@/lib/products/cohort-ai/programs";
import { listBatchPickerOptions } from "@/lib/products/cohort-ai/batches";
import { formatDate } from "@/lib/utils";

export default async function CertificatesPage() {
  const user = await getCurrentTmsUser();
  const canIssue = user ? canIssueCertificates(user) : false;

  const [certs, students, programs, batches, total, industrial, internship] = await Promise.all([
    listCertificates({}, 500),
    listStudentOptions(),
    listProgramOptions(),
    listBatchPickerOptions(),
    countCertificates(),
    countCertificates({ type: "industrial_training" }),
    countCertificates({ type: "internship" }),
  ]);

  const revoked = certs.filter((c) => c.revoked).length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Certificates" }]}
        title={<>Certificates</>}
        description={<>{total} certificate{total === 1 ? "" : "s"} issued.</>}
        actions={<>{canIssue && (
          <CertificateIssueForm
            students={students}
            programs={programs.map((p) => ({ _id: p._id, name: p.name }))}
            batches={batches.map((b) => ({ _id: b._id, name: b.name, programId: b.programId }))}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                Issue Certificate
              </Button>
            }
          />
        )}</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total Issued" value={total} accent icon={<BadgeCheck className="size-4" />} />
        <KpiCard label="Industrial Training" value={industrial} icon={<GraduationCap className="size-4" />} />
        <KpiCard label="Internship" value={internship} icon={<Briefcase className="size-4" />} />
        <KpiCard label="Revoked" value={revoked} tone={revoked > 0 ? "down" : undefined} icon={<Ban className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          {certs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No certificates yet.{" "}
              {canIssue ? "Use “Issue Certificate”." : "Ask a Cohort AI admin to issue one."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certs.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/cohort-ai/certificates/${c._id}`} className="hover:underline">{c.certificateNumber}</Link>
                    </TableCell>
                    <TableCell>{c.studentName}</TableCell>
                    <TableCell className="text-muted-foreground">{c.typeLabel}</TableCell>
                    <TableCell className="text-muted-foreground">{c.programName}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(c.issuedOn)}</TableCell>
                    <TableCell>
                      {c.revoked ? (
                        <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">Revoked</span>
                      ) : (
                        <span className="rounded-md bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">Valid</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
