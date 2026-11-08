import type { LegalDoc } from "@/lib/platform/saas/site";
import type { LegalProfile } from "@/lib/platform/saas/legal-profile";
import { SUB_PROCESSORS } from "@/lib/platform/saas/legal-compliance";

/**
 * The public policies, written for a product sold in India: the Information Technology Act, 2000 and its rules (the Reasonable Security
 * Practices and Sensitive Personal Data Rules, 2011; the Intermediary Guidelines Rules, 2021; CERT-In's directions of 28 April 2022), the
 * Digital Personal Data Protection Act, 2023 and the rules made under it, the Consumer Protection Act, 2019 and Consumer Protection
 * (E-Commerce) Rules, 2020, the CGST Act, 2017, the Indian Contract Act, 1872 and the Arbitration and Conciliation Act, 1996.
 *
 * Nothing here names a person, address or number that the operator has not entered: the operator's identity, registered office, registration
 * number, Grievance Officer and courts come from `LegalProfile` (Console → Legal & compliance), and a missing field is left out, never
 * replaced by a placeholder. The wording is a complete working draft that rests on what the product really does (see docs/compliance/); the
 * operator's own legal counsel should review it before launch, as with any contract.
 */
const SERVICE = "SelfRun AI";

export interface LegalContext {
  name: string;
  profile: LegalProfile;
  mail: { privacy: string; security: string; support: string };
}

// ── Shared pieces ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

const officer = (c: LegalContext) => c.profile.grievanceEmail || c.mail.privacy;
const who = (c: LegalContext) => c.profile.legalName || c.name;

/** The operator, as completely as the profile allows. */
export function operatorSentence(c: LegalContext): string {
  const p = c.profile;
  const parts = [p.legalName || c.name];
  if (p.tradeName && p.tradeName !== p.legalName) parts.push(`doing business as ${p.tradeName}`);
  let s = parts.join(", ");
  if (p.constitution) s += `, a ${p.constitution.toLowerCase().replace(/^other$/, "business")}`;
  if (p.registrationType && p.registrationNo) s += ` (${p.registrationType} ${p.registrationNo})`;
  if (p.registeredOffice) s += `, with its registered office at ${p.registeredOffice}`;
  if (p.gstin) s += `, GSTIN ${p.gstin}`;
  return s;
}

const courts = (c: LegalContext) => (c.profile.jurisdictionCity ? `the courts at ${c.profile.jurisdictionCity}${c.profile.jurisdictionState ? `, ${c.profile.jurisdictionState}` : ""}` : "the courts having territorial jurisdiction over our registered office");
const seat = (c: LegalContext) => c.profile.jurisdictionCity || "the city of our registered office";

export const effectiveLine = (c: LegalContext): string => {
  const d = c.profile.effectiveDate;
  if (!d) return "";
  const t = Date.parse(d);
  return Number.isNaN(t) ? "" : ` Effective from ${new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.`;
};

/** The Grievance Officer block that every policy ends with. Only what has been entered is shown. */
export function grievanceLines(c: LegalContext): string[] {
  const p = c.profile;
  const lines: string[] = [];
  if (p.grievanceName) lines.push(`Name: ${p.grievanceName}${p.grievanceDesignation ? `, ${p.grievanceDesignation}` : ""}`);
  lines.push(`Email: ${officer(c)}`);
  if (p.grievancePhone) lines.push(`Phone: ${p.grievancePhone}`);
  if (p.registeredOffice) lines.push(`Address: ${p.registeredOffice}`);
  lines.push("Response: we acknowledge every complaint within 24 hours and resolve it within 15 days, and in any case within 30 days.");
  return lines;
}

const contactSection = (c: LegalContext, topic: string): LegalDoc["sections"][number] => ({
  heading: "Grievance Officer and contact",
  body: [`For ${topic}, write to our Grievance Officer. The Grievance Redressal page explains how a complaint is handled and where to take it if you are not satisfied.`],
  list: grievanceLines(c),
});

