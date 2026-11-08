/* eslint-disable */
// The literal prompts as they were written in code BEFORE they moved into the registry (extracted verbatim). Used by test-prompts-goldens.ts to prove the default text did not change.
export const oldBrochureGenerate = (v: any) => {
  const { input, brand, audience, offerings, highlights, cta, tone, language } = v;
  return `You are a world-class digital brochure designer and commercial copywriter.
Generate professional, structured content for a digital brochure with the following brief:
- Brochure Title: "${input.title}"
- Category: ${input.category}${input.customCategory ? ` (${input.customCategory})` : ""}
- Brand / Business Name: "${brand}"
- Business Description / Objective: "${input.aboutBusiness || input.title}"
- Target Audience: "${audience}"
- Core Products / Offerings: "${offerings}"
- Key Advantages / USPs: ${highlights.join(", ")}
- Primary Call to Action: "${cta}"
- Tone of Voice: ${tone}
- Language: ${language}

Return a valid JSON object matching this exact structure:
{
  "heroHeadline": "compelling punchy headline (max 8-10 words)",
  "heroSubheadline": "clear positioning tagline (max 6-8 words)",
  "heroDescription": "2-3 sentences explaining value proposition and benefit to the reader",
  "overviewTitle": "section heading",
  "overviewBody": "3-4 sentences summarizing organization, domain expertise, and capabilities",
  "featuresTitle": "section heading",
  "featuresSubtitle": "subheading",
  "features": [
    { "icon": "Star|Shield|Award|Zap|CheckCircle|Clock|Users|Cpu|Heart", "title": "feature title", "description": "concise description" },
    { "icon": "Star|Shield|Award|Zap|CheckCircle|Clock|Users|Cpu|Heart", "title": "feature title", "description": "concise description" },
    { "icon": "Star|Shield|Award|Zap|CheckCircle|Clock|Users|Cpu|Heart", "title": "feature title", "description": "concise description" }
  ],
  "servicesTitle": "section heading",
  "services": [
    { "title": "service 1", "description": "service 1 description", "icon": "Briefcase|Settings|Globe|Wrench", "price": "e.g. Inquire for pricing" },
    { "title": "service 2", "description": "service 2 description", "icon": "Briefcase|Settings|Globe|Wrench", "price": "e.g. Custom quote" },
    { "title": "service 3", "description": "service 3 description", "icon": "Briefcase|Settings|Globe|Wrench", "price": "e.g. Contact sales" }
  ],
  "faq": [
    { "question": "relevant client question", "answer": "clear professional answer" },
    { "question": "relevant client question", "answer": "clear professional answer" },
    { "question": "relevant client question", "answer": "clear professional answer" }
  ],
  "seoDescription": "1-2 sentence meta description for search engines",
  "keywords": "comma separated keywords"
}`;
};
export const oldBrochureUpdate = (v: any) => {
  const { section, brand, brochureContext, prompt } = v;
  return `You are an expert digital brochure copywriter and layout designer.
You are updating a "${section.data.type}" section of a brochure for "${brand}" (Category: ${brochureContext.category}).
Current section data:
${JSON.stringify(section.data, null, 2)}

User instruction:
"${prompt}"

Return ONLY a valid JSON object matching the exact schema of this section type (${section.data.type}).
Preserve the "type": "${section.data.type}" field. Improve or rewrite the fields according to the user instruction while maintaining professionalism and industry realism.`;
};
export const oldBrochureAddSection = (v: any) => {
  const { brand, brochureContext, prompt, preferredType } = v;
  return `You are a digital brochure architect.
A user wants to add a new section to their brochure for "${brand}" (Category: ${brochureContext.category}).
User prompt: "${prompt}"
Preferred type if specified: "${preferredType || "any suitable brochure section"}"

Available section types:
hero, overview, about, features, services, gallery, team, testimonials, pricing, stats, curriculum, process, projects, agenda, speakers, venue, floorplan, location, highlights, itinerary, offer, faq, cta, contact, custom.

Determine the best section type (or use preferredType), and return a strictly valid JSON object matching the data schema for that section:
{
  "sectionType": "one of the available types above",
  "sectionData": {
    "type": "same as sectionType",
    ... (all required fields for this section with realistic, professional content based on the prompt)
  }
}`;
};
export const oldBrochureTheme = (v: any) => {
  const { prompt, currentTheme } = v;
  return `You are a world-class graphic designer and brand stylist.
Generate a digital brochure theme palette and typography configuration based on the user's design prompt.
User aesthetic prompt: "${prompt}"

Current theme:
${JSON.stringify(currentTheme, null, 2)}

Allowed headingFont options: "Inter", "Plus Jakarta Sans", "Montserrat", "Cinzel", "Playfair Display"
Allowed bodyFont options: "Inter"
Allowed borderRadius options: "none", "sm", "md", "lg", "xl"
Allowed density options: "compact", "comfortable", "spacious"

Return strictly a valid JSON object matching this schema:
{
  "primaryColor": "#hex (main brand accent)",
  "accentColor": "#hex (secondary accent)",
  "backgroundColor": "#hex (canvas background, e.g. #ffffff or dark #0f172a)",
  "textColor": "#hex (high contrast text color)",
  "headingFont": "Inter|Plus Jakarta Sans|Montserrat|Cinzel|Playfair Display",
  "bodyFont": "Inter",
  "borderRadius": "none|sm|md|lg|xl",
  "density": "compact|comfortable|spacious"
}`;
};
export const oldBrochureChat = (v: any) => {
  const { input, brand, msg } = v;
  return `You are the AI Brochure Copilot in ViralPulse AI. You assist users via chat to edit, rewrite, add sections, and restyle digital brochures in real-time.

Brochure Context:
- Title: "${input.brochure.title}"
- Brand Name: "${brand}"
- Category: "${input.brochure.category}"
- Current Sections: ${JSON.stringify(
        input.brochure.sections.map((s) => ({
          id: s.id,
          type: s.type,
          label: s.headline || s.title || s.type,
        }))
      )}
- Currently Selected Section ID: "${input.selectedSectionId || "none"}"
${
  input.selectedSectionData
    ? `- Currently Selected Section Details: ${JSON.stringify({
        id: input.selectedSectionData.id,
        type: input.selectedSectionData.data.type,
        data: input.selectedSectionData.data,
      })}`
    : ""
}
- Current Theme: ${JSON.stringify(input.brochure.theme)}

User Request: "${msg}"

Classify user intent into ONE of:
1. "update_section": User wants to edit, rewrite, improve copy, change tone, or update a section.
   - Set "targetSectionId" to the section ID (use selectedSectionId if applicable, or find the section matching user intent).
   - Provide "updatedData": valid JSON object with updated fields for that section schema.
2. "add_section": User wants to add/insert a new section (e.g. pricing, testimonials, FAQ, team, process, roadmap, stats).
   - Set "sectionType" to one of: hero, overview, about, features, services, gallery, team, testimonials, pricing, stats, curriculum, process, projects, agenda, speakers, venue, floorplan, location, highlights, itinerary, offer, faq, cta, contact, custom.
   - Provide "sectionData": complete JSON object matching schema with realistic copy tailored to this brand.
3. "restyle_theme": User wants to change colors, dark/light mode, typography, or palette style.
   - Provide "updatedTheme": complete BrochureTheme object with primaryColor, accentColor, backgroundColor, textColor, headingFont, bodyFont, borderRadius, density.
4. "none": General conversation, greeting, advice, or clarification.

Return strictly valid JSON:
{
  "reply": "Concise, friendly message explaining what was updated or answering the question.",
  "actionTaken": "update_section" | "add_section" | "restyle_theme" | "none",
  "targetSectionId"?: string,
  "updatedData"?: object,
  "sectionType"?: string,
  "sectionData"?: object,
  "updatedTheme"?: object,
  "suggestedPrompts": ["Next prompt 1", "Next prompt 2", "Next prompt 3"]
}`;
};
export const oldVcardContent = (v: any) => {
  const { name, jobTitle, company, industry, audience, services, input, personality } = v;
  return `You are an expert personal branding consultant and copywriter.
Generate professional visiting card content for:
- Name: "${name}"
- Job Title: "${jobTitle}"
- Company: "${company}"
- Industry: "${industry}"
- Target Audience: "${audience}"
- Core Services/Expertise: "${services}"
- Key Achievements: "${input.achievements || "Not specified"}"
- Personality/Tone: "${personality}"

Create compelling, authentic, and professional content. Return strictly valid JSON:
{
  "tagline": "One punchy tagline (max 10 words, no clichés)",
  "bio": "Professional bio (2-3 sentences, first person, mentions key expertise and value proposition)",
  "servicesTitle": "Services section heading",
  "servicesList": ["Service 1", "Service 2", "Service 3", "Service 4"],
  "skillsList": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5", "Skill 6"],
  "ctaHeadline": "Call-to-action headline (action-oriented, 5-8 words)",
  "ctaBody": "CTA supporting text (1 sentence)",
  "ctaButton": "CTA button label (2-3 words)",
  "metaDescription": "SEO meta description (max 160 chars)"
}`;
};
export const oldVcardChat = (v: any) => {
  const { vcard, message } = v;
  return `You are the AI Visiting Card Copilot for ViralPulse AI.
You help users update their professional visiting card via chat.

Current Card:
- Name: "${vcard.name}"
- Job Title: "${vcard.jobTitle}"
- Company: "${vcard.company}"
- Bio: "${vcard.bio || "Not set"}"
- Layout: "${vcard.layout}"
- Color Scheme: "${vcard.colorScheme}"
- Tagline: "${vcard.branding.tagline || "Not set"}"
- Contact: ${JSON.stringify(vcard.contact)}

User message: "${message}"

Classify the user's intent and return strictly valid JSON:
{
  "reply": "Friendly, helpful explanation of what you did or answered.",
  "action": "update_field" | "change_layout" | "change_colors" | "update_contact" | "none",
  "field"?: "name" | "jobTitle" | "company" | "bio" | "tagline",
  "newValue"?: "the new value for the field",
  "layout"?: "classic|modern|minimal|bold|creative|executive",
  "colorScheme"?: "professional-blue|midnight-black|elegant-white|forest-green|royal-purple|rose-gold|coral-orange|slate-gray",
  "contactPatch"?: { "email"?: "...", "phone"?: "...", "linkedin"?: "...", "website"?: "...", "whatsapp"?: "..." },
  "suggestedPrompts": ["Prompt 1", "Prompt 2", "Prompt 3"]
}`;
};
