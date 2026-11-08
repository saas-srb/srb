# Meetings (DealFlow AI) — design contract

"Client Meetings" becomes **Meetings**. A meeting has any number of **external** people, **internal** people and **AI voice agents** (AgentOS). Types: `src/lib/dealflow-ai/meetings/types.ts`.

## Room engine (LiveKit)
- Every human joins the LiveKit room with a token issued by the server for that exact participant: staff through their session, guests through a personal link (opaque token, stored hashed, expiry = meeting end + grace, revocable). The old unauthenticated token route is removed.
- LiveKit credentials come from the connection system (company's own LiveKit first, platform fallback), not from env.
- Each human's browser transcribes its own microphone (VAD-segmented audio sent to the speech-to-text route, ElevenLabs Scribe via the company's key; browser Web Speech only as an optional fallback) and publishes finalized lines on the room data channel. Every client shows the same live transcript.
- A line is **addressed** to an agent when it contains the agent's name or alias (fuzzy, spelling and Hindi/English variants, unit-tested) or follows a recent answer by that agent within the follow-up window.
- **Agent runner**: AI agents are not LiveKit server processes (the app is serverless). One authenticated internal person's browser (elected: earliest-joined staff member, with a heartbeat lease and fail-over) runs the agents: it receives addressed lines, calls the server for the answer (agent instructions, knowledge and the meeting + lead briefing read from AgentOS server-side; the browser sends only the meeting id, agent id and the recent transcript), gets speech audio from the TTS route in the agent's own ElevenLabs voice, and publishes it as that agent's own audio track in the room. If no staff member is present agents stay silent and the room says so (this also stops outsiders from spending the company's AI quota).
- Turn-taking: agents wait for a gap, never talk over a human, one agent speaks at a time (queue), barge-in stops the agent, long answers are cut at a sentence boundary and offer to continue.
- Host controls: add/remove agents live, mute an agent, mute/remove people, end meeting, lock room, admit from waiting room.

## Around the meeting
Scheduling UI with any number of participants, ICS invites by email through the company's email connection, reminders, reschedule/cancel, guest join page with device check, post-meeting transcript + AI summary + action items (company's OpenAI), write-back to the lead/applicant timeline.
