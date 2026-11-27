/** Every product page has its whole story: what, why, problems, use cases, AI, automation, and the data of the other sections. No database. */
import assert from "node:assert/strict";
import { MODULE_COPY } from "../src/lib/platform/saas/content";
import { PRODUCT_STORY } from "../src/lib/platform/saas/product-story";
import { PANEL_DETAIL } from "../src/lib/platform/saas/panel-detail";
import { FEATURE_LISTS, PANEL_VALUE } from "../src/lib/platform/saas/feature-lists";

const keys = Object.keys(MODULE_COPY);
assert.deepEqual(Object.keys(PRODUCT_STORY).sort(), [...keys].sort(), "a story for every product page, and no other");
const seen = new Map<string, string>();
for (const key of keys) {
  const s = PRODUCT_STORY[key];
  assert.ok(s.banner.length > 180 && s.banner.length < 330, `${key}: banner description (${s.banner.length} characters)`);
  assert.ok(s.what.length > 80 && s.why.length > 80, `${key}: what and why are explained`);
  assert.ok(s.problems.length >= 4, `${key}: at least four problems`);
  assert.ok(s.useCases.length >= 3, `${key}: at least three use cases`);
  assert.ok(s.ai.length >= 3, `${key}: at least three AI points`);
  assert.ok(s.automation.length >= 3, `${key}: at least three automations`);
  assert.ok(s.aiRule.length > 40, `${key}: says where the person stays in charge`);
  assert.ok(PANEL_DETAIL[key] && FEATURE_LISTS[key] && PANEL_VALUE[key], `${key}: workflow, features and value`);
  for (const text of [s.banner, s.what, s.why, ...s.problems.flat(), ...s.useCases.map((u) => u.story)]) {
    assert.ok(!/lorem|todo|coming soon|\btbd\b/i.test(text), `${key}: no placeholder text`);
    assert.ok(!seen.has(text) || seen.get(text) === key, `${key}: text copied from ${seen.get(text)}`);
    seen.set(text, key);
  }
  console.log(`✓ ${key}`);
}
assert.match(PRODUCT_STORY.lpms.aiRule, /not Aadhaar eSign or a digital signature certificate/);
console.log(`product story: ${keys.length} products checked`);
