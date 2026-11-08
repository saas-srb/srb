import type { EmailProvider } from "@/lib/platform/email/types";

/**
 * Development adapter: prints the message instead of sending it, so sign-up
 * and invite links can be followed locally without an email account. In
 * production it refuses unless the console provider was chosen explicitly
 * (Platform Console → Integrations or `EMAIL_PROVIDER=console`): silently
 * dropping mail would strand real users.
 */
export function createConsoleEmailProvider(explicit: boolean): EmailProvider {
  return {
    id: "console",
    async send(message) {
      if (process.env.NODE_ENV === "production" && !explicit) {
        return { ok: false, error: "No email provider configured (add a Resend API key in Platform Console → Integrations, or set RESEND_API_KEY)" };
      }
      console.log(`\n[email:console] to=${[message.to].flat().join(", ")} subject="${message.subject}"\n${message.text}\n`);
      return { ok: true, id: null };
    },
  };
}
