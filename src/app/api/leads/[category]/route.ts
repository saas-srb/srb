import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { isAuthorizedLmsRequest } from "@/lib/api-auth";
import {
  CATEGORIES,
  createLead,
  getSubServices,
  isValidCategory,
  listLeads,
  uploadResume,
  validateLeadInput,
  validateResumeFile,
} from "@/lib/leads";
import { provisionLeadAndAccount } from "@/lib/lead-management/provision";
import { CATEGORY_TO_SOURCE } from "@/lib/lead-management/types";
import { getLeadCategories, type LeadCategoryConfig } from "@/lib/lead-categories";
import type { CategorySlug } from "@/lib/categories";
import { createPortalSession, setPortalSessionCookie } from "@/lib/portal-auth";

type Context = { params: Promise<{ category: string }> };

/**
 * The category being submitted to: the operator's built-in six, or — for every other company — one of that company's own categories.
 * `custom` is null for the built-in ones (their rules are unchanged).
 */
async function resolveCategory(slug: string): Promise<{ slug: CategorySlug; custom: LeadCategoryConfig | null; allowed: string } | null> {
  const set = await getLeadCategories();
  if (!set.custom) return isValidCategory(slug) ? { slug, custom: null, allowed: CATEGORIES.map((c) => c.slug).join(", ") } : null;
  const found = set.categories.find((c) => c.slug === slug);
  // The slug is a company-chosen string, not one of the built-in literals: the data layer only uses it to name the collection.
  if (found) return { slug: found.slug as CategorySlug, custom: found, allowed: "" };
  // Forms built into the site's own sections (product demo, catalogue enquiry) post to a built-in slug; for a company they land
  // in its first category, with the service it chose left out rather than rejected.
  const first = set.categories[0];
  return first ? { slug: first.slug as CategorySlug, custom: { ...first, subServices: [] }, allowed: "" } : null;
}

async function handlePOST(req: NextRequest, { params }: Context) {
  const limited = await limitOr429(req, "lead-submit", 10, 600);
  if (limited) return limited;
  const { category: categoryParam } = await params;
  const resolved = await resolveCategory(categoryParam);
  if (!resolved) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  const category = resolved.slug;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart form data." }, { status: 400 });
  }

  const validation = validateLeadInput({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    message: formData.get("message"),
    subService: formData.get("subService"),
    source: formData.get("source"),
    utmSource: formData.get("utmSource"),
    utmMedium: formData.get("utmMedium"),
    utmCampaign: formData.get("utmCampaign"),
    utmContent: formData.get("utmContent"),
    utmTerm: formData.get("utmTerm"),
  });
  if (!validation.valid) {
    return NextResponse.json({ error: "Validation failed.", fields: validation.errors }, { status: 422 });
  }

  // A company's own category may have no sub-services at all (then none is asked for or stored).
  const validSubServices = resolved.custom ? resolved.custom.subServices : getSubServices(category);
  if (resolved.custom && validSubServices.length === 0) {
    validation.data.subService = undefined;
  } else if (!validation.data.subService || !validSubServices.some((s) => s.slug === validation.data.subService)) {
    return NextResponse.json(
      { error: "Validation failed.", fields: { subService: "Please choose a specific service." } },
      { status: 422 }
    );
  }

  const resumeEntry = formData.get("resume");
  let resume: Awaited<ReturnType<typeof uploadResume>> | undefined;
  if (resumeEntry instanceof File && resumeEntry.size > 0) {
    const resumeError = validateResumeFile(resumeEntry);
    if (resumeError) {
      return NextResponse.json({ error: "Validation failed.", fields: { resume: resumeError } }, { status: 422 });
    }
    try {
      resume = await uploadResume(resumeEntry);
    } catch (err) {
      console.error("Failed to upload resume", err);
      return NextResponse.json({ error: "Failed to upload resume. Please try again." }, { status: 500 });
    }
  }

  try {
    const lead = await createLead(category, { ...validation.data, resume });

    // Lead-driven portal: every inquiry becomes a Lead + a portal account the
    // visitor is immediately signed into. Needs an email to own the account.
    let portal: { redirect: string; isNewAccount: boolean; tempPassword: string | null } | undefined;
    if (validation.data.email) {
      try {
        const result = await provisionLeadAndAccount({
          source: CATEGORY_TO_SOURCE[category] ?? "client_inquiry",
          name: validation.data.name,
          email: validation.data.email,
          phone: validation.data.phone,
          subService: validation.data.subService ?? null,
          message: validation.data.message ?? null,
          sourceRef: { kind: "category_lead", category, id: String(lead._id) },
          referralCode: typeof formData.get("referralCode") === "string" ? String(formData.get("referralCode")) : null,
        });
        // Only a brand-new account is signed in automatically. An email that already has an account is NOT proof of identity —
        // logging the submitter in would let anyone take over (and spend the wallet of) any user whose email they know.
        if (result.isNewAccount) {
          const { token } = await createPortalSession(result.externalUserId, false);
          await setPortalSessionCookie(token, false);
        }
        portal = { redirect: result.isNewAccount ? "/clientos" : "/login", isNewAccount: result.isNewAccount, tempPassword: result.tempPassword };
      } catch (provErr) {
        console.error("Lead provisioning failed (submission still saved)", provErr);
      }
    }

    return NextResponse.json({ data: lead, portal }, { status: 201 });
  } catch (err) {
    console.error("Failed to create lead", err);
    return NextResponse.json({ error: "Failed to save submission. Please try again." }, { status: 500 });
  }
}

async function handleGET(req: NextRequest, { params }: Context) {
  if (!(await isAuthorizedLmsRequest(req, "VIEW_LEADS"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { category: categoryParam } = await params;
  const resolved = await resolveCategory(categoryParam);
  if (!resolved) return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  const category = resolved.slug;

  const searchParams = req.nextUrl.searchParams;
  const limit = Number(searchParams.get("limit")) || undefined;
  const cursor = searchParams.get("cursor") ?? undefined;

  try {
    const { items, nextCursor } = await listLeads(category, { limit, cursor });
    return NextResponse.json({ data: items, nextCursor });
  } catch (err) {
    console.error("Failed to list leads", err);
    return NextResponse.json({ error: "Failed to fetch submissions." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
export const GET = withTransport(handleGET);
