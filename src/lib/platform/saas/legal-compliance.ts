import type { LegalDoc } from "@/lib/platform/saas/site";

/**
 * The list of sub-processors (shared by the Sub-processors page and the checks that keep it honest) and the Vulnerability Disclosure Policy.
 * The India-law policies (Terms, Privacy, Refund, Cookie, Data Policy, DPA, Sub-processors, Data Rights, Grievance Redressal) are built in
 * `legal-india.ts` from the operator's profile; they describe what the platform actually does (see docs/compliance/ for the control each
 * sentence rests on).
 */
const SERVICE = "SelfRun AI";

export interface Mailboxes { privacy: string; security: string; sales: string }

export interface SubProcessor { name: string; purpose: string; data: string; scope: "platform" | "company" }

/** The providers behind the service. Platform: used by everyone. Company: only if that company connects it, with its own account and keys. */
export const SUB_PROCESSORS: SubProcessor[] = [
  { name: "MongoDB Atlas", purpose: "The database every workspace's records live in", data: "All data a customer stores, and account details", scope: "platform" },
  { name: "Vercel", purpose: "Hosting and delivery of the website and the products, and file storage (Vercel Blob)", data: "Requests to the service, and files customers upload", scope: "platform" },
  { name: "Resend", purpose: "Delivery of the service's own emails (sign-up, invitations, alerts, receipts)", data: "Recipient email address, name and the message", scope: "platform" },
  { name: "Razorpay", purpose: "Taking payment for plans and add-ons", data: "Billing contact details and payment status. Card details go to Razorpay, not to us", scope: "platform" },
  { name: "OpenAI", purpose: "AI features, only when a person uses one", data: "The question or content needed to answer, and the answer", scope: "platform" },
  { name: "GitHub", purpose: "Building and publishing a company's desktop and mobile apps, only when a Director presses Generate", data: "The company's name, icon and app address. No personal data", scope: "platform" },
  { name: "ElevenLabs", purpose: "Voice features, when a company connects it", data: "Audio and text of a voice conversation", scope: "company" },
  { name: "Twilio and WhatsApp Business", purpose: "SMS and WhatsApp messages, when a company connects them", data: "Phone numbers and message content", scope: "company" },
  { name: "SMTP, Resend or SendGrid (a company's own account)", purpose: "A company sending email from its own address", data: "Recipient details and message content", scope: "company" },
  { name: "Social platforms a company connects", purpose: "Publishing a company's posts and reading its analytics", data: "Posts, media and account analytics", scope: "company" },
];

export function vulnerabilityDisclosureDoc(m: Mailboxes): LegalDoc {
  return {
    slug: "vulnerability-disclosure",
    title: "Vulnerability Disclosure Policy",
    description: `How to report a security vulnerability in ${SERVICE} to us privately, what is in scope, the rules for good-faith research, and what we do with your report.`,
    intro: `If you believe you have found a security problem in ${SERVICE}, please tell us. This policy explains how to report it, what is in scope, and how we treat good-faith research.`,
    highlights: [
      { icon: "shield", title: "Report privately", text: `Write to ${m.security}; do not open a public issue.` },
      { icon: "check", title: "Good faith is protected", text: "We will not take legal action against research that follows this policy." },
      { icon: "clock", title: "A reply in 3 business days", text: "We acknowledge every report and keep you informed." },
    ],
    sections: [
      { heading: "How to report", list: [`Email ${m.security}. Our security.txt file at /.well-known/security.txt lists the same contact.`, "Describe what you found, where it is, how to reproduce it and the impact you expect. Screenshots or a short video help.", "Do not include other people's data. If you saw some, tell us the type and where, not the data itself."] },
      { heading: "In scope", list: ["The product website and the workspace and product applications served from it.", "Our public APIs and the sign-in, billing and file-upload flows.", "The desktop and mobile apps we build."] },
      { heading: "Out of scope", list: ["Denial-of-service, volumetric attacks, and spam or social engineering of our people or customers.", "Findings that need a rooted or jailbroken device, or physical access.", "Missing best-practice headers or settings with no demonstrated impact, and reports from automated scanners without a working proof.", "Attacks on providers we use (report those to the provider), and on a customer's own systems."] },
      { heading: "Rules for research", list: ["Test only against accounts you own or have permission to use, and never touch another company's data.", "Do not degrade the service, run automated attacks at volume, or keep access longer than needed to show the issue.", "Do not publish details until we have fixed the issue or agreed a date with you."] },
      { heading: "What we do", list: ["We acknowledge your report within three business days.", "We reproduce it, assess its severity and tell you what we found.", "We fix critical and high issues before the next release goes out and verify the fix.", "We tell you when it is fixed, and credit you if you wish."] },
      { heading: "Safe harbour", body: ["If you follow this policy in good faith, we will treat your research as authorised, we will not pursue legal action against you for it (including under sections 43 and 66 of the Information Technology Act, 2000, which we do not need to invoke for good-faith research), and we will say so if a third party brings a claim. This does not cover activity outside the policy, and it cannot bind other parties or the State."] },
      { heading: "Reporting to CERT-In", body: ["You are also free to report a vulnerability to the Indian Computer Emergency Response Team (CERT-In) at vdisclose@cert-in.org.in. If a confirmed incident in our service falls within CERT-In's directions, we report it to CERT-In within 6 hours of noticing it."] },
      { heading: "Contact", body: [`Security reports: ${m.security}.`] },
    ],
  };
}
