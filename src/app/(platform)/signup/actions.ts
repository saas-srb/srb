"use server";

import { notFound, redirect } from "next/navigation";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { slugFormatError } from "@/lib/platform/tenancy/provisioning";
import { reservedSlugError } from "@/lib/platform/settings";
import { confirmSignup, isSlugAvailable, precheckSignup, startSignup, type SignupFieldErrors } from "@/lib/platform/signup";
import { clientKey, requestOrigin } from "@/lib/platform/request";

/** Sign-up lives on the platform's own site only — never on a company's workspace domain. */
async function requirePlatformSite() {
  if (!(await isPlatformOwnerContext())) notFound();
}

export async function checkSlugAction(slug: string): Promise<{ available: boolean; message: string | null }> {
  await requirePlatformSite();
  const s = slug.trim().toLowerCase();
  const formatError = slugFormatError(s) ?? (await reservedSlugError(s));
  if (formatError) return { available: false, message: formatError };
  return (await isSlugAvailable(s)) ? { available: true, message: null } : { available: false, message: "That address is taken." };
}

/** The owner's display name now comes from their email ("rita.rao@acme.com" → "Rita Rao"); they can change it in their profile. */
function nameFromEmail(email: string): string {
  const local = email.trim().split("@")[0] ?? "";
  const words = local.replace(/[._+-]+/g, " ").replace(/\d+/g, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ").slice(0, 60);
  return name.length >= 2 ? name : "Owner";
}

function signupInput(formData: FormData) {
  const field = (k: string) => String(formData.get(k) ?? "");
  const email = field("email");
  return {
    companyName: field("companyName"),
    slug: field("slug").trim().toLowerCase(),
    name: field("name").trim() || nameFromEmail(email),
    email,
    password: field("password"),
    businessCategories: formData.getAll("businessCategory").map(String),
    businessSubCategories: formData.getAll("businessSubCategory").map(String),
    acceptTerms: formData.get("acceptTerms") === "on",
    planId: field("plan") || undefined,
    interval: field("interval") || undefined,
  };
}

/** Step 1 of sign-up: validate on the server (nothing is created). The form shows the progress only when this returns no errors. */
export async function validateSignupAction(formData: FormData): Promise<{ errors?: SignupFieldErrors }> {
  await requirePlatformSite();
  const errors = await precheckSignup(signupInput(formData));
  return Object.keys(errors).length ? { errors } : {};
}

export interface SignupState {
  errors?: SignupFieldErrors;
  /** Approval mode: the request is stored and waits for a platform admin. */
  awaitingApproval?: string;
  /** What was submitted (never the password), so a rejected form keeps the user's typing. */
  values?: { email: string };
}

export async function startSignupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  await requirePlatformSite();
  const input = signupInput(formData);
  const { host } = await requestOrigin();
  const result = await startSignup(input, { hostHint: host, clientKey: await clientKey() });
  if (!result.ok) return { errors: result.errors, values: { email: input.email } };
  // Open mode: the company exists already; the one-time hand-off signs the owner in on its own host.
  if (result.kind === "created") redirect(result.redirectTo);
  return { awaitingApproval: result.email };
}

export interface ConfirmState {
  error?: string;
  awaitingApproval?: boolean;
}

export async function confirmSignupAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  await requirePlatformSite();
  const { host } = await requestOrigin();
  const result = await confirmSignup(String(formData.get("token") ?? ""), { hostHint: host });
  if (!result.ok) return { error: result.error };
  if ("awaitingApproval" in result) return { awaitingApproval: true };
  redirect(result.redirectTo);
}
