import assert from "node:assert/strict";
import { parseSummary, verdict } from "./check-build-memory";

// Pure: the verdict logic of `npm run check:build-memory`. Run: npx tsx scripts/test-build-memory.ts
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("  ✓", name); };
const text = (exit: string, total: number, peak: number) => `label: x  cap: 7500 MB\nexit code: ${exit}  (137)\ntotal: ${total}s\npeak anonymous memory: ${peak} MB   peak incl. page cache: 0 MB\n`;
t("parses the summary the measuring script prints", () => assert.deepEqual(parseSummary(text("0", 900, 5100)), { exitCode: "0", totalSeconds: 900, peakAnonMb: 5100 }));
t("passes a build inside both limits", () => assert.deepEqual(verdict(parseSummary(text("0", 900, 5100)), { maxMb: 6500, maxMinutes: 25 }), []));
t("fails a killed build (out of memory)", () => assert.match(verdict(parseSummary(text("killed", 500, 7238)), { maxMb: 6500, maxMinutes: 25 })[0], /killed/));
t("fails a build over the memory threshold even when it finished", () => assert.match(verdict(parseSummary(text("0", 900, 7000)), { maxMb: 6500, maxMinutes: 25 })[0], /above the limit/));
t("fails a build that takes too long", () => assert.match(verdict(parseSummary(text("0", 2000, 4000)), { maxMb: 6500, maxMinutes: 25 })[0], /took/));
t("an unreadable summary is a failure, not a pass", () => assert.ok(verdict(parseSummary("garbage"), { maxMb: 6500, maxMinutes: 25 }).length > 0));
console.log(`\n${n} passed`);
