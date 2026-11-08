import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Mail,
  Phone,
  Calendar,
  Briefcase,
  Download,
  ExternalLink,
  UserCircle2,
  Route,
  MessagesSquare,
  FileText,
  Handshake,
  BadgeCheck,
  Wallet,
  Activity,
  Link2,
  Lock,
  Globe,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import CareerStatusBadge from "@/components/products/dealflow-ai/CareerStatusBadge";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import Tabs from "@/components/products/talentos/Tabs";
import StatusSelect from "./StatusSelect";
import NotesEditor from "./NotesEditor";
import DeleteButton from "./DeleteButton";
import InterviewSchedule from "./InterviewSchedule";
import OtsCandidatePanel from "@/components/products/evaliq/OtsCandidatePanel";
import { getApplicantProfile } from "@/lib/careers/applicant-profile";
import { getCurrentLmsUser } from "@/lib/lms-auth";
import { DEFAULT_CAREER_APPLICATION_STATUS, getCareerApplicationStatusMeta } from "@/lib/career-application-status";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import DealflowCallButton from "@/components/products/dealflow-ai/DealflowCallButton";
import DealflowCallHistory from "@/components/products/dealflow-ai/DealflowCallHistory";
import { applicantCallSpec } from "@/lib/dealflow-ai/call-targets";
import LoginAsPortalUserButton from "@/app/(products)/dealflow-ai/(protected)/leads/list/LoginAsPortalUserButton";

export const dynamic = "force-dynamic";

