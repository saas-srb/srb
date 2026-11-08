# Playbook AI rebuild: audit, decisions and build plan

Status: planning only. No source was changed. Date of audit: 2026-11-03. Repo: Next.js 16.3.8, React 19.2.4, Tailwind v4, MongoDB (company-scoped layer), Vercel.
Convention: **VERIFIED** = read in the repo, run locally, or read in an official source. **UNVERIFIED** = from memory, vendor blogs or secondary sources; must be checked before the owner relies on it.

## Decisions (owner, approved; supersede any conflicting text below)

1. **Legal review**: the reviewer is an intern lawyer. Legal types keep the in-product notice "AI draft. Needs review by a qualified advocate before use". Every template has `reviewedBy` / `reviewedOn` that a user with the REVIEW_TEMPLATES permission can set; every template, starter and clone-of-starter defaults to **unreviewed** and shows that status. Nothing is marked reviewed by default.
2. **Execution all over India**: the e-stamping rules table covers every state and UT structurally. It is **platform-owned reference data maintained by the platform admin in the Console**, modelled on the Tax Rulebook (per state, per instrument category, per duty entry, with "confirmed by / on" stamps). Every entry is **unconfirmed** until a legal reviewer confirms it. Ship the structure and an empty (or structure-only) table; **never invent duty amounts**.
3. **E-stamp is manual**: the user buys the stamp paper elsewhere, uploads the certificate, and it is attached to the clone and to the sealed PDF. No reseller API.
4. **OTP**: **email OTP is the default** and works with no registration. **SMS OTP is optional via the company's own Twilio connection** and is **blocked with a clear explanation until the company confirms India DLT registration**. Twilio's India SMS guidelines say company and sender-ID registration on the operators' DLT portal comes first, only DLT-registered alphanumeric sender IDs are supported, and Entity ID and Template ID must be supplied with each message; carriers allow only DLT-approved templates (sources: twilio.com/en-us/guidelines/in/sms and Twilio support article 21162166457755; re-verify at build time, timelines are UNVERIFIED).
5. **Approvals**: the lifecycle states stay (draft, in_review, approved, issued) but an **author's own document is approved by default** (auto-advance). A company setting can require a different approver, per document type.
6. **Numbering**: `{PREFIX}/{FY}/{SEQ}` by default, Indian financial year April to March, configurable per company and per document type, atomic counters.
7. **Retention and purge** are permission-driven: a dedicated permission to purge and to set legal hold; retention period per document type is company-configurable; **no hardcoded periods**.
8. **Contract dates** (start, end, renewal) live in the ContractFlow vault; SpendIQ only links to them.
9. **SOPs** stay but simply: an SOP becomes a document type in a "Policies and procedures" template category, with the existing assignment and acknowledgement kept simple. Old SOP data is migrated. ContractFlow stays but is **restructured around the new model**; old `lpms_*` data is migrated or archived safely. **All document modification during signing happens only in ContractFlow on the clone, never in Playbook's document or the base template.**
10. **Language: English only for now.** The model stays Unicode-safe and the Noto fonts stay bundled, but no Hindi, Hinglish or bilingual features are built. Those items are removed from the plan.
11. **Employees see their own letters** (issued and signed) in the TalentOS portal: feature B12, after the vault.
12. **Real-time co-editing: deferred (not in this roadmap).** Nothing is designed or built for collaboration, presence or Yjs. The editor is single-user with safe save: autosave to drafts, a revision check (and optional edit lock) so a second editor gets a clear "someone else changed this, reload or merge" message instead of silently overwriting. The document model keeps stable node ids, which costs nothing and leaves a future collaboration layer possible.
13. **Template batch order**: HR lifecycle, contracts, management/operations/IT, vendor/pre-sale/finance, training/marketing/legal.

14. **Page: A4 only** (210 x 297 mm, portrait), as default and the only size for now, in the PBDoc model, editor page view, PDF (`size="A4"`) and DOCX (`w:pgSz` 11906 x 16838 twips). Page size, orientation and margins are **stored** in the document and template settings (so Letter or Legal later is a data change), but only A4 is exposed in the UI. Default margins 25 mm top and bottom, 20 mm left and right; company-configurable within safe limits (10 to 50 mm, and the text area must stay at least 100 mm wide); header and footer zones are reserved inside the margins. The editor shows A4 page boundaries, visible page breaks and page numbers, consistent with the PDF as far as pagination limits allow (the PDF stays authoritative, see 2.2).

Also decided earlier (section 0): Playbook only authors; ContractFlow clones, signs (built-in simple e-signature only, no ESP/Aadhaar/DSC) and keeps the party-wise vault.

Build status: see the end of this document ("Build log").

---

## 0. Scope (owner's clarification, binding)

1. **Playbook AI only creates documents**: starter templates, per-company templates, AI generation, editor, versions, approval, numbering, PDF and DOCX export. **There is no e-signature inside Playbook.**
2. A document is **cloned** into **ContractFlow AI** (owner decision): Playbook's document and template are never changed by signing; the clone is editable in ContractFlow until the first signature, then locked. ContractFlow runs the e-signature process and keeps the **signed** documents in a party-wise vault (client, vendor, employee, partner, freelancer, candidate, trainee, other), with status, expiry and renewal dates.
3a. **No ESP, Aadhaar eSign or DSC** in this roadmap: only a built-in simple electronic signature (email/phone OTP, audit trail, consent, sealed PDF with certificate of completion), behind a provider interface. **E-stamping is wanted wherever required** (guided step with certificate upload; automation not assumed).
3. The work is two tracks (A: Playbook authoring, B: ContractFlow signing and vault) joined by a handoff contract, still **built by one agent, one feature at a time**.

---

## 1. Audit of what exists today

### 1.1 Playbook AI today is an SOP library, not a document maker, and has no AI

VERIFIED: `grep -i openai|generate` over `src/lib/products/playbook-ai`, `src/components/products/playbook-ai`, `src/app/(products)/playbook-ai`, `src/app/(products)/api/playbook-ai` finds nothing that calls a model. The only "AI" is the product name. Sizes: lib 4,573 lines (21 files), components 3,743 (36 files), pages 2,485 (routes below).

| Area | What exists (real) | Evidence |
| --- | --- | --- |
| Routes | Dashboard, `library`, `library/new`, `library/[id]`, `library/[id]/edit`, `library/[id]/compare`, `my`, `assigned`, `departments`, `categories`, `templates`, `templates/[id]`, `reports`, `compliance`, `settings`, `notifications`, login, change-password. APIs: `files`, `files/[id]`, `export/[type]`, `cron`. | `src/app/(products)/playbook-ai/(protected)/**`, `src/app/(products)/api/playbook-ai/**` |
| Content model | Typed blocks (paragraph, heading 2-3, steps, bullets, table, checklist, image, video, attachment, link, note/warning/example/reference) inside sections. Paragraph text is a **Markdown string**. Heading levels 2 and 3 only. | `src/lib/products/playbook-ai/constants.ts:94-141` (`SopBlock`, `SopSection`, `SopContent`) |
| Versioning | Real and good: working `draft`, published `live`, immutable `sop_versions` row on each publish, unique (sopId, version) index, major/minor numbering, compare page, revert-to-draft, optimistic concurrency via `baseUpdatedAt`. | `sops.ts:283-300` (`saveSop`), `sops.ts:454-520` (`publishSop`), `sops.ts:475` (`nextVersion`), `sops.ts:615` (`revertDraftToVersion`), `library/[id]/compare/page.tsx` |
| Templates | Only a **section layout + guidance text**, seeded in code as 16 department families. The body is never templated. Per-company: `seedSystemTemplates` copies into the company collection, so clone/modify/delete already works. | `templates.ts:35` (`FAMILIES`), `templates.ts:37-60`, `templates.ts:205-210` (`sectionsFromTemplate` returns empty paragraphs) |
| Lifecycle | Draft, Published, Active, Expired (date-derived), Archived. **No review or approval state, by design.** | `constants.ts:23` ("There is NO review/approval state"), `sop-roles.ts:10` |
| Editor | Block editor made of `Textarea`s; Markdown typed by hand; no rich text, no inline marks UI, no variables, no page layout. Images are blocked inside Markdown. | `components/products/playbook-ai/BlockEditor.tsx:68,96,186`, `SopMarkdown.tsx:19` (`img: () => null`) |
| Export | Tabular only (CSV/XLSX of library, acknowledgements, compliance, reviews, audit). **No PDF, no DOCX of any document.** | `exports.ts`, `api/playbook-ai/export/[type]/route.ts:36-37` |
| Files | Private Vercel Blob via `putObject`; extension map + magic-byte sniffing; served only through an access-checked route. | `files.ts`, `lib/storage/blob.ts` |
| Permissions | Roles in `admin_users.roles` (`sop_admin`, `sop_manager`, `sop_author`, `sop_employee`) plus Director overrides; 12 permissions; object scope (own/department/all) and 6 confidentiality levels. | `lib/sop-roles.ts`, `access.ts:1-60`, `constants.ts:70-85` |
| Audit / notifications | Append-only `sop_activity_logs` (`recordAudit` never throws); notifications ride the shared `chat_notifications` store; daily cron for review/expiry/reminders. | `audit.ts`, `notifications.ts`, `reminders.ts`, `vercel.json` (`/api/playbook-ai/cron`) |
| Distribution | Assign to people/teams/departments/roles, acknowledgement with version, re-ack, checklists, feedback. Genuinely useful for policies/SOPs and **worth keeping**. | `assignments.ts`, `AckPanel.tsx`, `feedback.ts` |
| Tenancy | Collections `sops`, `sop_versions`, `sop_templates`, ..., `sop_counters`, `sop_settings` (the two singletons are in `KEYED_COLLECTIONS`, `collections.ts:63`). Company isolation is automatic (scoped DB). | `db.ts:35-49`, `lib/platform/tenancy/collections.ts` |

Real vs hardcoded: no lorem, mock or dummy data was found in the product (grep for lorem/dummy/todo/mock/fake/sample returned nothing). The "hardcoded" items are seed data and scope limits, not fakes:
- 32 seeded departments and 8 categories are in code (`constants.ts:208-256`), then become editable data (`taxonomy.ts`). One seed code contains a space (`code: "Cohort AI"`, `constants.ts:225`), which would fail the template validator regex `^[A-Z0-9]{1,8}$` (`templates.ts` `cleanTemplateInput`). Minor bug.
- Module links are a fixed list of 7 products (`constants.ts:79-87`).
- `docs/products.md:169-181` describes "versions and approval" while the code says there is no approval state. The doc overclaims.

**Conclusion:** the SOP engine (versions, access, assignment, acknowledgement, cron, audit) is solid and reusable as the "Distribution" feature. Everything the owner asked for (document types, AI, real editor, PDF/DOCX, brand, variables, approval, numbering) is **new**. The block model cannot guarantee identical PDF/DOCX output (Markdown strings inside blocks) and should be replaced by a typed document model (section 3.1) with a migration of existing SOPs.

### 1.2 ContractFlow AI today: a skeleton that looks complete in the docs but is not

ContractFlow (`src/lib/products/contractflow-ai`, 2,487 lines; routes under `src/app/(products)/contractflow-ai/(protected)`: new, documents, documents/[id], approvals, makers, templates, templates/[id], workflows, signatures, categories, settings, notifications) has a document-maker data model, but the parts the owner needs are **absent or stubbed**.

| Capability | State | Evidence (file:line) |
| --- | --- | --- |
| PDF export | **Not functional.** Tries `pdfkit` via `@ts-ignore` dynamic import; `pdfkit` is not a direct dependency (only present transitively through `@react-pdf`); on failure returns a hand-written minimal PDF stub. Nothing ever calls `getRenderer`/the renderer registry, and no export route exists (`api/contractflow-ai` has only `ai`, `entities`, `files`, `variables`). | `output/pdf.ts:29-41`; `output/renderer.ts` (registry unused: `grep getRenderer` has no caller); `package.json` (no `pdfkit`, no `docx`) |
| DOCX export | **Not functional.** `docx` is not in `package.json`; on import failure returns plain UTF-8 text with a `.docx` mime type (corrupt file). | `output/docx.ts:23-28` |
| AI generation | Single `chat.completions` call, model **hardcoded `"gpt-4o-mini"`**, `temperature: 0.7`, returns a free-form JSON array, parse failure silently becomes one paragraph. No facts, no schema, no fact guard. Route passes the literal `'ctx'` as `companyId` and returns 501 on any error. | `ai.ts:49,54,66`; `api/contractflow-ai/ai/generate/route.ts:25,29` |
| Editor | None. `documents/[id]/page.tsx` (208 lines) has no editor component; `createDocument` stores `blocks: []`. Templates page 124 lines. | `documents.ts:40-43`; `documents/[id]/page.tsx` |
| E-signature | **Data shape only.** `requestSignatures` inserts a `lpms_signatures` row with a nested `signers[]` and notifies; **nothing calls it** (no UI, no route) and **nothing calls `updateSignatureStatus`** (no webhook route). `ESignProvider` is an interface with no implementation. No signer link, no OTP, no signature capture, no sealed PDF, no certificate, no hash. | `signatures.ts:6-31` (interface), `signatures.ts:39-90`, `:63-64` (`providerId: null`); `grep requestSignatures|updateSignatureStatus` outside the file: no matches |
| Signed-document repository / party model | **None.** Documents belong to a `makerTypeId`, not a party. Entity adapters exist only for the workspace company, current user, and HRMS employees. No client (SprintOS `pms_clients`, ClientOS), vendor (SpendIQ `prms_vendors`) or partner adapters. | `entity-discovery.ts:41,84,126` |
| Versions | Snapshot row per `createVersion` (blocks, header/footer, fieldValues). Not hash-sealed, not immutable by index, `versionNumber` computed by read-then-write (race). | `versions.ts:9-45` |
| Numbering | `PREFIX-YYYY-NNN` computed by "find last document, +1": **not atomic**, can duplicate under concurrency; resets per year only by string parsing. | `makers.ts:110-133` |
| Workflow / approvals | Real CRUD for workflows, approvals, statuses (draft, review, pending_approval, approved, published, active, archived). Reusable ideas, light code. | `constants.ts:3-11`, `workflows.ts`, `approvals/page.tsx` |
| Roles | `lpms_admin`, `lpms_manager`, `lpms_author` string checks inline in each function (not the capability-matrix pattern used by SOP). | `documents.ts:17-20`, `templates.ts:42-47` |
| Data layer | Uses `ObjectId` `_id`s, `as any` throughout, stores `companyId` itself even though the scoped DB already stamps it, timestamps as ISO strings, not Dates. Collections `lpms_*` (scoped by default; none need KEYED). | `db.ts:7-124`, `documents.ts:40` |
| Variables | `{{a.b}}` regex + registry from adapters; `conditional` and `repeating` block types are declared in the type but no renderer handles them. | `variables.ts:6`, `types.ts` (`TemplateBlock`), `output/docx.ts` |
| Expiry / renewal / retention / reminders | Types mention `expiryDateTo` filter; no expiry fields, no reminders, no retention or legal hold, no renewals view. The product page claims "notifications when documents are ... expiring" (`docs/products.md:237-247`): **not implemented** (no cron in `vercel.json` for contractflow). | `library.ts:8`; `vercel.json` |
| Notifications | `lpmsEvents` for review/approval/decision/signature-requested. Reusable. | `lib/notify/triggers/lpms.ts:1-60` |