// ── Terms of Service ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function termsDoc(c: LegalContext): LegalDoc {
  const name = c.name;
  const us = who(c);
  return {
    slug: "terms",
    title: "Terms of Service",
    description: `The terms that apply when you use the ${SERVICE} website and service in India: accounts, plans and GST, your data, acceptable use, liability, governing law and dispute resolution.`,
    intro: `The agreement between you and ${us} for using ${name}, governed by the laws of India.${effectiveLine(c)}`,
    highlights: [
      { icon: "file", title: "Governed by Indian law", text: "Indian courts, the Arbitration and Conciliation Act, 1996, and prices in rupees with GST shown on a tax invoice." },
      { icon: "shield", title: "You own your data", text: "We process it only to provide the service. You decide what is stored; we protect it." },
      { icon: "check", title: "Cancel any time", text: "From your billing page. Your data is kept for a stated period so you can export it." },
    ],
    sections: [
      {
        heading: "Who we are and these terms",
        body: [
          `${name} is provided by ${operatorSentence(c)} (“we”, “us”). These terms are a contract between you and us. By registering for or using ${name}, you accept them.`,
          "This is an electronic record under the Information Technology Act, 2000 and the rules made under it. It is generated by a computer system and does not need a physical or digital signature.",
        ],
      },
      {
        heading: "Who may use the service",
        body: ["The service is for businesses, professionals and organisations, not for consumers. You must be at least 18 years old and competent to contract under the Indian Contract Act, 1872, and you must have authority to bind the business you register. If you register for a company, you confirm that you are authorised to do so."],
      },
      {
        heading: "Your account, workspace and people",
        body: ["Each business has its own workspace. The owner and administrators choose which products are on, invite people and set roles and permissions. You are responsible for the accuracy of what you give us, for keeping credentials secure, for who you give access to and for removing access when someone leaves. Activity under your workspace is your responsibility."],
      },
      {
        heading: "Plans, prices, GST and payment",
        list: [
          "Plans: every plan includes every product and feature. Plans differ by the number of people and by allowances such as storage, AI use, email, voice and custom domains. The plans, prices and allowances are those on the pricing page and in your billing settings.",
          "Currency and tax: prices are in Indian rupees (INR). Goods and Services Tax (GST) at the rate in force is charged in addition, unless the price is shown as inclusive of tax, and is itemised on the tax invoice.",
          "Tax invoices: we issue a tax invoice for every payment, with our GSTIN and SAC, and a credit note under section 34 of the CGST Act, 2017 where an invoice is corrected or refunded. Give us your correct GSTIN, legal name and state before you pay, so that the invoice supports your input tax credit. We cannot change an invoice after the return period for it has closed.",
          "Tax deducted at source: if the law requires you to deduct tax at source, pay us the invoice amount net of it and send us the deduction certificate; do not deduct on the GST part shown separately.",
          "Payments: payments are taken through Razorpay, a payment aggregator regulated by the Reserve Bank of India. We never see or store your card number, CVV or UPI PIN. Recurring card, UPI and e-mandate payments need your authorisation and are subject to the Reserve Bank of India's rules, including a pre-debit notification before each charge.",
          "Renewal: a paid plan renews each billing period until you cancel. A failed payment starts a grace period; afterwards your workspace becomes read-only until payment is made. Your data is not deleted for non-payment.",
        ],
      },
      {
        heading: "Free plan and free trials",
        body: ["The Free plan is free for one person and needs no card. Where a plan starts with a free trial, its length is shown when you sign up. If a trial ends and no plan has been bought, the workspace is locked: every page leads to the subscribe screen and changes are refused. Nothing is deleted, and the workspace returns exactly as it was as soon as a plan is subscribed."],
      },
      {
        heading: "Your data and what you must do with it",
        list: [
          "Ownership: you own the data you put into your workspace. You give us the right to host, copy and process it only to provide the service to you.",
          "Your role under data protection law: for personal data about your own employees, clients, students, applicants and website visitors you are the Data Fiduciary under the Digital Personal Data Protection Act, 2023, and we are your Data Processor. The Data Processing Addendum forms part of these terms.",
          "Lawful use: you are responsible for having a lawful basis for the data you store, for giving the notices and obtaining the consents the law requires from those people, and for answering their requests.",
          "Statutory compliance: payroll, provident fund, ESI, professional tax, TDS, GST and other filings remain your responsibility. The product computes figures from the rates and rules you set; check them before you file or pay.",
          "Identity numbers: do not collect or store Aadhaar numbers, or a copy of an Aadhaar card, except as the Aadhaar Act, 2016 and UIDAI's rules allow, and mask them where you display them. Do not store card numbers, CVV or PINs.",
          "Sensitive data: passwords, bank and card details, health records and biometric data need extra care. Give only the people who need them the permission to see them.",
        ],
      },
      {
        heading: "Your brand, domains, apps and clients",
        body: ["You can put your own logo, name, colours, domain and apps on the workspace, your website and your notifications. You are responsible for the content you publish, for having the right to use your brand and domain, and for the people and visitors you invite. Your clients, students, applicants and website visitors are your users: how you use their information is your responsibility."],
      },
      {
        heading: "Automations, integrations and AI",
        body: ["Automations and webhooks do what you configure them to do, and each run is logged. You are responsible for what you automate and for the services you connect with your own keys. AI features produce answers and drafts from your data and instructions. They can be wrong. Review them before relying on them, in particular where they affect people, money, tax, employment or legal obligations. AI does not give legal, tax, financial or medical advice. AI use is metered according to your plan."],
      },
      {
        heading: "Messages you send through the service",
        body: ["If you send commercial SMS, voice calls, WhatsApp or email to people, you must follow the law that applies to those messages, including the Telecom Commercial Communications Customer Preference Regulations, 2018 of the Telecom Regulatory Authority of India (registration of your sender IDs and templates, and the preference and consent registers) and the terms of WhatsApp and of your messaging provider. You must send marketing messages only to people who have agreed to receive them, and must honour opt-outs."],
      },
      {
        heading: "Acceptable use and content",
        list: [
          "You may not use the service to break any law in force in India, to infringe anyone's rights, or to store, publish or send content that is unlawful, obscene, defamatory, harassing, hateful, that threatens the sovereignty, integrity or security of India, that impersonates another person, that contains malware, or that is otherwise prohibited under Rule 3(1)(b) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.",
          "You may not send spam, attempt to reach another company's data, probe or disrupt the service, bypass its limits, resell it without our written agreement or reverse engineer it.",
          "Where we act as an intermediary for content you host through the service, we will remove or disable access to content when ordered by a court or notified by an appropriate government agency, and in other cases as the law requires, and we may keep records as the law requires.",
          "We may suspend a workspace that puts the service, other customers or the public at risk, or that breaks this section, and we will tell you why unless the law stops us.",
        ],
      },
      {
        heading: "Ownership of the service",
        body: ["The service, its software, design and documentation belong to us and our licensors. We give you a non-exclusive, non-transferable right to use it for your business while your plan is active. Suggestions you send us may be used without obligation to you. Your data and your brand stay yours."],
      },
      {
        heading: "Availability and support",
        body: ["We work to keep the service available and secure. Paid plans carry the Uptime SLA. Support is provided as described in your plan, through the Help & Support product. Planned maintenance and events outside our control can interrupt the service."],
      },
      {
        heading: "Suspension, termination and deletion",
        body: ["You can cancel at any time from your billing page. We may terminate access for a material breach that is not fixed within a reasonable time after notice, or at once for unlawful use. After a plan ends the workspace stays readable for a period so you can export your data. A Director can delete the company: it is then scheduled for permanent deletion after 30 days, during which it can be restored. After deletion, backups roll off on their stated schedule, and we keep only what the law requires, such as tax and accounting records."],
      },
      {
        heading: "Disclaimer and limit of liability",
        body: [
          "To the extent the law permits, the service is provided “as is” and “as available”, and we do not promise that it will be uninterrupted or error-free.",
          "To the extent the law permits, neither of us is liable to the other for indirect or consequential loss, loss of profit, revenue or goodwill, and our total liability under these terms for all claims is limited to the fees you paid us for the service in the twelve months before the event that gave rise to the claim.",
          "Nothing in these terms limits liability that cannot be limited by law, including for fraud, wilful default, death or personal injury caused by negligence, or a data protection obligation that the law does not allow us to limit. Section 73 and section 74 of the Indian Contract Act, 1872 apply to any claim for damages or compensation.",
        ],
      },
      {
        heading: "Indemnity",
        body: ["You will compensate us for third-party claims, and the reasonable costs of defending them, that arise from data or content you put into the service in breach of the law or of these terms, or from your unlawful use of the service. We will tell you promptly of such a claim and let you help defend it."],
      },
      {
        heading: "Events beyond our control",
        body: ["Neither of us is in breach for a delay or failure caused by an event beyond reasonable control, such as natural disaster, epidemic, war, riot, strike, government order or restriction, failure of the public internet or of electricity, or failure of a hosting, database, payment or telecom provider that we could not reasonably have prevented. Payment obligations for service already received are not excused."],
      },
      {
        heading: "Changes to the service and to these terms",
        body: ["We may improve the service. We may change these terms when the law, the service or our practices change. We will notify you of a material change at least 30 days before it applies, by email or in the product, and your continued use after that date means you accept it. If you do not accept a change, you may cancel before it takes effect."],
      },
      {
        heading: "Governing law and disputes",
        list: [
          `Governing law: these terms and any dispute about them are governed by the laws of India.`,
          `First step: write to our Grievance Officer with the details. We will try in good faith to settle the matter within 30 days.`,
          `Arbitration: a dispute that is not settled in that time is finally resolved by arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator chosen by both of us (or, failing agreement within 15 days, appointed as the Act provides). The seat and venue are ${seat(c)}, the language is English, and the award is binding.`,
          `Courts: subject to the above, and for interim relief and the enforcement of an award, ${courts(c)} have exclusive jurisdiction.`,
        ],
      },
      {
        heading: "General",
        body: ["These terms, the Privacy Policy, the Data Processing Addendum, the Refund & Cancellation Policy and the Uptime SLA are the whole agreement between us about the service. If a part is unenforceable, the rest stays in force. A delay in enforcing a right is not a waiver of it. You may not transfer your rights under these terms without our written consent; we may transfer ours in a merger, restructuring or sale of the business, if the new owner takes on these terms. We may give you notices by email or in the product."],
      },
      contactSection(c, "any question or complaint about these terms or the service"),
    ],
  };
}

