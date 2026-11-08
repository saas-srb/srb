# Progress tracker (updated 2026-11-03)

How to read this: **Code done** = written and passing its own automated tests (fake providers, throwaway databases). It does NOT mean it has been run in a browser or against a real account. **Live-checked** = someone ran it for real. Almost nothing is live-checked yet. Percentages are estimates, not measurements.

| Area | Code done | Live-checked | What is pending |
|---|---|---|---|
| CashFlow: accounting engine, GST, TDS, income tax, month close | ~95% | 0% | 36 items in `docs/accounts-plan-checklist.md` (setup wizard, GSTR files, fixed assets, year-end, audit pack) |
| CashFlow: "My work" (daily/weekly/monthly/quarterly/yearly) | ~100% | 0% | open in browser, real company data |
| AgentOS: Agent Hub, text + voice agents, call history/audio | ~100% | ~10% (ElevenLabs API called for real once) | browser check, real call |
| Voice calling engine (phone, conference, takeover, public, briefing) | ~100% | 0% | needs public https URL, Twilio number, verified test number |
| DealFlow AI (voice moved out, panels, meetings) | ~100% | 0% | browser check |
| Meetings (schedule, guests, live room, AI agents) | ~100% | 0% | real LiveKit test, browser check |
| ViralPulse: sidebar, dashboard, posts, ads, studios, analytics | ~95% | 0% | `npm run build`, browser, UGC wizard steps 3-5 AI buttons, developer-app approvals |
| ViralPulse: real publishing and real Meta ads | ~100% code | 0% | company developer approvals (Meta, YouTube, LinkedIn, X, Google) |
| Playbook AI + ContractFlow rebuild | **~5%** | 0% | see below |

## Playbook AI + ContractFlow (single agent, one feature at a time)
Plan and decisions: `docs/playbook-audit-and-plan.md` (Build log at the end is updated after every feature).

Track A: Playbook authoring
- A0 setup: DONE
- A1 document model: DONE
- A2 PDF renderer: IN PROGRESS
- A3 DOCX renderer: next
- A4 versions, A5 export routes, A6 editor, A7 brand, A8 variables, A9 templates, A10 numbering and approvals, A11 AI engine and fact guard, A12 create wizard, A13 comments and share links
- A14-A18 template batches (HR, contracts, management/ops/IT, vendor/pre-sale/finance, training/marketing/legal)
- A19 SOP migration, A20 DOCX import (optional)

Track B: ContractFlow and handoff
- B0 reset, B1 clone store and editor, H1 send for signature, H2 status back to Playbook
- B2 request model, B3 OTP (email default, SMS after DLT), B4 signer experience, B5a stamp rulebook, B5b stamp certificate upload, B6 sealing and certificate
- B7 company controls, B8 bulk send, B9 party model, B10 vault, B11 renewals and retention, B12 employee letters in TalentOS portal

Hardening: Z1 security and tenancy, Z2 performance, Z3 legal and content review

Counting: 2 of about 40 features done = about 5%.

## Things only the owner can do
1. Run `npm run build` once (stop the dev server first).
2. Open each new screen in a browser and report problems.
3. Real accounts: Twilio (public URL, number, verified numbers), ElevenLabs, Gemini, OpenAI keys; Meta/YouTube/LinkedIn/X/Google developer apps and approvals.
4. Legal review of legal templates by a qualified advocate.
