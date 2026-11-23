# White label: a customer never sees the platform's name

Rule (owner, 2026-11-24): once a company has its own account, the words SRB, SelfRun and the platform's domain must not appear anywhere in its app.

## How branding flows
- Company brand: `getCompanyBrand()` (`src/lib/platform/branding`) is the single source. `brandName()` (`src/lib/platform/white-label.ts`) is the one-line accessor for server code that needs the company's name; it falls back to a neutral word, never the platform's.
- The one rule for "may the platform's name be shown here?": `isPlatformBrandVisible()` in the same file. True only outside any company (the marketing site, the Platform Console, platform mail) or inside the platform owner's own workspace. Do not add ad-hoc checks.
- Product names: the Product Registry (`panels/types.ts`, `DEFAULT_PANELS`) holds plain names (CommandOS, TalentOS, SprintOS, DealFlow AI, CashFlow AI, SpendIQ, Cohort AI ...). Names stored by earlier versions with a prefix are rewritten on the next registry load, and `whiteLabelProductName()` strips any brand prefix as a second lock.
- Tab titles: `brandedMetadata("... {brand} ...")`. Installable app: `buildCompanyIdentity()` (name, short name, description, shortcuts, icons). PDFs: `resolvePdfIdentity()` (company letterhead). Emails: `renderEmail({ brand: companyName })`; the default sender is shown as `<Company name> <no-reply@...>` (`senderForTenant`, used by `sendEmail`). Playbook PDF/DOCX metadata says "Playbook", not the platform.
- Wording for the shared (included) services: "Included default", "Included with your plan", "Using your own account". Never "Using SRB" / "SelfRun's account". Internal values (`using_srb`, `mode: "srb"`, `selfrun:` crypto labels, storage keys) stay as they are: they are identifiers a person never reads.
- Addresses: a company's default addresses end in the platform's root domain (it derives from `SAAS_HOSTS` / `PLATFORM_ROOT_DOMAIN`, so an owner can use a neutral root). The Default domain page, the Domains page and the Setup-progress step "Use your own web address" all tell the Director that their own domain replaces it.

## Where to add new strings
Write the company's name from `brandName()` / `{brand}` / the `brand` argument; write the product's name from the registry; write shared services as "included default". Never type the platform's name in tenant code.

## The guarantee: `npm run test:white-label`
1. Static: `scripts/lib/white-label-scan.ts` strips comments and finds the written brand forms (`SRB` as a word, `SelfRun`/`Self Run`, `SELFRUN`, `selfrunbusiness`) in string literals, templates and JSX text of all of `src`. Lowercase identifiers (`selfrun:...`, `srb`) are ignored.
2. Allowlist (each entry has a reason in `scripts/test-white-label.ts`): the marketing site `/saas` (pages, components, `lib/platform/saas`: content, docs, FAQs, legal, brand constants), the Platform Console, the platform sign-up page, the platform's own app identity (`lib/pwa/identity.ts`), development-only harness pages. An entry that no longer needs its exception fails the test, so the list only shrinks.
3. Runtime with a fake tenant "Acme Pvt Ltd" on a throwaway database: Product Registry (including a row stored with the old prefix), emails (no "Sent via" / "Powered by"), sender name, tab titles, app manifest, PDF letterhead identity, Integrations card copy and categories, connection providers, Setup-progress steps, AI prompt defaults; and the platform owner's own workspace still shows the platform's name through `isPlatformBrandVisible`.

## What is NOT covered (be honest)
- The in-app FAQ and docs text lives in `lib/platform/saas/*` (marketing). Nothing outside `/saas` imports it today, but if a tenant screen starts to, move that text out of the allowlisted folder.
- PDFs were checked through the letterhead identity and the static scan of every PDF component, not by rendering every document type.
- Voice and SMS/WhatsApp templates are covered only by the static scan of their source strings.
- "Powered by ViralPulse AI" on public visiting cards names a product, not the platform; remove it if the owner wants no attribution at all.
- A company's default addresses still end in the platform's domain until the company adds its own.
