/**
 * Client-safe copy for the public "Ways to earn credits" guide. Amounts are NEVER
 * written here — they come from the live, admin-configured reward rules. This file
 * only explains *when* a reward lands and *what the user has to do* to get it.
 */
import type { RewardRuleType, RewardRuleAudience } from "@/lib/wallet/constants";

export type GuideAudience = Exclude<RewardRuleAudience, "ALL">;

export const GUIDE_AUDIENCES: { id: GuideAudience; label: string; short: string; blurb: string }[] = [
  { id: "trainee", label: "Student", short: "Student", blurb: "Industrial-training students — learn, complete assessments and earn along the way." },
  { id: "intern", label: "Intern", short: "Intern", blurb: "Internship-program interns — every milestone from enrolment to certificate earns credits." },
  { id: "client", label: "Client / Business", short: "Client", blurb: "Clients and businesses — earn as your project moves forward and when you refer others." },
  { id: "job_applicant", label: "Job Seeker / Hiring", short: "Job seeker", blurb: "Job applicants — earn as you progress through hiring and by referring friends." },
];

/** Which reward types make sense for each audience (a client has no assignments; a job seeker has interviews). */
export const APPLIES_TO: Record<GuideAudience, RewardRuleType[]> = {
  trainee: ["signup", "profile_complete", "daily_visit", "streak_7", "stage_complete", "assignment_submit", "assignment_approved", "first_offer_claim", "first_payment", "referral_referrer", "referral_referee", "referral_milestone"],
  intern: ["signup", "profile_complete", "daily_visit", "streak_7", "stage_complete", "assignment_submit", "assignment_approved", "first_offer_claim", "first_payment", "referral_referrer", "referral_referee", "referral_milestone"],
  client: ["signup", "profile_complete", "daily_visit", "streak_7", "stage_complete", "first_offer_claim", "first_payment", "referral_referrer", "referral_referee", "referral_milestone"],
  job_applicant: ["signup", "profile_complete", "daily_visit", "streak_7", "stage_complete", "interview_completed", "first_offer_claim", "referral_referrer", "referral_referee", "referral_milestone"],
};

export interface GuideEntry {
  title: string;
  /** When the credits are added to the wallet. */
  when: string;
  /** What the user has to complete. */
  steps: string[];
  /** Extra conditions worth knowing. */
  note?: string;
  frequency: "One time" | "Every time" | "Once a day" | "Every 7 days";
}

