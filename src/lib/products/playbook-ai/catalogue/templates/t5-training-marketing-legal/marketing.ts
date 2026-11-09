/**
 * T5 marketing (mk.profile to mk.content_calendar): eleven documents of public collateral and marketing planning.
 * Every claim comes from the user's inputs. AI sections write narrative from those facts only; names, numbers, awards, clients and quotes
 * are never generated. Collateral uses structured A4 blocks: short headings, short paragraphs, bullet lists and callouts.
 */
import { ai, aiSection, callout, col, divider, each, f, fixedSection, h, hybridSection, kv, p, whenSet } from "@/lib/products/playbook-ai/catalogue/build";
import { defineTemplate } from "@/lib/products/playbook-ai/catalogue/define";
import type { TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";
import { COLLATERAL_LAYOUT, DOC_LAYOUT, NEVER_MARKETING, companyContact, listRows, optionalText, whenUnset } from "@/lib/products/playbook-ai/catalogue/templates/t5-training-marketing-legal/common";

const contact = (extraLine?: string) => fixedSection("contact", "Contact", [companyContact(), ...(extraLine ? [p(extraLine)] : [])]);
const toneOk = { tone: "warm" as const };

const profile = defineTemplate("mk.profile", {
  title: "{{company.name}}: Company Profile",
  layout: COLLATERAL_LAYOUT,
  inputs: [
    optionalText("tagline", "Tagline", "Use the line the company already uses. Leave blank if none."),
    f.longtext("about_notes", "About the company", { help: "Facts only: what the company does, who it serves, where it works, when it was founded, its size. Only what you enter is used.", feedsSections: ["about"] }),
    f.rows("services", "Services or offerings", [col("name", "Name"), col("description", "One-line description")], { minRows: 1, maxRows: 20 }),
    f.rows("clients", "Clients you may name", [col("name", "Client name")], { required: false, minRows: 0, maxRows: 40, help: "Only clients that have agreed to be named." }),
    optionalText("contact_person", "Contact person for enquiries"),
  ],
  sections: [
    aiSection("about", "About", [whenSet("input.tagline", [p("**{{input.tagline}}**")]), p("[[input.about_text|About|Who the company is and what it does]]")],
      ai("Write an introduction to the company in two or three short paragraphs, using only the notes. Do not add dates, sizes, awards or claims that are not in them.", ["company.name", "input.tagline", "input.about_notes"], NEVER_MARKETING, { ...toneOk, minWords: 60, maxWords: 220 })),
    fixedSection("services", "Services", [listRows("input.services", "**{{item.name}}**: {{item.description}}")]),
    fixedSection("clients", "Clients", [whenSet("input.clients", [p("We are proud to work with:"), listRows("input.clients", "{{item.name}}")]), whenUnset("input.clients", [p("Client references are available on request.")])]),
    fixedSection("contact", "Contact", [companyContact(), whenSet("input.contact_person", [p("For enquiries, please contact {{input.contact_person}}.")])]),
  ],
});

const serviceBrochure = defineTemplate("mk.service_brochure", {
  title: "{{company.name}}: Our Services",
  layout: COLLATERAL_LAYOUT,
  inputs: [
    f.text("audience", "Who the brochure is for", { help: "For example 'growing manufacturing companies'." }),
    f.longtext("overview_notes", "What the company offers and the problem it solves", { feedsSections: ["overview"] }),
    f.rows("services", "Services", [col("name", "Service"), col("summary", "What it is and what the client gets"), col("outcome", "Outcome or benefit")], { minRows: 1, maxRows: 15 }),
    f.longtext("why_notes", "Reasons to choose the company", { help: "Facts you can stand behind: method, team, tools, support. No claims you cannot support.", feedsSections: ["why_us"] }),
    optionalText("cta", "Call to action", "For example 'Write to us for a free consultation'."),
  ],
  sections: [
    aiSection("overview", "Overview", [p("[[input.overview_text|Overview|What the company offers]]")],
      ai("Write a short overview of what the company offers and for whom, using only the notes.", ["company.name", "input.audience", "input.overview_notes"], NEVER_MARKETING, { ...toneOk, minWords: 40, maxWords: 160 })),
    fixedSection("services", "Services", [each("input.services", "item", [h(3, "{{item.name}}"), p("{{item.summary}}"), p("**What you get:** {{item.outcome}}")])]),
    aiSection("why_us", "Why us", [p("[[input.why_text|Why us|Reasons to choose the company]]")],
      ai("Write the reasons to choose the company as a short intro and a bullet list, using only the notes.", ["company.name", "input.why_notes"], NEVER_MARKETING, { ...toneOk, minWords: 40, maxWords: 170 })),
    fixedSection("contact", "Contact", [whenSet("input.cta", [callout("info", "{{input.cta}}")]), companyContact()]),
  ],
});

const productBrochure = defineTemplate("mk.product_brochure", {
  title: "{{input.product}}",
  layout: COLLATERAL_LAYOUT,
  inputs: [
    f.text("product", "Product name"), optionalText("tagline", "Tagline"),
    f.longtext("product_notes", "What the product is and who it is for", { feedsSections: ["overview"] }),
    f.rows("features", "Features", [col("feature", "Feature"), col("benefit", "What it means for the customer")], { minRows: 1, maxRows: 20 }),
    f.rows("specs", "Specifications", [col("name", "Specification"), col("value", "Value")], { required: false, minRows: 0, maxRows: 40, help: "Enter values exactly as they are in the product record." }),
    optionalText("cta", "Call to action"),
  ],
  sections: [
    aiSection("overview", "Overview", [whenSet("input.tagline", [p("**{{input.tagline}}**")]), p("[[input.overview_text|Overview|What the product is]]")],
      ai("Describe the product and who it is for in two short paragraphs, using only the notes.", ["input.product", "input.product_notes", "company.name"], NEVER_MARKETING, { ...toneOk, minWords: 40, maxWords: 170 })),
    fixedSection("features", "Features", [listRows("input.features", "**{{item.feature}}**: {{item.benefit}}")]),
    fixedSection("specs", "Specifications", [whenSet("input.specs", [listRows("input.specs", "**{{item.name}}:** {{item.value}}")]), whenUnset("input.specs", [p("Detailed specifications are available on request.")])]),
    fixedSection("contact", "Contact", [whenSet("input.cta", [callout("info", "{{input.cta}}")]), companyContact()]),
  ],
});

const onePager = defineTemplate("mk.one_pager", {
  title: "{{input.offering}}",
  layout: COLLATERAL_LAYOUT,
  inputs: [
    f.text("offering", "Offering", { help: "The product, service or proposition this page presents." }),
    f.longtext("offering_notes", "What it is, who it is for, and the problem it solves", { feedsSections: ["headline"] }),
    f.rows("benefits", "Benefits", [col("benefit", "Benefit"), col("detail", "Supporting detail", "text", false)], { minRows: 1, maxRows: 8 }),
    f.text("cta", "Call to action", { help: "One clear next step, for example 'Book a demo' with how to do it." }),
  ],
  sections: [
    aiSection("headline", "Headline", [p("[[input.headline_text|Headline|A headline and one supporting sentence]]")],
      ai("Write one headline of up to twelve words and one supporting sentence, using only the notes. No unsupported superlatives.", ["input.offering", "input.offering_notes", "company.name"], NEVER_MARKETING, { ...toneOk, minWords: 10, maxWords: 50 })),
    fixedSection("benefits", "Benefits", [listRows("input.benefits", "**{{item.benefit}}** {{item.detail|text}}")]),
    fixedSection("cta", "Call to action", [callout("important", "{{input.cta}}"), p("{{company.legal_name}}  |  {{company.email}}  |  {{company.phone}}  |  {{company.website}}")]),
  ],
});

const datasheet = defineTemplate("mk.datasheet", {
  title: "{{input.product}}: Datasheet",
  layout: COLLATERAL_LAYOUT,
  inputs: [
    f.text("product", "Product name"), optionalText("model", "Model or version"),
    f.longtext("summary_notes", "One-paragraph description", { required: false, feedsSections: ["use_cases"] }),
    f.rows("specs", "Specifications", [col("parameter", "Parameter"), col("value", "Value"), col("unit", "Unit", "text", false)], { minRows: 1, maxRows: 60, help: "Enter values and units exactly as they are in the product record." }),
    f.longtext("use_cases_notes", "Where and how the product is used", { feedsSections: ["use_cases"] }),
    optionalText("compliance", "Standards and certifications", "Only those the product actually holds; name them exactly."),
  ],
  sections: [
    fixedSection("specs", "Specifications", [kv([["Product", "{{input.product}}"], ["Model or version", "{{input.model|text|Not stated}}"], ["Issued by", "{{company.legal_name}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]), listRows("input.specs", "**{{item.parameter}}:** {{item.value}} {{item.unit|text}}"), whenSet("input.compliance", [p("**Standards and certifications:** {{input.compliance}}")])]),
    aiSection("use_cases", "Use cases", [p("[[input.use_cases_text|Use cases|Where and how the product is used]]")],
      ai("Describe where and how the product is used as a short bullet list, using only the notes. Do not state performance, ratings or standards that are not in the specifications or notes.", ["input.product", "input.summary_notes", "input.use_cases_notes", "input.specs"], NEVER_MARKETING, { tone: "neutral", minWords: 30, maxWords: 160 })),
    contact(),
  ],
  disclaimers: ["Specifications are as entered. Have them checked against the product record before the datasheet is released."],
});

const flyer = defineTemplate("mk.flyer", {
  title: "{{input.offer_title}}",
  layout: COLLATERAL_LAYOUT,
  inputs: [
    f.text("offer_title", "Offer or event title"),
    f.longtext("offer_notes", "What is on offer, for whom, and the terms", { help: "Include every condition that applies. Only what you enter is printed.", feedsSections: ["headline", "details"] }),
    f.date("start_date", "Starts on"), f.date("end_date", "Ends on", { required: false }),
    optionalText("venue", "Venue or link"), optionalText("time", "Time"),
    f.text("cta", "Call to action", { help: "How to take part, for example 'Call us or write to us to book'." }),
  ],
  sections: [
    aiSection("headline", "Headline", [p("[[input.headline_text|Headline|A short, attention-grabbing headline]]")],
      ai("Write one short headline of up to ten words from the offer notes. Do not add discounts, prices or claims that are not in them.", ["input.offer_title", "input.offer_notes"], NEVER_MARKETING, { ...toneOk, minWords: 3, maxWords: 25 })),
    hybridSection("details", "Details", [kv([["Starts", "{{input.start_date|date}}"], ["Time", "{{input.time|text|To be announced}}"], ["Where", "{{input.venue|text|To be announced}}"]]), whenSet("input.end_date", [p("**Ends:** {{input.end_date|date}}")]), p("[[input.details_text|Details|What is on offer and the terms]]")],
      ai("Describe the offer or event in two short paragraphs and list any terms as bullets, using only the notes.", ["input.offer_title", "input.offer_notes"], NEVER_MARKETING, { ...toneOk, minWords: 30, maxWords: 150 })),
    fixedSection("cta", "Call to action", [callout("important", "{{input.cta}}"), p("{{company.name}}  |  {{company.email}}  |  {{company.phone}}  |  {{company.website}}")]),
  ],
});

const pressRelease = defineTemplate("mk.press_release", {
  title: "Press Release",
  layout: COLLATERAL_LAYOUT,
  inputs: [
    f.text("headline_hint", "What the news is, in one line"), f.text("city", "City of release (dateline)"), f.date("release_date", "Release date"),
    f.longtext("news_notes", "The news in detail", { help: "Who, what, when, where and why. Only these facts are used.", feedsSections: ["headline", "body"] }),
    f.rows("quotes", "Quotes", [col("speaker", "Speaker"), col("designation", "Designation"), col("quote", "Quote, exactly as approved")], { required: false, minRows: 0, maxRows: 4, help: "Quotes are printed word for word. They are never written by AI." }),
    f.longtext("about_notes", "About the company", { help: "The boilerplate: what the company does. Facts only.", feedsSections: ["about"] }),
    f.text("media_contact", "Media contact name"),
  ],
  sections: [
    aiSection("headline", "Headline", [p("**FOR IMMEDIATE RELEASE**"), p("[[input.headline_text|Headline|The release headline]]")],
      ai("Write a factual headline of up to fifteen words from the news notes.", ["input.headline_hint", "input.news_notes", "company.name"], NEVER_MARKETING, { tone: "formal", minWords: 5, maxWords: 30 })),
    hybridSection("body", "Body", [p("**{{input.city}}, {{input.release_date|date}}:** [[input.body_text|Body|The news in the order of importance]]"), each("input.quotes", "item", [p("\"{{item.quote}}\", said {{item.speaker}}, {{item.designation}}.")])],
      ai("Write the news in two to four short paragraphs in order of importance, using only the notes. Do not write or paraphrase quotes; quotes are inserted separately.", ["company.name", "input.news_notes", "input.city", "input.release_date"], [...NEVER_MARKETING, "quotes or statements attributed to any person"], { tone: "formal", minWords: 80, maxWords: 300 })),
    aiSection("about", "About", [p("[[input.about_text|About|The company boilerplate]]")],
      ai("Write the 'About the company' boilerplate in one short paragraph, using only the notes.", ["company.name", "input.about_notes"], NEVER_MARKETING, { tone: "formal", minWords: 30, maxWords: 120 })),
    fixedSection("contact", "Media contact", [kv([["Contact", "{{input.media_contact}}"], ["Company", "{{company.legal_name}}"], ["Email", "{{company.email}}"], ["Phone", "{{company.phone}}"], ["Website", "{{company.website}}"]]), p("End of release.", "center")]),
  ],
});

const mediaKit = defineTemplate("mk.media_kit", {
  title: "{{company.name}}: Media Kit",
  layout: COLLATERAL_LAYOUT,
  inputs: [
    f.longtext("about_notes", "About the company", { feedsSections: ["overview"] }),
    f.rows("facts", "Company facts", [col("label", "Fact"), col("value", "Value")], { minRows: 1, maxRows: 25, help: "For example year founded, headquarters, number of employees. Only verified facts." }),
    f.rows("assets", "Logo and image files", [col("file", "File or asset name"), col("where", "Where to download it"), col("use", "How it may be used", "text", false)], { minRows: 1, maxRows: 15 }),
    f.rows("leaders", "Spokespeople and leadership", [col("name", "Name"), col("designation", "Designation"), col("bio", "Short biography", "text", false)], { required: false, minRows: 0, maxRows: 12 }),
    f.text("media_contact", "Media contact name"),
  ],
  sections: [
    aiSection("overview", "Overview", [p("[[input.overview_text|Overview|Who the company is]]")],
      ai("Write a short company overview in two paragraphs, using only the notes.", ["company.name", "input.about_notes"], NEVER_MARKETING, { tone: "formal", minWords: 50, maxWords: 190 })),
    fixedSection("logos", "Logos", [p("Please use the company logo only from the files listed here, without changing its colours, proportions or spacing."), listRows("input.assets", "**{{item.file}}**: {{item.where}}. {{item.use|text}}")]),
    fixedSection("facts", "Facts", [listRows("input.facts", "**{{item.label}}:** {{item.value}}"), whenSet("input.leaders", [h(3, "Spokespeople"), listRows("input.leaders", "**{{item.name}}**, {{item.designation}}. {{item.bio|text}}")])]),
    fixedSection("contact", "Media contact", [kv([["Contact", "{{input.media_contact}}"], ["Company", "{{company.legal_name}}"], ["Email", "{{company.email}}"], ["Phone", "{{company.phone}}"], ["Website", "{{company.website}}"]])]),
  ],
});

const brandGuide = defineTemplate("mk.brand_guide", {
  title: "{{company.name}}: Brand Guidelines",
  layout: DOC_LAYOUT,
  inputs: [
    optionalText("owner", "Brand owner", "The person or team who answers brand questions."),
    f.longtext("logo_notes", "Logo rules", { help: "Clear space, minimum size, versions, and what must never be done to the logo.", feedsSections: ["logo"] }),
    f.rows("colours", "Colours", [col("name", "Colour name"), col("value", "Colour value (hex)"), col("usage", "Where it is used")], { minRows: 1, maxRows: 12 }),
    f.rows("fonts", "Typefaces", [col("role", "Role (heading, body, caption)"), col("font", "Typeface"), col("note", "Notes", "text", false)], { minRows: 1, maxRows: 6 }),
    f.longtext("voice_notes", "Voice and tone", { help: "How the company sounds: words to use and words to avoid.", feedsSections: ["voice"] }),
  ],
  sections: [
    aiSection("logo", "Logo", [kv([["Brand", "{{company.name}}"], ["Owner", "{{input.owner|text|Marketing team}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]), p("[[input.logo_text|Logo|How the logo is used]]")],
      ai("Set out the logo rules as a short intro and a bullet list of do and do-not rules, using only the notes.", ["company.name", "input.logo_notes"], NEVER_MARKETING, { tone: "instructional", minWords: 30, maxWords: 150 })),
    fixedSection("colour", "Colour", [p("Use only these colours in company material."), listRows("input.colours", "**{{item.name}}** ({{item.value}}): {{item.usage}}")]),
    fixedSection("type", "Type", [p("Use these typefaces in all company material."), listRows("input.fonts", "**{{item.role}}:** {{item.font}}. {{item.note|text}}")]),
    aiSection("voice", "Voice", [p("[[input.voice_text|Voice|How the company writes and speaks]]")],
      ai("Describe the company's voice and tone as a short paragraph and a do and do-not list, using only the notes.", ["company.name", "input.voice_notes"], NEVER_MARKETING, { tone: "instructional", minWords: 30, maxWords: 170 })),
    fixedSection("approval", "Questions and approvals", [p("Anyone unsure whether a use of the brand follows these guidelines should ask the brand owner before publishing.")]),
  ],
});

const campaignBrief = defineTemplate("mk.campaign_brief", {
  title: "Campaign Brief: {{input.campaign}}",
  layout: DOC_LAYOUT,
  inputs: [
    f.text("campaign", "Campaign name"), f.text("owner", "Campaign owner"),
    f.longtext("goal_notes", "Goal", { help: "What the campaign must achieve and how success will be judged.", feedsSections: ["objective"] }),
    f.longtext("audience_notes", "Audience", { help: "Who the campaign speaks to and what they care about.", feedsSections: ["audience"] }),
    f.multiselect("channels", "Channels", ["Email", "LinkedIn", "Instagram", "Facebook", "YouTube", "WhatsApp", "Website", "Search ads", "Events", "Print", "Press"]),
    f.longtext("channel_notes", "Message and plan for each channel", { required: false, feedsSections: ["channels"] }),
    f.money("budget", "Budget", { required: false }), f.date("start_date", "Start date", { required: false }), f.date("end_date", "End date", { required: false }),
  ],
  sections: [
    aiSection("objective", "Objective", [kv([["Campaign", "{{input.campaign}}"], ["Owner", "{{input.owner}}"], ["Prepared on", "{{date.today|date}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]), p("[[input.objective_text|Objective|What the campaign must achieve]]")],
      ai("State the campaign objective and how success will be judged, using only the notes.", ["input.campaign", "input.goal_notes"], NEVER_MARKETING, { tone: "formal", minWords: 30, maxWords: 130 })),
    aiSection("audience", "Audience", [p("[[input.audience_text|Audience|Who the campaign speaks to]]")],
      ai("Describe the target audience and what matters to them, using only the notes.", ["input.audience_notes"], NEVER_MARKETING, { tone: "formal", minWords: 30, maxWords: 140 })),
    hybridSection("channels", "Channels", [p("**Selected channels:** {{input.channels}}"), p("[[input.channels_text|Channels|The message and plan for each channel]]")],
      ai("Describe the message and plan for each selected channel, using only the notes. Do not invent budgets, schedules or targets.", ["input.channels", "input.channel_notes", "input.audience_notes"], NEVER_MARKETING, { tone: "formal", minWords: 30, maxWords: 200 })),
    fixedSection("budget", "Budget and timeline", [whenSet("input.budget", [p("**Budget:** {{input.budget|money}} ({{input.budget|words}}).")]), whenSet("input.start_date", [p("**Starts:** {{input.start_date|date}}")]), whenSet("input.end_date", [p("**Ends:** {{input.end_date|date}}")]), p("Spend above the approved budget needs written approval from the campaign owner before it is committed.")]),
  ],
});

const contentCalendar = defineTemplate("mk.content_calendar", {
  title: "Content Calendar: {{input.period}}",
  layout: DOC_LAYOUT,
  inputs: [
    f.text("period", "Period", { help: "For example 'November 2026' or 'Quarter two'." }),
    f.multiselect("channels", "Channels covered", ["Email", "LinkedIn", "Instagram", "Facebook", "YouTube", "WhatsApp", "Blog", "Website", "Press"]),
    f.rows("entries", "Planned content", [col("date", "Date", "date"), col("channel", "Channel"), col("topic", "Topic"), col("format", "Format"), col("owner", "Owner"), col("status", "Status", "text", false)], { minRows: 1, maxRows: 120 }),
  ],
  sections: [
    fixedSection("calendar", "Calendar table", [
      kv([["Period", "{{input.period}}"], ["Channels", "{{input.channels}}"], ["Prepared on", "{{date.today|date}}"], ["Reference", "{{doc.number||To be assigned on issue}}"]]),
      p("Entries are listed in the order planned. Update the status as each piece moves from idea to draft, approved and published."),
      divider(),
      listRows("input.entries", "**{{item.date|date}}** | {{item.channel}} | {{item.topic}} | {{item.format}} | Owner: {{item.owner}} | Status: {{item.status|text|planned}}"),
    ]),
  ],
});

export const MARKETING_TEMPLATES: TemplateDef[] = [profile, serviceBrochure, productBrochure, onePager, datasheet, flyer, pressRelease, mediaKit, brandGuide, campaignBrief, contentCalendar];
