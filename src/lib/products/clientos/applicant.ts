import "server-only";
import { getApplication } from "@/lib/career-applications";
import { getOfferByApplication, serializeOffer, type SerializedOffer } from "@/lib/products/talentos/offers";
import { CAREER_APPLICATION_STATUSES, type CareerApplicationStatus } from "@/lib/career-application-status";
import { listInterviewsForApplication, type SerializedInterview } from "@/lib/products/clientos/interviews";

/**
 * Job-applicant portal data — assembled live from `career_applications`,
 * `hrms_offers` and `portal_interviews`. Nothing here is editable by the
 * applicant; it reflects whatever recruitment staff set in the LMS/HRMS products.
 */

export interface HiringStep {
  key: CareerApplicationStatus;
  label: string;
  state: "done" | "current" | "upcoming" | "skipped";
}

// The linear happy path. `rejected` is terminal and handled separately.
const PIPELINE: CareerApplicationStatus[] = [
  "new",
  "under_review",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "hired",
];

export interface ApplicantOverview {
  applicationId: string;
  applicantName: string;
  positionTitle: string;
  positionSlug: string | null;
  status: CareerApplicationStatus;
  rejected: boolean;
  appliedOn: string;
  lastUpdate: string;
  recruiterNote: string | null;
  timeline: HiringStep[];
  offer: SerializedOffer | null;
  interviews: SerializedInterview[];
  upcomingInterviews: SerializedInterview[];
  requiredDocuments: { name: string; provided: boolean; note?: string }[];
  hasResume: boolean;
  resumeName: string | null;
}

export async function getApplicantOverview(applicationId: string): Promise<ApplicantOverview | null> {
  const app = await getApplication(applicationId);
  if (!app) return null;

  const status = app.status as CareerApplicationStatus;
  const rejected = status === "rejected";

  const [offer, interviews] = await Promise.all([
    getOfferByApplication(applicationId).catch(() => null),
    listInterviewsForApplication(applicationId).catch(() => [] as SerializedInterview[]),
  ]);

  const currentIdx = rejected ? -1 : PIPELINE.indexOf(status);
  const timeline: HiringStep[] = PIPELINE.map((key, i) => {
    const label = CAREER_APPLICATION_STATUSES.find((s) => s.value === key)?.label ?? key;
    let state: HiringStep["state"];
    if (rejected) state = i === 0 ? "done" : "skipped";
    else if (i < currentIdx) state = "done";
    else if (i === currentIdx) state = "current";
    else state = "upcoming";
    return { key, label, state };
  });

  const now = Date.now();
  const upcomingInterviews = interviews.filter(
    (iv) => iv.status === "scheduled" && new Date(iv.scheduledAt).getTime() >= now
  );

  return {
    applicationId,
    applicantName: app.name,
    positionTitle: app.positionTitle || "General Application",
    positionSlug: app.positionSlug ?? null,
    status,
    rejected,
    appliedOn: app.createdAt.toISOString(),
    lastUpdate: app.updatedAt.toISOString(),
    recruiterNote: app.notes?.trim() || null,
    timeline,
    offer: offer ? serializeOffer(offer) : null,
    interviews,
    upcomingInterviews,
    requiredDocuments: [
      { name: "Résumé / CV", provided: Boolean(app.resume?.storageKey) },
      { name: "Government photo ID", provided: false, note: "Bring to your first interview" },
      { name: "Latest qualification certificate", provided: false },
      { name: "Experience / relieving letters", provided: false, note: "If applicable" },
    ],
    hasResume: Boolean(app.resume?.storageKey),
    resumeName: app.resume?.filename ?? null,
  };
}
