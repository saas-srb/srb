import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, ShieldCheck, SearchCheck } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import CertificateList from "@/components/products/evaliq/CertificateList";
import CertificateAdminActions from "@/components/products/evaliq/CertificateAdminActions";
import { PageHeader, SectionCard, Chip, Notice, Pager, qsHref } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { resolveTaker } from "@/lib/products/evaliq/taker";
import { candidateCertificates } from "@/lib/products/evaliq/candidate";
import { certificateState, findCertificate, listCertificates } from "@/lib/products/evaliq/certificates";
import { listTestOptions } from "@/lib/products/evaliq/tests";
import { CANDIDATE_KINDS, fmtPct, labelOf } from "@/lib/products/evaliq/constants";
import { formatDate } from "@/lib/utils";

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  const staff = can(viewer, "VIEW_REPORTS") || can(viewer, "REVOKE_CERTIFICATE") || can(viewer, "GENERATE_CERTIFICATE");
  const verifier = staff || can(viewer, "VERIFY_CERTIFICATE");
  if (!verifier && !can(viewer, "VIEW_CERTIFICATES")) redirect("/evaliq");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const taker = can(viewer, "VIEW_CERTIFICATES") ? await resolveTaker("staff") : null;
  const [mine, all, tests, lookup] = await Promise.all([
    taker ? candidateCertificates(taker) : Promise.resolve([]),
    staff ? listCertificates({ q: sp.q, testId: sp.testId, state: sp.state, page }) : Promise.resolve(null),
    staff ? listTestOptions() : Promise.resolve([]),
    verifier && sp.verify ? findCertificate(sp.verify) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Certificates" crumbs={[{ label: "Certificates" }]} description="Certificates are issued automatically when a candidate passes a certification test and the result is released. Anyone can verify one at /verify/<code>." />
      {verifier && (
        <SectionCard title="Verify a certificate" description="Look up by certificate ID or verification code.">
          <form className="flex flex-wrap gap-2" action="/evaliq/certificates">
            <input name="verify" defaultValue={sp.verify ?? ""} placeholder="EvalIQ-2026-0001 or verification code" className="h-9 min-w-64 flex-1 rounded-xl border border-border/60 bg-background px-3 text-sm" aria-label="Certificate ID or code" />
            <Button type="submit" size="sm">
              <SearchCheck className="size-3.5" /> Verify
            </Button>
          </form>
          {sp.verify && (
            <div className="mt-3">
              {!lookup ? (
                <Notice tone="error">No certificate matches that ID or code.</Notice>
              ) : (
                <Notice tone={certificateState(lookup) === "valid" ? "ok" : "error"}>
                  <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-4" />{`${lookup.certificateNumber} — ${certificateState(lookup) === "valid" ? "Valid" : certificateState(lookup) === "expired" ? "Expired" : `Revoked${lookup.revokedReason ? `: ${lookup.revokedReason}` : ""}`}`}</p>
                  <p className="text-xs">{`${lookup.candidateName} · ${lookup.testName} · ${lookup.score}/${lookup.totalMarks} (${fmtPct(lookup.percentage)}) · issued ${formatDate(lookup.issuedOn)}${lookup.validUntil ? ` · valid until ${formatDate(lookup.validUntil)}` : ""}`}</p>
                </Notice>
              )}
            </div>
          )}
        </SectionCard>
      )}
      {taker && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">My certificates</h2>
          <CertificateList certs={mine} />
        </section>
      )}
      {all && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">All certificates</h2>
          <SmmsFilterBar
            values={{ q: sp.q ?? "", testId: sp.testId ?? "", state: sp.state ?? "" }}
            fields={[
              { key: "q", label: "Search", type: "search", placeholder: "Name, certificate ID, test" },
              { key: "testId", label: "Test", type: "select", options: tests },
              { key: "state", label: "State", type: "select", options: [{ value: "valid", label: "Valid" }, { value: "expired", label: "Expired" }, { value: "revoked", label: "Revoked" }] },
            ]}
          />
          <GlassCard interactive={false}>
            <CardContent>
              {all.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No certificates yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate</TableHead>
                      <TableHead>Holder</TableHead>
                      <TableHead>Test</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Valid until</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {all.items.map((c) => {
                      const st = certificateState(c);
                      return (
                        <TableRow key={c._id}>
                          <TableCell className="font-mono text-xs">{c.certificateNumber}</TableCell>
                          <TableCell>
                            {c.candidateName}
                            <p className="text-[11px] text-muted-foreground">{labelOf(CANDIDATE_KINDS, c.candidate.kind)}</p>
                          </TableCell>
                          <TableCell className="max-w-xs text-sm">
                            <Link href={`/evaliq/tests/${c.testId}`} className="hover:text-primary">{c.testName}</Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(c.percentage)}</TableCell>
                          <TableCell className="text-xs">{formatDate(c.issuedOn)}{!c.issuedBy && <p className="text-[11px] text-muted-foreground">automatic</p>}</TableCell>
                          <TableCell className="text-xs">{c.validUntil ? formatDate(c.validUntil) : "No expiry"}</TableCell>
                          <TableCell><Chip tone={st === "valid" ? "green" : st === "expired" ? "amber" : "rose"}>{st}</Chip></TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="xs" variant="ghost" nativeButton={false} render={<a href={`/api/evaliq/certificates/${c._id}/pdf`} />} aria-label="Download PDF">
                                <Download className="size-3" />
                              </Button>
                              {can(viewer, "REVOKE_CERTIFICATE") && <CertificateAdminActions id={c._id} number={c.certificateNumber} revoked={c.revoked} />}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </GlassCard>
          <Pager page={all.page} totalPages={all.totalPages} total={all.total} noun="certificates" href={(p) => qsHref("/evaliq/certificates", sp, { page: String(p) })} />
        </section>
      )}
    </div>
  );
}
