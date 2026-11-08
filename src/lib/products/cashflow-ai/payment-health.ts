import "server-only";
import { getDb } from "@/lib/mongodb";
import { getPaymentAccountView } from "@/lib/platform/integrations/payments";
import { activeEmailProvider } from "@/lib/platform/email";
import { getPaymentControls } from "@/lib/products/cashflow-ai/payment-controls";
import { derivedKeyConfigured } from "@/lib/security/derived-key";

/**
 * A plain check of everything the payment system depends on, for the company to read before relying on it: what is set up, what is missing
 * and what happens if it stays missing. It reads settings only; it never moves or asks for money.
 */
export interface HealthCheck {
  key: string;
  level: "ok" | "warn" | "fail";
  title: string;
  detail: string;
}

export async function paymentHealth(): Promise<HealthCheck[]> {
  const out: HealthCheck[] = [];
  const add = (key: string, level: HealthCheck["level"], title: string, detail: string) => out.push({ key, level, title, detail });
  const [account, controls] = await Promise.all([getPaymentAccountView(), getPaymentControls()]);

  if (!derivedKeyConfigured("HRMS_ENCRYPTION_KEY")) add("encryption", "fail", "Secure storage is not set up", "PLATFORM_ENCRYPTION_KEY is missing on the server, so bank account numbers and Razorpay keys cannot be stored. Nothing can be paid.");
  else add("encryption", "ok", "Secure storage is set up", "Bank account numbers and Razorpay keys are stored encrypted.");

  if (account.status === "not_connected") add("razorpay", "fail", "Razorpay is not connected", "Customers cannot pay and nothing can be paid out. Connect it in Settings → Payments.");
  else if (account.status === "unreadable") add("razorpay", "fail", "Razorpay's keys cannot be read", "The stored keys no longer decrypt (the server key changed). Enter them again in Settings → Payments.");
  else if (!account.lastTest) add("razorpay", "warn", "Razorpay was never tested", "Press “Test connection” in Settings → Payments to check the keys.");
  else if (!account.lastTest.ok) add("razorpay", "fail", "Razorpay's last test failed", account.lastTest.message);
  else add("razorpay", "ok", `Razorpay is connected (${account.mode} mode)`, account.lastTest.message);

  if (account.mode === "test") add("mode", "warn", "Razorpay is in test mode", "Payments are simulated and no real money moves. Switch to live keys when you are ready.");
  if (account.status === "connected" && !account.payoutsEnabled) add("payouts", "warn", "RazorpayX payouts are off", "Salaries, vendors, refunds and reimbursements cannot be paid until payouts are turned on and the RazorpayX account number is added.");
  if (account.status === "connected" && !account.webhookSecretLast4) add("webhook", "warn", "No webhook secret", "Razorpay cannot tell your system a payment was made. Customers' payments are still confirmed from their browser and payouts are checked when you open the Payments pages, but a customer who closes the page early may not be booked until then. Set the webhook secret and add the webhook URLs in Razorpay.");
  else if (account.webhookSecretLast4) add("webhook", "ok", "Webhook secret is set", "Razorpay's reports are accepted once their signature checks out.");
  if (!account.webhookUrls.payments.startsWith("https://") && account.status === "connected") add("https", "warn", "Webhook address is not public https", "Razorpay can only call a public https address. On a developer machine use a tunnel; in production this must be your real domain.");

  if (!controls.requireCode) add("code", "warn", "Confirmation code is off", "Anyone who is signed in can send money without a confirmation code. Turn it on under Payments → Limits.");
  else add("code", "ok", "Confirmation code is on", "Money only leaves after the person confirms with a code.");
  if (controls.approvalThreshold > controls.perPayoutMax || controls.approvalThreshold === 0) add("approval", "warn", "Second-person approval is not in effect", "Large payments go without a second approver. Set the approval amount under Payments → Limits.");

  const db = await getDb();
  const owners = await db.collection("admin_users").countDocuments({ roles: "super_admin", status: { $nin: ["deactivated", "blocked"] } });
  if (owners === 0) add("owners", "fail", "No owner can approve", "Payments that wait for approval, and the alerts about money, have nobody to go to.");
  else if (owners === 1) add("owners", "warn", "Only one owner", "A payment above the approval amount needs a second person. With one owner it will wait for another approver you add.");

  const mail = await activeEmailProvider().then((m) => m.id).catch(() => "none");
  if (mail === "console" || mail === "none") add("email", "fail", "Email is not set up", "Confirmation codes, payment links and alerts are only printed on the server, never sent, so nobody can confirm a payment. Set up an email provider (Settings → Integrations, or the platform's).");
  else add("email", "ok", "Email is set up", "Confirmation codes, payment links and alerts can be sent.");

  const accounts = await db.collection("fms_bank_accounts").countDocuments({ status: "active", deletedAt: null, accountName: { $nin: ["RazorpayX balance", "Razorpay collections (awaiting settlement)"] } });
  if (accounts === 0) add("bank", "warn", "No current account added", "Top-ups and government dues are recorded against a company account. Add one under CommandOS → Settings → Payments & payouts.");
  return out;
}
