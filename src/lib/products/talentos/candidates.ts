import "server-only";
import { createApplication, searchApplications, updateApplication, uploadResume } from "@/lib/career-applications";
import { validateApplicationInput, validateApplicationUpdate, validateResumeFile } from "@/lib/career-application-validation";

/**
 * Candidates kept in TalentOS, for a company without DealFlow (which otherwise runs the applications inbox): add one by
 * hand, see them all and move them along, so offers and joining work from an empty start. Same records and checks as
 * the careers page. The caller has already checked that the person may manage recruitment.
 */
export async function addCandidate(form: FormData): Promise<{ ok: true; id: string } | { ok: false; errors: Record<string, string> }> {
  const text = (k: string) => String(form.get(k) ?? "");
  const checked = validateApplicationInput({ name: text("name"), email: text("email"), phone: text("phone"), coverNote: text("coverNote"), source: "Added by HR" });
  const file = form.get("resume");
  const resumeError = !(file instanceof File) || file.size === 0 ? "Attach the resume." : validateResumeFile(file);
  const position = text("positionTitle").trim();
  const errors: Record<string, string> = { ...(checked.valid ? {} : checked.errors), ...(resumeError ? { resume: resumeError } : {}), ...(position ? {} : { positionTitle: "Which role is it for?" }) };
  if (!checked.valid || resumeError || !position) return { ok: false, errors };
  const resume = await uploadResume(file as File);
  const application = await createApplication({ ...checked.data, positionSlug: undefined, positionTitle: position, resume });
  return { ok: true, id: String(application._id) };
}

export async function setCandidateStatus(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const checked = validateApplicationUpdate({ status });
  if (!checked.valid) return { ok: false, error: checked.errors.status ?? "Invalid status." };
  return (await updateApplication(id, checked.data)) ? { ok: true } : { ok: false, error: "Candidate not found." };
}

/** The newest candidates, whatever their status. */
export async function listCandidates(page = 1) {
  const result = await searchApplications({ page, pageSize: 100 });
  return { total: result.total, items: result.items.map((a) => ({ id: String(a._id), name: a.name, positionTitle: a.positionTitle, status: a.status, appliedAt: a.createdAt })) };
}