// ── Privacy Policy ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function privacyDoc(c: LegalContext): LegalDoc {
  const name = c.name;
  const us = who(c);
  return {
    slug: "privacy",
    title: "Privacy Policy",
    description: `How ${SERVICE} collects, uses and protects personal data in India under the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000: purposes, consent, your rights, retention and how to complain.`,
    intro: `This is the privacy notice of ${us} for ${name}. It tells you what personal data we collect, why, how long we keep it, your rights under Indian law and how to complain.${effectiveLine(c)}`,
    highlights: [
      { icon: "shield", title: "We do not sell personal data", text: "We use it to run, secure and improve the service, to bill you and to answer you." },
      { icon: "check", title: "Your rights under DPDP", text: "Access, correction, erasure, grievance redressal and nomination, answered by a named Grievance Officer." },
      { icon: "lock", title: "Your workspace data is yours", text: "We process it only for you, isolated to your company, and under the Data Processing Addendum." },
    ],
    sections: [
      {
        heading: "Who this notice covers and who we are",
        body: [
          `${us} is the Data Fiduciary for the personal data described in this notice: information about visitors to this website, people who register or contact us, and account holders. We are ${operatorSentence(c)}.`,
          `${name} is also used by businesses to store personal data about their own people, clients, students, applicants and website visitors. For that data the business is the Data Fiduciary and we are its Data Processor, working only on its instructions under the Data Processing Addendum. If you are one of those people, direct requests to the business you deal with.`,
          "We follow the Digital Personal Data Protection Act, 2023 and the rules made under it as they come into force, and the Information Technology Act, 2000 with the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011.",
        ],
      },
      {
        heading: "Personal data we collect",
        list: [
          "What you give us: your name, work email, phone number, company, role and the message you write when you register, ask for a demo or contact us.",
          "Account and billing details: workspace details, plan, invoices, GSTIN and billing address, and payment status. Card, UPI and bank details are taken by our payment provider, Razorpay, and are not stored by us.",
          "Sign-in and device data: sign-in events, devices and sessions, IP address, browser type and approximate location, used to run and secure your account and to show you your own sign-in history.",
          "Usage data: which features are used, to run, support and improve the product.",
          "Support records: your requests and our replies, and attachments you send.",
        ],
      },
      {
        heading: "Why we use it and on what basis",
        list: [
          "To create your account and provide the service you asked for: you give us this data for that purpose, and we use it with your consent or, where you provided it voluntarily for the purpose and did not object, as the Act permits.",
          "To bill you, issue tax invoices and meet tax, accounting and other legal duties: to comply with Indian law.",
          "To keep the service secure, prevent fraud and abuse, keep logs, and report cyber security incidents as the law requires: to comply with Indian law and to protect the service.",
          "To answer your questions and requests, and send account, security and billing messages: to respond to you.",
          "To send product news or marketing: only with your consent, which you can withdraw at any time. Withdrawing it never affects the service.",
        ],
      },
      {
        heading: "Consent and how to withdraw it",
        body: ["Where we ask for your consent we ask clearly, for a stated purpose, and you give it by a clear action, such as ticking a box that is not pre-ticked. You can withdraw consent at any time as easily as you gave it, from your account settings or by writing to our Grievance Officer. If you withdraw consent, we stop the processing that relied on it within a reasonable time; the consequence is that features that need that data may not work, and processing that was lawful before the withdrawal stays lawful. On request we give you this notice in English or in any language listed in the Eighth Schedule to the Constitution of India."],
      },
      {
        heading: "Sensitive personal data",
        body: ["Some information that businesses keep in the products is sensitive under the 2011 Rules: passwords, financial information such as bank and card details, health records, and biometric data. We collect such information about you only with your consent for a lawful purpose, keep it encrypted where it is stored as a secret, restrict who can see it, and use it only for that purpose. You may refuse to give it or withdraw it, and we will then not provide the feature that needs it."],
      },
      {
        heading: "What businesses store in the products",
        body: [`What is stored in ${name} is what each business chooses to put there. Depending on the products it switches on, that can include:`],
        list: [
          "Sales and clients: leads, clients, messages with them, offers, coupons and wallet or referral records.",
          "People: employee records, attendance, leave, payroll and documents.",
          "Money and work: invoices, bills, payments, projects, timesheets, purchase requests and vendors.",
          "Knowledge and documents: SOPs, agreements and signatures, and credentials and files in the secure vault.",
          "Conversations: team chat, AI assistant chats, and website chatbot and voice conversations with a business's own visitors.",
        ],
      },
      {
        heading: "AI features",
        body: ["When someone uses an AI feature (asking a question of their data, an assistant, drafting content, a chatbot or a voice conversation), the content needed to answer is processed by an AI provider at the business's request. AI features run only against the requesting business's own workspace, with the permissions of the person asking. Questions about data are answered with read-only queries, and a change an assistant proposes waits for a person's approval. We do not make decisions about you that have legal or similarly significant effects by solely automated means."],
      },
      {
        heading: "Who we share it with",
        body: ["We do not sell personal data. We share it only with service providers who help us run the service (hosting, database, email delivery, payments and AI processing), with services a business chooses to connect, with auditors and advisers under confidentiality, and with courts, government agencies and regulators when the law requires it, for example an order under section 69 of the Information Technology Act, 2000. Each provider receives only what it needs and is bound to protect it. The Sub-processors page lists them."],
      },
      {
        heading: "Transfers outside India",
        body: ["Some of our providers process data outside India. Section 16 of the Digital Personal Data Protection Act allows this except to countries the Central Government restricts by notification, and we do not transfer personal data to any country so restricted. We bind each provider to protect the data, and keep a register of transfers. Where a business needs its data processed only in India, it should write to us before it starts."],
      },
      {
        heading: "How long we keep it",
        list: [
          "Account and workspace data: while the account is active. A company that is deleted is scheduled for deletion after 30 days, during which it can be restored, and then deleted for good. Safety copies made before a restore or wipe are kept for 30 days.",
          "Backups: the most recent eight scheduled and ten manual backups; older ones are removed automatically.",
          "Sign-in history, security events and system logs: 180 days, as CERT-In's directions require; some logs may be kept longer where the law requires.",
          "Tax and accounting records: for the period the Income-tax Act, 1961, the CGST Act, 2017 and the Companies Act, 2013 require.",
          "Enquiries and support messages: as long as needed to answer them and for a reasonable period after.",
          "Requests under this notice and our answers: three years.",
          "When the purpose is served and no law requires us to keep the data, we erase it and tell our processors to do the same.",
        ],
      },
      {
        heading: "How we protect it",
        body: ["We take reasonable security safeguards, as section 8(5) of the Digital Personal Data Protection Act and section 43A of the Information Technology Act require: every company's data is isolated, access follows roles and per-action permissions checked on the server, administrators and staff use two-step sign-in, passwords are stored only as salted hashes, secrets and vault documents are encrypted at rest, traffic uses HTTPS, uploads are checked, and actions are logged. No system is perfectly secure, so we also ask you to use strong passwords and least-privilege access."],
      },
      {
        heading: "If there is a data breach",
        body: ["If a personal data breach happens, we act at once to contain it, report cyber security incidents to CERT-In within 6 hours of noticing them as its directions require, and, where the law requires, inform the Data Protection Board of India and each affected person without delay, with what happened, what data was involved, what we have done and what you can do. Where we are the Data Processor we tell the business concerned without undue delay so that it can meet its own duty."],
      },
      {
        heading: "Your rights",
        body: ["Under sections 11 to 14 of the Digital Personal Data Protection Act, 2023 you have the right to:"],
        list: [
          "Access: a summary of the personal data we hold about you and how we process it, and the identities of the other parties we have shared it with.",
          "Correction, completion and updating: have inaccurate or incomplete data fixed.",
          "Erasure: have your data erased when it is no longer needed for the purpose, unless the law requires us to keep it.",
          "Grievance redressal: get an answer from our Grievance Officer within the time stated below.",
          "Nomination: nominate another person to exercise these rights if you die or cannot do so.",
          "Withdraw consent: at any time, as described above.",
        ],
      },
      {
        heading: "Your duties",
        body: ["Under section 15 of the Act, you must comply with the law, not impersonate anyone, not hide material information when giving us your data, not file a false or frivolous complaint, and give only verifiably authentic information when you ask us to correct or erase data."],
      },
      {
        heading: "Children",
        body: ["The service is for businesses and is not directed at anyone under 18. We do not knowingly collect the personal data of a child (a person under 18) without the verifiable consent of a parent or lawful guardian, and we never track or monitor the behaviour of children or show them targeted advertising. If you think a child has given us data, write to our Grievance Officer and we will delete it."],
      },
      {
        heading: "Cookies",
        body: ["We use cookies that are needed to keep you signed in and secure and to remember preferences. We do not run third-party analytics or advertising trackers on this website. The Cookie Policy lists what is stored."],
      },
      {
        heading: "Complaints and the Data Protection Board",
        body: ["First write to our Grievance Officer below; we will acknowledge within 24 hours and resolve within 15 days and in any case within 30 days. If you are not satisfied, or do not receive an answer in time, you can complain to the Data Protection Board of India, as the Act provides after you have used our grievance process."],
      },
      {
        heading: "Changes to this notice",
        body: ["We may update this notice when the law or the service changes. We will announce material changes on this page or by email before they apply, and show the date this version took effect at the top. Where a change needs your consent, we will ask for it again."],
      },
      contactSection(c, "any privacy question, request or complaint"),
    ],
  };
}