export const EARN_GUIDE: Record<RewardRuleType, GuideEntry> = {
  signup: {
    title: "Create your account",
    when: "Instantly, the moment your account is created.",
    steps: ["Go to Sign up and choose what describes you (Student, Intern, Client/Business or Job seeker).", "Enter your name, email, phone and a password, accept the terms and submit."],
    note: "One signup reward per person. Staff-created accounts follow the same rule.",
    frequency: "One time",
  },
  profile_complete: {
    title: "Complete your profile",
    when: "Instantly after you save a valid profile.",
    steps: ["Open Portal → Profile.", "Enter your full name and a valid phone number, then press Save."],
    frequency: "One time",
  },
  daily_visit: {
    title: "Visit your dashboard daily",
    when: "Automatically the first time you open the portal each day (India time).",
    steps: ["Log in and open any portal page — that is all."],
    note: "Only the first visit each day counts.",
    frequency: "Once a day",
  },
  streak_7: {
    title: "7-day visit streak",
    when: "On the 7th consecutive day (and every 7th day after).",
    steps: ["Visit the portal every day for 7 days in a row.", "Missing a day resets the streak to 1."],
    frequency: "Every 7 days",
  },
  stage_complete: {
    title: "Complete a journey stage",
    when: "When our team marks the stage as completed on your journey (you get a notification).",
    steps: ["Follow your journey in Portal → My Journey.", "Do what each stage needs — attend, submit documents, pay, deliver — and our team moves you to the next stage."],
    note: "Some milestone stages (like certificate issued or joined) pay more. Stages that end in rejection, dropping out or closure never pay.",
    frequency: "Every time",
  },
  assignment_submit: {
    title: "Submit an assignment",
    when: "Instantly when your submission is recorded.",
    steps: ["Open Portal → Assignments.", "Upload or link your work and submit before the due date."],
    note: "Paid once per assignment.",
    frequency: "Every time",
  },
  assignment_approved: {
    title: "Get an assignment approved",
    when: "When your mentor reviews and approves the submission.",
    steps: ["Submit the assignment.", "Address any feedback if reworks are requested until it is approved."],
    note: "Paid once per assignment.",
    frequency: "Every time",
  },
  interview_completed: {
    title: "Attend an interview round",
    when: "When the recruiter marks your interview as completed.",
    steps: ["Check Portal → Interview Schedule for your slot.", "Join at the scheduled time and complete the round."],
    note: "Paid once per interview round.",
    frequency: "Every time",
  },
  first_offer_claim: {
    title: "Claim your first offer",
    when: "Instantly when your first festival-offer claim is submitted.",
    steps: ["Open the Offers page while an offer is live.", "Pick an offer, fill the claim form and submit."],
    note: "Only for the account that makes the claim; paid once.",
    frequency: "One time",
  },
  first_payment: {
    title: "Make your first payment",
    when: "When your first payment is recorded (course fee instalment or invoice receipt).",
    steps: ["Pay a fee or invoice through the usual payment channel.", "Our finance team records it and your credit is added automatically."],
    note: "Paying part of a fee or invoice with credits does not count as a payment.",
    frequency: "One time",
  },
  referral_referrer: {
    title: "Refer a friend",
    when: "When your friend qualifies under the current referral campaign (see the Referral section below).",
    steps: ["Open Portal → Referrals and copy your link or code.", "Share it — your friend signs up through it.", "Once they complete the campaign's qualifying step, you both get credits."],
    note: "Self-referrals and duplicate accounts are rejected; suspicious signups are held for review.",
    frequency: "Every time",
  },
  referral_referee: {
    title: "Join through a friend's link",
    when: "When you qualify under the referral campaign that brought you.",
    steps: ["Open a friend's referral link (or enter their code at signup).", "Create your account and complete the campaign's qualifying step."],
    frequency: "One time",
  },
  referral_milestone: {
    title: "Referral milestone bonus",
    when: "The moment your total rewarded referrals reaches a milestone.",
    steps: ["Keep referring — each rewarded referral counts towards the next milestone."],
    frequency: "Every time",
  },
};

export const GUIDE_FAQS: { question: string; answer: string }[] = [
  { question: "What is a YO Credit worth?", answer: "One credit equals ₹1 of discount wherever credits can be used. Credits are promotional — they have no cash value, can't be withdrawn or transferred." },
  { question: "When do credits expire?", answer: "Every reward shows its own validity (for example 90 days). Credits that pass their date expire automatically and the oldest credits expire first. We notify you 7 days before credits expire." },
  { question: "Can I use credits together with an offer and a coupon?", answer: "Yes. The offer discount and coupon discount are applied first; credits then cover part of the remaining amount, up to the limit set for your account type (see 'Where you can use credits')." },
  { question: "Where do I enter a coupon code?", answer: "In the claim form of a live offer there is a 'Coupon code' box — type the code, press Apply to preview the saving, then submit. Coupons are shared through campaigns and by our team; each has its own validity, minimum order, cap and per-person limit." },
  { question: "Why didn't I receive credits for something I did?", answer: "Stage, payment and interview rewards are added when our team records the step, so there can be a short delay. Each reward is paid once per event. If you think something is missing, message support from the portal and we will check your ledger." },
  { question: "Can credits be taken back?", answer: "Yes, if a reward was earned in error or through misuse (for example fake referrals), or if the related order is cancelled. Every change is recorded in your wallet ledger with a reason." },
  { question: "Is there a limit to how much I can earn?", answer: "One-time rewards can be earned once. Recurring rewards continue as long as the activity does. Referrals are capped per person by the active campaign." },
];
