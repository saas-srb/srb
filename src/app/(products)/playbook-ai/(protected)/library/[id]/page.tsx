import PanelTabs from "@/components/platform/panel/PanelTabs";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { panelNameMap } from "@/lib/platform/panels/store";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Archive, FilePenLine, GitCompare, Info, Pencil, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { AssignmentStateBadge, ConfidentialityBadge, PriorityBadge, SopStatusBadge } from "@/components/products/playbook-ai/SopBadges";
import SopDocument, { documentOutline, sectionAnchor, type DocFile } from "@/components/products/playbook-ai/SopDocument";
import AckPanel from "@/components/products/playbook-ai/AckPanel";
import ViewTracker from "@/components/products/playbook-ai/ViewTracker";
import SopActions from "@/components/products/playbook-ai/SopActions";
import PublishDialog from "@/components/products/playbook-ai/PublishDialog";
import AssignDialog, { type AssignOptions } from "@/components/products/playbook-ai/AssignDialog";
import AssignmentsPanel, { type AssignmentRow } from "@/components/products/playbook-ai/AssignmentsPanel";
import VersionsPanel, { type VersionRow } from "@/components/products/playbook-ai/VersionsPanel";
import FeedbackPanel, { type FeedbackRow } from "@/components/products/playbook-ai/FeedbackPanel";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getReadableSop, listVersions, listVisibleSummaries } from "@/lib/products/playbook-ai/sops";
import {
  canArchiveSop,
  canAssignSop,
  canDeleteDraftSop,
  canDownloadSop,
  canEditSop,
  canPublishSop,
  canRestoreSop,
  canAcknowledgeSop,
  inWriteScope,
  toAccessDoc,
} from "@/lib/products/playbook-ai/access";
import { sopCan } from "@/lib/sop-roles";
import { todayIso, addDaysIso } from "@/lib/products/playbook-ai/db";
import { formatIsoDate, SOP_MODULES } from "@/lib/products/playbook-ai/constants";
import { listSopFiles } from "@/lib/products/playbook-ai/files";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { getSettings } from "@/lib/products/playbook-ai/settings";
import { listHrmsDesignations, listHrmsTeams, listAssignablePeople, userNames } from "@/lib/products/playbook-ai/people";
import { assignmentState, checklistProgress, countAssignments, getAssignment, listAssignmentsForSop } from "@/lib/products/playbook-ai/assignments";
import { listFeedback, listOwnFeedback } from "@/lib/products/playbook-ai/feedback";
import { cn, formatDateTime } from "@/lib/utils";

const TABS = ["document", "details", "versions", "assignments", "feedback"] as const;
type Tab = (typeof TABS)[number];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children || "—"}</dd>
    </div>
  );
}