function kb(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Section({ title, description, icon, action, children }: { title: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {icon}
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </GlassCard>
  );
}

/** Complete applicant profile: every piece of data the platform holds about this applicant, read live from its owner. */
export default async function ApplicantDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireLmsPage("VIEW_CAREERS");
  const { id } = await params;
  const { tab } = await searchParams;
  const [profile, viewer] = await Promise.all([getApplicantProfile(id), getCurrentLmsUser()]);
  if (!profile) notFound();
  const { application, account, leads, interviews, files, offer, employee, wallet, activity, otherApplications } = profile;
  // Compensation is HR data: only HR and the Director see the offered CTC.
  const seesCompensation = !!viewer && (viewer.roles.includes("super_admin") || viewer.roles.includes("hr"));
  const lead = leads[0] ?? null;
  const messages = leads.flatMap((l) => [...l.portalMessages, ...l.internalMessages]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const timeline = leads.flatMap((l) => l.timeline).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const overview = (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2" interactive={false}>
          <CardHeader>
            <CardTitle>Applicant Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              <a href={`mailto:${application.email}`} className="hover:underline">{application.email}</a>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-muted-foreground" />
              <a href={`tel:${application.phone}`} className="hover:underline">{application.phone}</a>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="size-4 shrink-0 text-muted-foreground" />
              <span>{application.positionTitle}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-4 shrink-0 text-muted-foreground" />
              <span>{`Applied ${formatDateTime(application.createdAt)} · updated ${formatDateTime(application.updatedAt)}`}</span>
            </div>
            {application.source && (
              <div className="flex items-center gap-2">
                <Globe className="size-4 shrink-0 text-muted-foreground" />
                <span>{`Source: ${application.source}`}</span>
              </div>
            )}
            <div className="pt-2">
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Resume</h3>
              <a href={`/api/careers/applications/${id}/resume`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download className="size-3.5" data-icon="inline-start" />
                {application.resume.filename}
              </a>
            </div>
            <div className="pt-2">
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cover Note</h3>
              <p className="whitespace-pre-wrap text-foreground">{application.coverNote || "No cover note provided."}</p>
            </div>
          </CardContent>
        </GlassCard>

        <div className="space-y-4">
          {/* `h-auto`: a GlassCard fills its parent's height by default, which inside this stacked column made the first card cover the second. */}
          <GlassCard interactive={false} containerClassName="h-auto">
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusSelect id={id} initialStatus={application.status ?? DEFAULT_CAREER_APPLICATION_STATUS} />
              <DeleteButton id={id} />
            </CardContent>
          </GlassCard>
          <GlassCard interactive={false} containerClassName="h-auto">
            <CardHeader>
              <CardTitle className="text-base">At a glance</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border/40">
                <Row label="Portal account">{account ? (account.status === "active" ? "Active" : "Suspended") : "Not registered"}</Row>
                <Row label="Hiring stage">{lead ? `${lead.stageLabel} (${lead.code})` : "—"}</Row>
                <Row label="Interviews">{interviews.length}</Row>
                <Row label="Messages">{messages.length}</Row>
                <Row label="Documents">{files.length}</Row>
                <Row label="Offer">{offer ? offer.status.replace(/_/g, " ") : "None"}</Row>
                <Row label="Employee">{employee ? <Link href={`/talentos/employees/${employee.id}`} className="text-primary hover:underline">{employee.code}</Link> : "Not hired"}</Row>
                <Row label="Other applications">{otherApplications.length}</Row>
              </dl>
            </CardContent>
          </GlassCard>
        </div>
      </div>

      <DealflowCallHistory entityType="applicant" entityId={id} />

      <Section title="Internal HR Notes">
        <NotesEditor id={id} initialNotes={application.notes ?? ""} />
      </Section>

      <Section title="Other applications" description="Applications from the same email address" icon={<Link2 className="size-4" />}>
        {otherApplications.length === 0 ? (
          <Empty>This is the applicant&apos;s only application.</Empty>
        ) : (
          <ul className="divide-y divide-border/40">
            {otherApplications.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/dealflow-ai/careers/applicants/${o.id}`} className="font-medium hover:text-primary">{o.positionTitle}</Link>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  {formatDateTime(o.createdAt)}
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", getCareerApplicationStatusMeta(o.status).badgeClass)}>{getCareerApplicationStatusMeta(o.status).label}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );

  const journey = (
    <div className="space-y-4">
      <Section
        title="Hiring journey"
        description={lead ? `Lead ${lead.code} · current stage: ${lead.stageLabel} · ${lead.status}` : "No lead record is linked to this application yet (created when the applicant registers on the portal)."}
        icon={<Route className="size-4" />}
        action={lead ? <Link href={`/dealflow-ai/leads/${lead.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Open in Lead Management <ExternalLink className="size-3.5" /></Link> : undefined}
      >
        {timeline.length === 0 ? (
          <Empty>No journey events yet.</Empty>
        ) : (
          <ol className="space-y-3 border-l border-border/60 pl-4">
            {timeline.map((e) => (
              <li key={e._id} className="relative text-sm">
                <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary" />
                <p className="font-medium text-foreground">{e.title}</p>
                {e.detail && <p className="text-muted-foreground">{e.detail}</p>}
                <p className="text-[11px] text-muted-foreground">{`${formatDateTime(e.createdAt)} · ${e.actor}${e.visibleToLead ? "" : " · internal"}`}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section
        title="Messages"
        description="Portal conversation and internal staff notes. Reply from Lead Management."
        icon={<MessagesSquare className="size-4" />}
        action={lead ? <Link href={`/dealflow-ai/leads/${lead.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Reply <ExternalLink className="size-3.5" /></Link> : undefined}
      >
        {messages.length === 0 ? (
          <Empty>No messages yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m._id} className={cn("rounded-xl border px-3 py-2 text-sm", m.visibility === "internal" ? "border-amber-500/30 bg-amber-500/5" : m.authorType === "portal" ? "border-primary/30 bg-primary/5" : "border-border/50")}>
                <p className="mb-1 text-[11px] text-muted-foreground">{`${m.authorType === "portal" ? "Applicant" : "Staff"} · ${m.visibility === "internal" ? "internal note" : "portal message"} · ${formatDateTime(m.createdAt)}`}</p>
                <p className="whitespace-pre-wrap">{m.body}</p>
                {m.attachments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {m.attachments.map((a) => (
                      <a key={a.storageKey} href={`/api/lead-messages/files/${encodeURIComponent(a.storageKey)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <FileText className="size-3" /> {a.filename}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );

  const interviewsTab = (
    <Section title="Interview Schedule" description="Slots you add here appear in the applicant's portal and trigger a notification.">
      <InterviewSchedule applicationId={id} initial={interviews} />
    </Section>
  );

  const documents = (
    <Section title="Documents" description="Resume, documents shared on the portal and every message attachment" icon={<FileText className="size-4" />}>
      <ul className="divide-y divide-border/40">
        <li className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{application.resume.filename}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{`Resume · ${kb(application.resume.size)} · submitted by applicant`}</span>
          </span>
          <a href={`/api/careers/applications/${id}/resume`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Download className="size-3.5" />
          </a>
        </li>
        {files.map((f) => (
          <li key={`${f.source}-${f.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{`${f.category} · ${kb(f.size)} · ${f.sharedBy === "applicant" ? "from applicant" : "shared by staff"} · ${formatDateTime(f.createdAt)}`}</span>
            </span>
            <a href={f.href} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <Download className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
      {lead && (
        <Link href={`/dealflow-ai/leads/${lead.id}`} className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Share a new document from Lead Management <ExternalLink className="size-3" />
        </Link>
      )}
    </Section>
  );

  const offerTab = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Offer" icon={<Handshake className="size-4" />} action={offer ? <Link href="/talentos/recruitment" className={buttonVariants({ variant: "outline", size: "sm" })}>Open in TalentOS <ExternalLink className="size-3.5" /></Link> : undefined}>
        {!offer ? (
          <Empty>No offer has been made.</Empty>
        ) : (
          <dl className="divide-y divide-border/40">
            <Row label="Status"><span className="capitalize">{offer.status.replace(/_/g, " ")}</span></Row>
            <Row label="Position">{offer.positionTitle}</Row>
            <Row label="Offer date">{offer.offerDate ?? "—"}</Row>
            <Row label="Proposed joining">{offer.proposedJoiningDate ?? "—"}</Row>
            <Row label="Annual CTC">{seesCompensation ? (offer.annualCtc !== null ? formatCurrency(offer.annualCtc) : "—") : <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="size-3" /> HR only</span>}</Row>
            {offer.notes && seesCompensation && <Row label="Notes">{offer.notes}</Row>}
          </dl>
        )}
      </Section>
      <Section title="Employment" icon={<BadgeCheck className="size-4" />}>
        {!employee ? (
          <Empty>Not converted to an employee.</Empty>
        ) : (
          <dl className="divide-y divide-border/40">
            <Row label="Employee"><Link href={`/talentos/employees/${employee.id}`} className="text-primary hover:underline">{`${employee.name} (${employee.code})`}</Link></Row>
            <Row label="Status"><span className="capitalize">{employee.status.replace(/_/g, " ")}</span></Row>
            <Row label="Joining date">{employee.joiningDate ?? "—"}</Row>
          </dl>
        )}
      </Section>
    </div>
  );

  const accountTab = (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Portal account" icon={<UserCircle2 className="size-4" />}>
          {!account ? (
            <Empty>The applicant has not registered on the portal yet.</Empty>
          ) : (
            <dl className="divide-y divide-border/40">
              <Row label="Login email">{account.email}</Row>
              <Row label="Phone">{account.phone}</Row>
              <Row label="Status"><span className="capitalize">{account.status}{account.locked ? " · temporarily locked" : ""}</span></Row>
              <Row label="Registered">{formatDateTime(account.createdAt)}</Row>
              <Row label="Last login">{account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Never"}</Row>
              <Row label="Password">{account.mustChangePassword ? "Must change on next login" : "Set by applicant"}</Row>
              <Row label="Referral code">{account.referralCode ?? "—"}</Row>
              <Row label="Referred by">{account.referredByCode ?? "—"}</Row>
            </dl>
          )}
        </Section>
        <Section title="Wallet" icon={<Wallet className="size-4" />}>
          {!wallet ? (
            <Empty>No wallet activity.</Empty>
          ) : (
            <dl className="divide-y divide-border/40">
              <Row label="Available credits">{wallet.available}</Row>
              <Row label="Pending">{wallet.pending}</Row>
              <Row label="Lifetime earned">{wallet.lifetimeEarned}</Row>
              <Row label="Lifetime redeemed">{wallet.lifetimeRedeemed}</Row>
              <Row label="Status"><span className="capitalize">{wallet.status}</span></Row>
            </dl>
          )}
        </Section>
      </div>
      <Section title="Portal activity" description="Recent actions by the applicant on the portal (kept 180 days)" icon={<Activity className="size-4" />}>
        {activity.length === 0 ? (
          <Empty>No recorded portal activity.</Empty>
        ) : (
          <ul className="divide-y divide-border/40">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span>
                  <span className="font-medium capitalize">{a.action.replace(/_/g, " ")}</span>
                  {a.summary && <span className="text-muted-foreground">{` · ${a.summary}`}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{`${formatDateTime(a.createdAt)}${a.ip ? ` · ${a.ip}` : ""}`}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dealflow-ai" },
          { label: "Applicants", href: "/dealflow-ai/careers/applicants" },
          { label: application.name },
        ]}
        title={<>{application.name}</>}
        description={<>{`${application.positionTitle} · applied ${formatDateTime(application.createdAt)}${lead ? ` · ${lead.code}` : ""}`}</>}
        actions={<><div className="flex flex-wrap items-center gap-2">
          <DealflowCallButton spec={applicantCallSpec({ _id: id, name: application.name, phone: application.phone, positionTitle: application.positionTitle })} />
          {account ? (
            <LoginAsPortalUserButton
              applicationId={id}
              leadId={lead?.id}
              externalUserId={account.id}
              email={application.email}
              displayName={application.name}
              variant="full"
            />
          ) : (
            // Signing in as someone needs their portal account, which exists once they register on the portal.
            <span
              className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-xs text-muted-foreground"
              title="This applicant has not registered on the portal yet, so there is no account to sign in to."
            >
              No portal account yet
            </span>
          )}
          <CareerStatusBadge status={application.status} />
        </div></>}
      />

      <Tabs
        initial={tab}
        syncParam="tab"
        tabs={[
          { key: "overview", label: "Overview", content: overview },
          { key: "journey", label: `Journey & Messages (${messages.length})`, content: journey },
          { key: "interviews", label: `Interviews (${interviews.length})`, content: interviewsTab },
          { key: "assessments", label: "Assessments", content: <OtsCandidatePanel kind="applicant" id={id} title="Assessments & Screening Tests" /> },
          { key: "documents", label: `Documents (${files.length + 1})`, content: documents },
          { key: "offer", label: "Offer & Employment", content: offerTab },
          { key: "account", label: "Portal Account & Activity", content: accountTab },
        ]}
      />
    </div>
  );
}
