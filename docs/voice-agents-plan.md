# Voice agents across the platform — design contract

AgentOS owns every agent. Other products (DealFlow, TalentOS, SprintOS, ClientOS, Sitecraft websites …) never create agents; they **ask AgentOS to place a call or open a conversation** with an agent the company already built. Nothing calls anyone on its own: every call is started or scheduled by a signed-in person.

## Uses to support (all through one engine)
1. **Lead call** — "Call" CTA on a lead → pick a voice agent → confirm the number → call now or schedule.
2. **Job application** — screening interview and HR pre-qualification (looking for a change? expected CTC? notice period …); answers come back as structured fields.
3. **Web page and phone number** — the same agent works in the browser (website visitor / staff) and on a phone number (outbound, and inbound on a company number).
4. **Client work** — follow-up calls, joining a client meeting to discuss.
5. **Website agent directory** — public page listing the company's public agents; a visitor picks one and talks.
6. **Pre-sale calls.**
7. **After project close** — development update call, upsell call.
8. More: any product can register a *call purpose*.

## Building blocks
- **Call purpose (template)**: screening, pre-HR, lead follow-up, pre-sale, client follow-up, project update, upsell, support, custom. A purpose gives a prompt scaffold and a list of **data-collection fields** (name, type, description, required) the company edits; fields map to ElevenLabs `analysis.data_collection`. No facts or numbers are baked in.
- **Call record** (`agentos_calls`, one document per call, unique ids): agent, purpose, target `{product, entityType, entityId, label}`, phone (E.164), direction (outbound | inbound | web), initiatedBy, scheduledFor, status machine `scheduled → dialing → in_progress → completed | failed | no_answer | busy | cancelled`, attempts, ElevenLabs conversation id, collected data, outcome, summary, transcript, consent/compliance snapshot, cost/minutes.
- **Telephony**: the company's own Twilio account (Settings → Integrations) imported into ElevenLabs as a phone number; numbers listed and assigned to agents (inbound) in AgentOS. SelfRun's Twilio is a fallback only if the platform allows it. Outbound uses ElevenLabs' native outbound call API.
- **Guards before any outbound call** (server-side, cannot be bypassed from the UI): signed-in person with the call permission; target number valid E.164 and in the allowed countries; not on the company do-not-contact list or the lead's flag; calling window (company time zone, default 09:00–21:00) with an explicit override reason by a manager only; no duplicate call to the same number within a short window; per-user and per-company hourly caps; company voice budget not exhausted; agent active and synced; AI disclosure line enabled for outbound by default; consent/recording notice setting.
- **Results flow back**: webhook (ElevenLabs post-call, HMAC verified) and the reconcile poll update the call record; collected data and a summary are written to the target's activity timeline (lead, applicant, client, project); a human decides follow-ups.
- **Scheduling**: a person schedules a call; the existing cron system (`src/lib/cron`) dials due calls once (claim-first, idempotent), re-checks every guard at dial time, never retries without a human or an explicit per-schedule retry setting.
- **Web**: browser calls use signed URLs from a server action. Public (website) use goes through a tightly limited public route: agent must be marked public, per-IP and per-agent rate limits, per-day minute cap, allowed-origin list, abuse logging, no prompt overrides.
- **Call CTA component**: one shared `CallWithAI` button + dialog used by every product: pick agent (AgentOS picker, voice only, filtered by purpose), confirm/edit number, call now or schedule, shows guard failures in plain words.
- **Permissions**: `VOICE_CALL` (place/schedule), `VOICE_CALL_MANAGE` (cancel others', override window, numbers, do-not-contact list), existing VIEW_CHATS for oversight; every action audit-logged.
- **Compliance notes** (India): outbound calling is subject to TRAI/DND rules; the engine ships the guards and records; the company is responsible for lawful use of its numbers. AI disclosure and call-recording notice are on by default for outbound.

## Phases
1. Foundation: data model, telephony numbers, outbound API, webhook, guards, purposes + data-collection fields, scheduling.
2. UI + integrations (parallel): CallWithAI + Calls management + Phone numbers settings; DealFlow (leads, applicants, clients, meetings) + write-back; website directory + inbound; other products (TalentOS recruitment, project close).
3. Security review, fixes, live checks with real ElevenLabs/Twilio using a number the owner supplies.

## Decision: live control through a Twilio conference (chosen by the owner)
ElevenLabs cannot give an observer audio, and its human takeover works for chat only; its monitor socket is Enterprise-only. So phone calls run inside a **Twilio conference**: the lead, the AI agent and (when someone joins) a human are separate participants. A person hears the call by joining muted in the browser (Twilio Voice SDK), takes over by putting the AI leg on hold and speaking, and hands back by releasing the hold and leaving — any number of times, either direction. Live transcript comes from Twilio Real-Time Transcription callbacks (HTTP, stored per call and polled by the console) and does not need ElevenLabs Enterprise. Web (browser) calls keep a live transcript from the ElevenLabs client events; a human cannot join those. All Twilio webhooks verify Twilio's signature; the company's own Twilio account is used.

## What is built (status)
- Engine: call records, guards, scheduling (`agentos-calls` job), ElevenLabs webhook and reconcile, inbound calls, website (public) calls with limits and abuse log, Twilio conference calls with live listen / take-over / hand-back.
- Screens: Call History (merged engine and older browser calls, direction badges, masked inbound numbers, recording player, transcript with speakers, control history, live link), Phone (numbers, Live calls setup checklist and mode, webhook), Phone settings (calling rules, website-call limits, overview, incoming numbers), Do not call, live console.
- Recording: `/api/agentos/calls/<id>/audio` serves engine calls (owner or oversight) and older browser calls (chat id). For a conference call it is the AI side only.
- Limits that follow from the platforms: no live audio for web calls, no notes to the AI during a conference call, the AI hears nothing while on hold.
- Tests: `npm run test:voice`, `npm run test:agentos`.
