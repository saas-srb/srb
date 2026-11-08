"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Phone, Calendar, Briefcase, Download, ExternalLink } from "lucide-react";
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
import CareerStatusBadge from "@/components/products/dealflow-ai/CareerStatusBadge";
import StatusSelect from "@/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/StatusSelect";
import NotesEditor from "@/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/NotesEditor";
import DeleteButton from "@/app/(products)/dealflow-ai/(protected)/careers/applicants/[id]/DeleteButton";
import { DEFAULT_CAREER_APPLICATION_STATUS } from "@/lib/career-application-status";
import type { SerializedCareerApplication } from "@/components/products/dealflow-ai/types";
import { formatDateTime } from "@/lib/utils";

export default function CareerApplicationSheet({
  application,
  open,
  onOpenChange,
}: {
  application: SerializedCareerApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  if (!application) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto">
        <SheetHeader className="border-b border-border/60">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="truncate text-lg">{application.name}</SheetTitle>
            <CareerStatusBadge status={application.status} />
          </div>
          <SheetDescription>{application.positionTitle}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <div className="space-y-2.5 text-sm">
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
              <span>{formatDateTime(application.createdAt)}</span>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Resume</h3>
            <a href={`/api/careers/applications/${application._id}/resume`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download className="size-3.5" data-icon="inline-start" />
              {application.resume.filename}
            </a>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cover Note</h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">{application.coverNote || "No cover note provided."}</p>
          </div>

          <Separator />

          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Status</h3>
            <StatusSelect id={application._id} initialStatus={application.status ?? DEFAULT_CAREER_APPLICATION_STATUS} />
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Internal HR Notes</h3>
            <NotesEditor id={application._id} initialNotes={application.notes ?? ""} />
          </div>
        </div>

        <SheetFooter className="flex-row border-t border-border/60">
          <Link
            href={`/dealflow-ai/careers/applicants/${application._id}`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1" })}
          >
            <ExternalLink className="size-3.5" data-icon="inline-start" />
            Open full page
          </Link>
          <DeleteButton
            id={application._id}
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
