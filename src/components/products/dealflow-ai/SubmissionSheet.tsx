"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Phone, Calendar, Tag, Download, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import StatusBadge from "@/components/products/dealflow-ai/StatusBadge";
import StatusSelect from "@/app/(products)/dealflow-ai/(protected)/submissions/[category]/[id]/StatusSelect";
import NotesEditor from "@/app/(products)/dealflow-ai/(protected)/submissions/[category]/[id]/NotesEditor";
import DeleteButton from "@/app/(products)/dealflow-ai/(protected)/submissions/[category]/[id]/DeleteButton";
import DealValueEditor from "@/app/(products)/dealflow-ai/(protected)/submissions/[category]/[id]/DealValueEditor";
import { categoryAcceptsResume, getCategoryLabel, type CategorySlug } from "@/lib/categories";
import { DEFAULT_LEAD_STATUS } from "@/lib/lead-status";
import { getLeadSourceLabel } from "@/lib/lead-sources";
import type { SerializedLead } from "@/components/products/dealflow-ai/types";
import { formatDateTime } from "@/lib/utils";

export default function SubmissionSheet({
  lead,
  open,
  onOpenChange,
}: {
  lead: SerializedLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  if (!lead) return null;
  const category = lead.category as CategorySlug;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto">
        <SheetHeader className="border-b border-border/60">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="truncate text-lg">{lead.name}</SheetTitle>
            <StatusBadge status={lead.status} />
          </div>
          <SheetDescription>{getCategoryLabel(category)}{lead.subService ? ` · ${lead.subService}` : ""}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="size-4 shrink-0 text-muted-foreground" />
              {lead.email ? <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a> : <span className="text-muted-foreground">Not provided</span>}
            </div>
            <div className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-muted-foreground" />
              <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="size-4 shrink-0 text-muted-foreground" />
              <span>{getCategoryLabel(category)}{lead.subService ? ` · ${lead.subService}` : ""}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="size-4 shrink-0 text-muted-foreground" />
              <span>{formatDateTime(lead.createdAt)}</span>
            </div>
          </div>

          <Separator />

          {categoryAcceptsResume(category) ? (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Resume</h3>
              {lead.resume ? (
                <a href={`/api/leads/${category}/${lead._id}/resume`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Download className="size-3.5" data-icon="inline-start" />
                  {lead.resume.filename}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">No resume uploaded.</p>
              )}
            </div>
          ) : (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Project Details</h3>
              <p className="whitespace-pre-wrap text-sm text-foreground">{lead.message || "No message provided."}</p>
            </div>
          )}

          <Separator />

          {(lead.campaign || (lead.source && lead.source !== "contact-page" && lead.source !== "homepage-hero")) && (
            <>
              <div className="space-y-1 text-sm">
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Attribution</h3>
                <p><span className="text-muted-foreground">Source:</span> {getLeadSourceLabel(lead.source)}</p>
                {lead.campaign && <p><span className="text-muted-foreground">Campaign:</span> {lead.campaign}</p>}
              </div>
              <Separator />
            </>
          )}

          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Status</h3>
            <StatusSelect category={category} id={lead._id} initialStatus={lead.status ?? DEFAULT_LEAD_STATUS} />
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Deal Value</h3>
            <DealValueEditor category={category} id={lead._id} initialValue={lead.dealValue ?? null} />
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Internal Notes</h3>
            <NotesEditor category={category} id={lead._id} initialNotes={lead.notes ?? ""} />
          </div>
        </div>

        <SheetFooter className="flex-row border-t border-border/60">
          <Link
            href={`/dealflow-ai/submissions/${category}/${lead._id}`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1" })}
          >
            <ExternalLink className="size-3.5" data-icon="inline-start" />
            Open full page
          </Link>
          <DeleteButton
            category={category}
            id={lead._id}
            onDeleted={() => {
              onOpenChange(false);
              router.refresh();
            }}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
