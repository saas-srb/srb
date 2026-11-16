/**
 * THE SETTINGS SCHEMA: every field a product keeps in its own settings, defined ONCE.
 *
 * A product's settings hold only that product's own choices. Anything that belongs to the whole company (who the company is, its keys and accounts)
 * is kept once in CommandOS and read from there, so it can never appear here. `scripts/test-shared-config.ts` reads this file and the product code
 * and FAILS THE BUILD when:
 *   - a settings type gains or loses a field that is not written here (so a new field is a deliberate, reviewed change),
 *   - the same field key is defined by two different products without being declared as an override below,
 *   - a field that belongs to the company (identity, a provider key) is defined or rendered in a product's settings,
 *   - one product settings form renders the same field twice.
 */

/** Where a field lives: the file and the exported type that defines it. */
export interface SettingsSource { file: string; type: string; fields: string[] }

const STAMP = ["_id", "updatedAt", "updatedBy"];

export const PRODUCT_SETTINGS: Record<string, SettingsSource[]> = {
  talentos: [
    { file: "src/lib/products/talentos/settings.ts", type: "OrgSettings", fields: [...STAMP, "workingDays", "shiftStart", "shiftEnd", "graceMinutes", "earlyDepartureMinutes", "halfDayHours", "fullDayHours", "timezone", "saturdayOffs", "state"] },
    { file: "src/lib/products/talentos/payroll-config.ts", type: "PayrollConfig", fields: [...STAMP, "pfRegistered", "esiRegistered", "ptRegistered", "lwfRegistered", "paidDaysBasis", "fixedDays", "sandwichRule", "unmarkedDay", "lateMarksPerHalfDay", "overtimeEnabled", "overtimeRequiresApproval", "overtimeMaxMinutesPerDay", "overtimeMaxMinutesPerMonth", "overtimeMultiplier", "holidayWorkMultiplier", "hoursPerDay", "shortLeavesPerMonth", "shortLeaveMaxMinutes", "expenseMaxAgeDays", "wageDefinition", "pfDefaultMode", "statutoryBonusEnabled", "statutoryBonusPercent", "minimumWage", "gratuityCovered", "includeGratuityProvision", "leaveEncashmentDaysInMonth", "tdsEnabled", "defaultTaxRegime", "noPanRule", "proofCutoffMonth", "deductionCapPercent", "requireSeparateApprover", "salaryAccountId", "financialYearStartMonth"] },
    // The payroll registrations and the payslip signatory. The identity fields of this legacy record are read from the company identity (fallback only).
    { file: "src/lib/products/talentos/company.ts", type: "CompanyDetails", fields: [...STAMP, "name", "legalName", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "email", "phone", "website", "pan", "gstin", "cin", "pfEstablishmentCode", "esiEstablishmentCode", "lin", "tan", "ptRegistration", "signatoryName", "signatoryDesignation", "payslipNote"] },
  ],
  sprintos: [{ file: "src/lib/products/sprintos/settings.ts", type: "PmsSettings", fields: [...STAMP, "categories", "technologySuggestions", "defaultCurrency"] }],
  "cohort-ai": [
    { file: "src/lib/products/cohort-ai/settings.ts", type: "TmsSettings", fields: [...STAMP, "technologySuggestions", "defaultCurrency", "certificateNumberFormat", "defaultClassDurationMinutes", "institute"] },
    { file: "src/lib/products/cohort-ai/settings.ts", type: "InstituteIdentity", fields: ["name", "addressLine", "city", "email", "phone", "website", "signatoryName", "signatoryTitle"] },
  ],
  spendiq: [
    { file: "src/lib/products/spendiq/settings.ts", type: "PrmsSettings", fields: [...STAMP, "defaultCurrency", "procurementReviewThreshold", "financeNotifyThreshold", "itemSuggestions", "company"] },
    { file: "src/lib/products/spendiq/settings.ts", type: "CompanyIdentity", fields: ["name", "addressLine", "city", "gstin", "pan", "email", "phone", "website", "signatoryName", "signatoryTitle"] },
  ],
  agentos: [{ file: "src/lib/products/agentos/settings.ts", type: "AibotsSettings", fields: [...STAMP, "models", "defaultModel", "maxOutputTokens", "dailyMessageLimit", "generalInstructions"] }],
  evaliq: [{ file: "src/lib/products/evaliq/settings.ts", type: "OtsSettings", fields: ["updatedAt", "updatedBy", "organizationName", "certificateNumberFormat", "signatoryName", "signatoryTitle", "defaultValidityMonths", "reminderHoursBeforeDue", "graceSeconds", "evaluatorUserIds"] }],
  "viralpulse-ai": [{ file: "src/lib/products/viralpulse-ai/settings.ts", type: "SmmsSettings", fields: [...STAMP, "brand", "ai", "linkedinVersion"] }],
  "rankmax-ai": [{ file: "src/lib/products/rankmax-ai/settings.ts", type: "SeoSettings", fields: [...STAMP, "siteOrigin", "crawl", "thresholds", "schedule", "defaults", "integrations"] }],
  cybervault: [{ file: "src/lib/products/cybervault/settings.ts", type: "DlmsSettings", fields: [...STAMP, "warnDays", "alertsEnabled"] }],
  "playbook-ai": [{ file: "src/lib/products/playbook-ai/pb-settings.ts", type: "PbSettings", fields: ["numbering", "approval", "legalTypes", "categoryRoles", "retentionMonths", "ai"] }],
  "sitecraft-ai": [{ file: "src/lib/products/sitecraft-ai/settings.ts", type: "CmsSettings", fields: ["maintenanceMode", "defaultOgImage", "companyLegalName"] }],
};