export default async function SopDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const panelName = await panelNameMap();
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const { id } = await params;
  const sp = await searchParams;

  const found = await getReadableSop(viewer, id);
  if (!found) notFound();
  const { doc, assigned, status } = found;
  const today = todayIso();
  const acc = toAccessDoc(doc, today);
  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };

  const canEdit = canEditSop(viewer, acc);
  const canPublish = canPublishSop(viewer, acc);
  const canAssign = canAssignSop(viewer, acc);
  const canMonitor = sopCan(ctx, "ASSIGN") && inWriteScope(viewer, acc) && !!doc.version;
  const canDownload = canDownloadSop(viewer, acc, assigned);
  const canAck = canAcknowledgeSop(viewer, acc, assigned);
  const canArchive = canArchiveSop(viewer, acc);
  const canRestore = canRestoreSop(viewer, acc);
  const canDiscard = canDeleteDraftSop(viewer, acc);

  const tabParam = TABS.find((t) => t === sp.tab) ?? "document";
  const tab: Tab = tabParam === "assignments" && !canMonitor ? "document" : tabParam;

  const showDraft = (sp.view === "draft" && canEdit) || !doc.live;
  const content = showDraft ? doc.draft : (doc.live ?? doc.draft);

  const [tax, filesRaw, myAssign, settings] = await Promise.all([getTaxonomy(), listSopFiles(id), getAssignment(id, viewer.userId), getSettings()]);
  const files: DocFile[] = filesRaw.map((f) => ({ id: f._id, filename: f.filename, size: f.size, kind: f.kind }));
  const dept = tax.departments.find((d) => d._id === doc.departmentId);
  const fn = tax.functions.find((f) => f._id === doc.functionId);
  const proc = tax.processes.find((p) => p._id === doc.processId);
  const sub = tax.processes.find((p) => p._id === doc.subProcessId);
  const cat = tax.categories.find((c) => c._id === doc.categoryId);
  const names = await userNames([doc.ownerId, doc.authorId]);
  const outline = documentOutline(content);

  const checklistState = myAssign?.checklist ?? {};
  const progress = checklistProgress(showDraft ? doc.draft : doc.live, checklistState);
  const assignedCount = canPublish && doc.live ? await countAssignments(id) : 0;
  const versionRows = tab === "versions" || tab === "details" ? await listVersions(id) : [];

  // --- tab-specific data ---------------------------------------------------
  let assignmentRows: AssignmentRow[] = [];
  let assignOptions: AssignOptions | null = null;
  if (canMonitor && (tab === "assignments" || canAssign)) {
    const rows = await listAssignmentsForSop(id);
    assignmentRows = rows.map((a) => ({
      userId: a.userId,
      userName: a.userName,
      departmentName: a.departmentId ? tax.departments.find((d) => d._id === a.departmentId)?.name ?? "—" : "—",
      source: a.source.label,
      dueDate: a.dueDate,
      viewedAt: a.viewedAt ? a.viewedAt.toISOString() : null,
      acknowledgedAt: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null,
      acknowledgedVersion: a.acknowledgedVersion,
      state: assignmentState(a, today),
      checklist: (() => {
        const p = checklistProgress(doc.live, a.checklist);
        return p.total ? `${p.done}/${p.total}` : "—";
      })(),
    }));
  }
  if (canAssign && tab === "assignments") {
    const [{ people }, teams, designations] = await Promise.all([listAssignablePeople(), listHrmsTeams(), listHrmsDesignations()]);
    const deptName = new Map(tax.departments.map((d) => [d.hrmsDepartmentId ?? "", d.name]));
    assignOptions = {
      people: people.map((p) => ({ id: p.userId, label: p.name, sub: p.email })),
      teams: teams.map((t) => ({ id: t._id, label: t.name, sub: deptName.get(t.departmentId) ?? "" })),
      departments: tax.departments.filter((d) => d.active && d.hrmsDepartmentId).map((d) => ({ id: d._id, label: d.name, sub: d.code })),
      roles: designations.map((d) => ({ id: d._id, label: d.title, sub: deptName.get(d.departmentId) ?? "" })),
    };
  }

  let feedbackRows: FeedbackRow[] = [];
  if (tab === "feedback") {
    const rows = canEdit ? await listFeedback(id) : await listOwnFeedback(id, viewer.userId);
    feedbackRows = rows.map((r) => ({
      id: r._id,
      kind: r.kind,
      message: r.message,
      userName: r.userName,
      version: r.version,
      status: r.status,
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt.toISOString(),
      mine: r.userId === viewer.userId,
    }));
  }

  let related: { id: string; code: string; title: string }[] = [];
  let roleTitles: string[] = [];
  if (tab === "details") {
    if (content.relatedSopIds.length) {
      const visible = await listVisibleSummaries(viewer);
      related = visible.filter((s) => content.relatedSopIds.includes(s._id)).map((s) => ({ id: s._id, code: s.code, title: s.title }));
    }
    if (doc.applicableRoleIds.length) {
      const d = await listHrmsDesignations();
      roleTitles = d.filter((x) => doc.applicableRoleIds.includes(x._id)).map((x) => x.title);
    }
  }

  const tabLink = (t: Tab) => `/playbook-ai/library/${id}${t === "document" ? "" : `?tab=${t}`}`;
  const tabLabels: Record<Tab, string> = { document: "Document", details: "Details", versions: `Versions${versionRows.length ? ` (${versionRows.length})` : ""}`, assignments: "Assignments", feedback: "Feedback" };
  const visibleTabs = TABS.filter((t) => t !== "assignments" || canMonitor);

  return (
    <div className="space-y-4">
      <div className="sop-print-hide">
      </div>
      {doc.live && !showDraft && <ViewTracker sopId={id} />}

      <PanelPageHeader
        title={<>{content.title}</>}
        description={<>{dept?.name ?? "Unknown department"}
            {fn ? ` › ${fn.name}` : ""}
            {proc ? ` › ${proc.name}` : ""}
            {sub ? ` › ${sub.name}` : ""}
            {" · "}Owner {names.get(doc.ownerId) ?? "—"}</>}
        eyebrow={<><div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{doc.code}</span>
            <SopStatusBadge status={status} />
            {doc.version && <Badge className="bg-primary/10 text-primary">v{doc.version}</Badge>}
            <ConfidentialityBadge level={doc.confidentiality} />
            <PriorityBadge priority={doc.priority} />
            {doc.mandatory && <Badge className="bg-destructive/15 text-destructive">Mandatory</Badge>}
          </div></>}
        actions={<><div className="sop-print-hide flex flex-wrap items-center gap-2">
          {canEdit && (
            <Link href={`/playbook-ai/library/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Pencil className="size-3.5" data-icon="inline-start" />
              Edit
            </Link>
          )}
          {canPublish && (!doc.live || doc.hasUnpublishedChanges) && (
            <PublishDialog sopId={id} currentVersion={doc.version} reackDefault={settings.reackOnNewVersion} assignedCount={assignedCount} />
          )}
          {canAssign && (
            <Link href={tabLink("assignments")} className={buttonVariants({ variant: "outline", size: "sm" })}>Assignments</Link>
          )}
          <SopActions sopId={id} canArchive={canArchive} canRestore={canRestore} canDiscard={canDiscard} canPrint={canDownload && !!doc.live} />
        </div></>}
      />

      {status === "expired" && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>This SOP expired on <strong>{formatIsoDate(doc.expiryDate)}</strong>. Its content may be out of date — check with the owner before relying on it.</span>
        </div>
      )}
      {status === "archived" && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-slate-500/30 bg-slate-500/10 px-4 py-3 text-sm">
          <Archive className="mt-0.5 size-4 shrink-0" />
          <span>This SOP is archived and hidden from the library for readers.</span>
        </div>
      )}
      {showDraft && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm">
          <FilePenLine className="mt-0.5 size-4 shrink-0 text-blue-600" />
          <span>
            {doc.live ? <>You are previewing the <strong>unpublished draft</strong>. Readers see v{doc.version}. </> : <>This SOP is a <strong>draft</strong> — only people who can edit it can see it. </>}
            {doc.live && <Link href={`/playbook-ai/library/${id}`} className="font-medium text-primary hover:underline">View published version</Link>}
          </span>
        </div>
      )}
      {!showDraft && canEdit && doc.hasUnpublishedChanges && (
        <div className="sop-print-hide flex flex-wrap items-center gap-2.5 rounded-2xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm">
          <Info className="size-4 shrink-0 text-blue-600" />
          <span className="min-w-0 flex-1">This SOP has unpublished changes that readers can&apos;t see yet.</span>
          <Link href={`/playbook-ai/library/${id}?view=draft`} className="font-medium text-primary hover:underline">Preview draft</Link>
        </div>
      )}

      <div className="sop-print-hide flex flex-wrap items-center justify-between gap-3">
        <PanelTabs label="SOP sections" active={tab} tabs={visibleTabs.map((t) => ({ key: t, label: tabLabels[t], href: tabLink(t) }))} />
        {sopCan(ctx, "VIEW_AUDIT") && (
          <Link href={`/commandos/settings/audit-log?source=products&module=sop&search=${id}`} className="flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <ScrollText className="size-3.5" />
            Audit trail
          </Link>
        )}
      </div>

      {tab === "document" && (
        <div className="space-y-4">
          {canAck && !showDraft && doc.version && (
            <div className="sop-print-hide">
              <AckPanel
                sopId={id}
                version={doc.version}
                mandatory={doc.mandatory}
                dueDate={myAssign?.dueDate ?? null}
                acknowledgedAt={myAssign?.acknowledgedAt ? myAssign.acknowledgedAt.toISOString() : null}
                acknowledgedVersion={myAssign?.acknowledgedVersion ?? null}
                openChecklistItems={progress.total - progress.done}
              />
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <GlassCard interactive={false}>
              <CardContent className="p-5 sm:p-6">
                <SopDocument
                  content={content}
                  sopId={id}
                  files={files}
                  canDownload={canDownload}
                  checklist={checklistState}
                  checklistInteractive={canAck && !showDraft}
                />
                {doc.version && !showDraft && (
                  <p className="mt-6 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                    {doc.code} · v{doc.version}
                    {doc.publishedAt ? ` · published ${formatDateTime(doc.publishedAt)}` : ""}
                    {doc.effectiveDate ? ` · effective ${formatIsoDate(doc.effectiveDate)}` : ""}
                    {doc.reviewDate ? ` · review by ${formatIsoDate(doc.reviewDate)}` : ""}
                  </p>
                )}
              </CardContent>
            </GlassCard>
            {outline.length > 1 && (
              <aside className="sop-print-hide hidden lg:block">
                <div className="sticky top-2 rounded-2xl border border-border/40 bg-background/80 p-3 backdrop-blur-md">
                  <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">On this page</p>
                  <ul className="space-y-0.5 text-sm">
                    {outline.map((o) => (
                      <li key={o.id}>
                        <a href={`#${sectionAnchor(o.id)}`} className="block truncate rounded px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">{o.title}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
          </div>
        </div>
      )}

      {tab === "details" && (
        <GlassCard interactive={false}>
          <CardContent className="space-y-6 p-5">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="SOP ID"><span className="font-mono">{doc.code}</span></Field>
              <Field label="Version">{doc.version ? `v${doc.version}` : "Not published"}</Field>
              <Field label="Status"><SopStatusBadge status={status} /></Field>
              <Field label="Department">{dept?.name}</Field>
              <Field label="Function">{fn?.name}</Field>
              <Field label="Process">{[proc?.name, sub?.name].filter(Boolean).join(" › ")}</Field>
              <Field label="Category">{cat?.name}</Field>
              <Field label="Owner">{names.get(doc.ownerId)}</Field>
              <Field label="Author">{names.get(doc.authorId)}</Field>
              <Field label="Applicable roles">{roleTitles.length ? roleTitles.join(", ") : "All roles"}</Field>
              <Field label="Effective date">{formatIsoDate(doc.effectiveDate)}</Field>
              <Field label="Review date">{formatIsoDate(doc.reviewDate)}</Field>
              <Field label="Expiry date">{formatIsoDate(doc.expiryDate)}</Field>
              <Field label="Priority"><PriorityBadge priority={doc.priority} /></Field>
              <Field label="Confidentiality"><ConfidentialityBadge level={doc.confidentiality} /></Field>
              <Field label="Downloads">{doc.allowDownload ? "Allowed" : "Not allowed"}</Field>
              <Field label="Tags">
                {doc.tags.length ? <span className="flex flex-wrap gap-1">{doc.tags.map((t) => <Badge key={t} className="bg-muted text-muted-foreground">#{t}</Badge>)}</span> : null}
              </Field>
              <Field label="Created">{formatDateTime(doc.createdAt)}</Field>
            </dl>
            {content.moduleLinks.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-sm font-bold">Linked products</h3>
                <ul className="flex flex-wrap gap-2">
                  {content.moduleLinks.map((m, i) => (
                    <li key={i}>
                      <a href={m.url} target={m.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs hover:bg-muted">
                        <span className="font-semibold">{panelName(m.module, SOP_MODULES.find((x) => x.value === m.module)?.label)}</span>
                        <span className="text-muted-foreground">{m.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {related.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-sm font-bold">Related SOPs</h3>
                <ul className="space-y-1 text-sm">
                  {related.map((r) => (
                    <li key={r.id}><Link href={`/playbook-ai/library/${r.id}`} className="text-primary hover:underline"><span className="mr-2 font-mono text-xs text-muted-foreground">{r.code}</span>{r.title}</Link></li>
                  ))}
                </ul>
              </div>
            )}
            {content.relatedPolicies.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-sm font-bold">Related policies</h3>
                <ul className="space-y-1 text-sm">
                  {content.relatedPolicies.map((p, i) => (
                    <li key={i}>{p.url ? <a href={p.url} target={p.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer nofollow" className="text-primary hover:underline">{p.title}</a> : p.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {filesRaw.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-sm font-bold">Attachments</h3>
                <ul className="space-y-1 text-sm">
                  {filesRaw.map((f) => (
                    <li key={f._id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">{f.filename}</span>
                      {canDownload ? <a href={`/api/playbook-ai/files/${f._id}?download=1`} className="shrink-0 text-xs text-primary hover:underline">Download</a> : <span className="shrink-0 text-xs text-muted-foreground">Download not permitted</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </GlassCard>
      )}

      {tab === "versions" && (
        <GlassCard interactive={false}>
          <CardContent className="p-5">
            <VersionsPanel
              sopId={id}
              canEdit={canEdit}
              canCompare={canEdit || canMonitor}
              rows={versionRows.map<VersionRow>((v) => ({
                version: v.version,
                previousVersion: v.previousVersion,
                changeType: v.changeType,
                changeSummary: v.changeSummary,
                authorName: v.authorName,
                publishedAt: v.publishedAt.toISOString(),
                isCurrent: v.version === doc.version,
              }))}
            />
            {(canEdit || canMonitor) && versionRows.length > 1 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><GitCompare className="size-3.5" />Published versions are immutable — restoring copies one into the draft; publishing creates a new version.</p>
            )}
          </CardContent>
        </GlassCard>
      )}

      {tab === "assignments" && canMonitor && (
        <GlassCard interactive={false}>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">Assignments & acknowledgements</h2>
                <p className="text-xs text-muted-foreground">Track who has been assigned, viewed and acknowledged v{doc.version}.</p>
              </div>
              {canAssign && assignOptions && <AssignDialog sopId={id} options={assignOptions} defaultDueDate={addDaysIso(today, settings.defaultDueDays)} />}
            </div>
            {myAssign && <div className="flex items-center gap-2 text-xs text-muted-foreground">You: <AssignmentStateBadge state={assignmentState(myAssign, today)} /></div>}
            <AssignmentsPanel sopId={id} rows={assignmentRows} canManage={canAssign} />
          </CardContent>
        </GlassCard>
      )}

      {tab === "feedback" && (
        <GlassCard interactive={false}>
          <CardContent className="p-5">
            <FeedbackPanel sopId={id} rows={feedbackRows} canResolve={canEdit} />
          </CardContent>
        </GlassCard>
      )}
    </div>
  );
}