// ── Refund & Cancellation ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function refundDoc(c: LegalContext): LegalDoc {
  return {
    slug: "refund-policy",
    title: "Refund & Cancellation Policy",
    description: `How cancelling, refunds, failed payments and GST credit notes work for ${SERVICE} customers in India, and how fast a billing complaint is answered.`,
    intro: `How the free plan, cancellation, refunds and billing complaints work. Plans, prices and allowances are always those on the pricing page and in your billing settings.${effectiveLine(c)}`,
    highlights: [
      { icon: "wallet", title: "Rupees, with a GST invoice", text: "Every payment gets a tax invoice; a refund against an invoice gets a credit note." },
      { icon: "check", title: "Cancel from billing", text: "Stops the next renewal. What you have paid for stays active to the end of its period." },
      { icon: "clock", title: "Answered in 24 hours", text: "We acknowledge billing complaints within 24 hours and resolve them within 15 days." },
    ],
    sections: [
      { heading: "Free plan and free trials", body: ["The Free plan is free for one person and needs no card. A free trial, where a plan has one, ends on the date shown in your billing settings. If you do not buy a plan, the workspace is locked and nothing is deleted; it opens again, as it was, when you subscribe. No money is taken for a trial or the Free plan."] },
      { heading: "Subscriptions and renewal", body: ["A paid plan renews each billing period until you cancel. Prices are in Indian rupees and GST is charged as shown at checkout and on the tax invoice. Before a recurring card, UPI or e-mandate charge, you receive a notification as the Reserve Bank of India's rules require."] },
      { heading: "Cancelling", body: ["You can cancel at any time from your billing page. Cancelling stops the next renewal. The plan you have paid for stays active until the end of the period you paid for, and your workspace then stays readable for a period so you can export your data. We do not refund the unused part of a period that was correctly charged, unless the law or your plan says otherwise."] },
      {
        heading: "When we refund",
        list: [
          "Charged twice, or charged an amount that differs from your invoice or plan.",
          "Charged after you cancelled, or after a plan change took effect.",
          "A charge that you did not authorise, once you have told us and we have checked it.",
          "A period in which the service was unavailable to you beyond the Uptime SLA: a service credit as the SLA states.",
          "Any other case in which the law requires a refund.",
        ],
      },
      { heading: "How a refund is paid", body: ["We refund to the original payment method (card, UPI, net banking or wallet) through Razorpay. We start the refund within 7 working days of approving it, and your bank or card network can take a further 5 to 7 working days to show it. Where the refund is against a tax invoice, we issue a credit note under section 34 of the CGST Act, 2017, so that your input tax credit can be adjusted."] },
      { heading: "Failed payments", body: ["If a payment fails we tell you and give a grace period before the workspace becomes read-only. Your data stays available to export, and paying brings everything back straight away. Retry the payment from your billing page, or write to us if it keeps failing."] },
      { heading: "How to ask", body: ["Open a request in Help & Support or write to our Grievance Officer with your workspace address, the invoice number and what went wrong. We acknowledge within 24 hours, tell you what we found, and resolve within 15 days and in any case within 30 days, as the Consumer Protection (E-Commerce) Rules, 2020 require us to be able to."] },
      {
        heading: "How long data is kept",
        list: [
          "Your workspace data stays while your account is active.",
          "A company scheduled for deletion is deleted for good after 30 days, and until then it can be restored.",
          "Before a restore or a wipe, a safety copy is kept for 30 days.",
          "Backups rotate automatically: the latest eight scheduled and ten manual ones are kept.",
          "Sign-in history and security logs are kept for 180 days.",
          "Billing and tax records are kept as long as Indian tax and company law require.",
        ],
      },
      contactSection(c, "any billing, refund or cancellation question"),
    ],
  };
}