/** Bookkeeping fields every settings document has: allowed in every product. */
export const STAMP_FIELDS: readonly string[] = STAMP;

/**
 * Field keys two products may both define because they are separate, deliberate choices of each product (not copies of one thing):
 * the number format of the product's own certificates, the product's own suggestion lists, its own signatory, and the default currency a product
 * starts new records with (the company currency is the default; the product keeps its own choice for records it creates).
 */
export const PRODUCT_OVERRIDES: Record<string, { reason: string; products: string[] }> = {
  defaultCurrency: { reason: "the currency a product starts its own records with; the company currency is only the default", products: ["sprintos", "cohort-ai", "spendiq"] },
  technologySuggestions: { reason: "each product's own suggestion list", products: ["sprintos", "cohort-ai"] },
  certificateNumberFormat: { reason: "each product numbers its own certificates", products: ["cohort-ai", "evaliq"] },
  signatoryName: { reason: "who signs that product's own documents", products: ["cohort-ai", "spendiq", "evaliq", "talentos"] },
  signatoryTitle: { reason: "who signs that product's own documents", products: ["cohort-ai", "spendiq", "evaliq"] },
  state: { reason: "TalentOS holds state in two unrelated records (the holiday state for the work calendar, the company address in the legacy record)", products: ["talentos"] },
  ai: { reason: "each product's own AI model choices (never keys)", products: ["viralpulse-ai", "playbook-ai"] },
  integrations: { reason: "RankMax's own switches for which Google APIs it uses (never keys)", products: ["rankmax-ai"] },
};

/**
 * What belongs to the whole company and may not be defined or rendered in a product's settings, with the one place that owns it.
 * `fields` are the key names that would mean a copy of it; the check ignores the legacy identity fields that are listed in `LEGACY_IDENTITY_FALLBACKS`.
 */
export const COMPANY_OWNED: { owner: string; why: string; fields: string[] }[] = [
  { owner: "Company setup (company identity)", why: "who the company is", fields: ["gstin", "pan", "cin", "legalName", "companyLegalName", "organizationName", "addressLine1", "addressLine2", "postalCode", "timezone", "fiscalYearStartMonth", "financialYearStartMonth", "logoUrl"] },
  { owner: "Integrations (provider connection)", why: "provider keys and accounts", fields: ["apiKey", "apiSecret", "openaiApiKey", "openaiKey", "elevenLabsApiKey", "razorpayKeyId", "razorpayKeySecret", "keySecret", "authToken", "accountSid", "vapidPublicKey", "vapidPrivateKey", "privateKey", "clientSecret", "appSecret", "accessToken"] },
];

/**
 * The older copies of company identity that still exist ONLY as a fallback until the owner confirms they can go (the company identity wins whenever
 * it has a value, and the product forms show them read-only). Each is listed so none can be added silently; removing the fallback is a later step.
 */
export const LEGACY_IDENTITY_FALLBACKS: Record<string, string[]> = {
  talentos: ["OrgSettings.timezone", "PayrollConfig.financialYearStartMonth", ...["name", "legalName", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "email", "phone", "website", "pan", "gstin", "cin"].map((f) => `CompanyDetails.${f}`)],
  "cohort-ai": ["name", "addressLine", "city", "email", "phone", "website"].map((f) => `InstituteIdentity.${f}`),
  spendiq: ["name", "addressLine", "city", "gstin", "pan", "email", "phone", "website"].map((f) => `CompanyIdentity.${f}`),
  evaliq: ["OtsSettings.organizationName"],
  "sitecraft-ai": ["CmsSettings.companyLegalName"],
};

/**
 * The per-product identity blocks that existed before the company identity was one document. Their identity-like fields (name, address, contact,
 * registrations) are now fallbacks only: read-only in the product's form and overridden by the company identity. They are listed here so no new copy
 * can appear; the remainder of each block (signatory, payroll codes, payslip note) is the product's own and is checked like any other field.
 */
export const LEGACY_IDENTITY_BLOCKS: Record<string, { type: string; identityLike: string[] }[]> = {
  talentos: [{ type: "CompanyDetails", identityLike: ["name", "legalName", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "email", "phone", "website", "pan", "gstin", "cin"] }],
  "cohort-ai": [{ type: "InstituteIdentity", identityLike: ["name", "addressLine", "city", "email", "phone", "website"] }],
  spendiq: [{ type: "CompanyIdentity", identityLike: ["name", "addressLine", "city", "gstin", "pan", "email", "phone", "website"] }],
};
