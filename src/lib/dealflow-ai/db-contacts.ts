import "server-only";
import { getDb } from "@/lib/mongodb";
import { isValidCategory } from "@/lib/categories";
import type { PipelineTab, UnifiedPipelineContact } from "./types";

function toIsoString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export async function loadPipelineContactsFromDb(
  pipeline?: PipelineTab
): Promise<UnifiedPipelineContact[]> {
  const db = await getDb();
  const results: UnifiedPipelineContact[] = [];

  // 1. JOBS PIPELINE (Website Career Applications & Job Applicant Lead Records)
  if (!pipeline || pipeline === "jobs") {
    const [careerApps, leadJobs] = await Promise.all([
      db
        .collection("career_applications")
        .find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
      db
        .collection("lead_records")
        .find({ type: "job_applicant", deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
    ]);

    for (const app of careerApps) {
      const id = String(app._id);
      results.push({
        id,
        pipeline: "jobs",
        name: String(app.name || "Unnamed applicant"),
        email: String(app.email || ""),
        phone: String(app.phone || ""),
        titleOrService: String(app.positionTitle || "General application"),
        source: "website",
        sourceLabel: "Website Careers Portal",
        status: String(app.status || "new"),
        statusLabel: String(app.status || "applied").replace(/_/g, " ").toUpperCase(),
        message: app.coverNote ? String(app.coverNote) : undefined,
        resumeUrl: app.resume?.storageKey ? `/api/lead-messages/files/${app.resume.storageKey}` : undefined,
        submittedAt: toIsoString(app.createdAt),
        detailUrl: `/dealflow-ai/careers/applicants/${id}`,
        callEntity: "applicant",
      });
    }

    for (const lead of leadJobs) {
      const id = String(lead._id);
      results.push({
        id,
        pipeline: "jobs",
        name: String(lead.name || "Unnamed applicant"),
        email: String(lead.email || ""),
        phone: String(lead.phone || ""),
        titleOrService: lead.subService ? String(lead.subService) : "Job application",
        source: "website",
        sourceLabel: "Website Careers Portal",
        status: String(lead.stage || "applied"),
        statusLabel: String(lead.stage || "applied").replace(/_/g, " ").toUpperCase(),
        message: lead.message ? String(lead.message) : undefined,
        submittedAt: toIsoString(lead.createdAt),
        detailUrl: `/dealflow-ai/leads/${id}`,
        callEntity: "lead",
        doNotContact: Boolean(lead.doNotContact),
      });
    }
  }

  // 2. INTERNS PIPELINE (Internship Applications from Website / lead_records)
  if (!pipeline || pipeline === "interns") {
    const interns = await db
      .collection("lead_records")
      .find({ type: "intern", deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    for (const intern of interns) {
      const id = String(intern._id);
      results.push({
        id,
        pipeline: "interns",
        name: String(intern.name || "Unnamed applicant"),
        email: String(intern.email || ""),
        phone: String(intern.phone || ""),
        titleOrService: intern.subService ? String(intern.subService) : "Internship",
        source: "website",
        sourceLabel: "Website Internship Portal",
        status: String(intern.stage || "applied"),
        statusLabel: String(intern.stage || "applied").replace(/_/g, " ").toUpperCase(),
        message: intern.message ? String(intern.message) : undefined,
        submittedAt: toIsoString(intern.createdAt),
        detailUrl: `/dealflow-ai/leads/${id}`,
        callEntity: "lead",
        doNotContact: Boolean(intern.doNotContact),
      });
    }
  }

  // 3. TRAINEES PIPELINE (Industrial Training Applications from Website / lead_records)
  if (!pipeline || pipeline === "trainees") {
    const trainees = await db
      .collection("lead_records")
      .find({ type: "trainee", deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    for (const trainee of trainees) {
      const id = String(trainee._id);
      results.push({
        id,
        pipeline: "trainees",
        name: String(trainee.name || "Unnamed applicant"),
        email: String(trainee.email || ""),
        phone: String(trainee.phone || ""),
        titleOrService: trainee.subService ? String(trainee.subService) : "Industrial training",
        source: "website",
        sourceLabel: "Website Training Registration",
        status: String(trainee.stage || "applied"),
        statusLabel: String(trainee.stage || "applied").replace(/_/g, " ").toUpperCase(),
        message: trainee.message ? String(trainee.message) : undefined,
        submittedAt: toIsoString(trainee.createdAt),
        detailUrl: `/dealflow-ai/leads/${id}`,
        callEntity: "lead",
        doNotContact: Boolean(trainee.doNotContact),
      });
    }
  }

  // 4. CLIENTS PIPELINE (Multi-Source Client Inbound: Meta, Facebook, Instagram, Upwork, Google, LinkedIn, Website)
  if (!pipeline || pipeline === "clients") {
    const [leadsCollection, clientLeadRecords] = await Promise.all([
      db
        .collection("leads")
        .find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
      db
        .collection("lead_records")
        .find({ type: "client", deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
    ]);

    for (const lead of leadsCollection) {
      const id = String(lead._id);
      const rawSource = String(lead.source || "website").toLowerCase();

      const SOURCES: [string, RegExp, string][] = [
        ["meta", /meta/, "Meta"],
        ["facebook", /facebook|fb/, "Facebook"],
        ["instagram", /instagram|ig/, "Instagram"],
        ["upwork", /upwork/, "Upwork"],
        ["google", /google/, "Google"],
        ["linkedin", /linkedin/, "LinkedIn"],
      ];
      const hit = SOURCES.find(([, re]) => re.test(rawSource));
      const source = hit ? hit[0] : "website";
      const sourceLabel = hit ? hit[2] : "Website contact form";

      results.push({
        id,
        pipeline: "clients",
        name: String(lead.name || "Unnamed lead"),
        email: String(lead.email || ""),
        phone: String(lead.phone || ""),
        companyOrCollege: lead.company ? String(lead.company) : undefined,
        titleOrService: lead.category ? String(lead.category).replace(/-/g, " ") : "Enquiry",
        source,
        sourceLabel,
        budgetOrSalary: Number(lead.dealValue) > 0 ? `₹${Number(lead.dealValue).toLocaleString("en-IN")}` : undefined,
        status: String(lead.status || "new"),
        statusLabel: String(lead.status || "new").replace(/_/g, " ").toUpperCase(),
        message: lead.message ? String(lead.message) : undefined,
        submittedAt: toIsoString(lead.createdAt),
        // These rows come from the website-form collections, whose page is the submission page (not Lead Management).
        ...(isValidCategory(String(lead.category)) ? { detailUrl: `/dealflow-ai/submissions/${String(lead.category)}/${id}`, callEntity: "submission" as const, submissionCategory: String(lead.category) } : { detailUrl: `/dealflow-ai/leads/${id}` }),
      });
    }

    for (const lead of clientLeadRecords) {
      const id = String(lead._id);
      results.push({
        id,
        pipeline: "clients",
        name: String(lead.name || "Unnamed lead"),
        email: String(lead.email || ""),
        phone: String(lead.phone || ""),
        titleOrService: lead.subService ? String(lead.subService) : "Enquiry",
        source: "website",
        sourceLabel: "Website Business Inbound",
        status: String(lead.stage || "inquiry"),
        statusLabel: String(lead.stage || "inquiry").replace(/_/g, " ").toUpperCase(),
        message: lead.message ? String(lead.message) : undefined,
        submittedAt: toIsoString(lead.createdAt),
        detailUrl: `/dealflow-ai/leads/${id}`,
        callEntity: "lead",
        doNotContact: Boolean(lead.doNotContact),
      });
    }
  }

  // Sort by real submittedAt / createdAt descending
  return results.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}