// ── Cookie Policy ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function cookiesDoc(c: LegalContext): LegalDoc {
  return {
    slug: "cookies",
    title: "Cookie Policy",
    description: `The cookies and similar browser storage ${SERVICE} uses, why, how long they last and how to control them.`,
    intro: `What is stored in your browser when you use the ${SERVICE} website and your workspace, and the choices you have.${effectiveLine(c)}`,
    highlights: [
      { icon: "shield", title: "No advertising cookies", text: "We keep only what is needed to run and secure the service." },
      { icon: "lock", title: "Sign-in and device protection", text: "Cookies keep you signed in and keep your device list and sign-in history accurate." },
      { icon: "check", title: "Your choice", text: "Delete or block cookies in your browser any time; clearing preferences resets your interface." },
    ],
    sections: [
      { heading: "What we store and the legal basis", body: ["We store only what is needed to run and secure the service. These are strictly necessary for what you asked for, so they do not need a separate consent, and they carry no advertising or profiling. Anything beyond that would be used only after you agree, as the Digital Personal Data Protection Act, 2023 requires, and you could withdraw that agreement at any time."] },
      {
        heading: "Cookies we use",
        list: [
          "Sign-in cookies: keep you signed in to your workspace or product and protect your session. They are removed when you sign out or the session ends.",
          "Device cookie: recognises your browser so your list of signed-in devices and your sign-in history are accurate. It lasts up to a year.",
          "Referral cookie: if you arrive through a referral link, the code is remembered for 30 days so a later sign-up is credited correctly.",
          "Preference storage: your chosen theme and similar interface choices are kept in your browser's local storage.",
        ],
      },
      { heading: "Analytics and advertising", body: ["This website does not run third-party analytics or advertising trackers, and we do not sell personal data. A business that builds its own website on the platform may add analytics or advertising tools to that website; its website asks visitors before loading them and says so in its own cookie notice, and that business, not us, is responsible for them."] },
      { heading: "Your choices", body: ["You can delete or block cookies in your browser settings. Blocking the sign-in cookies means you will not be able to sign in. Clearing stored preferences resets your interface choices."] },
      contactSection(c, "any question about cookies"),
    ],
  };
}

