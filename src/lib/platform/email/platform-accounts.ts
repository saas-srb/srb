import "server-only";
import { getConfigs } from "@/lib/platform/config/store";

/**
 * The platform's own SMTP and SendGrid accounts (Console → Integrations). Optional alternatives to the platform's Resend account, for companies that saved
 * none of their own. The From address is ALWAYS the platform's verified sender saved with the account (a company's domain is never used on it); the
 * company's name is shown as the display name and replies go to the company's reply-to (`email/index.ts`).
 */
export async function platformSmtp(): Promise<{ values: Record<string, string>; from: string } | null> {
  const c = await getConfigs(["PLATFORM_SMTP_HOST", "PLATFORM_SMTP_PORT", "PLATFORM_SMTP_SECURE", "PLATFORM_SMTP_USERNAME", "PLATFORM_SMTP_PASSWORD", "PLATFORM_SMTP_FROM"]);
  if (!c.PLATFORM_SMTP_HOST || !c.PLATFORM_SMTP_FROM) return null;
  return {
    from: c.PLATFORM_SMTP_FROM,
    values: { host: c.PLATFORM_SMTP_HOST, port: c.PLATFORM_SMTP_PORT ?? "587", secure: (c.PLATFORM_SMTP_SECURE ?? "starttls").toLowerCase(), username: c.PLATFORM_SMTP_USERNAME ?? "", password: c.PLATFORM_SMTP_PASSWORD ?? "" },
  };
}

export async function platformSendgrid(): Promise<{ apiKey: string; from: string } | null> {
  const c = await getConfigs(["PLATFORM_SENDGRID_API_KEY", "PLATFORM_SENDGRID_FROM"]);
  return c.PLATFORM_SENDGRID_API_KEY && c.PLATFORM_SENDGRID_FROM ? { apiKey: c.PLATFORM_SENDGRID_API_KEY, from: c.PLATFORM_SENDGRID_FROM } : null;
}