**Related and overlapping:** SpendIQ already has a vendor contract register with `startDate`, `endDate`, `renewalDate`, `autoRenew`, `documentStorageKey` (`lib/products/spendiq/contracts.ts:7-27`, collection `prms_contracts`). The vault must link to it, not duplicate it (decision in section 7.4).

### 1.3 Reusable inventory (VERIFIED unless noted)

| Need | Reuse | Where |
| --- | --- | --- |
| PDF engine | `@react-pdf/renderer` 4.9.0 (MIT), already in `serverExternalPackages` (`next.config.ts:11`); used by ~20 documents (payslip, invoices, certificates, PO). `renderPdf` + per-company identity scope (name, address, logo data URI). | `lib/pdf/identity.ts:1-60`, `lib/pdf/layout.tsx` (`PdfLetterhead`), `lib/pdf/lazy-styles.ts`, `components/products/talentos/PayslipPdfDocument.tsx` |
| PDF gaps | All current PDFs use built-in **Helvetica** (`layout.tsx:23`, `PayslipPdfDocument.tsx:28`): **no Devanagari anywhere in current PDFs**; no `Font.register` exists in the repo; logos limited to PNG/JPEG (`identity.ts:47`). | grep `Font.register` has no matches |
| Fonts (incl. Devanagari) | Noto Sans and Noto Sans Devanagari (Regular, Bold), SIL OFL, already bundled and traced into `/viralpulse-ai/**` functions. | `src/lib/products/viralpulse-ai/images/fonts/*`, `LICENSE-FONTS.txt`, `next.config.ts:21` |
| Blob storage | `putObject/getObject` private Blob with upload scanning and plan metering. | `lib/storage/blob.ts` |
| AI client and metering | `getOpenAI()`: company's own key first, else platform's; plan allowance check and token metering (streams included); `setAiFeature(label)` for the usage log. Responses API with strict `json_schema` is already used. | `lib/openai.ts:1-60`, `viralpulse-ai/ai.ts:143`, `lib/platform/billing/ai-usage-log.ts` |
| Model resolution | Prompts carry a `model` per key (`prompts/registry.ts:901` = gpt-4o-mini, `:231`/`:625` = gpt-4.1-mini); ViralPulse validates a chosen model against `/v1/models` (`viralpulse-ai/models.ts:20,91`). Reuse the registry, not a hardcoded id. | as cited |
| Prompt management | Platform console overrides, versioned; companies may edit wording of `companyEditable` prompts inside a fixed security header/footer. | `lib/prompts/registry.ts`, `guard.ts`, `company-store.ts` |
| Language policy | Exactly three languages: Hindi (Devanagari), English, Hinglish (Roman). | `lib/ai/policy.ts:1-30`, `registry.ts:29-31,918` |
| Fact checking pattern | Website AI audits generated text for invented numbers, prices, years, phones, banned claims, wrong script and scrubs offending sentences. Same idea for documents. | `lib/platform/website/ai/validate.ts` |
| Company profile | `hrms_company` singleton: legal name, address, PAN, GSTIN, CIN, TAN, PF/ESI codes, authorised signatory name and designation. Platform brand and logo via `getCompanyBrand`. | `lib/products/talentos/company.ts:16-45`, `lib/platform/branding/index.ts` |
| Employee / client / vendor records | `hrms_employees`, `pms_clients` (`sprintos/clients.ts:16`), `prms_vendors` (`spendiq/vendors.ts:23`), ClientOS clients, DealFlow leads. | as cited |
| Statutory numbers (India) | Platform-owned `payroll_statutory_rates`, `tax_rulebook` (global collections). Documents must pull law numbers from here, never from the model's memory. | `collections.ts:50-53` |
| Legal text built from profile | Console legal profile builds India-only policies with no placeholders; `npm run test:legal`. Template for privacy/terms generation. | `lib/platform/saas/legal-profile.ts`, `legal-india.ts` |
| Permissions, audit, notifications | SOP capability + scope + confidentiality pattern; append-only audit; `notifyRoles/notifyUsers`; central audit-log page (redirects in `next.config.ts`). | `sop-roles.ts`, `access.ts`, `audit.ts`, `lib/notify` |
| Encrypted browser JSON transport | `withTransport` wraps browser-called JSON routes; **required** for new routes called from client components. Downloads and public signer links are served without the envelope by design. | `lib/security/transport.ts` |
| Public link surfaces | `/pay` and `/verify` work on both hosts; any new public link prefix (`/sign`, `/d`) must be added to `SHARED_SEGMENTS`. | `lib/platform/tenancy/surfaces.ts:32` |
| Cron | `vercel.json` crons + `lib/cron` runner with locks and per-company runs. | `vercel.json`, `lib/cron` |
| Diff | `diff` 8.0.4 is in `node_modules` (transitive, BSD-3). Must be added as a direct dependency. | `package-lock.json:17726` |
| Dependencies **absent** | `docx`, TipTap, `mammoth`, `pdf-lib`: not installed. | `package.json` |

### 1.4 Constraints from the repo's own rules
- AGENTS.md: this Next.js has breaking changes; read `node_modules/next/dist/docs/` before Next-specific code. Read for this plan: `route.md` (route handlers: `params` is a Promise, streaming), `maxDuration.md`, `after.md`, `serverExternalPackages.md`. Version 16.3.8 confirmed in `node_modules/next/package.json`.
- Tenancy: every collection is company-scoped unless listed in `GLOBAL_COLLECTIONS`; a collection with a **fixed `_id`** (counters, singletons) **must be added to `KEYED_COLLECTIONS`** or two companies collide (`collections.ts:56-62`).
- Browser-called JSON routes use `withTransport`. Server-only modules (`import "server-only"`) must never be imported by client components; shared types and constants live in a client-safe file (the SOP `constants.ts` pattern, `constants.ts:1-4`).
- Memory rules to honour: company keys first; env holds only bootstrap keys; India-only legal content built from the Console legal profile with no placeholders; payroll statutory rates are platform-owned; DB tests only against a throwaway `MONGODB_URI`; keep `docs/build-apps.md` current if build/install changes.

---

## 2. Technical decisions (recommendations with verified facts)

### 2.1 Editor: **TipTap v3 (ProseMirror), MIT core**
- VERIFIED via npm registry (2026-11-03): `@tiptap/core`, `@tiptap/react`, `starter-kit`, `extension-table`, `extension-image`, `extension-text-align`, `extension-mention`, `extension-collaboration` are all **3.32.2, MIT**. Lexical 0.53.0 (MIT) and `@lexical/table` are also MIT.
- VERIFIED: TipTap's **comments and DOCX-export extensions are not on the public npm registry** (404 for `@tiptap/extension-comments`, `@tiptap/extension-export-docx`, `@tiptap-pro/extension-comments`): they are the paid tier. Do not plan on them. Build comments ourselves (section 3.9) and export through our own renderer.
- Why TipTap over Lexical: ProseMirror has a strict **schema** (we can forbid anything the PDF/DOCX renderers cannot draw), first-class table, `Node` attributes for our custom nodes (variable, signature block, page break), transactions for AI accept/reject, JSON document model, and a mature collaboration option (Yjs 13.6.33, MIT) if wanted later. Lexical is smaller but its table and schema story is weaker for locked documents. Both are acceptable; this repo has neither, so cost is equal. **Decision: TipTap.**
- Bundle: editor loads only on the document edit route via `next/dynamic` with `ssr: false` (client component). UNVERIFIED: exact gzip size; measure in feature A3.
- Real-time co-editing: **deferred** (decision 12). Safe save instead: autosave to draft with a `rev` check (as `saveSop` does with `baseUpdatedAt`) and an optional edit lock; a second editor sees a clear conflict message. Stable node ids are kept in the model; nothing else is built for collaboration.

### 2.2 Canonical document model: **our own JSON schema ("PBDoc v1") in ProseMirror-compatible shape. Not HTML.**
- HTML cannot be rendered identically by react-pdf and docx; both libraries consume structure, not HTML. Storing HTML would also need sanitising and re-parsing (injection surface).
- PBDoc JSON is what the editor stores, what AI emits (strict JSON schema), what versions freeze and hash, and what both exporters read. Single source of truth.
- Guarantee of identical rendering (honest version): (1) one node vocabulary that both renderers fully implement; the editor schema is **generated from the same list**, so an unsupported feature cannot be typed; (2) shared **style tokens** (fonts, sizes, spacing, colours, page margins) resolved from the company brand and fed to both renderers; (3) the same **embedded fonts** in PDF and DOCX; (4) golden fixtures: every node type rendered to PDF (text extraction + `pdftoppm` PNG compare in dev) and DOCX (XML assertions); (5) the editor's "Preview" tab shows the **real exported PDF**, not an approximation.
- **Limit that cannot be removed:** pagination. Word lays out the DOCX with its own engine, react-pdf lays out the PDF with its own, so page breaks and page counts can differ by a few lines. Rules: explicit page-break nodes only where needed; never write "see page 3" in generated text; the PDF is the authoritative, sealed rendering; the DOCX is the editable equivalent.