// ── Data Policy ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function dataPolicyDoc(c: LegalContext): LegalDoc {
  return {
    slug: "data-policy",
    title: "Data Policy",
    description: `How ${SERVICE} treats the data stored in a workspace: ownership, isolation, AI processing, security safeguards, export and deletion under Indian law.`,
    intro: `What happens to the business data a customer keeps in ${SERVICE}. It complements the Privacy Policy, which covers personal data about website visitors and account holders.${effectiveLine(c)}`,
    highlights: [
      { icon: "shield", title: "Isolated per company", text: "Every record belongs to one company and every query is confined to it by the platform itself." },
      { icon: "brain", title: "AI stays in your permissions", text: "AI answers use read-only queries with the asker's permissions, and any change an assistant proposes waits for approval." },
      { icon: "check", title: "Yours to export and delete", text: "Export your records any time, and ask for permanent deletion." },
    ],
    sections: [
      { heading: "You own your data", body: ["The records, files and content a company puts into its workspace belong to that company. We process them only to provide the service. Under the Digital Personal Data Protection Act, 2023 the company is the Data Fiduciary for the personal data in them and we are its Data Processor."] },
      { heading: "Isolation between companies", body: ["Every record belongs to one company and every database query is confined to that company by the platform itself. One company cannot read another company's data."] },
      { heading: "Access inside your company", body: ["Administrators control who can see and do what through roles and fine-grained permissions per product and action. Sign-ins, changes and administrative actions are recorded in an audit log, and sign-in records are kept for 180 days."] },
      { heading: "AI and your data", body: ["AI features run against the requesting company's own workspace, with the permissions of the person asking. Business questions are answered with read-only queries, and answers show how they were calculated. When an AI assistant proposes a change, nothing happens until the person approves it. AI use is metered according to your plan."] },
      { heading: "Security safeguards", body: ["Credentials, API keys, bank details and vault documents are encrypted at rest. Connections use HTTPS. Staff access is limited, uses two-step sign-in and is recorded. These are the reasonable security safeguards that section 8(5) of the Digital Personal Data Protection Act, 2023 and section 43A of the Information Technology Act, 2000 require. The Security & Trust page describes them in full."] },
      { heading: "Breaches", body: ["If your data is affected by a breach, we tell you without undue delay so that you can meet your own duty to inform the Data Protection Board of India and the people concerned. We report cyber security incidents to CERT-In within 6 hours of noticing them, as its directions require."] },
      { heading: "Export and portability", body: ["You can export your records at any time. Leads, clients and employees can also be imported from CSV."] },
      { heading: "When a plan ends and deletion", body: ["After a plan ends, the workspace stays readable for a period so you can export what you need. You can ask for deletion; a deleted company is removed for good after 30 days, and backups roll off on their stated schedule. We keep only what the law requires, such as tax and accounting records."] },
      contactSection(c, "any question about how your data is handled"),
    ],
  };
}

// ── Data Processing Addendum ────────────────────────────────────────────────────────────────────────────────────────────────────

