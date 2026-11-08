/**
 * Page & widget text the platform operator's own site shows when its CMS has not set the key. These were fixed strings in the
 * components; they are now CMS text keys (CMS → Site Identity → Page & widget text), so every other company starts with them empty
 * and writes its own. The operator's wording is kept here so its site reads exactly as before.
 */
export const OWNER_TEXT_DEFAULTS: Record<string, string> = {
  "offers.offersHero.badge": "Festival Offers",
  "offers.offersHero.headline": "Build More. Pay Less.",
  "offers.offersHero.subheadline": "Exclusive limited-time offers on Software, AI, Training, Internships & Technology Talent.",
  "offers.finalCtaSection.live": "Festival offers are available for a limited period.",
  "offers.finalCtaSection.upcoming": "Talk to us — we'll let you know when the next festival offer goes live.",
  "offers.offersUpcoming.open-to-everyone": "Open to everyone",
  "offers.offersUpcoming.coming-soon": "Coming soon",
  "offers.offersUpcoming.scheduled": "Scheduled campaign · {days} to go",
  "offers.whyBrandSection.stat1.value": "12+",
  "offers.whyBrandSection.stat2.value": "100%",
  "offers.whyBrandSection.stat3.value": "4+",
  "offers.whyBrandSection.stat4.value": "24/7",
};
