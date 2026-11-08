/**
 * Neutral defaults for the starter website a new company is given: header / footer labels and the contact form. Nothing
 * here belongs to any company; the company's own name, contact details and social links are filled in from its profile.
 */

import type { SiteInfo } from "@/lib/products/sitecraft-ai/site-info-shared";

export const STARTER_SITE_INFO_DEFAULTS = {
  "header": {
    "ctaLabel": "Let's Talk",
    "ctaHref": "/contact",
    "followLabel": "Follow Us",
    "askAiLabel": "Ask AI",
    "askAiHref": "/ask",
    "featuredLabel": "Featured",
    "consultLabel": "Book a Consultation",
    "consultHref": "/contact",
    "liveChatLabel": "Live Chat",
    "whatsappLabel": "WhatsApp",
    "dashboardLabel": "Dashboard",
    "loginLabel": "Login",
    "signupLabel": "Sign up"
  },
  "labels": {
    "breadcrumbHome": "Home",
    "breadcrumbBlog": "Blog",
    "readingTime": "Reading time",
    "readArticle": "Read Article",
    "featured": "Featured",
    "mostPopular": "Most Popular",
    "bestForListing": "Best for:",
    "bestForPlan": "Best for: ",
    "caseChallenge": "Challenge: ",
    "caseSolution": "Solution: ",
    "upNext": "Up Next",
    "exploreService": "Explore service",
    "learnMore": "Learn More",
    "onThisPage": "On this page",
    "sendAnother": "Send another message",
    "fileSelected": "Selected: ",
    "heroBadgeOneTitle": "Trusted Process",
    "heroBadgeOneText": "Proven at scale",
    "heroBadgeTwoTitle": "Dedicated Experts",
    "heroBadgeTwoText": "On every project",
    "exploreMore": "Explore More",
    "exploreMoreFeatured": "Explore More",
    "faqTitle": "Frequently asked questions",
    "relatedServicesTitle": "Related services",
    "relatedPostsTitle": "Related reading",
    "messageSent": "Message sent!",
    "liveDemoHeading": "Try it yourself, right now",
    "liveDemoDescription": "No sign-up walls, no sales call required — launch the live product and see it work with your own image.",
    "detailCtaLabel": "Start a Conversation",
    "planFeaturesLabel": "What's Included",
    "viewDetails": "View Details",
    "morePillars": "More Service Pillars",
    "readNextArticle": "Read Next Article"
  },
  "floating": {
    "assistantLabel": "Ask AI",
    "whatsappLabel": "WhatsApp",
    "liveChatLabel": "Live Chat"
  },
  "footer": {
    "badge": "Available for new projects",
    "ctaTitle": "Have a project in mind?",
    "ctaText": "Let's talk about what you need.",
    "ctaLabel": "Get in touch",
    "ctaHref": "/contact",
    "whatsappLabel": "Chat on WhatsApp",
    "followLabel": "Follow us"
  }
} as unknown as Partial<SiteInfo>;

export const STARTER_CONTACT_FIELDS = [
  {
    "name": "name",
    "label": "Name",
    "placeholder": "Enter your first name",
    "helpText": "",
    "required": true,
    "visible": true,
    "orderKey": 1024
  },
  {
    "name": "email",
    "label": "Email",
    "placeholder": "Enter your work email",
    "helpText": "",
    "required": true,
    "visible": true,
    "orderKey": 2048
  },
  {
    "name": "phone",
    "label": "Phone Number",
    "placeholder": "Enter your phone number",
    "helpText": "",
    "required": true,
    "visible": true,
    "orderKey": 3072
  },
  {
    "name": "message",
    "label": "Project Details",
    "placeholder": "Tell us about your goals, timeline, and requirements...",
    "helpText": "",
    "required": false,
    "visible": true,
    "orderKey": 4096
  }
];