export function dpaDoc(c: LegalContext): LegalDoc {
  const m = c.mail;
  return {
    slug: "dpa",
    title: "Data Processing Addendum",
    description: `How ${SERVICE} processes personal data on behalf of its customers under the Digital Personal Data Protection Act, 2023: roles, instructions, security, sub-processors, transfers, breach notice, and return or erasure.`,
    intro: `This addendum applies when you use ${SERVICE} to store or process personal data about your own people, clients, students, applicants or website visitors. It is the contract that section 8(2) of the Digital Personal Data Protection Act, 2023 requires between a Data Fiduciary and its Data Processor, and it forms part of the Terms of Service.${effectiveLine(c)}`,
    highlights: [
      { icon: "building", title: "You decide, we process", text: "You are the Data Fiduciary for what you store. We process it only to provide the service, on your instructions." },
      { icon: "lock", title: "Kept apart and protected", text: "Every company's data is isolated, access is by role, and administrators use two-step sign-in." },
      { icon: "file", title: "Clear exit", text: "Export your data at any time. On leaving, it is erased on a stated schedule." },
    ],
    sections: [
      { heading: "Roles", body: ["For the personal data you put into your workspace, you are the Data Fiduciary and we are your Data Processor. You decide the purposes and means; we process on your behalf. For the account, billing and website information about you as our customer, we are the Data Fiduciary, and the Privacy Policy applies."] },
      { heading: "Your responsibilities as Data Fiduciary", list: ["Give your people, clients, students and visitors the notice the Act requires, and obtain and record their consent where it is needed.", "Make sure the data you put in is lawful to process and accurate, and keep it up to date.", "Answer the requests and complaints of those people, and inform the Data Protection Board of India and the people concerned of a breach as the law requires.", "Do not give us instructions that break the law."] },
      { heading: "Your instructions", list: ["We process your personal data only to provide the service, as you instruct through the product, its settings, its API and your written requests.", "Features you switch on (AI, automations, integrations, your website, push notifications) are instructions to process data in that way.", "If we believe an instruction breaks the law, we will tell you and may pause it until it is clarified."] },
      { heading: "Confidentiality and access", body: ["Only people who need access to operate and support the service have it, and they are bound by confidentiality. What platform staff do in the Platform Console is recorded in a platform audit log. Inside your company, access follows the roles and permissions you set."] },
      {
        heading: "Security safeguards",
        list: [
          "Strict isolation: every record carries its company, and every database query is confined to it.",
          "Roles and per-action permissions, enforced on the server, with extra permission for payroll, salaries, bank details and stored credentials.",
          "Two-step sign-in, mandatory for company Directors and every Platform Console user; lock-out after repeated wrong passwords; passwords stored only as salted hashes.",
          "Encryption of connection secrets and vault documents at rest, HTTPS with HSTS for all traffic, and a hardened set of security headers.",
          "Uploaded files are checked by type and size before they are accepted.",
          "Sign-ins, changes, exports and administrative actions are logged; logs are kept for 180 days.",
          "Backups of your workspace, with restore and deletion controls for your Director.",
        ],
      },
      { heading: "Sub-processors", body: ["You authorise us to use the sub-processors on the Sub-processors page. We bind each one to data protection terms no less protective than these, and remain responsible to you for them. We update that page before a new sub-processor starts handling your personal data; if you object on reasonable grounds, write to us and we will work with you on a solution, and if there is none you may cancel."] },
      { heading: "Transfers outside India", body: ["Section 16 of the Digital Personal Data Protection Act allows transfer of personal data outside India except to countries the Central Government restricts by notification. We do not transfer your personal data to a restricted country. Our sub-processors and the regions they use are listed on the Sub-processors page."] },
      { heading: "Helping you answer people's rights", body: [`People can ask you to give them a summary of their data, correct it, erase it, redress a grievance or nominate someone. Your workspace has export and deletion tools. If someone writes to us about data in your workspace, we send them to you and do not answer on your behalf. If you need our help beyond those tools, write to ${m.privacy}.`] },
      { heading: "Personal data breach", body: ["If we learn of a breach of security that leads to accidental or unlawful destruction, loss, alteration or unauthorised disclosure of your personal data, we tell you without undue delay, with what happened, the data and people affected as far as we know, what we have done and what we advise, and we keep you informed as we learn more, so that you can inform the Data Protection Board of India and the people concerned. We also report cyber security incidents to CERT-In within 6 hours of noticing them."] },
      { heading: "Return and erasure", body: ["You can export your data at any time while your plan is active. When the service ends, your workspace stays readable for a period so you can export it. A Director can delete the company: it is scheduled for deletion after a 30-day period during which it can be restored. After that, we erase the data and ask our sub-processors to do the same, and backups roll off on their stated schedule. We keep only what the law requires us to keep, such as tax and accounting records, as section 8(7) of the Act allows."] },
      { heading: "Information and audits", body: [`We make available the information needed to show that we meet this addendum, including the Security & Trust page. If you need more, or an audit that your regulator requires, write to ${m.security}. We will agree a reasonable scope, time and confidentiality so that it does not put other customers at risk.`] },
      { heading: "Order of precedence and liability", body: ["If this addendum and the Terms of Service conflict about the processing of personal data, this addendum applies. Liability is as set out in the Terms of Service, except where the law does not allow it to be limited."] },
      contactSection(c, "any question about how we process your data"),
    ],
  };
}

// ── Sub-processors ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function subprocessorsDoc(c: LegalContext): LegalDoc {
  const m = c.mail;
  return {
    slug: "subprocessors",
    title: "Sub-processors and International Transfers",
    description: `The providers ${SERVICE} uses to run the service, what each one receives, and how personal data is protected when it leaves India.`,
    intro: `${SERVICE} uses a small number of providers to run the service. This page lists them, what each does and receives, and how transfers outside India are handled.${effectiveLine(c)}`,
    highlights: [
      { icon: "layers", title: "A short, named list", text: "Each provider, its purpose and the data it handles." },
      { icon: "globe", title: "Section 16 followed", text: "No transfer to a country the Central Government has restricted; transfers are recorded in a register." },
      { icon: "check", title: "Told before changes", text: "This page is updated before a new provider handles customer data." },
    ],
    sections: [
      { heading: "Providers we use for everyone", list: SUB_PROCESSORS.filter((p) => p.scope === "platform").map((p) => `${p.name}: ${p.purpose}. Receives: ${p.data}.`) },
      { heading: "Services a company connects itself", body: ["These are used only if a company connects them in Settings → Integrations, with its own account and keys. The company chooses them and is responsible for its agreement with them; we send data to them only as the company's automations and settings direct."], list: SUB_PROCESSORS.filter((p) => p.scope === "company").map((p) => `${p.name}: ${p.purpose}. Receives: ${p.data}.`) },
      { heading: "Where data is processed", body: ["Hosting and database regions are chosen when the service is deployed, and the AI, email and payment providers process data in the countries where they operate. To learn which regions are used for your workspace, write to the address below."] },
      { heading: "Transfers outside India", body: ["The Digital Personal Data Protection Act, 2023 (section 16) allows transfer of personal data outside India except to a country or territory the Central Government restricts by notification, and any other Indian law that gives a higher protection or restricts a transfer still applies (for example sector rules for financial or health data). We do not transfer personal data to a restricted country, we bind every provider to protect it, and we record each transfer in a register with the safeguard used."] },
      { heading: "How we choose providers", body: ["Before a provider handles customer data we check what it receives, how it protects it, where it processes it and what its security attestations say, and we bind it to data protection terms. We review providers at least once a year and when what they receive changes."] },
      { heading: "Changes and objections", body: [`We update this page before a new provider starts handling customer data. If you object on reasonable data protection grounds, write to ${m.privacy}.`] },
      contactSection(c, "data protection questions about our providers"),
    ],
  };
}

// ── Data rights and requests ────────────────────────────────────────────────────────────────────────────────────────────────────

