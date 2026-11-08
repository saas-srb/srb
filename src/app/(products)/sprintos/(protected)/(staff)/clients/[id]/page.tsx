import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Mail, Phone, MapPin, CreditCard, Tag } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { ClientStatusBadge, ProjectStatusBadge, PriorityBadge } from "@/components/products/sprintos/StatusBadges";
import ClientActions from "@/components/products/sprintos/ClientActions";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageClients } from "@/lib/pms-roles";
import DoNotContactSwitch from "@/components/products/agentos/calls/DoNotContactSwitch";
import { isClientDoNotContact } from "@/lib/products/sprintos/calls";
import { setClientDoNotContactAction } from "../actions";
import { getClient, serializeClient } from "@/lib/products/sprintos/clients";
import { listProjectsForClient, serializeProject } from "@/lib/products/sprintos/projects";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, client] = await Promise.all([getCurrentPmsUser(), getClient(id)]);
  if (!client) notFound();

  const canManage = user ? canManageClients(user) : false;
  const projects = (await listProjectsForClient(id)).map((p) => serializeProject(p));
  const serialized = serializeClient(client);
  const doNotContact = canManage ? await isClientDoNotContact(id) : false;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos" }, { label: "Clients", href: "/sprintos/clients" }, { label: client.companyName }]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{client.companyName}<ClientStatusBadge status={client.status} /></span></>}
        description={<><span className="font-mono">{client.clientCode}</span>
            {client.industry ? ` · ${client.industry}` : ""}</>}
        actions={<>{canManage && <ClientActions client={serialized} />}</>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard>
          <CardHeader><CardTitle>Primary Contact</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium text-foreground">{client.primaryContact.name}</p>
            {client.primaryContact.designation && <p className="text-muted-foreground">{client.primaryContact.designation}</p>}
            {client.primaryContact.email && (
              <p className="flex items-center gap-2 text-muted-foreground"><Mail className="size-3.5" /> {client.primaryContact.email}</p>
            )}
            {client.primaryContact.phone && (
              <p className="flex items-center gap-2 text-muted-foreground"><Phone className="size-3.5" /> {client.primaryContact.phone}</p>
            )}
            {client.website && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Globe className="size-3.5" />
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                  {client.website.replace(/^https?:\/\//, "")}
                </a>
              </p>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {(client.billing.addressLine || client.billing.city || client.billing.country) && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                <span>{[client.billing.addressLine, client.billing.city, client.billing.country].filter(Boolean).join(", ")}</span>
              </p>
            )}
            {client.billing.gstin && (
              <p className="flex items-center gap-2"><CreditCard className="size-3.5" /> {client.billing.gstin}</p>
            )}
            <p>Currency: <span className="font-medium text-foreground">{client.billing.currency}</span></p>
            {client.billing.paymentTermsDays != null && <p>Payment terms: {client.billing.paymentTermsDays} days</p>}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Meta</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Added {formatDate(serialized.createdAt)}</p>
            <p>Updated {formatDate(serialized.updatedAt)}</p>
            {client.tags.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5">
                <Tag className="size-3.5" />
                {client.tags.map((t) => (
                  <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{t}</span>
                ))}
              </p>
            )}
          </CardContent>
        </GlassCard>
      </div>

      {canManage && <DoNotContactSwitch initial={doNotContact} who={client.primaryContact.name} action={setClientDoNotContactAction.bind(null, id)} />}

      {client.notes && (
        <GlassCard>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">{client.notes}</CardContent>
        </GlassCard>
      )}

      <GlassCard>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Projects ({projects.length})</CardTitle>
          <Link href={`/sprintos/projects/new?clientId=${client._id}`} className="text-sm font-medium text-primary hover:underline">
            + New Project
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects for this client yet.</p>}
          {projects.map((p) => (
            <Link
              key={p._id}
              href={`/sprintos/projects/${p._id}`}
              className="block rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <div className="flex items-center gap-1.5">
                  <PriorityBadge priority={p.priority} />
                  <ProjectStatusBadge status={p.status} />
                </div>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {p.projectCode}
                {p.estimatedBudget != null ? ` · ${formatCurrency(p.estimatedBudget, p.currency)}` : ""}
                {p.endDate ? ` · Due ${formatDate(p.endDate)}` : ""}
              </p>
              <ProgressBar value={p.progressPercent} className="mt-2" />
            </Link>
          ))}
        </CardContent>
      </GlassCard>
    </div>
  );
}
