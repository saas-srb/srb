# CashFlow accounts — plan checklist (no CA needed)

Goal: any owner runs the company's accounts and filing by following the screen. Nothing hidden behind accountant words.
Legend: ✅ built and tested · 🟡 built, but needs one thing from you (see the note) · ⬜ not built yet

## 0. Two things the law keeps with a person (cannot be removed by software)

- ⬜ **Statutory audit** — must be done by an independent chartered accountant. The system only gets the books ready (item 8).
- ⬜ **Submitting on the government portals** (GST, TRACES, Income-tax, MCA) — the company logs in and submits. The system prepares the numbers/file and a step-by-step guide (item 6).

## 1. Simple structure (how it looks)

- ✅ Sidebar cut from 15 items to 8: Home · Money in · Money out · Bank & cash · Taxes · Month & year-end · Reports · Settings
- ✅ Three hub pages (Bank & cash, Taxes, Month & year-end): plain-language cards with one live status each
- ✅ Home: "Needs your attention" list + "Get started" steps
- ⬜ Plain-words pass on the busiest screens (reconcile → match, ledger → record, accrual → "record sales and bills when raised"), one main button per page
- ⬜ One-time **setup wizard**: six yes/no questions that switch the right things on and hide what does not apply
- ✅ **My work**: daily, weekly, monthly, quarterly and yearly steps, on Home and in the sidebar, with reminders (docs/work-plan.md)

## 2. Law's numbers kept by the platform (so nobody types a rate)

- ✅ Tax rulebook (TDS sections, income-tax bases with surcharge/cess/MAT, advance-tax dates, due-date rules), per financial year
- ✅ Console page to publish, confirm, copy last year, see history
- 🟡 **Someone must check and confirm each year's table** against the current Act and notifications (the built-in table is FY 2025-26 law carried forward; the Income-tax Act, 2025 applies from 1 April 2026). Until then every screen says "indicative"
- ⬜ GST rate list, depreciation rates and Companies Act asset lives in the rulebook (needed for fixed assets)
- ⬜ Annual reminder to the platform admin to confirm the next year's table

## 3. Everyday books

- ✅ Invoices, receipts, bills, vendor payments, refunds, credit/debit notes, expense claims
- ✅ Payments only through the company's own Razorpay, with approvals and alerts
- ✅ Books record sales and bills when raised (opening balances brought in automatically)
- ✅ Bank statement matching; Razorpay payouts checked and recorded; cash count
- ✅ Duplicate bills refused; missing bills/proofs listed; vendor bank-detail changes need a second person
- ✅ Customer and vendor statements, balance confirmation, write-off register
- ⬜ Receipts/bills photo upload from phone with auto-read of amount and GSTIN
- ⬜ Refunds posted properly against the receivable (today a refund is booked as an expense)
- ⬜ Salary accrual in the books (today salaries are booked when paid)

## 4. GST

- ✅ Monthly working: tax on sales, input credit, net, credit notes, reverse charge
- ✅ Sales register (B2B/B2C) + CSV; HSN/SAC on invoice lines
- ✅ Purchases register with a decision on each bill's credit
- ✅ Match purchases with GSTR-2B (upload)
- ⬜ **Automatic** input-credit decision by default rules (today the owner decides each bill)
- ⬜ Upload-ready **GSTR-1 and GSTR-3B files** + "enter this on the portal" guide
- ⬜ GST payment (challan) record and ledger match
- ⬜ Exports, SEZ and nil/exempt supplies handled separately
- ⬜ Annual return (GSTR-9) working

## 5. TDS

- ✅ Rates/limits from the rulebook; section on the vendor bill fills the rate; PAN checked
- ✅ Every deduction checked (short / excess / not deducted)
- ✅ Deposits (challans) recorded and compared month by month; ledger posting
- ✅ Quarterly statement working + CSV; Form 16A tracker; lower-deduction certificates
- ✅ TDS cut by customers matched with Form 26AS (CSV)
- ⬜ **Suggest the section automatically** from the vendor and what was bought
- ⬜ File in the format the return utility accepts, + portal guide
- ⬜ Form 16 for salaries and 24Q working (links with payroll)
- ⬜ 15CA/15CB for payments to non-residents

## 6. Income tax and "do it for me" flows

- ✅ Tax for the year from book profit (company picks its basis; rates automatic); losses set-off; MAT automatic; provision posted to the books
- ✅ Advance-tax schedule automatic; payments recorded; losses register; return/audit status; notices register
- ⬜ **Guided monthly GST flow**: review → one tap → files + portal steps
- ⬜ **Guided quarterly TDS flow**
- ⬜ **Guided advance-tax flow**: "pay this much by this date", challan details to copy
- ⬜ **Year-end flow**: tax computation → ITR-6 working sheet → submit guide
- ⬜ Deferred tax
- ⬜ Tax-audit and MAT applicability tests from the rulebook's limits

## 7. Assets, loans, capital (Phase 3)

- ⬜ Fixed-asset register (Companies Act and income-tax depreciation side by side, disposals) — also feeds the income-tax depreciation adjustment
- ⬜ Inventory (only if the company holds stock)
- ⬜ Loans and investments register, EMI match, interest accrued
- ⬜ Share capital and director/related-party loans

## 8. Year-end, audit and company law

- ✅ Month-end close checklist and lock; CA checklist; filing calendar that **fills itself** from the rulebook and moves dates on extensions
- ⬜ Year-end close: final trial balance, schedules (receivables, payables, assets, loans)
- ⬜ **Audit pack**: financial statements with notes + all schedules as one download for the auditor
- ⬜ Statutory registers (members, directors, charges), board/AGM notices and minutes (templates)
- ⬜ ROC forms tracker (AOC-4, MGT-7, DIR-3 KYC …) with the facts each form needs prepared
- ⬜ Other compliances tracker (PF/ESI/PT/LWF registrations, Shops, POSH, FEMA)

## 9. Safety net

- ✅ Every checked module has tests (accrual, GST, TDS, income tax, rulebook, settlements, month close, vendor controls, party recon) and an independent review pass
- ⬜ Check the pages by clicking through them in a browser (so far only type-checks and tests, no one has used the screens)
- ⬜ Try the Razorpay flows (collect, payout, settlements) with a real test-mode account
- ⬜ Check GSTR-2B, 26AS and portal file formats against real downloads

## Rough progress

| Area | Done | Pending |
|---|---|---|
| Structure / simple look | 3 of 6 | 3 |
| Law's numbers (rulebook) | 2 of 5 | 3 |
| Everyday books | 6 of 9 | 3 |
| GST | 4 of 9 | 5 |
| TDS | 5 of 9 | 4 |
| Income tax and guided flows | 2 of 8 | 6 |
| Assets, loans, capital | 0 of 4 | 4 |
| Year-end, audit, company law | 1 of 6 | 5 |
| Safety net | 1 of 4 | 3 |
| **Total** | **24 of 60** | **36** |

## Suggested order (simplest wins first)

1. Setup wizard + plain-words pass + "due this week" on Home (everything after depends on a person finding their way).
2. Guided monthly GST flow with upload files, then automatic input-credit decision.
3. Guided quarterly TDS and advance-tax flows, TDS section suggestion.
4. Fixed assets (also completes the income-tax computation).
5. Year-end close, audit pack, ITR-6 working sheet.
6. Registers, board/AGM templates, ROC tracker, loans and capital.
7. Browser check and real Razorpay test, in parallel with all of the above.
