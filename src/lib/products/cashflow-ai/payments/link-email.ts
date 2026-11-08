import "server-only";
import { sendEmail } from "@/lib/platform/email";

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Emails the customer a payment link. `sent` is true only when the email really went out. */
export async function emailPaymentLink(input: { to: string; name: string; title: string; amount: number; currency: string; url: string }): Promise<{ sent: boolean; error: string | null }> {
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: input.currency || "INR" }).format(input.amount);
  try {
    const mail = await sendEmail({
      to: input.to,
      subject: `${input.title}: ${amount} payment request`,
      text: `Hello ${input.name},\n\n${input.title}\nAmount: ${amount}\n\nPay securely online: ${input.url}\n`,
      html: `<p>Hello ${esc(input.name)},</p><p>${esc(input.title)}<br>Amount: <strong>${esc(amount)}</strong></p><p><a href="${esc(input.url)}">Pay securely online</a></p>`,
    });
    return mail.ok ? { sent: true, error: null } : { sent: false, error: "error" in mail ? String(mail.error) : "The email could not be sent." };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "The email could not be sent." };
  }
}
