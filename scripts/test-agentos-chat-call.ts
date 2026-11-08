import assert from "node:assert/strict";
import { buildChatSummary, chatCallNotes, chatContextLine, chatTarget, phoneCallAvailability, talkHereAvailability, voiceCallNote, CHAT_SUMMARY_MESSAGES } from "../src/lib/products/agentos/chat-call";
import { targetHref } from "../src/lib/products/agentos/calls/target-links";
import { CONTEXT_NOTES_MAX } from "../src/lib/products/agentos/calls/context";

// Pure helpers only: no database, no network, no call is placed.
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const msg = (role: "user" | "assistant", text: string, attachments: string[] = []) => ({ role, text, attachments });

t("default notes are only the context line (nothing shared without the tick)", () => {
  const msgs = [msg("user", "my secret salary is 90000"), msg("assistant", "noted")];
  const notes = chatCallNotes("Pricing questions", msgs, false);
  assert.equal(notes, "Continuing from a chat titled Pricing questions.");
  assert.ok(!notes.includes("secret"));
  assert.equal(chatContextLine(null), "Continuing from a chat.");
  assert.equal(chatContextLine("  <b>Hi</b> {{x}} \u0007there  "), "Continuing from a chat titled bHi/b x there.");
});

t("summary is included only when opted in, and fits the 500 character total", () => {
  const msgs = [msg("user", "I need a quote for 40 seats"), msg("assistant", "Sure, the annual plan is the best fit.")];
  const withSummary = chatCallNotes("Quote", msgs, true);
  assert.match(withSummary, /Recent messages: Person: I need a quote for 40 seats \| Agent: Sure/);
  assert.ok(withSummary.length <= CONTEXT_NOTES_MAX);
  const long = Array.from({ length: 30 }, (_, i) => msg(i % 2 ? "assistant" : "user", `message number ${i} ${"x".repeat(400)}`));
  for (const title of ["T", "T".repeat(300)]) {
    const n = chatCallNotes(title, long, true);
    assert.ok(n.length <= CONTEXT_NOTES_MAX, `length ${n.length}`);
  }
});

t("only the last few messages are used, oldest first", () => {
  const msgs = Array.from({ length: 20 }, (_, i) => msg(i % 2 ? "assistant" : "user", `m${i}`));
  const s = buildChatSummary(msgs, "x");
  const used = [...s.matchAll(/m(\d+)/g)].map((m) => Number(m[1]));
  assert.equal(used.length, CHAT_SUMMARY_MESSAGES);
  assert.deepEqual(used, [...used].sort((a, b) => a - b));
  assert.equal(used.at(-1), 19);
});

t("control characters, angle brackets, braces and the attachment marker are stripped; attachments are not shared", () => {
  const s = buildChatSummary([msg("user", "<script>alert(1)</script>\u0000\u001b[31m {{notes}} `rm`\n\nline", ["salary.pdf"])], "x");
  assert.ok(!/[<>{}`\u0000-\u001f]/.test(s), s);
  assert.ok(!s.includes("salary.pdf"));
  assert.equal(buildChatSummary([], "x"), "");
  assert.equal(buildChatSummary([msg("user", "  \n ")], "x"), "");
});

t("a single huge message is cut, never overflows", () => {
  const s = buildChatSummary([msg("user", "a".repeat(5000))], "x");
  assert.ok(s.length > 0 && s.length + chatContextLine("x").length + 1 <= CONTEXT_NOTES_MAX);
});

t("target and link mapping for chats", () => {
  assert.deepEqual(chatTarget("c1", "Hello"), { product: "agentos", entityType: "chat", entityId: "c1", label: "Hello" });
  assert.equal(chatTarget("c1", "").label, "this chat");
  assert.equal(targetHref({ product: "agentos", entityType: "chat", entityId: "a b/c" }), "/agentos/chats/a%20b%2Fc");
  assert.equal(targetHref({ product: "agentos", entityType: "other", entityId: "1" }), null);
});

const ready = { canCall: true, blockers: [], agents: [{ ready: true }] };
t("Call button availability and plain reasons", () => {
  assert.equal(phoneCallAvailability({ chatCreated: true, options: ready }).enabled, true);
  assert.match(phoneCallAvailability({ chatCreated: false, options: ready }).reason!, /first message/);
  assert.match(phoneCallAvailability({ chatCreated: true, options: null }).reason!, /Checking/);
  assert.match(phoneCallAvailability({ chatCreated: true, options: { ...ready, canCall: false } }).reason!, /permission/);
  assert.match(phoneCallAvailability({ chatCreated: true, options: { ...ready, agents: [] } }).reason!, /no voice agent/i);
  assert.match(phoneCallAvailability({ chatCreated: true, options: { ...ready, agents: [{ ready: false }] } }).reason!, /ready/);
  assert.match(phoneCallAvailability({ chatCreated: true, options: { ...ready, blockers: [{ code: "no_number" }] } }).reason!, /phone number/);
});

t("Talk here needs no phone number or calling permission, but a ready agent and a connected provider", () => {
  assert.equal(talkHereAvailability({ chatCreated: true, options: { ...ready, canCall: false, blockers: [{ code: "no_number" }] } }).enabled, true);
  assert.equal(talkHereAvailability({ chatCreated: true, options: { ...ready, blockers: [{ code: "not_connected" }] } }).enabled, false);
  assert.equal(talkHereAvailability({ chatCreated: false, options: ready }).enabled, false);
  assert.equal(talkHereAvailability({ chatCreated: true, options: { ...ready, agents: [] } }).enabled, false);
});

t("voice call note is plain text with a call link", () => {
  assert.equal(voiceCallNote("Maya <b>", "abc 1", "talk"), "[Voice call] I had a voice conversation with Maya b. [Open the call](/agentos/calls/abc%201)");
  assert.match(voiceCallNote("", "x", "phone"), /phone call with a voice agent/);
});

console.log("agentos chat-call: all passed");