export function dataRequestsDoc(c: LegalContext): LegalDoc {
  return {
    slug: "data-requests",
    title: "Your Data Rights and Requests",
    description: `How to use your rights under India's Digital Personal Data Protection Act, 2023 with ${SERVICE}: a summary of your data, correction, erasure, grievance redressal and nomination, and what to expect.`,
    intro: `You can ask us about the personal data we hold about you. Use the form at the end of this page, or write to our Grievance Officer. If your data is in a business's workspace, that business decides what happens to it, so ask the business.${effectiveLine(c)}`,
    highlights: [
      { icon: "check", title: "One place to ask", text: "A form, a reference number and a confirmation email." },
      { icon: "clock", title: "Acknowledged in 24 hours", text: "We resolve within 15 days and in any case within 30 days, and tell you if we need more time and why." },
      { icon: "shield", title: "Your identity checked", text: "So your data is never given to someone else." },
    ],
    sections: [
      { heading: "Who to ask", list: [`Data about you as a visitor, a sign-up or a customer of ${SERVICE} (your account, billing contacts, enquiries): ask us, using the form below.`, "Data a business holds in its workspace (its people, clients, students, applicants, website visitors): ask that business. We process it for the business and send requests we receive to them."] },
      {
        heading: "Your rights under the Digital Personal Data Protection Act, 2023",
        list: [
          "Access (section 11): a summary of the personal data we hold about you and how we process it, the identities of other parties we shared it with, and the data shared.",
          "Correction, completion and updating (section 12): have inaccurate or incomplete data fixed.",
          "Erasure (section 12): have data erased when it is no longer needed for the purpose, unless the law requires us to keep it, for example tax and accounting records.",
          "Grievance redressal (section 13): have your complaint answered by our Grievance Officer.",
          "Nomination (section 14): name another person to exercise your rights if you die or cannot do so yourself.",
          "Withdraw consent (section 6): where we rely on your consent, take it back at any time.",
        ],
      },
      { heading: "How we handle a request", list: ["We send a confirmation email with a reference number straight away, and acknowledge the request within 24 hours.", "We may ask you to confirm who you are, using the email address you wrote from or details only the account holder knows.", "We resolve it within 15 days and in any case within 30 days. If it is complex we tell you why before the 30 days end and how long we need.", "We do not charge for a reasonable request. If we cannot do what you ask, we say why and tell you how to complain.", "Every request and its outcome is recorded for three years, so we can show how it was handled."] },
      { heading: "If you are not satisfied", body: ["Write to our Grievance Officer again, giving the reference number, and we will review the answer. If you are still not satisfied, or do not receive an answer in time, you can complain to the Data Protection Board of India after using our grievance process, as the Act provides."] },
      contactSection(c, "a request about your personal data"),
    ],
  };
}

// ── Grievance Redressal (new) ───────────────────────────────────────────────────────────────────────────────────────────────────

export function grievanceDoc(c: LegalContext): LegalDoc {
  return {
    slug: "grievance",
    title: "Grievance Redressal",
    description: `The Grievance Officer of ${SERVICE}: how to file a complaint, how fast it is answered, and where to go if you are not satisfied, as the IT Rules 2021, the E-Commerce Rules 2020 and the DPDP Act, 2023 require.`,
    intro: `If you have a complaint about ${SERVICE}, our service, a bill, your personal data, or content on the service, write to our Grievance Officer. This page also states who to turn to if you are not satisfied.${effectiveLine(c)}`,
    highlights: [
      { icon: "chat", title: "A named officer", text: "The Grievance Officer's name and contact are published here, as Indian law requires." },
      { icon: "clock", title: "24 hours to acknowledge", text: "We resolve within 15 days, and in any case within 30 days." },
      { icon: "shield", title: "Somewhere to escalate", text: "The Data Protection Board of India and the National Consumer Helpline, as the case may be." },
    ],
    sections: [
      { heading: "Grievance Officer", body: [`Appointed under Rule 3(2) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, Rule 4(5) of the Consumer Protection (E-Commerce) Rules, 2020, Rule 5(9) of the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 and section 13 of the Digital Personal Data Protection Act, 2023.`], list: grievanceLines(c) },
      { heading: "What you can complain about", list: ["The service, a bill, a refund or a cancellation.", "How your personal data is collected, used, shared or kept, or a right you asked to use.", "Content on the service that you think is unlawful or that violates your rights, including content that exposes your private areas or is an impersonation of you; for this kind of complaint we act within 24 hours as the Intermediary Rules require.", "Anything else about how we have treated you."] },
      { heading: "How to complain", list: ["Email the Grievance Officer, or use the Your Data Rights and Requests form for privacy requests, or open a request in Help & Support for billing and service questions.", "Give your name, your workspace address or the email you registered with, what happened, any invoice or reference number, and what you want us to do.", "You do not need a lawyer, and it costs nothing."] },
      { heading: "What happens next", list: ["Acknowledgement within 24 hours, with a reference number.", "We look into it, and may ask you for more details or proof of identity.", "We give you a reasoned answer and fix what is wrong within 15 days and in any case within 30 days; where we cannot, we tell you why and what else you can do.", "Complaints and answers are recorded for three years."] },
      { heading: "If you are not satisfied", list: ["Personal data: the Data Protection Board of India, once you have used this process, as the Digital Personal Data Protection Act, 2023 provides.", "Consumers: the National Consumer Helpline (1915, or consumerhelpline.gov.in), and the consumer commission through e-Daakhil (edaakhil.nic.in), under the Consumer Protection Act, 2019.", "Online content: the Grievance Appellate Committee, where the Intermediary Rules provide for it, and the courts.", "Cyber security incidents and cyber crime: CERT-In (incident@cert-in.org.in) and the National Cyber Crime Reporting Portal (cybercrime.gov.in), 1930.", "Disputes under our contract: the process in the Terms of Service."] },
    ],
  };
}
