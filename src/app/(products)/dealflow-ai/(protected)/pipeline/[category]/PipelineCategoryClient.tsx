"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  MessageSquare,
  Mail,
  Radio,
  FileText,
  DollarSign,
  Building2,
  GraduationCap,
  Sparkles,
  ExternalLink,
  Tag,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PipelineTab, UnifiedPipelineContact } from "@/lib/dealflow-ai/types";
import DealflowCallButton from "@/components/products/dealflow-ai/DealflowCallButton";
import { pipelineCallSpec } from "@/lib/dealflow-ai/call-targets";

function getSourceStyle(source: string) {
  switch (source.toLowerCase()) {
    case "facebook":
      return "bg-blue-600/10 text-blue-600 border-blue-500/30";
    case "instagram":
      return "bg-gradient-to-r from-pink-500/10 to-purple-500/10 text-pink-600 border-pink-500/30";
    case "meta":
      return "bg-blue-500/10 text-blue-600 border-blue-500/30";
    case "upwork":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "website":
    case "website_portal":
      return "bg-purple-500/10 text-purple-600 border-purple-500/30";
    default:
      return "bg-muted text-foreground border-border/60";
  }
}

export default function PipelineCategoryClient({
  category,
  meta,
  initialContacts,
}: {
  category: PipelineTab;
  meta: { label: string; desc: string; icon: string };
  initialContacts: UnifiedPipelineContact[];
}) {
  const [contacts] = useState<UnifiedPipelineContact[]>(initialContacts);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const filtered = contacts.filter((c) => {
    if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.titleOrService.toLowerCase().includes(q) ||
        (c.companyOrCollege && c.companyOrCollege.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search & Source Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${category} by name, email, skill, or source...`}
            className="rounded-xl pl-9 text-xs"
          />
        </div>

        {category === "clients" && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-1 text-xs">
            <span className="px-2 text-[11px] font-bold uppercase text-muted-foreground">Source:</span>
            {["all", "facebook", "instagram", "upwork", "website"].map((src) => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-semibold uppercase tracking-wider text-[10px] transition-colors",
                  sourceFilter === src
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {src}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contacts List Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-border/60 bg-card p-12 text-center text-muted-foreground">
            No contacts found in {meta.label}.
          </div>
        ) : (
          filtered.map((contact) => (
            <div
              key={contact.id}
              className="flex flex-col justify-between rounded-3xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md space-y-4"
            >
              <div>
                {/* Header with Source Badge & Status */}
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-3">
                  <div>
                    <Link
                      href={contact.detailUrl || (category === "jobs" ? `/dealflow-ai/careers/applicants/${contact.id}` : `/dealflow-ai/leads/${contact.id}`)}
                      className="text-base font-black text-foreground hover:text-primary transition-colors hover:underline inline-flex items-center gap-1.5"
                    >
                      {contact.name}
                      <ExternalLink className="size-3 opacity-60" />
                    </Link>
                    <p className="text-xs text-muted-foreground">{contact.email} · {contact.phone}</p>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                      Submitted: {new Date(contact.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {/* Source Attribution Badge */}
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
                        getSourceStyle(contact.source)
                      )}
                    >
                      {contact.sourceLabel}
                    </span>

                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
                      {contact.statusLabel}
                    </span>
                  </div>
                </div>

                {/* Body Details */}
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {category === "clients" ? "Inquired Service:" : "Position / Track:"}
                    </span>
                    <strong className="text-foreground">{contact.titleOrService}</strong>
                  </div>

                  {contact.companyOrCollege && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {category === "clients" ? "Company:" : "College / Current Org:"}
                      </span>
                      <span className="font-semibold text-foreground">{contact.companyOrCollege}</span>
                    </div>
                  )}

                  {contact.budgetOrSalary && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {category === "clients" ? "Project Budget:" : "Expected Stipend / CTC:"}
                      </span>
                      <strong className="text-emerald-600 font-bold">{contact.budgetOrSalary}</strong>
                    </div>
                  )}

                  {/* Campaign details if from Meta / FB / IG */}
                  {contact.campaignInfo && (
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-2.5 text-[11px] space-y-1">
                      <div className="text-muted-foreground">
                        Campaign: <strong className="text-foreground">{contact.campaignInfo.campaignName}</strong>
                      </div>
                      {contact.campaignInfo.adName && (
                        <div className="text-muted-foreground">
                          Ad Creative: <span className="text-foreground">{contact.campaignInfo.adName}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {contact.message && (
                    <div className="rounded-xl bg-muted/30 p-2.5 text-muted-foreground leading-relaxed italic">
                      "{contact.message}"
                    </div>
                  )}

                  {contact.skills && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {contact.skills.map((s) => (
                        <span key={s} className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">

                <div className="flex items-center gap-1.5">
                  <Link
                    href={contact.detailUrl || (category === "jobs" ? `/dealflow-ai/careers/applicants/${contact.id}` : `/dealflow-ai/leads/${contact.id}`)}
                    className="inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                  >
                    <ExternalLink className="size-3" /> Details
                  </Link>

                  <Link
                    href={`/dealflow-ai/messages?lead=${contact.id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    <MessageSquare className="size-3 text-primary" /> Chat
                  </Link>

                  <Link
                    href={`/dealflow-ai/emails?lead=${contact.id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    <Mail className="size-3 text-purple-600" /> Email
                  </Link>

                  <Link
                    href={`/dealflow-ai/whatsapp?lead=${contact.id}`}
                    className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    <Radio className="size-3 text-emerald-600" /> WhatsApp
                  </Link>

                  {(() => {
                    const spec = pipelineCallSpec({ ...contact, pipeline: category });
                    return spec ? <DealflowCallButton spec={spec} size="sm" className="rounded-xl" /> : null;
                  })()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
