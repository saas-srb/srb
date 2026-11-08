import "server-only";
import { getDb } from "@/lib/mongodb";
import { getCompanyBrand } from "@/lib/platform/branding";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";

/**
 * Tells the company's owners when something happens to its money that they would want to know at once: a payment waiting for approval, one
 * that failed or came back, a change to the Razorpay connection or to a payee's bank details, a payment the amount of which did not match.
 * Best effort: an email problem never stops or undoes the payment itself.
 */
export async function alertOwners(subject: string, lines: string[]): Promise<void> {
  try {
    const owners = await (await getDb()).collection<{ email: string; status?: string }>("admin_users").find({ roles: "super_admin", status: { $nin: ["deactivated", "blocked"] } }, { projection: { email: 1 } }).toArray();
    const to = owners.map((o) => o.email).filter(Boolean);
    if (to.length === 0) return;
    const brand = await getCompanyBrand().catch(() => null);
    const name = brand?.name?.trim() || "Your workspace";
    const { html, text } = renderEmail({ brand: name, heading: subject, paragraphs: lines, footnote: "You get this because you are an owner of the workspace. If you do not recognise this activity, sign in and review Payments at once." });
    await sendEmail({ to, subject: `${subject} — ${name}`, html, text });
  } catch {
    /* an alert that cannot be sent must never stop a payment */
  }
}