### 2.3 PDF: **keep `@react-pdf/renderer` 4.9.0**
- Already in the repo, MIT, server-only, no headless browser. Chromium (`@sparticuz/chromium` 153.0.0, MIT, 70 MB unpacked) would add a large binary, cold-start cost and a second layout engine; `pdf-lib` 1.17.1 (MIT, 19 MB unpacked) draws but does not lay out text. Reject both for rendering. `pdf-lib` may still be useful later to **append** a certificate-of-completion page or embed metadata; evaluate in B-feature on sealing.
- **VERIFIED by experiment (scratchpad, react-pdf 4.9.0 + the repo's Noto Sans Devanagari TTF):** Hindi with conjuncts and matras (क्षत्रि, श्रीमान्, प्रक्रिया, ज्ञान, द्वारा, ₹५०,०००) rendered correctly shaped; a fixed footer with `render={({pageNumber,totalPages})=>...}` rendered; 1 page in ~320 ms. Not tested: very long Hindi paragraphs (line-breaking/hyphenation), mixed Latin+Devanagari in one run (use font fallback per run: UNVERIFIED), tables across pages. Add these to the golden fixtures in A5.
- Limits: react-pdf embeds PNG/JPEG only (`identity.ts:47`): convert WebP/SVG/GIF logos with `sharp` (already a dependency) at upload. Tables are laid out manually (View rows): v1 has **no merged cells**. Generated page numbers: supported as above.
- Vercel: function size and duration limits depend on plan (UNVERIFIED current numbers); the repo already uses `maxDuration = 300` (`app/(platform)/signup/page.tsx:22`). A 20-page text PDF should take well under 5 s (measure in A5). Fonts must be listed in `outputFileTracingIncludes` for the export route (pattern at `next.config.ts:21`).

### 2.4 DOCX: **`docx` 9.15.1 (MIT)**
- VERIFIED (installed in scratchpad, 20 MB unpacked, typings inspected): exports for headers/footers, `PageNumber`, `TableOfContents`, `LevelFormat` numbering (decimal, legal-style multilevel), `ImageRun`, `PageBreak`, table `cantSplit`, comments (`CommentRangeStart`), tracked changes (`InsertedTextRun`, `DeletedTextRun`), a `fonts` option for embedding fonts, `complexScript` run property, bidirectional language options, and a `watermarks` entry point. Pure JS, no native dependency; works in a Node route handler. Add `docx` to `serverExternalPackages` like the other large server libs.
- Hindi in Word: set run `font` to a font that has Devanagari and the complex-script properties (`complexScript`, language `hi-IN`); embed Noto Sans Devanagari via the `fonts` option so Word does not substitute. UNVERIFIED: that Word on every platform honours the embedded font; also test in LibreOffice and Google Docs. Fallback: name `Mangal`/`Nirmala UI` as the cs font.
- Mapping PBDoc to docx is mechanical: heading->`HeadingLevel`, lists->numbering config, legal clauses->multilevel numbering `1.`, `1.1`, `(a)`, table->`Table` with fixed column widths, variable->resolved text run, page break->`PageBreak`, header/footer->`Header`/`Footer` with `PageNumber.CURRENT`/`TOTAL_PAGES`, logo->`ImageRun`, watermark "DRAFT" for non-approved exports.
- Import of existing DOCX (optional, later): `mammoth` 1.13.0 (BSD-2-Clause) converts DOCX to HTML/Markdown, losing layout fidelity; map into PBDoc through a sanitising converter. Optional feature; **not** in the main path.

### 2.5 Template variables and conditionals
- Keep `{{namespace.field}}` for compatibility with ContractFlow (`variables.ts:6`). In PBDoc a variable is an **inline node** `{type:"var", key, format?, fallback?}`, not text to regex over. Typed namespaces: `company.*` (hrms_company + brand), `employee.*`, `client.*`, `vendor.*`, `candidate.*`, `doc.*` (number, version, date, title), `input.*` (the form fields the user filled), `custom.*` (company-defined variables).
- Conditionals and repeats are **structured nodes**, not a string DSL: `conditional{when:{key,op,value}, children}` and `repeat{source, itemVar, children}` (op in eq, neq, exists, gt, lt). No expression evaluation, no code execution.
- Resolution: variables resolve **when the document is generated or refreshed**, and every issued version freezes the resolved values (`variableSnapshot`), so a later change to the company address cannot change an issued letter.
- Formats: date (`dd MMM yyyy`, India style), money with Indian grouping (₹ 12,34,567) and amount in words (there is already `lib/number-to-words.ts`: VERIFIED present).

### 2.6 Version diffing
- Block-level diff by stable node ids (added, removed, moved, changed), then word-level diff inside changed text with `diff` (8.0.4, BSD-3). Render as redline in the compare page (replaces the current meta/blocks compare). Variable nodes diff by key and resolved value.

### 2.7 Serverless constraints (design rules)
- No persistent filesystem: all binaries (PDF, DOCX, logos, uploads) in private Blob; `/tmp` only for transient work.
- Exports are generated on demand from a version; **issued exports are stored once** (Blob key + sha256) so a re-download is byte-identical.
- AI work is split into short calls (one section per request) to stay well inside function duration (section 4).
- Fonts: bundle Noto Sans, Noto Sans Devanagari, plus a small curated OFL set; move out of the `viralpulse-ai` folder into a shared `src/lib/fonts` with the licence file. **Licensing:** Noto fonts are SIL OFL 1.1 (the repo ships `LICENSE-FONTS.txt`): embedding in generated PDF/DOCX is allowed. Company-uploaded arbitrary fonts are **not** recommended (licence and embedding-permission risk); offer the curated list only. Decision for owner (section 10).

### 2.8 Summary of decisions
TipTap + PBDoc JSON; react-pdf (authoritative PDF) + docx (editable DOCX) from the same node vocabulary and tokens; Noto fonts embedded in both; structured variables/conditionals; immutable hash-sealed Playbook versions; section-by-section AI with strict JSON schema and a fact guard; ContractFlow receives an editable CLONE (locked at first signature) and owns signing, e-stamping and the vault; built-in OTP e-signature behind a provider interface, no ESP.

---

## 3. Authoring architecture (Track A)

### 3.1 PBDoc v1 (the document model)
```
PBDoc { schemaVersion: 1,
  page: { size: "A4"|"Letter", orientation, margins{t,r,b,l}, columns?: 1 },
  lang: "en"|"hi"|"hinglish",           // default text language (affects font choice, hyphenation, AI)
  header: Node[], footer: Node[],       // may contain fields (pageNumber, totalPages, docNumber, version, date)
  body: Node[] }
Node ids are stable UUIDs (diff, comments, AI citations).
Blocks: heading(1-4) | paragraph | bulletList | orderedList(style: decimal|alpha|roman|legal) | clause(level,numbered) |
        table(colWidths, headerRow, rows[cells[Node[]]], no merge in v1) | image(fileId, width, align, caption) |
        callout(info|warning|important) | signatureBlock(label, role, partyRole, nameVar, designationVar, dateVar) |
        pageBreak | divider | spacer | toc | conditional | repeat | section(key,title,aiMode,locked?)
Inline: text with marks(bold,italic,underline,strike,sup,sub,link,highlight(palette),color(palette)) |
        var(key,format,fallback) | placeholder(key,label,hint) | field(pageNumber|totalPages|docNumber|version|date) | hardBreak
Not allowed: raw HTML, arbitrary CSS, scripts, iframes, merged cells (v1), floating images, custom fonts per run.
```
`signatureBlock` is a **layout marker only** in Playbook (a line, a printed name/designation, "Authorised signatory"). It carries `partyRole` so ContractFlow can derive signature fields (section 6.3). Playbook never captures a signature.

### 3.2 Template model (per company; platform starters)
- **Starter templates** live in code as PBDoc JSON (reviewed, tested, versioned with deploys), keyed by catalogue id (section 8). They are shown in a read-only **Library**. **"Use this template"** copies a starter into the company's `pb_templates` (`sourceStarterId`, `sourceStarterVersion`), after which the company owns and edits it. When the platform improves a starter, the company sees "starter updated, review changes" (diff), never an automatic overwrite. This satisfies "platform provides starters that companies copy".
- A template = `{ docTypeId, name, lang, pbdoc skeleton (sections with `aiMode` and `guidance`), inputs[] (form fields: key, label, type, required, source binding), requiredFacts[], numbering series, approval flow, brand override?, legal level, party type, needsSignature, version }`. Section `aiMode`: `fixed` (boilerplate text, no AI), `generate` (AI writes from facts), `table` (AI fills rows from provided data), `facts` (variables only).
- Template versions are immutable too; a document remembers `templateId + templateVersion`.

### 3.3 Brand & letterhead (per company)
`pb_brand` singleton: logo (PNG/JPEG after conversion), colour primary/accent from the platform brand by default, font pair (curated), header layout (logo left/right/centre, address block), footer text ("Registered office, CIN, GSTIN" built from `hrms_company`), page margins, default signatory, optional second letterhead for a sub-entity. Live preview uses the same tokens as exports. The `PdfLetterhead` (`lib/pdf/layout.tsx`) is the model, but it hardcodes the SelfRun navy/coral look and Helvetica; Playbook gets its own brand-token header, not that component.

### 3.4 Lifecycle and approval
`draft -> in_review -> (changes_requested -> draft) -> approved -> issued -> (superseded | revoked | archived)`.
- Editing allowed only in `draft`/`changes_requested`. Any edit of an `approved` or `issued` document **creates a new draft version**; the old version stays frozen.
- `issued` assigns the **document number** and freezes the version; stores the sealed PDF and DOCX; makes it eligible for "Send for signature" and for distribution/acknowledgement.
- Approval flow per document type: none, single approver, or ordered chain (role or named user); reject with reason; approver cannot approve their own authored version (configurable). Reuse ideas from ContractFlow workflows (statuses), re-implemented in `pb_*`.
- Legal-type documents add a mandatory step: the issuer ticks "I confirm this document has been reviewed by a qualified lawyer" (recorded in audit with user and time).

### 3.5 Numbering
Per company, per document-type series, pattern tokens `{PREFIX}`, `{FY}` (India April to March option), `{YYYY}`, `{MM}`, `{SEQ:n}`. Number assigned **at issue** (not at draft creation) so there are no gaps from abandoned drafts. Atomic increment via `findOneAndUpdate({_id:"<series>:<fy>"},{$inc:{seq:1}},{upsert:true})` as in `nextSequence` (`db.ts:51-56`); `pb_counters` must be in `KEYED_COLLECTIONS`. Do not copy ContractFlow's non-atomic approach (`makers.ts:110-133`).

### 3.6 Versioning
`pb_documents` holds the head and the editable draft. `pb_versions` rows are immutable: `{documentId, number, label, changeNote, pbdoc, variableSnapshot, contentSha256, templateRef, status, authorId, createdAt, exports:{pdf:{key,sha256},docx:{key,sha256}}}`. Unique index (documentId, number). Autosave writes the draft only (with `rev` for optimistic concurrency); "Save version" and every status transition create a version. Revert = copy an old version into the draft as a new version. Compare = redline (section 2.6).

### 3.7 Sharing (before signature)
Internal: share to users/roles with view/comment/edit. External read-only: tokenised link to the **PDF of a specific version** (hashed token, expiry, revocable, optional view-OTP, view audit). Public prefix must be added to `SHARED_SEGMENTS`. Signing is **not** done here; for signature use the handoff.

### 3.8 Permissions
Reuse the SOP pattern: capability matrix + object scope + confidentiality. Capabilities: VIEW, CREATE, EDIT, COMMENT, SUBMIT, APPROVE, ISSUE, EXPORT, SHARE, SEND_FOR_SIGNATURE, USE_AI, MANAGE_TEMPLATES, MANAGE_BRAND, MANAGE_VARIABLES, VIEW_AUDIT, SETTINGS. **Per document-type category ACL**: HR-category types visible only to HR roles (and the employee they concern); finance types to finance, etc. Roles stay in `admin_users.roles` with Director overrides (`commandos/permission-catalog`). Existing `sop_*` roles map onto the new capabilities so current users keep access.

### 3.9 Comments and suggestions
Build our own, on `pb_comments`: anchored to node ids (+ text range), threads, resolve, mentions via notifications. "Suggestion mode" (tracked changes) is a later feature; AI edits already use accept/reject. TipTap's paid comments are not assumed.

### 3.10 Audit
Append-only `pb_audit` (create, edit, ai_generate, ai_apply, submit, approve, reject, issue, export, share, view_shared, handoff, revoke, template_change, brand_change, settings). Never blocks the action (`recordAudit` pattern, `audit.ts`). Surfaced in the central workspace audit log like other products.

### 3.11 Information architecture (simple sidebar)
1. **Home** (my drafts, waiting for my approval, recently issued, expiring, quick "Create document" box)
2. **Documents** (all, filter by type, category, status, owner, party; saved filters)
3. **Create** (a full-width wizard, not a sidebar item: pick type from Library, fill inputs, generate)
4. **Templates** (company templates; "Library" tab of platform starters grouped by the 11 categories)
5. **Brand & Letterhead**
6. **Data & Variables** (company profile fields, custom variables, party records picker rules)
7. **Approvals** (inbox and flows)
8. **Policies & Acknowledgement** (the surviving SOP assignments/ack engine, only for distributable documents)
9. **Settings** (numbering, approval flows, languages, AI, retention, roles)
Document page: left outline, centre editor, right panel with tabs (Sources & AI, Comments, Versions, Details). Top bar: status, Save version, Preview PDF, Download (PDF/DOCX), Submit/Approve/Issue, Send for signature.

### 3.12 Existing SOP data
SOPs become document type `op.sop`. A one-off migration maps `SopContent` (Markdown paragraphs) into PBDoc nodes (Markdown to nodes via a small converter), keeps `sop_versions` as `pb_versions`, and keeps `sop_assignments`/`sop_feedback` by renaming the key `sopId` to `documentId` in the distribution layer. Migration is its own feature with a dry-run and rollback (A-feature M1).

---

## 4. AI generation design

1. **Inputs**: template (sections, guidance, `aiMode`), the user's form `inputs`, and a **FactBag** assembled server-side from the company's own records (company profile, brand, selected employee/client/vendor/candidate record, platform statutory rates when relevant). Each fact: `{key, label, value, kind(text|number|date|money|id|email), source{type,ref}}`.
2. **Orchestration is client-driven, one section per request** (`POST /api/playbook-ai/ai/section`, `withTransport`, `maxDuration` set). Each call is short and independent: resumable, parallelisable (limit 3 concurrent), and the same endpoint serves "regenerate this section". Streaming tokens is optional; section-level progress ("3 of 14 sections") is the reliable UX because strict JSON cannot be validated mid-stream. Avoids a single long function.
3. **Structured output**: Responses API `text.format = json_schema, strict: true` (pattern at `viralpulse-ai/ai.ts:143`) returning only AI-permitted nodes (heading, paragraph, lists, table, callout, clause, `var`, `placeholder`). No HTML. On schema violation: one repair retry, then the section is marked failed with a retry button.
4. **Fact guard** (pure, unit-tested, modelled on `website/ai/validate.ts`):
   - The prompt gives values (for coherent prose) but instructs: every fact is written as a `var` node by key; never type a name, number, date, amount, ID or address literally.
   - Post-check: every `var.key` must exist; every literal token matching number, currency, date, email, phone, URL, PAN, GSTIN, CIN, pincode patterns must be in an allow-list (fact values, list numerals, clause numbers, statute names configured in a platform-reviewed reference list). Violations trigger one auto-repair pass with the issue list, then the offending run is marked `unverified` (amber, blocks Approve/Issue until resolved or accepted by the user with a recorded reason).
   - Missing required facts: the model must emit `placeholder` nodes ("Enter notice period"). Placeholders are the **only** permitted gaps. Export while placeholders remain is blocked unless the user chooses "Export draft" (watermarked).
   - **Law numbers (notice period defaults, gratuity, PF/ESI rates, leave encashment, minimum wages, POSH committee rules) come only from platform-owned rates/reference data or from the company's own policy input, never from model memory.**
5. **Citations**: each generated node stores `src: factKey[]`; the "Sources" panel shows which fields fed a section and highlights facts not used. Not printed in exports.
6. **Language (decision 10)**: English only for now. Prompts, schemas and storage stay Unicode-safe; no translation, Hindi, Hinglish or bilingual features are built. (`lib/ai/policy.ts` supports three languages for other products; Playbook pins `en`.)
7. **Edit actions** on a selection or a section: regenerate, improve, shorten, expand, simplify, change tone (formal, friendly, firm), translate, fix grammar. Result is shown as a diff to **accept or reject**; nothing is saved until accepted; accepted changes are audited with the prompt key.
8. **Legal caveat**: types flagged L show a persistent banner ("AI draft. Not legal advice. Must be reviewed by a qualified lawyer before use."), print the same line in the DRAFT footer, and require the lawyer-review confirmation at Issue. C-flag types (statute-sensitive) show "Verify against current law and your registered details".
9. **Safety**: reuse `SECURITY_HEADER/FOOTER` (`prompts/guard.ts`); only business documents for this company are drafted; user-supplied text and records are DATA not instructions; prompts registered in `registry.ts` with `product: "playbook"`; legal prompts not company-editable, style prompts company-editable. Model comes from the registry entry (not hardcoded), metered via `getOpenAI()` with `setAiFeature("Playbook AI")`; company's own key wins, platform key is the fallback (existing behaviour).
10. **Quality gate**: 5 golden generations per top-20 type in tests using a fake model client (deterministic) plus a manual review checklist before shipping each batch of templates.

---

## 5. Data model

Collections for Playbook (prefix `pb_`, all company-scoped by default). Anything with a fixed `_id` is marked KEYED and **must be added to `KEYED_COLLECTIONS`** in the same feature that creates it.

| Collection | Purpose | KEYED? |
| --- | --- | --- |
| `pb_documents` | Head + editable draft PBDoc, status, number, docTypeId, templateRef, party link, owner, rev | no |
| `pb_versions` | Immutable versions with sha256, variable snapshot, export refs | no |
| `pb_templates` | Company templates (clones/own), `sourceStarterId/Version` | no |
| `pb_brand` | Letterhead/brand singleton (`_id:"main"`) | **yes** |
| `pb_settings` | Numbering defaults, languages, AI, retention (`_id:"main"`) | **yes** |
| `pb_counters` | Numbering sequences (`_id:"<series>:<fy>"`) | **yes** |
| `pb_variables` | Company-defined variables and picker rules | no |
| `pb_approval_flows`, `pb_approvals` | Flows per type; decisions per version | no |
| `pb_comments` | Anchored comment threads | no |
| `pb_share_links` | Hashed tokens, expiry, revoke, views | no |
| `pb_ai_runs` | Section generation log: prompt key, model, tokens, fact keys used, guard issues | no |
| `pb_files` | Logos, images (Blob keys) | no |
| `pb_audit` | Append-only audit | no |
| `pb_handoffs` | Link Playbook document version to its ContractFlow clone id, plus mirrored status (section 6) | no |
Starter templates are code (no collection). If a platform-editable starter catalogue is wanted later, add `pb_starter_templates` to `GLOBAL_COLLECTIONS` (decision, section 10).

ContractFlow (Track B) new collections, prefix `cf_` (do **not** extend the `lpms_*` ObjectId/`as any` code; it is replaced, section 7.5): `cf_documents` (the editable clones), `cf_clone_edits` (content diffs), `cf_stamps`, `cf_stamp_rules` (or platform reference data), `cf_requests`, `cf_signers`, `cf_events` (append-only signer audit), `cf_sealed` (sealed artefacts), `cf_vault_items`, `cf_parties`, `cf_renewals`, `cf_retention_holds`, `cf_settings` (KEYED), `cf_counters` (KEYED), `cf_otp` (hashed codes, TTL index). Signer pages are **public** routes: they must never use an admin session, only an unguessable token plus OTP, and company context must be derived from the request record (use the platform DB path deliberately, with the company id stored on `cf_signers` and verified), not from the host. This is a tenancy-sensitive area: design with a dedicated review feature (B-hardening).

Other rules: string UUID `_id`s via `newId()` (like `sop`), `Date` objects (not ISO strings), `createStamp/updateStamp`, soft delete only for drafts; every browser-called JSON route wrapped in `withTransport`; PBDoc types, node vocabulary, status lists and limits in a **client-safe** `constants.ts`/`schema.ts` with **no** `server-only` or Mongo imports; renderers and stores `import "server-only"`.

---

## 6. Playbook to ContractFlow handoff contract (CLONE model, owner decision)

Principle: **the Playbook document and its template are never changed by anything that happens in ContractFlow.** "Send for signature" makes a **clone** of one chosen version inside ContractFlow. The clone is **editable by hand in ContractFlow** (the same TipTap editor component and PBDoc schema, mounted in ContractFlow) until the first signature is applied. Edits in the clone never flow back to Playbook or to the template.

### 6.1 "Send for signature" (Playbook side)
Preconditions: version is `approved` or `issued` (type setting), no unfilled placeholders, user has SEND_FOR_SIGNATURE, lawyer-review confirmation done for L types, type is not e-sign-ineligible (`NE`).
Steps: (1) validate PBDoc and resolve variables; (2) call the ContractFlow service function (same codebase and DB: a function call, not HTTP) `createCloneFromPlaybook({source, party, signers, options})`; (3) ContractFlow copies the version's PBDoc JSON and variable snapshot into `cf_documents`, records `sourceContentSha256`, sets state `clone_draft`; (4) Playbook stores `pb_handoffs` (documentId, versionId, cloneId, sentBy, sentAt) and shows the link. Sending the same version twice creates a second independent clone (e.g. a different party); it never reuses or mutates an earlier one.

### 6.2 Clone record (the contract)
```
CloneInput {
  source: { product:"playbook-ai", documentId, versionId, versionNumber, docNumber, docTypeId, templateRef },
  title, language, legalLevel,
  content: { pbdocJson, variableSnapshot }, sourceContentSha256,
  party: { type: "client"|"vendor"|"employee"|"partner"|"freelancer"|"candidate"|"trainee"|"other",
           recordRef: { product:"sprintos|spendiq|talentos|clientos|dealflow|manual", collection, id } | null, displayName },
  signers: [ { role:"company_signatory"|"counterparty"|"witness"|"approver", name, email, phone, order } ],
  options: { expiresAt, reminderDays[], requireOtp:true },
  dates: { effectiveDate, expiryDate, renewalDate, autoRenew, noticePeriodDays },
  stamp: { required, state, instrumentCategory, amountPayable?, certificateRef? },
  requestedBy, requestedAt }
```

### 6.3 Clone lifecycle and the lock rule
`clone_draft` (editable) -> `stamping` (optional, only when required) -> `ready` (content frozen for sending: PDF and DOCX rendered, sha256 recorded) -> `sent` -> `in_progress` -> `completed` | `declined` | `expired` | `voided`.
- Editing is allowed while **no signature has been applied** (states `clone_draft`, `stamping`, `ready`, `sent`, and `in_progress` before the first signature). Any content edit after `ready` returns the clone to `clone_draft`, invalidates the rendered files and unsent links (signers who already viewed are notified on resend), and is audited with a content diff.
- **The first applied signature locks the clone** permanently (legal integrity): editor read-only, no signer or party changes, no re-render. Any change then requires **Void** (reason required, tokens revoked, signed-so-far evidence retained) and **creating a new clone** (from the same Playbook version or from the edited clone, user's choice). The old clone, the void and the new clone are linked in the audit trail (`replacedBy` / `replaces`).
- A clone edited by hand in ContractFlow diverges from Playbook by design; the vault records `sourceContentSha256` versus `finalContentSha256` and flags "edited after cloning" with a redline link, so reviewers can see what changed.
- Signature coordinates: the PDF renderer returns a layout manifest of each `signatureBlock` (page, position), spiked in H1 (UNVERIFIED mechanism); fallback is an appended signature page rendered by ContractFlow. Because clones are editable, placement is **recomputed on every re-render**.

### 6.4 Status flowing back
ContractFlow calls `playbook.recordSignatureStatus(cloneId, status, meta)`; Playbook shows on the source document version: `clone_draft | sent | viewed | partially_signed | signed | declined | expired | voided`, signer list with times, and a link **"Signed copy (ContractFlow)"** through an access-checked route. Playbook stores status and ids only, never a second copy of the signed file.

---

## 7. ContractFlow: signing, stamping, sealing, vault

### 7.1 What a simple electronic signature honestly is in India (research; mostly secondary sources, **UNVERIFIED** until a lawyer confirms against the Gazette)
- **IT Act 2000, s.3A** recognises electronic signatures made by a "reliable" technique listed in the **Second Schedule** (Aadhaar e-KYC eSign notified January 2015; widened to "Aadhaar or other e-KYC" in 2019 per secondary sources; sources disagree on the current list). **Digital Signature Certificates** and **Aadhaar eSign through an eSign Service Provider (ESP)** sit in that category. An **ESP** is a licensed company that verifies the signer (for Aadhaar eSign through UIDAI e-KYC with the signer's consent) and signs on their behalf with a short-lived certificate; it is paid per signature.
- **Owner decision: no ESP, Aadhaar eSign or DSC in this roadmap.** The product builds a **built-in simple electronic signature** only. ESP/DSC is listed under "future, not in scope" (section 7.7) with the signing layer kept behind a provider interface.
- **What the built-in signature can honestly claim:** "Electronically signed. Identity checked by a one-time code sent to the signer's email/phone; consent, time, IP address and device recorded; the document is sealed with a hash so changes are detectable." Most Indian commercial contracts do not need a prescribed signature form, so this is commonly accepted for NDAs, offer/appointment letters and ordinary agreements, but its evidentiary strength depends on proving who signed and that the record is intact.
- **What it must never claim:** "Aadhaar eSign", "digital signature certificate", "valid under the IT Act Second Schedule", "equivalent to a handwritten signature in all cases", "court-proof".
- **Mandatory in-product notice** (shown at send time, in the signer consent page and on the certificate): *"This is a simple electronic signature (OTP verified). Some documents are legally ineligible for electronic signing (for example wills, trust deeds, negotiable instruments other than cheques, certain powers of attorney and property conveyance documents) or may need registration, notarisation, stamp duty or a stronger signature. Ask a lawyer before using electronic signature for such documents."* Wording to be approved by the owner's lawyer.
- **Not eligible / special** (IT Act s.1(4) and First Schedule as reported; verify current text): negotiable instruments other than cheques, powers of attorney (partly relaxed October 2022 for entities regulated by RBI, NHB, SEBI, IRDAI, PFRDA), trust deeds, wills, and (sources conflict whether relaxed in 2022) contracts for sale or conveyance of immovable property. Types flagged `NE` hide "Send for signature" and explain why; the owner/lawyer maintains the flag.
- Evidence: electronic records are admissible with an integrity certificate (Evidence Act s.65B, now Bharatiya Sakshya Adhiniyam; mapping UNVERIFIED). Keep hashes, audit trail and sealed original.

### 7.2 Signature request model, provider interface and flow
**Provider interface** `SignatureProvider { name, begin(request), verifyIdentity(signer, challenge), applySignature(signer, artefact), seal(request), status() }`. Implementation 1 (only one built): `BuiltInProvider` (OTP + audit trail + hash seal). No vendor type, ESP field, or Aadhaar field is added to any model now; `authMode` has a single value `otp` plus an extensible string so a later provider needs no migration.

`cf_requests`: status (`sent|in_progress|completed|declined|expired|voided`), clone id, order mode (`parallel|sequential`), expiry, reminder schedule. `cf_signers`: role, name, email, phone, order, token hash, status (`pending|sent|viewed|otp_verified|signed|declined`), signedAt, ip, userAgent, optional geolocation (consent), signature artefact (Blob), consent text version, `declineReason`. `cf_events` append-only (who, what, when, IP, UA, hashes).

Signer experience (public `/sign/<token>`, mobile-first, no account):
1. Email/SMS link (rate-limited, single-purpose token, hashed at rest, expires with the request).
2. **Identity**: OTP to the email and/or phone on the request (6 digits, 5 to 10 minutes, 5 attempts then lock, throttled resend).
3. **Review**: the frozen PDF is shown in-page; Sign is enabled after it is opened/scrolled; download allowed.
4. **Consent**: explicit text with version and checkbox, plus the mandatory notice above; **decline with reason**.
5. **Signature**: draw, type (font choice) or upload; placed per layout manifest or on the signature page; date/time automatic.
6. Confirmation and emailed signed copy when all have signed. Sequential mode releases the next signer after the previous signs.
Company side: **countersign** by authorised company signatories in the app (logged-in user plus a fresh OTP), or as a normal signer with `role=company_signatory`; order configurable.
Controls: reminders and expiry (cron), **void** (reason, revokes tokens), **re-send** (rotates token), **change signer** (voids old token, audited), **bulk send** (CSV or selection of employees: one independent clone per recipient), per-company rate limits. After the first signature the clone is locked (6.3).

### 7.3 Sealing and tamper evidence
On completion: (1) **final PDF** = rendered clone + signature images at placements (or signature page) + footer stamp (request id, short hash); (2) **Certificate of Completion** page(s): title, number, sha256 of the content at sending, signer names, masked email/phone, verification method (OTP), timestamps, IPs, event timeline, the mandatory notice, final hash; (3) sha256 of the final PDF stored in `cf_sealed` and a public **verify** page (`/verify/<id>`, prefix already shared) that recomputes the hash of an uploaded file. Tooling: `pdf-lib` (MIT) to append pages/embed images, or re-render with react-pdf (decide in B4 spike). **Honest claim:** tamper-**evident** by hash and stored original; **not** a cryptographic PAdES signature, so Adobe Reader will not show it as "validly signed" (UNVERIFIED, expected); the UI says so.

### 7.3a E-stamping step (owner decision: wanted wherever required)
**Requirement flag.** Each catalogue type carries `stampRule`: `{ required: always|usually|rarely|never, basis: "instrument category" }`, and a **per-state table** `pb_stamp_rules` / platform reference data `{ state, instrumentCategory, dutyType: fixed|ad-valorem, amountOrRate, eStampAvailable (SHCIL|state-own|none), notes, verifiedBy, verifiedOn }`. **Duty amounts and state availability are law and must come from platform-owned reference data reviewed by a lawyer, never from the model's memory** (same rule as payroll rates). The party/state is taken from the place of execution entered on the request.
**How e-stamping works (secondary sources, UNVERIFIED):** SHCIL is the government-appointed central record-keeping agency for general e-stamping in about 22 to 25 states/UTs (counts differ by source; StockHolding's own blog says 23); Maharashtra runs its own system (GRAS / e-SBTR) and NeSL serves banks/NBFCs for financial documents. A buyer pays duty online (net banking, card, NEFT/RTGS, UPI in some states) or at an authorised collection centre and gets a **certificate with a unique identification number and QR code**, verifiable on SHCIL's portal; franking via authorised banks/agents is an alternative in some states. The certificate is generally used within about six months of purchase. State-specific rules vary.
**Is there an API?** I found no public SHCIL developer API. Third parties reach SHCIL through **authorised collection centres/resellers** who expose their own APIs with a prepaid wallet (Legistify, Surepass, Signzy and Zoho Sign advertise e-stamp APIs or integrations; terms and pricing UNVERIFIED), which implies a commercial contract. Automatic purchase is therefore **not** assumed.
**Design: a guided manual step first, automation as a provider behind an interface.**
- Stamping step before signing (only when `required` or user-forced): shows duty guidance from the rule table, a "Buy e-stamp" help link (SHCIL / state portal), and an **upload slot for the e-stamp certificate** (PDF) plus fields: certificate number, state, amount, date of purchase, purchaser, first party, second party, consideration. Server checks: file is a PDF, size, magic bytes, upload scan; **warn if purchase date is older than six months**; certificate number format checked per state if known; duplicate certificate number across the company is refused (a certificate must not be reused).
- The certificate is **attached as the first page(s) of the final PDF** (or kept as a linked annex, per state practice; lawyer to confirm) and its number is stored on the vault item and on the certificate of completion.
- Stamping cannot be skipped silently: if required and no certificate, sending is blocked unless an authorised role records an override with reason (audited).
- `StampProvider` interface `{ quote(), purchase(), verify(certificateNo) }` with one built-in implementation: `ManualStampProvider` (upload and record). A reseller-backed provider is a later optional feature, listed in 7.7.
- Honest limits in UI: "Stamp duty is state law. Confirm the requirement with a lawyer. E-signing does not replace stamping."

### 7.4 Signed-document vault (party-wise)
- `cf_vault_items` created automatically on completion (and by manual upload of **wet-signed/scanned** documents, important in practice): title, docType, number, party{type, recordRef, displayName}, status (`signed|active|expiring|expired|terminated|renewed|superseded`), key dates (signedAt, effectiveDate, expiryDate, renewalDate, autoRenew, noticePeriodDays), value (optional), tags, sealed file and certificate, links to the Playbook source document and version, `supersedes/amendmentOf`, confidentiality, `retentionUntil`, `legalHold`.
- **Party model** `cf_parties` is a **thin index** that links to the system of record, never a copy: client -> SprintOS `pms_clients` (and ClientOS), vendor -> SpendIQ `prms_vendors`, employee -> TalentOS `hrms_employees`, candidate -> TalentOS applications, trainee -> Cohort AI learners (UNVERIFIED collection), partner/freelancer/other -> manual party in ContractFlow with optional promotion later. Pickers are adapters (extend the pattern in `entity-discovery.ts`, which today has employee + company only).
- Views: **By party** (tabs: Clients, Vendors, Employees, Partners, Freelancers, Candidates, Trainees, Other; folder per party; party page lists all their documents and timeline), **By type**, **All** with search (title, number, party, tag), filters (type, party type, party, status, date range, expiry window), saved filters, **Renewals dashboard** (expiring in 30/60/90 days, auto-renew, notice-period deadlines, owner), counts and exports (CSV/XLSX using the existing `buildWorkbook` pattern, ZIP of files via `jszip` already in dependencies).
- **Access control per party type**: employee/candidate/trainee documents visible only to HR roles (and the person themself in the employee portal, optional); client documents to sales/account/legal roles; vendor documents to procurement/finance/legal; legal/admin see all; confidentiality levels reused from `access.ts`. Every download is authorised server-side and audited.
- **Retention and legal hold**: per document type retention period (e.g. employment records, contracts: owner/lawyer decides), `retentionUntil` computed from end date; a **legal hold** flag blocks deletion/purge; purge is a reviewed action (two-person), never automatic in v1.
- **Reminders**: daily ContractFlow cron (add to `vercel.json`, register in `lib/cron`) for expiring/renewal/notice dates, signer reminders and request expiry; notifications through `lib/notify` (`lpms` triggers) with dedupe keys.
- SpendIQ overlap: `prms_contracts` keeps procurement metadata (value, SLA, renewal); vault item for a vendor agreement **links** to it by `vendorContractId` and shows its dates (read-through), avoiding two sources of truth. Decision for owner: which side is master for vendor contract dates.

### 7.5 Reuse vs rebuild in ContractFlow
| Keep / reuse | Rebuild | Remove or retire |
| --- | --- | --- |
| Product shell, sidebar, login, roles registration, `lpms` notification triggers, approval/workflow status ideas, `fileUrl` route pattern, audit viewing, `lpms_audit` data | Data layer to `cf_*` (UUID `_id`, Dates, typed); signature request/signer/events model; public signer app; sealing; vault; party adapters; renewals; retention; permissions as a capability matrix; atomic numbering | Document **authoring**: `makers`, block templates, `output/pdf.ts`, `output/docx.ts`, `ai.ts`, `variables.ts`, `entity-discovery` generation role (all superseded by Playbook; `entity-discovery` adapters are reused for party pickers), `lpms_signatures` shape. Existing `lpms_documents` data: migrate into the vault as "imported, unsigned" or leave read-only (decision; no production data was inspected) |
ContractFlow becomes **"signing and signed-document vault"**; its name and product page text (`docs/products.md:237-247`) must be updated to match, and the false claims removed.

### 7.7 Future / not in scope
ESP-backed Aadhaar eSign or DSC (ESP = licensed signing provider; needs a commercial contract and per-signature fee): not planned; the `SignatureProvider` interface above keeps it possible without rewrites. Also not in scope: PAdES cryptographic sealing, automated e-stamp purchase, real-time co-editing.

---

## 8. Template catalogue (183 types)

Legend. **Legal**: `L` = lawyer-review notice mandatory (AI draft, not legal advice); `C` = statute-sensitive (verify against current Indian law and the company's registered details; numbers come from platform rates/reference data); `-` none. **Party**: EMP employee, CAN candidate, CLI client, VEN vendor, PTR partner, FRL freelancer, TRN trainee, INT internal (no external party), PUB public/audience, OTH other. **Sign**: Y = send to ContractFlow (clone) for e-signature by default, O = optional, N = no. **Exp**: all rows export PDF and DOCX (`PD`); no other format in v1. Inputs lists the minimum the user must supply; everything else is filled from company/party records. Sections list the template skeleton (AI writes `generate` sections from facts). `esign-ineligible` types are marked `NE` in Sign (hide the send button; wet signature and stamp/registration as required).

### 8.1 HR and employee lifecycle (hr.*)
| id | Name | Purpose | Required inputs | Sections | Legal | Party | Sign |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hr.jd | Job description | Define a role | role, dept, level, location | Summary, Responsibilities, Qualifications, Skills, Reporting, Compensation range | - | INT | N |
| hr.mrf | Manpower requisition | Approve a hire | role, headcount, justification, budget | Request, Justification, Budget, Approvals | - | INT | O |
| hr.job_post | Job posting | Advertise a role | role, location, apply-by | About us, Role, Requirements, How to apply | - | PUB | N |
| hr.interview_scorecard | Interview scorecard | Structured evaluation | role, criteria | Candidate, Criteria table, Recommendation | - | CAN | N |
| hr.interview_invite | Interview invitation | Invite a candidate | candidate, date, mode, panel | Details, Documents to bring, Contact | - | CAN | N |
| hr.offer | Offer letter | Offer employment | candidate, designation, CTC, joining date, validity | Offer, Compensation, Conditions, Acceptance | C | CAN | Y |
| hr.offer_regret | Candidate regret letter | Decline politely | candidate, role | Letter | - | CAN | N |
| hr.appointment | Appointment letter | Formal appointment | employee, designation, CTC, joining date, probation, notice | Appointment, Duties, Compensation, Probation, Leave, Confidentiality, Termination, Acceptance | C | EMP | Y |
| hr.internship_offer | Internship offer | Offer internship | intern, stipend, duration | Offer, Terms, Confidentiality, Acceptance | C | TRN | Y |
| hr.welcome | Welcome letter | Greet new joiner | employee, date | Letter, First-day plan | - | EMP | N |
| hr.onboarding_checklist | Onboarding checklist | Track joining tasks | employee, joining date | Pre-joining, Day 1, Week 1, 30-60-90 | - | EMP | N |
| hr.induction_plan | Induction plan | Schedule induction | employee, buddy | Schedule table, Owners | - | EMP | N |
| hr.bgv_consent | Background-verification consent | Consent to verify | employee, scope | Consent, Scope, Data use | L | EMP | Y |
| hr.asset_issue | Asset issue and undertaking | Record assets issued | employee, asset list | Assets table, Undertaking, Return | - | EMP | Y |
| hr.probation_plan | Probation goals | Set probation goals | employee, goals | Goals, Metrics, Review dates | - | EMP | O |
| hr.probation_review | Probation review | Assess probation | employee, ratings, manager notes | Ratings, Summary, Recommendation | - | EMP | O |
| hr.probation_ext | Probation extension | Extend probation | employee, new end date, reason | Letter | - | EMP | Y |
| hr.confirmation | Confirmation letter | Confirm employment | employee, effective date | Letter, Terms unchanged | - | EMP | Y |
| hr.increment | Increment letter | Salary revision | employee, new CTC, effective date | Letter, Revised structure | C | EMP | Y |
| hr.promotion | Promotion letter | Promote | employee, new designation, effective date | Letter, Role, Compensation | C | EMP | Y |
| hr.transfer | Transfer letter | Transfer location/dept | employee, from, to, date | Letter, Terms | - | EMP | O |
| hr.role_change | Role change letter | Change responsibilities | employee, new role | Letter | - | EMP | O |
| hr.bonus | Bonus / incentive letter | Award bonus | employee, amount, basis | Letter | C | EMP | O |
| hr.appreciation | Appreciation letter | Recognise work | employee, achievement | Letter | - | EMP | N |
| hr.show_cause | Show-cause notice | Seek explanation | employee, incident, response days | Notice, Allegation, Response | L | EMP | Y |
| hr.warning | Warning letter | Formal warning | employee, incident, level | Letter, Expected conduct | L | EMP | Y |
| hr.pip | Performance improvement plan | Structured improvement | employee, gaps, period | Gaps, Goals, Support, Review, Outcome | L | EMP | Y |
| hr.suspension | Suspension letter | Suspend pending inquiry | employee, reason, period | Letter | L | EMP | Y |
| hr.termination | Termination letter | End employment | employee, reason, last day | Letter, Dues, Handover | L | EMP | Y |
| hr.resignation_accept | Resignation acceptance | Accept resignation | employee, resignation date, last day | Letter, Notice, Handover | - | EMP | Y |
| hr.notice_waiver | Notice-period waiver/buyout | Agree early release | employee, days, amount | Letter, Terms | L | EMP | Y |
| hr.exit_checklist | Exit/offboarding checklist | Clear exit tasks | employee, last day | Assets, Access, Knowledge transfer, Finance, HR | - | EMP | N |
| hr.exit_interview | Exit interview form | Capture feedback | employee | Questions, Summary | - | EMP | N |
| hr.experience | Experience letter | Certify service | employee, designation, tenure | Letter | - | EMP | O |
| hr.relieving | Relieving letter | Confirm relief | employee, last day | Letter | - | EMP | O |
| hr.fnf | Full-and-final settlement | Settle dues | employee, earnings, deductions, last day | Summary, Earnings, Deductions, Net, Acknowledgement (figures from payroll settlement) | C | EMP | Y |
| hr.salary_cert | Salary certificate | Certify salary | employee, purpose | Letter | C | EMP | O |
| hr.verification | Employment verification letter | Confirm employment to third party | employee, addressee | Letter | - | EMP | O |
| hr.leave_policy | Leave policy | Define leave | leave types, accrual, holidays | Purpose, Types, Accrual, Application, Encashment, Misc | C | INT | N |
| hr.attendance_policy | Attendance policy | Define attendance | hours, grace, late rules | Purpose, Hours, Late, Regularisation | - | INT | N |
| hr.wfh_policy | Remote / WFH policy | Define remote work | eligibility, hours, security | Purpose, Eligibility, Rules, Security | - | INT | N |
| hr.handbook | Employee handbook | Full handbook | company profile, policies chosen | Welcome, Values, Employment, Conduct, Leave, Pay, Safety, Exit, Acknowledgement | C | INT | N |
| hr.code_of_conduct | Code of conduct | Conduct rules | company profile | Purpose, Principles, Conflicts, Reporting, Consequences | - | INT | N |
| hr.posh | POSH (sexual harassment) policy | Prevention policy | company size, ICC members | Policy, Definitions, ICC, Complaint, Inquiry, Confidentiality | L C | INT | N |
| hr.grievance | Grievance redressal policy | Employee grievances | steps, officers | Policy, Levels, Timelines | - | INT | N |
| hr.referral | Employee referral policy | Referral rewards | reward, conditions | Policy, Eligibility, Payout | - | INT | N |
| hr.ack_form | Policy acknowledgement form | Prove receipt | policy, employee | Statement, Signature | - | EMP | Y |

### 8.2 Management (mg.*)
| id | Name | Purpose | Required inputs | Sections | Legal | Party | Sign |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mg.project_charter | Project charter | Authorise a project | project, sponsor, goals, budget | Background, Objectives, Scope, Stakeholders, Risks, Budget | - | INT | O |
| mg.project_plan | Project plan | Plan delivery | project, milestones, team | Scope, WBS, Timeline, Resources, Risks, Communication | - | INT | N |
| mg.brd | Business requirements (BRD) | Capture business needs | project, stakeholders, needs | Overview, Objectives, Requirements, Assumptions, Acceptance | - | CLI | O |
| mg.prd | Product requirements (PRD) | Define a product | product, users, features | Problem, Users, Features, Non-functional, Metrics, Release | - | INT | N |
| mg.status_report | Project status report | Report progress | project, period, progress | Summary, Progress, Risks, Next steps | - | CLI | N |
| mg.weekly_report | Weekly team report | Weekly update | team, week | Done, Planned, Blockers | - | INT | N |
| mg.board_report | Board report | Report to the board | period, KPIs, decisions | Highlights, Financials, Operations, Risks, Resolutions sought | - | INT | N |
| mg.mis_report | Management (MIS) report | Monthly management pack | period, data | Summary, KPIs, Variances, Actions | - | INT | N |
| mg.kpi | KPI framework | Define KPIs | dept, metrics | Objectives, KPI table, Owners, Review | - | INT | N |
| mg.okr | OKR plan | Quarterly OKRs | team, quarter | Objectives, Key results, Owners | - | INT | N |
| mg.minutes | Meeting minutes | Record a meeting | meeting, attendees, notes | Attendees, Agenda, Discussion, Decisions, Actions | - | INT | O |
| mg.agenda | Meeting agenda | Plan a meeting | meeting, date, topics | Agenda table | - | INT | N |
| mg.board_resolution | Board resolution | Record a board decision | resolution subject, date, directors | Preamble, Resolution, Authorisation | L C | INT | Y |
| mg.raci | RACI matrix | Assign responsibility | activities, roles | Matrix | - | INT | N |
| mg.risk_register | Risk register | Track risks | project, risks | Risk table, Mitigation | - | INT | N |
| mg.change_request | Change request | Control change | project, change, impact | Change, Impact, Approval | - | CLI | O |
| mg.postmortem | Incident post-mortem / RCA | Learn from incidents | incident, timeline | Summary, Timeline, Root cause, Actions | - | INT | N |
| mg.business_plan | Business plan | Plan the business | company, market, financial inputs | Summary, Market, Strategy, Operations, Financials | - | PUB | N |
| mg.strategy_memo | Strategy memo | Propose a direction | topic, options | Context, Options, Recommendation | - | INT | N |
| mg.circular | Circular / office order | Announce internally | subject, effective date | Notice | - | INT | N |
| mg.doa | Delegation of authority | Define approvals | roles, limits | Matrix, Rules | - | INT | O |
| mg.org_chart | Organisation chart document | Describe structure | departments, reporting (from HRMS) | Structure table, Roles | - | INT | N |

### 8.3 Operations (op.*) and IT/security (it.*)
| id | Name | Purpose | Required inputs | Sections | Legal | Party | Sign |
| --- | --- | --- | --- | --- | --- | --- | --- |
| op.sop | Standard operating procedure | Document a process | process, dept, owner | Purpose, Scope, Responsibilities, Steps, Exceptions, Escalation | - | INT | N |
| op.work_instruction | Work instruction | Task-level steps | task, tools | Steps, Checks | - | INT | N |
| op.checklist | Operational checklist | Repeatable checklist | process | Items | - | INT | N |
| op.incident_report | Incident report | Record an incident | incident, date, impact | Summary, Impact, Actions | - | INT | N |
| op.bcp | Business continuity plan | Keep operating | critical functions, contacts | Scope, Risks, Recovery, Contacts | - | INT | N |
| op.quality_manual | Quality manual | Quality system | scope, standards | Policy, Processes, Audit | - | INT | N |
| op.hse_policy | Health & safety policy | Workplace safety | sites, officers | Policy, Duties, Emergency | C | INT | N |
| op.visitor_policy | Visitor policy | Visitor control | rules | Policy, Process | - | INT | N |
| op.handover | Handover note | Hand over work | from, to, items | Status, Pending, Contacts | - | INT | N |
| op.escalation | Escalation matrix | Who to escalate to | levels, contacts | Matrix | - | INT | N |
| it.security_policy | Information security policy | Security baseline | scope, owners | Purpose, Scope, Controls, Roles, Violations | - | INT | N |
| it.aup | IT acceptable use policy | Use of IT | rules | Policy, Do/Don't, Monitoring | - | EMP | O |
| it.password | Password policy | Password rules | length, rotation, MFA | Policy | - | INT | N |
| it.access | Access control policy | Who gets access | roles, review cycle | Policy, Joiner/mover/leaver | - | INT | N |
| it.byod | BYOD policy | Personal devices | rules | Policy, Controls | - | EMP | O |
| it.backup_dr | Backup & disaster recovery | Recover data | systems, RPO/RTO | Backups, Recovery, Tests | - | INT | N |
| it.incident_response | Security incident response plan | Handle breaches | team, contacts | Detect, Contain, Notify, Review | C | INT | N |
| it.change_mgmt | Change management policy | Control IT change | process | Policy, Approvals | - | INT | N |
| it.data_classification | Data classification policy | Classify data | levels | Policy, Handling | - | INT | N |
| it.asset_policy | IT asset policy | Manage assets | rules | Policy, Return | - | INT | N |
| it.sdlc | Secure development policy | Secure coding | practices | Policy, Review | - | INT | N |
| it.vendor_security | Vendor security questionnaire | Assess vendors | vendor | Questions | - | VEN | N |
| it.runbook | Runbook | Operate a system | system, steps | Overview, Procedures, Rollback | - | INT | N |
| it.release_notes | Release notes | Announce a release | product, version, changes | Highlights, Changes, Known issues | - | PUB | N |
| it.srs | Software requirements spec | Specify software | product, features | Intro, Requirements, Constraints | - | CLI | O |

### 8.4 Vendor (vn.*) and pre-sale (ps.*)
| id | Name | Purpose | Required inputs | Sections | Legal | Party | Sign |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vn.onboarding | Vendor onboarding form | Collect vendor details | vendor, GSTIN/PAN, bank | Details, Compliance, Bank, Declaration | C | VEN | Y |
| vn.rfp | Request for proposal | Invite proposals | scope, criteria, deadline | Background, Scope, Criteria, Submission, Terms | - | VEN | N |
| vn.rfq | Request for quotation | Invite quotes | items, qty, delivery | Items table, Terms | - | VEN | N |
| vn.evaluation | Vendor evaluation scorecard | Compare vendors | vendors, criteria | Criteria, Scores, Recommendation | - | VEN | N |
| vn.po | Purchase order | Order goods/services | vendor, items, rates, taxes, delivery | Items, Taxes, Delivery, Terms (amounts from records) | C | VEN | O |
| vn.work_order | Work order | Order work | vendor, scope, value, period | Scope, Value, Timeline, Terms | C | VEN | Y |
| vn.award | Award letter | Award a vendor | vendor, scope, value | Letter | - | VEN | O |
| vn.rejection | Vendor regret letter | Decline vendor | vendor | Letter | - | VEN | N |
| vn.sla | Vendor SLA | Service levels | vendor, services, targets, credits | Services, Targets, Reporting, Penalties, Review | L | VEN | Y |
| vn.payment_terms | Payment terms schedule | Agree payment | vendor, terms, milestones | Terms, Schedule | C | VEN | O |
| vn.code_of_conduct | Vendor code of conduct | Set conduct | rules | Code, Acknowledgement | - | VEN | Y |
| vn.performance | Vendor performance review | Review vendor | vendor, period, scores | Scores, Issues, Actions | - | VEN | N |
| ps.proposal | Proposal | Win work | client, need, scope, price | Summary, Understanding, Solution, Plan, Team, Pricing, Terms | - | CLI | N |
| ps.quotation | Quotation | Price work | client, items, rates, validity | Items, Taxes, Terms, Validity | C | CLI | O |
| ps.estimate | Estimate | Effort/cost estimate | scope, assumptions | Scope, Effort table, Assumptions | - | CLI | N |
| ps.pitch_outline | Pitch deck outline | Plan a pitch | audience, goal | Slide-by-slide outline | - | PUB | N |
| ps.capability | Capability statement | Show capability | company profile | Overview, Services, Credentials, Contact | - | PUB | N |
| ps.case_study | Case study | Show a result | client, problem, result (client-approved facts) | Challenge, Solution, Results | - | PUB | N |
| ps.discovery | Requirement discovery | Capture needs | client, interview notes | Context, Needs, Constraints, Next steps | - | CLI | N |
| ps.rfp_response | RFP response | Answer an RFP | RFP, answers | Cover, Responses, Pricing | - | CLI | N |
| ps.solution_brief | Solution brief | Summarise a solution | solution | Problem, Solution, Benefits | - | CLI | N |
| ps.followup | Follow-up letter | Follow up | client, meeting | Letter | - | CLI | N |
| ps.loi | Letter of intent | Record intent | parties, subject | Intent, Non-binding, Next steps | L | CLI | Y |
| ps.demo_plan | Demo / POC plan | Plan a demo | client, scope | Goals, Scenarios, Success | - | CLI | N |

### 8.5 Contracts (ct.*)
Contract types show the lawyer-review notice and, where marked, a stamp-duty prompt (`SD`).
| id | Name | Purpose | Required inputs | Sections | Legal | Party | Sign |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ct.client_agreement | Client services agreement | Engage a client | client, services, fees, term | Parties, Services, Fees, Term, IP, Confidentiality, Liability, Termination, Governing law | L SD | CLI | Y |
| ct.msa | Master services agreement | Framework | client, term, law | Parties, Framework, SOW process, Fees, IP, Liability, Termination, Disputes | L SD | CLI | Y |
| ct.sow | Statement of work | Define a project | client, MSA ref, scope, fees, milestones | Scope, Deliverables, Timeline, Fees, Acceptance | L | CLI | Y |
| ct.nda_mutual | NDA (mutual) | Protect both sides | parties, purpose, term | Definitions, Obligations, Exclusions, Term, Remedies | L SD | OTH | Y |
| ct.nda_one_way | NDA (one-way) | Protect discloser | parties, purpose, term | as above | L SD | OTH | Y |
| ct.nda_employee | Employee confidentiality agreement | Protect IP | employee | Confidentiality, IP assignment, Return | L SD | EMP | Y |
| ct.employment | Employment agreement | Detailed employment contract | employee, terms | Role, Pay, Hours, Leave, IP, Restraint, Termination | L C SD | EMP | Y |
| ct.consultancy | Consultancy agreement | Engage a consultant | consultant, scope, fee | Services, Fee, Term, IP, Confidentiality, Independence | L SD | FRL | Y |
| ct.freelancer | Freelancer agreement | Engage a freelancer | freelancer, scope, fee | Scope, Fee, Deliverables, IP, Termination | L SD | FRL | Y |
| ct.vendor_agreement | Vendor / supply agreement | Buy from a vendor | vendor, goods/services, price | Scope, Price, Delivery, Warranty, Liability, Termination | L SD | VEN | Y |
| ct.partnership | Partnership / alliance agreement | Partner | partner, scope, revenue share | Purpose, Contributions, Revenue, Governance, Exit | L SD | PTR | Y |
| ct.reseller | Reseller / distributor agreement | Channel | partner, territory, margin | Appointment, Territory, Pricing, Targets, Termination | L SD | PTR | Y |
| ct.license | Software / content licence | Grant licence | licensee, scope, fee | Grant, Restrictions, Fees, Support, Liability | L SD | CLI | Y |
| ct.mou | Memorandum of understanding | Record intent | parties, objectives | Purpose, Roles, Term, Non-binding | L | PTR | Y |
| ct.data_sharing | Data sharing agreement | Share data | parties, data, purpose | Data, Purpose, Safeguards, Breach | L C | OTH | Y |
| ct.nonsolicit | Non-solicitation agreement | Restrict poaching | parties, period | Covenant, Remedies | L SD | OTH | Y |
| ct.training_bond | Training bond | Retain trained staff | employee, cost, period | Cost, Period, Recovery | L C SD | EMP | Y |
| ct.amendment | Amendment | Change an agreement | original agreement, changes | Reference, Changes, Unchanged terms | L | OTH | Y |
| ct.renewal | Renewal / extension | Extend an agreement | original agreement, new term | Reference, New term | L | OTH | Y |
| ct.termination | Termination agreement/notice | End an agreement | agreement, date, reason | Notice, Effect, Dues | L | OTH | Y |
| ct.settlement | Settlement agreement | Settle a dispute | parties, terms | Recitals, Settlement, Release | L SD | OTH | Y |
| ct.lease | Office lease / rent agreement | Lease premises | lessor/lessee, rent, term | Premises, Rent, Term, Lock-in, Termination | L SD NE* | OTH | O |
\*Leases above the statutory period and sale of immovable property typically need registration (not e-sign alone). Eligibility is a per-type flag the owner and a lawyer must confirm (UNVERIFIED).

### 8.6 Training (tr.), marketing (mk.), finance (fn.), compliance/legal (lg.)
| id | Name | Purpose | Required inputs | Sections | Legal | Party | Sign |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tr.needs | Training needs analysis | Find gaps | dept, skills | Gaps, Priorities | - | INT | N |
| tr.plan | Training plan | Plan training | audience, objectives, dates | Objectives, Schedule, Trainers, Budget | - | INT | N |
| tr.curriculum | Curriculum | Course outline | course, level, hours | Modules table, Outcomes | - | TRN | N |
| tr.lesson_plan | Lesson plan | Plan a session | topic, duration | Objectives, Activities, Assessment | - | INT | N |
| tr.material | Training material / handout | Learner content | topic, audience | Intro, Content, Exercises, Summary | - | TRN | N |
| tr.assessment | Assessment / test paper | Assess learners | topic, marks | Instructions, Questions, Key | - | TRN | N |
| tr.certificate | Certificate of completion | Certify completion | learner, course, date | Certificate text | - | TRN | N |
| tr.feedback | Training feedback form | Collect feedback | course | Ratings, Comments | - | TRN | N |
| tr.attendance | Attendance sheet | Record attendance | session, learners | Table | - | TRN | N |
| tr.report | Training completion report | Report outcomes | course, results | Summary, Results, Actions | - | INT | N |
| mk.profile | Company profile | Introduce company | company profile | About, Services, Clients, Contact | - | PUB | N |
| mk.service_brochure | Service brochure | Market services | services | Overview, Services, Why us, Contact | - | PUB | N |
| mk.product_brochure | Product brochure | Market a product | product facts | Overview, Features, Specs, Contact | - | PUB | N |
| mk.one_pager | One-pager | Single page pitch | offering | Headline, Benefits, CTA | - | PUB | N |
| mk.datasheet | Datasheet | Technical summary | product specs | Specs table, Use cases | - | PUB | N |
| mk.flyer | Flyer | Promote an event/offer | offer, dates | Headline, Details, CTA | - | PUB | N |
| mk.press_release | Press release | Announce news | news, quotes (supplied) | Headline, Body, About, Contact | - | PUB | N |
| mk.media_kit | Media kit | Press pack | company facts | Overview, Logos, Facts | - | PUB | N |
| mk.brand_guide | Brand guidelines | Brand rules | brand tokens | Logo, Colour, Type, Voice | - | INT | N |
| mk.campaign_brief | Campaign brief | Brief a campaign | goal, audience | Objective, Audience, Channels, Budget | - | INT | N |
| mk.content_calendar | Content calendar | Plan content | period, channels | Calendar table | - | INT | N |
| fn.invoice_tpl | Invoice template | Standard invoice layout (numbers from billing) | invoice data | Header, Items, GST, Total, Bank | C | CLI | N |
| fn.proforma | Proforma invoice | Pre-invoice | client, items | Items, Taxes | C | CLI | N |
| fn.credit_note | Credit note | Reduce invoice | invoice, reason, amount | Reference, Amount | C | CLI | N |
| fn.receipt | Payment receipt | Acknowledge payment | payer, amount | Receipt | C | CLI | N |
| fn.payment_reminder | Payment reminder | Chase dues | client, invoices | Letter, Table | - | CLI | N |
| fn.expense_policy | Expense policy | Control spend | limits, approvers | Policy, Limits, Claims, Approval | - | INT | N |
| fn.travel_policy | Travel policy | Travel rules | grades, limits | Policy, Entitlements | - | INT | N |
| fn.reimbursement | Reimbursement form | Claim expenses | employee, items | Items, Declaration | - | EMP | N |
| fn.advance_request | Salary advance request | Request advance | employee, amount, recovery | Request, Recovery, Approval | C | EMP | Y |
| fn.budget_proposal | Budget proposal | Ask for budget | dept, items | Summary, Table, Justification | - | INT | N |
| fn.petty_cash | Petty cash policy | Small cash control | limits | Policy | - | INT | N |
| lg.privacy | Privacy policy | Disclose data practices | company legal profile, data collected | Collection, Use, Sharing, Retention, Rights, Grievance officer (built from legal profile, India) | L C | PUB | N |
| lg.terms | Terms of use | Website/service terms | service, jurisdiction | Acceptance, Use, IP, Liability, Law | L | PUB | N |
| lg.dpa | Data processing agreement | Processor terms | parties, data, purpose | Scope, Security, Sub-processors, Breach | L C SD | CLI | Y |
| lg.dpdp_notice | Consent/notice (DPDP) | Notice and consent | purposes, categories | Notice, Rights, Withdrawal | L C | PUB | N |
| lg.cookie | Cookie policy | Disclose cookies | cookies list | Policy | L | PUB | N |
| lg.refund | Refund & cancellation policy | Refund rules | rules | Policy | L | PUB | N |
| lg.aup | Acceptable use policy | Service rules | rules | Policy | L | PUB | N |
| lg.retention | Data retention policy | Retention schedule | categories, periods | Policy, Schedule | L C | INT | N |
| lg.legal_notice | Legal notice (draft) | Draft notice | facts, relief | Facts, Demand | L | OTH | O |
| lg.affidavit | Affidavit / undertaking | Sworn statement | deponent, facts | Statement | L SD NE* | OTH | O |
| lg.declaration | Declaration | Self-declaration | declarant, facts | Declaration | L | OTH | Y |
\*Affidavits need notarisation/attestation and stamp paper in most states; e-sign eligibility to be confirmed by a lawyer (UNVERIFIED).
Stamp column: `SD` in the Legal column means stamp duty is likely payable; every row also carries a `stampRule` (required always/usually/rarely/never) and the per-state duty table is platform reference data (section 7.3a). `NE` = e-sign-ineligible or special (hide Send for signature). Count: HR 47 + management 22 + operations/IT 25 + vendor/pre-sale 24 + contracts 22 + training/marketing/finance/legal 43 = **183 rows**; the first release ships in batches A14 to A18 (HR, contracts, management/operations/IT, vendor/pre-sale/finance, training/marketing/legal). Family count: 11 categories.

Coverage check against the owner's list: recruitment (hr.jd/mrf/job_post/scorecard/invite/offer/regret), offer, appointment, onboarding, probation, confirmation, increment/promotion, warning/PIP, policies, handbook, leave/attendance, experience/relieving, resignation acceptance, exit checklist, FnF, NDAs; SOW, MSA, proposals, project plans, BRD/PRD, status reports, board/management reports, SOPs, policies, org chart, KPIs/OKRs, minutes, MoU; vendor onboarding, RFP/RFQ, PO, vendor agreement, SLA, evaluation, NDA, payment terms; pre-sale proposal, quotation, pitch outline, capability, case study, discovery, estimates; contracts (client, MSA, SOW, NDA, employment, consultancy, freelancer, partnership, licence, amendment, termination); training; marketing; compliance/legal with caveats; finance; operations; IT/security. Nothing skipped.

---

## 9. Build plan (owner changed on 2026-11-03: PARALLEL agents with disjoint file ownership, to go faster; the order below is the dependency order)

Rules for every agent: each agent owns its own files and only makes small additive edits to shared files (package.json, nav, KEYED_COLLECTIONS, playbook-roles.ts, docs) after re-reading them; finish and verify each feature before reporting; nothing is committed; each feature ends with `npm run typecheck`, `npm run lint`, its own test script (pure-logic tests need no DB; flow tests use a throwaway `MONGODB_URI` named `zz_throwaway_*` as in the existing scripts, never `.env.local`), and an update to `docs/products.md`. New test scripts follow the `scripts/test-*.ts` pattern and are added to `package.json`. Read the relevant `node_modules/next/dist/docs` page before each Next-specific change.

### Track A: Playbook authoring
**A0. Decisions and fixtures.** Scope: record owner decisions (section 10) in this doc; add shared `src/lib/fonts` (move Noto files, keep licence); add deps `docx`, `@tiptap/*`, `diff` (pinned), `docx` in `serverExternalPackages`. Accept: install works, build passes, no behaviour change. Tests: typecheck. Files: `package.json`, `next.config.ts`, `src/lib/fonts/*`. Depends: none.

**A1. PBDoc schema, validator, plain-text and variables core (pure).** Scope: node vocabulary, limits, hand-written validator (repo style), `walk`, `plainText`, variable detection/resolution (typed namespaces, formats, India money, number-to-words), conditional/repeat evaluation, content hash (canonical JSON sha256). Accept: invalid nodes rejected; resolution deterministic; hash stable under key order. Tests: `scripts/test-pbdoc.ts` (50+ cases incl. Hindi text). Files: `src/lib/products/playbook-ai/doc/{schema,validate,variables,hash}.ts` (client-safe, no server-only). Depends: A0.

**A2. PDF renderer (PBDoc to react-pdf) with brand tokens.** (English only; Devanagari fonts stay bundled but are not exercised.) Scope: renderer for every node, header/footer fields, page numbers, logo, DRAFT watermark, Noto fonts registered, font choice by `lang`, PNG/JPEG normalisation via `sharp`. Accept: golden fixtures render; Hindi conjuncts correct; multi-page table splits rows safely; export route spike measures time. Tests: `scripts/test-pbdoc-pdf.ts` (text extraction and page count; manual PNG review recorded in the PR note). Files: `.../doc/render/pdf.tsx`, `next.config.ts` (`outputFileTracingIncludes` for the export route). Depends: A1.

**A3. DOCX renderer (PBDoc to docx).** Scope: same vocabulary, numbering (decimal/legal/alpha), headers/footers/page numbers, images, tables with widths, fonts embedded, DRAFT watermark, embedded fonts. Accept: opens in Word/LibreOffice (manual check recorded), XML assertions pass, parity table vs PDF for every node. Tests: `scripts/test-pbdoc-docx.ts` (unzip with `jszip`, assert structure). Files: `.../doc/render/docx.ts`. Depends: A1 (A2 for shared tokens `tokens.ts`).

**A4. Documents, versions, drafts (data layer).** Scope: `pb_documents`, `pb_versions` (immutable, unique index, sha256), autosave with `rev`, **conflict detection returning a typed `conflict` error (who changed it and when)**, optional edit lock with expiry, save-version, revert, compare data (block diff + word diff), `pb_audit`, status machine (pure). Accept: concurrent saves rejected with the conflict message, never silently overwritten; versions cannot be updated; revert creates a new version. Tests: `scripts/test-pb-versions.ts` (+ flow with throwaway DB). Files: `.../documents.ts`, `versions.ts`, `diff.ts`, `status.ts`, `audit.ts`. Depends: A1.

**A5. Export routes and sealed export storage.** Scope: `GET /api/playbook-ai/documents/[id]/export?format=pdf|docx&version=` with permission, audit, DRAFT watermark rule, issued versions store export once in Blob with sha256 and serve identical bytes; filename rules. Accept: issued re-download byte-identical; draft export watermarked; unauthorised blocked. Tests: flow test. Files: `src/app/(products)/api/playbook-ai/documents/[id]/export/route.ts`, `.../exports-store.ts`. Depends: A2, A3, A4.

**A6. Editor v1 (TipTap) with PBDoc schema.** Scope: client editor (built as a product-neutral component under `src/components/doc-editor` so ContractFlow reuses it in B1) (headings, lists, legal clauses, tables, images, callouts, page breaks, variable chips with picker, placeholders, signature block), toolbar, outline, save/autosave through `withTransport` actions, real-PDF preview tab. Accept: every editor node round-trips through PBDoc validator and both renderers; cannot type unsupported structures. Tests: `scripts/test-pbdoc-editor-schema.ts` (schema parity, no DOM). Files: `src/components/products/playbook-ai/editor/*`, doc routes. Depends: A1, A4, A5.

**A7. Brand & letterhead.** Scope: `pb_brand` (KEYED), logo upload/convert, font pair from curated list, header/footer layout, preview, used by both renderers. Accept: change brand, re-export differs accordingly; another company unaffected. Tests: flow test with two companies. Files: `brand.ts`, `BrandForm`, `collections.ts` KEYED entry. Depends: A2, A3.

**A8. Variables & company data.** Scope: variable registry from `hrms_company`, employee/client/vendor/candidate pickers (adapters), custom variables (`pb_variables`), missing-data report, snapshot on version. Accept: unresolved required variable listed; snapshot frozen at issue. Tests: `scripts/test-pb-variables.ts`. Files: `.../variables-registry.ts`, adapters. Depends: A1, A4.

**A9. Template engine and per-company templates.** Scope: template model, `pb_templates`, clone/modify/create, section `aiMode`, inputs form schema, versioned templates, the Library page shell reading starter definitions from code, and **`reviewedBy/reviewedOn` stamp (REVIEW_TEMPLATES permission; default unreviewed; editing a reviewed template resets it to unreviewed)**. Accept: clone a starter, edit, new documents use the company copy; starter update shows a diff, never overwrites; unreviewed badge visible. Tests: `scripts/test-pb-templates.ts`. Depends: A4, A6, A8.

**A10. Numbering, lifecycle and approvals.** Scope: `pb_counters` (KEYED) atomic series, default `{PREFIX}/{FY}/{SEQ}` with Indian FY (Apr-Mar), configurable per company and type; status transitions with checks; **approval auto-advance when the author is the approver (default); company setting per type to require a different approver**; reject reasons; notifications; legal-notice acknowledgement; permissions and category ACL. Accept: 20 parallel issues give 20 unique gapless numbers; FY rollover on 1 April; auto-advance and require-different-approver both work. Tests: `scripts/test-pb-numbering.ts`, `test-pb-approvals.ts`. Depends: A4, A9.

**A11. AI engine: fact bag, schema output, fact guard.** Scope: FactBag builder, strict-schema section generator via `getOpenAI()`, registry prompts (new keys), fact guard (pure), placeholder policy, `pb_ai_runs`, language handling, legal banners. Accept: with a fake client, invented numbers are caught and repaired/flagged; missing facts become placeholders; metering recorded. Tests: `scripts/test-pb-factguard.ts` (100+ cases incl. Indian number formats), `test-pb-ai-section.ts` (fake client). Files: `.../ai/{factbag,generate,guard,schemas}.ts`, `lib/prompts/registry.ts`. Depends: A1, A8, A9.

**A12. Create-document wizard and AI UI.** Scope: pick type, inputs form, stream section progress, per-section regenerate, improve/shorten/translate/tone with accept/reject diff, Sources panel, unverified/placeholder blockers. Accept: end-to-end create of 3 types in all 3 languages in a manual script; nothing saved without user action. Tests: UI-data tests like `test-ugc-ui.ts`. Files: wizard routes/components. Depends: A6, A11.

**A13. Comments, sharing links, internal share.** Scope: `pb_comments`, mentions, `pb_share_links` with hashed tokens, view audit, public prefix added to `SHARED_SEGMENTS`. Accept: revoked link stops working; expired link refused. Tests: `scripts/test-pb-share.ts`. Files: as named. Depends: A5, A10.

**A14. Platform starter templates, batch T1 (HR lifecycle, 47).** Scope: PBDoc starters with sections, inputs, legal flags, party/sign metadata; golden render per template. Accept: each renders in PDF and DOCX; metadata test enforces catalogue columns; lawyer-review flags present. Tests: `scripts/test-pb-catalogue.ts`. Depends: A9, A11. **Batches T2 (contracts), T3 (management/operations/IT), T4 (vendor/pre-sale/finance), T5 (training/marketing/legal) are features A15 to A18, same pattern, each its own session.**

**A19. SOPs as a document type (simple) and migration.** Scope: SOP becomes a template category/document type; keep a simple assignment and acknowledgement (people, departments), drop the heavier SOP-only taxonomy UI when safe; migrate `sops`/`sop_versions` to PBDoc with dry-run report, hash/count checks and rollback; old URLs redirect. Accept: counts match; acknowledgements preserved. Tests: migration flow test on a throwaway DB. Depends: A10, A6.

**A20. Optional: import DOCX (mammoth) and tracked-suggestions.** Scope as named; skippable by owner. Depends: A6.

### Track B: ContractFlow (clone, sign, stamp, vault) and the handoff
Order matters: the clone store and editor come first, then the Playbook "Send" button, then signing, stamping, sealing, vault. No ESP/Aadhaar/DSC feature exists in this roadmap (section 7.7).

**B0. ContractFlow reset.** Scope: hide old authoring routes from the nav, update product text and `docs/products.md` (remove the claims about PDF/DOCX export, expiry notifications and e-signature that the code does not deliver), define `cf_*` collections and KEYED entries (`cf_settings`, `cf_counters`), retire stubs (`output/*`, `ai.ts`); owner decides fate of `lpms_*` data. Accept: build passes; nothing user-visible breaks. Depends: A10.

**B1. Clone store and editable clone in ContractFlow.** Scope: `cf_documents` (PBDoc, variable snapshot, source refs, `sourceContentSha256`), mount the **same TipTap editor component and PBDoc schema** (shared package under `src/components/doc-editor`, extracted from A6 so both products import it), edit audit with content diff (`cf_clone_edits`), clone states `clone_draft|ready|...`, the **lock rule** (read-only after first signature; void then new clone), "edited after cloning" redline vs source, render PDF/DOCX with the A2/A3 renderers. Accept: edits in the clone never alter the Playbook document or template (test proves source hash unchanged); edit blocked once a signature exists. Tests: `scripts/test-cf-clone.ts` (includes lock and void-and-reclone). Files: `src/lib/products/contractflow-ai/clones.ts`, editor extraction. Depends: A6, A5, B0.

**H1. "Send for signature" from Playbook.** Scope: dialog (party type and record picker, signers with order, expiry, reminders, key dates, stamp requirement from rules, place of execution), eligibility rules (`NE`, placeholders, legal confirmation), `createCloneFromPlaybook`, `pb_handoffs`, signature layout manifest spike (fallback signature page). Accept: sending creates an independent clone; second send creates a second clone; source untouched. Tests: `scripts/test-pb-handoff.ts`. Depends: A10, B1.

**H2. Status back-channel.** Scope: `recordSignatureStatus`, chips and "Signed copy (ContractFlow)" link on the Playbook document version, access-checked route. Accept: simulated events update Playbook and audit. Tests: flow test. Depends: H1.

**B2. Signature request model, provider interface, public token infrastructure.** Scope: `cf_requests/signers/events`, `SignatureProvider` interface with only `BuiltInProvider`, token hashing, `/sign` prefix in `SHARED_SEGMENTS`, company context derived from the request record (not host), rate limits. Accept: wrong/expired/used token refused; cross-company access impossible (two-company test). Tests: `scripts/test-cf-tokens.ts`. Depends: B1.

**B3. OTP identity.** Scope: **email OTP default** (no registration needed); **SMS OTP optional through the company's own Twilio connection, blocked with an explanation until the company records that India DLT registration (entity ID, sender ID, approved template ID) is complete** (verify Twilio docs at build time); `cf_otp` hashed with TTL; attempt locks; throttled resend. Accept: email path works end to end; SMS path refuses to send and shows the DLT explanation when unconfirmed; brute-force lock; expiry. Tests: `scripts/test-cf-otp.ts` (no real provider). Depends: B2.

**B4. Signer experience.** Scope: mobile-first page: PDF review, versioned consent text and the mandatory simple-e-signature notice, draw/type/upload signature (Blob, validated image), decline with reason, sequential release. Accept: two-signer ordered signing on a throwaway DB; decline path; first signature locks the clone. Tests: flow test. Depends: B3.

**B5a. Stamp rulebook (Console).** Scope: global collection `stamp_rulebook` (added to GLOBAL_COLLECTIONS), structure for all states/UTs x instrument categories x duty entries (fixed or ad valorem, notes), each entry `unconfirmed` until `confirmedBy/On`; Console page like the Tax Rulebook; starter structure only, **no duty amounts invented**; read API for the stamping step. Accept: unconfirmed entries are clearly labelled and never presented as authoritative. Tests: `scripts/test-stamp-rulebook.ts`. Depends: B2. **B5b. Manual e-stamping step.** Scope: `stampRule` per type; stamping step shows rulebook guidance (with the unconfirmed warning), user buys stamp paper elsewhere and **uploads the certificate** (PDF, scan, magic bytes), fields (number, state, amount, date, parties, consideration), six-month warning, duplicate-number refusal, block-send-if-required with audited override, certificate attached to the clone and to the sealed PDF; `ManualStampProvider` only. Accept: required-but-missing certificate blocks sending; duplicate refused. Tests: `scripts/test-cf-stamp.ts`. Depends: B5a.

**B6. Sealing and certificate of completion.** Scope: apply signatures to the final PDF, append certificate pages (with the mandatory notice and stamp certificate number), final hash, `cf_sealed`, public verify page, `pdf-lib` versus re-render decision recorded. Accept: altering one byte fails verification; certificate lists every event. Tests: `scripts/test-cf-seal.ts`. Depends: B4, B5.

**B7. Company-side controls.** Scope: countersign (logged-in user plus fresh OTP), void with reason and **void-then-new-clone** link in the audit trail, re-send, change signer, reminders and expiry cron registered in `vercel.json`/`lib/cron`, notification triggers. Accept: expiry voids tokens; reminders deduped; voided request retains evidence. Tests: `scripts/test-cf-lifecycle.ts`. Depends: B6.

**B8. Bulk send.** Scope: choose a Playbook template/version, select employees/parties, per-recipient variables, one independent clone per recipient, progress and failure list. Accept: 50 recipients with injected failures are isolated. Tests: flow test. Depends: B7, A8, H1.

**B9. Party model and adapters.** Scope: `cf_parties` index and adapters: client (SprintOS `pms_clients`, ClientOS), vendor (SpendIQ `prms_vendors`), employee (TalentOS), candidate, manual partner/freelancer/trainee/other; pickers used by H1. Accept: link not copy; deleted source record handled. Tests: adapter tests. Depends: B2 (needed before H1 final polish, but H1 may start with manual party entry).

**B10. Signed-document vault.** Scope: auto-create on completion, manual upload of wet-signed documents (with stamp info), By party / By type / All, filters, saved filters, ZIP/CSV export, activity log, per-party-type ACL, source versus final hash flag. Accept: HR-only visibility for employee documents enforced; every download audited. Tests: `scripts/test-cf-vault.ts`. Depends: B6, B9.

**B11. Renewals, expiry and retention.** Scope: dates, renewals dashboard (30/60/90), notice-period alerts, retention rules, legal hold, SpendIQ link for vendor contracts, amendment/supersede chain. Accept: hold blocks purge; reminders fire once. Tests: `scripts/test-cf-renewals.ts`. Depends: B10.

**B12. Employee portal: my letters.** Scope: employees see their own issued and signed documents (offer, appointment, increment, experience, signed agreements) in the TalentOS portal through an access-checked route; only documents whose party is that employee; download audited. Accept: an employee cannot see another's letters or other party types. Tests: `scripts/test-cf-employee-letters.ts`. Depends: B10.

### Hardening
**Z1. Security and tenancy review.** Public routes (`/sign`, `/verify`, share links): token entropy, enumeration, rate limits, XSS in rendered content, upload scanning, SSRF in image fetch, secrets, `withTransport` coverage, server-only leaks (client bundle check), two-company isolation tests for every `pb_*`/`cf_*` collection, KEYED audit of every fixed-`_id` collection. Run `npm run security:scan`, `security:audit`.
**Z2. Performance and reliability.** Time and memory of 50-page PDF/DOCX, function duration settings, concurrent exports, AI failure paths, cron idempotency, backup/restore of Blob keys.
**Z3. Content and legal review.** Intern-lawyer review pass of every L template, the consent text and notices, using the per-template reviewed stamp; accessibility pass; docs; final end-to-end script: create, approve, issue, send, edit clone, sign, seal, verify, vault, renewal.

---

## 10. Still needed from the owner (after the decisions above)
1. Who maintains the stamp rulebook in the Console and who confirms entries (the intern lawyer?).
2. The company's Twilio connection and DLT registration details when SMS OTP is wanted (email OTP needs nothing).
3. The list of `NE` (e-sign-ineligible) types and per-type stamp-rule flags: reviewed by the intern lawyer.
4. Which approval exceptions need a different approver (company setting, per type).
5. Which fonts beyond Noto Sans, if any (curated OFL list only).
6. What to do with old `lpms_*` documents (migrate to vault as imported, or archive); whether production data exists (not inspected).
7. Platform-editable starters (code only is the default) and any corporate letterhead assets.

## 11. UNVERIFIED register (check before relying)
- Current Vercel function size/duration limits for the owner's plan; actual bundle size of the TipTap editor; docx output behaviour in Word/LibreOffice/Google Docs for embedded Devanagari fonts; react-pdf behaviour for very long Hindi paragraphs, mixed-script runs, tables across pages; a reliable way to obtain signature-field coordinates from react-pdf (fallback designed).
- All Indian-law statements in 7.1 (Second Schedule list, 2019 widening, 2022 First Schedule changes, Bharatiya Sakshya Adhiniyam mapping, stamp-duty penalties, SHCIL state coverage, 6-month use of e-stamp, lease/registration thresholds): taken from vendor and secondary sources because the official PDF fetch was blocked (HTTP 403). Primary sources to check: indiacode.nic.in (IT Act 2000, First and Second Schedules), cca.gov.in (eSign API specification, ESP list), MeitY notifications, each state's stamp act and the SHCIL portal.
- SHCIL has no public developer API that I could find (access is via authorised collection centres/resellers; reseller terms and pricing UNVERIFIED); state-wise e-stamp coverage (22 to 26 states depending on source), franking rules, duty rates, six-month validity; SMS provider capabilities in this repo; Cohort AI learner collection name for the trainee party adapter; whether Adobe Reader treats hash-sealed (non-PAdES) PDFs as valid (expected: it does not).
- Secondary sources consulted (not authoritative): leegality.com blogs on eSign, first schedule and stamp duty; signdesk.com on e-KYC amendment; emudhra.com stamping pages; barandbench.com and vinodkothari.com on the 2022 IT Act schedule amendment.

---

## Build log

### A0 and A1 (built, one at a time, sequentially)
**A0. Setup (done).** Dependencies (`@tiptap/core`, `pm`, `react`, `starter-kit`, `extension-table`, all MIT, plus `docx`); `docx` in `serverExternalPackages`; `pb_counters`, `pb_settings`, `pb_brand` registered in `KEYED_COLLECTIONS` (`src/lib/platform/tenancy/collections.ts`), collection names in `src/lib/products/playbook-ai/pb-collections.ts`; document permissions in `src/lib/playbook-roles.ts` (18 capabilities layered on the existing `sop_*` roles, Director overrides, listed in the permission catalog as "Playbook documents"; REVIEW_TEMPLATES and MANAGE_RETENTION are admin-only by default); admin-only "Documents (preview)" page and sidebar entry; docs updated (`docs/build-apps.md` section 14c, `docs/products.md`). Tests: `scripts/test-playbook-foundation.ts`, `scripts/test-playbook-client-graph.ts`.
**A1. PBDoc model (done).** `src/lib/products/playbook-ai/doc/*`: types, A4 page settings and safe margin limits (`page.ts`), strict parser/normaliser (`validate.ts`), stable ids, canonical JSON and SHA-256 content hash (`hash.ts` is the only server-only file), clause/list numbering, India formats (dates, lakh/crore grouping, rupees, amount in words), variables/placeholders/conditionals/repeats (collect and resolve), plain-text extraction, and a lossless TipTap JSON mapping that is the editor contract for A6. Tests: `scripts/test-pbdoc.ts` (54 tests plus golden files in `scripts/fixtures/playbook/`).
### A2 and A3 (built, one at a time)
**A2. PDF renderer (done).** `src/lib/products/playbook-ai/doc/render/{tokens,images,prepare,pdf}`; fonts bundled in `src/lib/fonts/noto/` (Noto Sans Regular, Bold, Italic, Bold Italic, OFL; shipped to render routes through `outputFileTracingIncludes`). `renderPdf(doc, options)` validates, resolves variables, then draws A4 pages with brand logo, header and footer zones, page numbers, numbered clauses, lists, tables, images, callouts, signature lines, a contents list with measured page numbers (two layout passes), keep-with-next headings, DRAFT/UNREVIEWED watermark and document properties. It refuses (RenderBlockedError) invalid documents, unfilled variables or placeholders (unless `allowUnresolved`, which highlights them and forces a DRAFT watermark), unusable images and absurd sizes. Tests: `scripts/test-pbdoc-pdf.ts` (25).
**A3. DOCX renderer (done).** `render/docx.ts` reads the same prepared document and tokens: A4 `w:pgSz` 11906 x 16838, Heading styles with keep-with-next, per-list numbering, text clause labels, fixed-width tables with repeated header rows, pictures with alt text, header/footer with PAGE and NUMPAGES fields, Word's own text watermark, bookmarks and internal links for the contents list, embedded Noto Sans (default regular and bold), and reproducible bytes. Tests: `scripts/test-pbdoc-docx.ts` (23), including a words-in-order parity check against the PDF.
Measured (developer machine, Node 24): PDF 27 pages of text 2.7 s, about 40 pages with tables and clauses 11 s, 77 pages with tables and clauses 54 s and +390 MB (layout time grows faster than page count; the estimate guard refuses documents of more than about 120 pages before rendering). DOCX 27 pages 0.4 s, about 80 pages 0.7 s, 0.8 MB with two fonts embedded (9 KB with none, 1.6 MB with all four faces).
Known PDF/DOCX differences: pagination (each engine lays out pages itself, so breaks and page counts differ); contents page numbers only in the PDF; PDF table header rows are not repeated on the next page (Word repeats them); superscript and subscript are only smaller in the PDF; a PDF footer line with page numbers is drawn as plain text; Word will not renumber clause labels (written as text so they match the PDF).
Not verified: opening in Microsoft Word, LibreOffice or Google Docs (none available here; checked with python-docx, mammoth and strict XML parsing instead), and whether Word honours the embedded fonts on every platform.
Not started (waiting for the owner): A4 onward.

### Catalogue schema, metadata and batch T1 (A9 schema part, A14)
`src/lib/products/playbook-ai/catalogue/*` (pure, client-safe): `types.ts` (`CatalogueMeta`, `TemplateDef`, input field types, AI instructions, layout tokens), `variables.ts` (known fields per namespace), `build.ts` (authoring helpers: readable `{{var|format|fallback}}` / `[[placeholder]]` syntax compiled to raw PBDoc), `validate.ts` (`validateMeta`, `validateTemplateDef`, `buildTemplateDoc`), `define.ts` (`defineTemplate`: adds the legal and verification notice sections and the exact banner texts), `registry.ts` (`listCatalogue`, `getTemplateDef`, `getCatalogueMeta`, `searchCatalogue`), `meta/<category>.ts` (metadata for every type), `templates/<batch>/` (full content).
Counts: metadata rows 183 (the section 8 TABLE has 183 rows: HR 47, management 22, operations 10, IT 15, vendor 12, pre-sale 12, contracts 22, training 10, marketing 11, finance 11, legal 11; the prose total of 184 and "44" for the last family are one too high, so no type is missing from the code, the sentence is miscounted); full templates 47 (batch T1, all HR types). The metadata test parses this section, so changing a row here without the matching metadata file fails the test.
Template conventions: `fixed` sections hold static, locked legal wording; `ai` and `hybrid` sections carry AI instructions (tone, length, allowed facts, what must never be invented) and map to PBDoc `generate`; legal-review types get a locked, draft-only `legal_notice` section and statute-sensitive types a `verify_notice` section (the issue step must strip `draftOnly` sections); no digits, percentages or currency in literal wording, every number comes from an input; placeholders inside AI sections are AI slots, elsewhere they must be declared inputs. Adding batch T2 to T5 = a folder `templates/t2-contracts/` exporting a `TemplateDef[]` built with `defineTemplate("<id>", ...)` plus one line in `templates/index.ts`. Tests: `scripts/test-pb-catalogue.ts` (35).

### A6 Editor v1 (built)
**Shared component `src/components/doc-editor/*`** (product-neutral; ContractFlow B1 reuses it): `schema/extensions.ts` (TipTap schema = the A1 mapping's node and mark names; structure rules live in the schema itself: cells, callouts and list items hold paragraphs and lists only, sections only at the top level, merged cells impossible; an integrity plugin keeps ids unique, `colWidths` and header cells consistent, section keys unique, one TOC, no links on variables), `core/*` (pure, no DOM: paste cleaner with its own tokenizer, autosave and conflict state machine, `DocumentStore` interface, outline and clause labels, find and replace, pagination estimate, shortcuts table, link safety, variable registry helpers, editor JSON to PBDoc conversion), `ui/*` (DocEditor, toolbar, outline and block inspector panel, variable picker with fill-in fields, find bar, conflict dialog, A4 page view with header and footer preview, PDF preview tab hook). Playbook wrapper: `src/components/products/playbook-ai/editor/PlaybookDocEditor.tsx`; route `documents/[id]` with server actions (`loadEditorDocument`, `saveEditorDocument` mapping the data layer's `conflict` to `CONFLICT`, `renderEditorPreview` using the A2 renderer with the company letterhead). The page takes the edit lock on load (A4 `acquireLock`); saves extend it.
Tests: `scripts/test-pbdoc-editor-schema.ts` (99 checks, no DOM, in `test:playbook`). Not verified (no browser here): real typing, selection, pasting from Word or Google Docs in a browser, drag and drop, touch, visual layout and page-boundary accuracy, screen-reader behaviour. Not done: image upload (no Playbook file store for document images exists yet, so the image button stays hidden until `uploadImage` is passed), real-time collaboration, comments (hook points only), editing header and footer text (they are the company letterhead, read-only here).
