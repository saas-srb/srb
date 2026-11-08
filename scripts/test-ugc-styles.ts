/**
 * UGC style catalogue: determinism, variety, validity, prompt caps, banned phrases, pacing, ranking. Pure, no DB, no network.
 *   npx tsx scripts/test-ugc-styles.ts
 */
import assert from "node:assert/strict";
import {
  buildDirectorBrief, buildScenePrompt, containsBannedPhrase, estimateSpeakingSecs, getStyle, listStyles, maxWordsForDuration,
  pickVariation, planBeats, STYLE_CATEGORIES, suggestStyles, validateStyle, variationKey, variationToActors,
  ACTOR_ARCHETYPES, SETTINGS, PLATFORMS, postGuidance, composeStoryboard, roomKindFor, propGlyphs,
} from "../src/lib/products/viralpulse-ai/ugc/styles";
import { BOLD_WOMAN_PERSONALITIES, MODEST_WARDROBES, TRADITIONAL_WARDROBES, TRENDY_WARDROBES } from "../src/lib/products/viralpulse-ai/ugc/styles/pools";
import { offerPlanProblems, offerProblems, OFFER_MISSING, parseOffer } from "../src/lib/products/viralpulse-ai/ugc/offer";
import { NEWS_STYLE_NOTICE } from "../src/lib/products/viralpulse-ai/ugc/styles/prompt";
import type { ProductBrief, ScenePlan, UgcScene } from "../src/lib/products/viralpulse-ai/ugc/types";

const styles = listStyles();
assert.ok(styles.length >= 200, `need 200+ styles, have ${styles.length}`);
const NEW = styles.slice(43);
assert.ok(NEW.length >= 90, `need 90+ new styles, have ${NEW.length}`);
assert.equal(new Set(styles.map((s) => s.id)).size, styles.length, "unique ids");
for (const c of STYLE_CATEGORIES) assert.ok(styles.some((s) => s.category === c), `category ${c} has no style`);
for (const s of styles) {
  const v = validateStyle(s);
  assert.ok(v.ok, `${s.id}: ${v.errors.join("; ")}`);
}
assert.equal(getStyle("cosy-floor-chat")?.actorCount, 2);
assert.equal(getStyle("nope"), undefined);

// validateStyle rejects bad styles.
const base = getStyle("cosy-floor-chat")!;
assert.equal(validateStyle({ ...base, beats: base.beats.slice(0, 2) }).ok, false);
assert.equal(validateStyle({ ...base, beats: base.beats.map((b) => ({ ...b, durationSecs: 20 })) }).ok, false);
assert.equal(validateStyle({ ...base, description: "Features a celebrity lookalike talking about it today" }).ok, false);
assert.equal(validateStyle({ ...base, actorCount: 4 as never }).ok, false);

// Determinism, keep/change.
for (const s of styles) {
  assert.deepEqual(pickVariation(s.id, 7), pickVariation(s.id, 7), s.id);
}
const v1 = pickVariation("cosy-floor-chat", "abc");
assert.notDeepEqual(v1, pickVariation("cosy-floor-chat", "abd"));
const kept = pickVariation("cosy-floor-chat", "other", { keep: v1, change: ["setting"] });
assert.deepEqual(kept.actors, v1.actors, "actors kept");
assert.equal(kept.camera, v1.camera);
assert.throws(() => pickVariation("missing", 1));
const actorsOf = variationToActors(v1);
assert.equal(actorsOf.length, 2);
assert.ok(actorsOf.every((a) => /^actor_\d$/.test(a.id)));
assert.notEqual(actorsOf[0]!.label, actorsOf[1]!.label);

// Variety: 200 seeds.
for (const [id, min] of [["cosy-floor-chat", 120], ["honest-first-impression", 100], ["kitchen-recipe-demo", 80]] as const) {
  const keys = new Set<string>();
  const settings = new Set<string>();
  const pairs = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const v = pickVariation(id, i);
    keys.add(variationKey(v));
    settings.add(v.setting.id);
    pairs.add(v.actors.map((a) => a.archetypeId).join("+"));
  }
  assert.ok(keys.size >= min, `${id}: only ${keys.size} distinct combos`);
  assert.ok(settings.size >= Math.min(3, getStyle(id)!.settingIds.length), `${id}: settings ${settings.size}`);
  assert.ok(pairs.size >= (getStyle(id)!.actorCount === 1 ? 8 : 40), `${id}: actor combos ${pairs.size}`);
}

// Speaking-rate helper.
assert.equal(estimateSpeakingSecs("", "en"), 0);
const t22 = estimateSpeakingSecs("one two three four five six seven eight nine ten eleven", "en");
assert.ok(t22 >= 4.9 && t22 <= 5.6, `11 english words ~5s, got ${t22}`);
assert.ok(estimateSpeakingSecs("yaar ye bahut accha hai na matlab", "hi") < estimateSpeakingSecs("yaar ye bahut accha hai na matlab", "ta"));
assert.ok(maxWordsForDuration(8, "en") < maxWordsForDuration(8, "hi"));
assert.equal(maxWordsForDuration(1, "en"), 0);

// planBeats stays inside 4-12 and the style range.
for (const s of styles) {
  for (const target of [15, 20, 30, 45, 60]) {
    const b = planBeats(s, target);
    const sum = b.reduce((a, x) => a + x.durationSecs, 0);
    assert.ok(b.every((x) => x.durationSecs >= 4 && x.durationSecs <= 12), `${s.id} beat range`);
    assert.ok(sum >= s.durationRange[0] && sum <= s.durationRange[1], `${s.id} total ${sum} for ${target}`);
  }
}

// Director brief + scene prompts over every style, several seeds, languages.
const brief: ProductBrief = { name: "Sample Product", description: "A simple everyday tool.", keyPoints: ["Easy to set up", "Works offline"], audience: "busy people", callToAction: "Try it today" };
for (const s of styles) {
  for (const [seed, lang] of [[1, "hinglish"], [2, "en"], [3, "hi"]] as const) {
    const v = pickVariation(s.id, seed);
    const db = buildDirectorBrief(s, brief, v, lang);
    assert.ok(/Never invent claims, prices/.test(db.text), "hard rules present");
    assert.ok(/words\/sec/.test(db.text));
    if (s.illustrative) assert.ok(/ILLUSTRATIVE/.test(db.text), `${s.id} illustrative notice`);
    assert.equal(db.sceneBudgets.length, s.beats.length);
    assert.ok(db.totalSecs >= 15 && db.totalSecs <= 60);
    const actors = variationToActors(v);
    for (const [i, b] of db.sceneBudgets.entries()) {
      const words = "yaar ye wala bahut simple hai matlab bas dekho ".repeat(4).trim().split(" ").slice(0, Math.min(b.maxWords, 24)).join(" ");
      const scene: UgcScene = {
        index: i, durationSecs: b.durationSecs, setting: v.setting.description,
        visualPrompt: "Both sit close, one holds up a phone and laughs, then points at the screen while the other leans in to look at the details.",
        cameraNotes: "handheld, slow push in, brief reframe", actorIds: actors.map((a) => a.id),
        dialogue: [{ speakerId: "actor_1", text: words, language: lang }], onScreenText: i === 0 ? "Illustrative" : undefined,
      };
      const p = buildScenePrompt(scene, actors, v, s);
      assert.ok(p.length <= (s.promptCharCap ?? 900), `${s.id} prompt ${p.length} > cap`);
      assert.ok(p.includes(words), "dialogue kept intact in the prompt");
      for (const a of actors) assert.ok(p.includes(`${a.label} (${a.ageRange}, ${a.gender}; ${a.look}; wearing ${a.wardrobe})`), "actor description verbatim");
      assert.equal(containsBannedPhrase(p.replace(/Avoid:.*$/, "")), null, `${s.id} prompt banned phrase`);
      assert.ok(/Avoid:/.test(p));
      assert.equal(buildScenePrompt(scene, actors, v, s), p, "deterministic");
    }
  }
}

// No banned phrases or minors anywhere in pools/styles; no style requires likeness.
for (const s of styles) {
  assert.equal(s.adultsOnly, true);
  assert.equal(containsBannedPhrase(JSON.stringify({ ...s, negativeCues: [] })), null, s.id);
  assert.ok(s.aspects.length >= 1 && s.durationRange[0] >= 15 && s.durationRange[1] <= 60);
}
for (let i = 0; i < 50; i++) for (const a of pickVariation("cosy-floor-chat", i).actors) {
  const [lo] = a.ageRange.split("-").map(Number);
  assert.ok((lo ?? 0) >= 18, "adult actors only");
}
assert.ok(containsBannedPhrase("looks like a celebrity") !== null);
assert.ok(containsBannedPhrase("guaranteed results") !== null);
assert.equal(containsBannedPhrase("two friends chat on the floor"), null);

// suggestStyles ranking.
const a = suggestStyles({ industry: "restaurant", goal: "footfall", platform: "instagram", language: "hinglish" });
assert.deepEqual(a, suggestStyles({ industry: "restaurant", goal: "footfall", platform: "instagram", language: "hinglish" }));
assert.equal(a.length, styles.length);
assert.ok(a.every((x, i) => i === 0 || a[i - 1]!.score >= x.score), "sorted desc");
assert.ok(a.slice(0, 8).some((x) => getStyle(x.styleId)!.industries.includes("restaurant")), "restaurant styles near top");
assert.ok(a[0]!.reasons.length >= 1);
const b2b = suggestStyles({ industry: "SaaS software", goal: "leads", platform: "linkedin", language: "en", limit: 5 });
assert.equal(b2b.length, 5);
assert.ok(b2b.slice(0, 3).every((x) => getStyle(x.styleId)!.platforms.includes("linkedin")), `linkedin top picks: ${b2b.map((x) => x.styleId)}`);
const retailTop = suggestStyles({ industry: "kirana store", goal: "footfall", platform: "whatsapp", language: "hi", limit: 3 });
assert.ok(retailTop.some((x) => getStyle(x.styleId)!.category === "local-business"), "local business surfaces for kirana");
assert.ok(suggestStyles({}).length === styles.length, "empty input still ranks");

// ---- new styles: structure, distinctness, per-category and per-platform coverage ----
assert.equal(new Set(styles.map((s) => s.description)).size, styles.length, "descriptions unique");
assert.equal(new Set(styles.map((s) => s.label)).size, styles.length, "labels unique");
const byCat = (c: string) => styles.filter((s) => s.category === c).length;
for (const [c, n] of [["direct-response", 6], ["offer-sale", 4], ["launch", 4], ["short-formats", 6], ["explainer", 6], ["tech-qa", 9], ["tech-humour", 6], ["devotional", 5], ["kids-parenting", 4], ["news-style", 6], ["entertainment", 6], ["company-marketing", 5], ["services-marketing", 4], ["product-marketing", 4], ["hiring", 3], ["events", 3], ["trades", 3]] as const) {
  assert.ok(byCat(c) >= n, `category ${c}: ${byCat(c)} < ${n}`);
}
for (const p of ["instagram", "facebook", "youtube", "linkedin", "x"] as const) {
  const native = styles.filter((s) => s.nativePlatform === p);
  assert.ok(native.length >= 6, `${p}: only ${native.length} native styles`);
  assert.ok(native.every((s) => s.platforms.includes(p)));
  for (const s of native) {
    const g = postGuidance(s.id, p)!;
    assert.ok(g && g.captionSkeleton.includes("{") && g.aiLabel.captionSuffix.length > 5 && g.aiLabel.action.length > 5, `${s.id} guidance`);
    assert.ok(["9:16", "16:9", "1:1"].includes(g.aspect));
    assert.ok(g.hashtagCount.min <= g.hashtagCount.max && g.hashtagCount.max <= 5);
    assert.ok(/current limits/i.test(g.limitsNote + g.lengthNote));
    assert.equal(containsBannedPhrase(JSON.stringify(g)), null, `${s.id} guidance banned phrase`);
    assert.ok(!/\d{3,}/.test(g.captionSkeleton), "no invented figures in caption skeleton");
    if (s.illustrative) assert.ok(g.illustrativeNotice && g.captionSkeleton.includes(g.illustrativeNotice));
  }
}
assert.equal(postGuidance("nope", "x"), null);
assert.ok(PLATFORMS.includes("x") && postGuidance("cosy-floor-chat", "x")!.aiLabel.captionSuffix.includes("AI-generated"));
for (const s of styles) assert.ok(s.aspects.every((a) => ["9:16", "16:9", "1:1"].includes(a)), `${s.id} aspects`);

// Illustrative flags: anything testimonial / interview / case-study / spotlight / news-like.
for (const s of styles) {
  if (/testimonial|interview|success story|spotlight|montage|case.study|employee voice|review-style|news|unboxing|expert/i.test(`${s.label} ${s.category}`)) assert.ok(s.illustrative, `${s.id} should be illustrative`);
  if (s.category === "kids-parenting") assert.ok(s.negativeCues.some((c) => /children|minors/i.test(c)), `${s.id} must forbid children`);
}
for (const s of styles.filter((x) => x.category === "news-style")) {
  const db = buildDirectorBrief(s, brief, pickVariation(s.id, 1), "en");
  assert.ok(db.text.includes(NEWS_STYLE_NOTICE) && /not real reporting/.test(db.text), `${s.id} news notice`);
}
for (const s of styles) {
  const db = buildDirectorBrief(s, brief, pickVariation(s.id, 1), "en");
  const tech = ["tech-qa", "tech-humour", "tech-demo"].includes(s.category);
  assert.equal(/TECHNICAL CONTENT/.test(db.text) && /Never invent one/.test(db.text), tech, `${s.id} tech rule`);
  assert.ok(/Nothing sexualised/.test(db.text), "appropriateness rule in every brief");
}

// New styles vary: 200 seeds each.
for (const s of NEW) {
  const keys = new Set<string>();
  for (let i = 0; i < 200; i++) keys.add(variationKey(pickVariation(s.id, i)));
  assert.ok(keys.size >= 60, `${s.id}: only ${keys.size} distinct combos`);
}

// Storyboards compose for every style; every setting maps to a specific room.
const generic = SETTINGS.filter((x) => roomKindFor({ id: x.id, label: x.label }) === "generic");
assert.equal(generic.length, 0, `settings without a room: ${generic.map((x) => x.id)}`);
for (const x of SETTINGS) assert.ok(propGlyphs(x.props).length >= 1);
for (const s of styles) for (const seed of [1, 2]) {
  const b = composeStoryboard(s, pickVariation(s, `preview-${seed}`));
  assert.equal(b.scenes.length, s.beats.length);
  assert.ok(b.scenes.every((sc) => sc.figures.length <= 3));
}

// ---- casting: female-led, young adult women, modest/traditional contexts, nothing sexualised ----
const SUGGESTIVE = /bikini|lingerie|revealing|cleavage|plunging|backless|crop top|bralette|sports bra|mini ?skirt|short skirt|skimpy|sexy|seductive|provocative|sultry|busty|bodycon|low-cut|strapless|sheer top|thong|tight-fitting|figure-hugging|body-hugging|bare midriff|midriff|hot pants|micro-?(skirt|mini)/i;
const pools = [...ACTOR_ARCHETYPES.flatMap((a) => [a.look, ...a.wardrobes, ...a.personalities]), ...BOLD_WOMAN_PERSONALITIES, ...Object.values(TRENDY_WARDROBES).flat(), ...Object.values(MODEST_WARDROBES).flat(), ...Object.values(TRADITIONAL_WARDROBES).flat()];
for (const t of pools) assert.ok(!SUGGESTIVE.test(t), `suggestive descriptor in pool: ${t}`);
for (const s of styles) {
  const texts = [s.label, s.description, s.promptTag, s.camera.primary, ...s.camera.alternates, ...s.beats.map((b) => b.purpose), ...s.lineRoles, ...s.realismCues, ...Object.values(s.speech)];
  for (const t of texts) assert.ok(!SUGGESTIVE.test(t), `${s.id}: suggestive wording: ${t}`);
  assert.ok(["solo-female", "female-male", "female-female"].includes(s.castMode));
  assert.equal(s.castMode === "solo-female", s.actorCount === 1, `${s.id} castMode vs actorCount`);
}
for (const s of styles) for (let i = 0; i < 40; i++) {
  const v = pickVariation(s.id, `cast-${i}`);
  const women = v.actors.filter((a) => a.gender === "woman");
  assert.ok(women.length >= 1, `${s.id}: no woman in the default cast`);
  assert.equal(v.actors[0]!.gender, "woman", `${s.id}: a woman leads`);
  for (const w of women) {
    const [lo, hi] = w.ageRange.split("-").map(Number);
    assert.ok(lo! >= 22 && hi! <= 32, `${s.id}: woman aged ${w.ageRange}`);
    assert.ok(!SUGGESTIVE.test(`${w.look} ${w.wardrobe} ${w.personality}`));
  }
  for (const a of v.actors) assert.ok(Number(a.ageRange.split("-")[0]) >= 18, "adults only");
  if (s.actorCount === 2 && s.castMode === "female-male") assert.deepEqual(v.actors.map((a) => a.gender), ["woman", "man"], `${s.id}: one woman and one man`);
  assert.ok(!(v.actors.length === 1 && v.actors[0]!.gender === "man"), "no male-only solo");
  const wardrobe = v.actors.map((a) => a.wardrobe);
  if (s.wardrobeTone === "modest") for (const a of v.actors) assert.ok(MODEST_WARDROBES[a.gender as "woman" | "man"].includes(a.wardrobe), `${s.id}: modest wardrobe expected, got ${a.wardrobe}`);
  if (s.wardrobeTone === "traditional") for (const a of v.actors) assert.ok(TRADITIONAL_WARDROBES[a.gender as "woman" | "man"].includes(a.wardrobe), `${s.id}: traditional wardrobe expected`);
  void wardrobe;
}
for (const id of ["news-breaking-bulletin", "devotional-aarti-moment", "li-hiring-post", "parenting-tip-adult-chat"]) assert.notEqual(getStyle(id)!.wardrobeTone, "trendy", id);
assert.equal(getStyle("cosy-floor-chat")!.wardrobeTone, "trendy");
assert.ok(getStyle("cosy-floor-chat")!.castMode === "female-male" && getStyle("honest-first-impression")!.castMode === "solo-female");

// ---- suggestions for the new styles ----
const top = (input: Parameters<typeof suggestStyles>[0], n = 8) => suggestStyles({ ...input, limit: n }).map((x) => x.styleId);
assert.ok(top({ industry: "devops docker kubernetes software", goal: "education", platform: "linkedin", language: "en" }).some((id) => id.startsWith("tech-qa") || id.startsWith("dev-")), "tech topic surfaces tech styles");
assert.ok(top({ industry: "wedding planner", goal: "leads", platform: "instagram" }).some((id) => id.includes("wedding")), "wedding surfaces");
assert.ok(top({ industry: "temple puja devotional", goal: "engagement", platform: "whatsapp", language: "hi" }).some((id) => id.startsWith("devotional")), "devotional surfaces");
assert.ok(top({ industry: "real estate", goal: "leads", platform: "instagram" }, 10).includes("real-estate-flat-tour"), "real estate surfaces");
assert.ok(top({ industry: "saas", goal: "installs", platform: "x" }, 10).some((id) => getStyle(id)!.nativePlatform === "x"), "x-native style surfaces for X");
assert.ok(top({ industry: "chartered accountant tax", goal: "trust", platform: "linkedin" }, 10).includes("ca-legal-finance-awareness"));
assert.ok(top({ goal: "walk-ins", platform: "whatsapp", industry: "kirana" }, 10).length === 10);

// ---- offer styles: details only from the brief ----
const offerStyles = styles.filter((x) => x.offer);
assert.ok(offerStyles.filter((x) => x.category === "offer-sale").length >= 20, "20+ offer-sale styles");
assert.ok(offerStyles.length >= 25, `offer styles: ${offerStyles.length}`);
for (const id of ["offer-flat-discount", "offer-diwali-sale", "offer-holi-sale", "offer-eid-sale", "offer-christmas-new-year-sale", "offer-independence-day-sale", "offer-flash-countdown", "offer-buy-one-get-one", "offer-combo-bundle", "offer-free-trial-consult-demo", "offer-early-bird", "offer-cashback-coupon-reveal", "offer-last-few", "offer-membership-subscription", "offer-student-first-time", "offer-loyalty-thank-you", "offer-upgrade-exchange", "offer-ends-tonight", "offer-owner-at-counter", "offer-whats-the-catch", "end-of-season-clearance", "referral-loyalty-promo"]) assert.ok(getStyle(id)?.offer, `${id} is an offer style`);
assert.equal(getStyle("offer-flash-countdown")!.offerNeeds, "validity");
assert.equal(getStyle("offer-ends-tonight")!.offerNeeds, "validity");
assert.equal(getStyle("offer-last-few")!.offerNeeds, "stock");
assert.equal(getStyle("cosy-floor-chat")!.offer, undefined);
for (const st of offerStyles) {
  assert.ok(st.beats.some((b) => /offer card|terms|brief/i.test(b.purpose)), `${st.id}: beats show brief offer text`);
  assert.ok(st.negativeCues.some((c) => /invented/i.test(c)), `${st.id}: forbids invented offer details`);
  const noOffer = offerProblems(brief, st);
  assert.equal(noOffer[0], OFFER_MISSING, `${st.id}: refuses without offer details`);
  const db = buildDirectorBrief(st, { ...brief, offer: { details: "Flat 20 off on 2 items", validity: "until 30 Nov", terms: "One per bill" } }, pickVariation(st.id, 1), "en");
  assert.ok(/OFFER STYLE/.test(db.text) && /Terms apply/.test(db.text) && /Flat 20 off on 2 items/.test(db.text), `${st.id}: brief carries offer rules`);
}
const withOffer: ProductBrief = { ...brief, offer: { details: "Flat 20 off on 2 items", validity: "until 30 Nov", code: "SAVE20", terms: "One per bill" } };
assert.deepEqual(offerProblems(withOffer, getStyle("offer-flat-discount")!), []);
assert.equal(offerProblems({ ...withOffer, offer: { details: "Flat 20 off" } }, getStyle("offer-flash-countdown")!).length, 1, "countdown needs a real validity");
assert.equal(offerProblems(withOffer, getStyle("offer-last-few")!).length, 1, "last-few needs stockLimited");
assert.deepEqual(offerProblems({ ...withOffer, offer: { ...withOffer.offer!, stockLimited: true } }, getStyle("offer-last-few")!), []);
const mkPlan = (onScreen: string[], say: string, b: ProductBrief): ScenePlan => ({
  styleId: "offer-flat-discount", title: "t", language: "en", aspect: "9:16", actors: [], productBrief: b,
  scenes: onScreen.map((t, i) => ({ index: i, durationSecs: 6, setting: "x", visualPrompt: "y", cameraNotes: "", actorIds: [], dialogue: i === 0 ? [{ speakerId: "a", text: say, language: "en" }] : [], onScreenText: t })),
});
const flat = getStyle("offer-flat-discount")!;
assert.ok(offerPlanProblems(mkPlan(["Flat 20 off", "Until 30 Nov", "Code SAVE20", "Terms apply"], "Here is the offer.", withOffer), flat).length === 0, "complete on-screen offer passes");
assert.ok(offerPlanProblems(mkPlan(["Flat 20 off"], "Here is the offer.", withOffer), flat).length >= 2, "missing validity, code and terms line are caught");
assert.ok(offerPlanProblems(mkPlan(["Flat 20 off", "30 Nov", "SAVE20"], "Here is the offer.", withOffer), flat).some((m) => /Terms apply/.test(m)), "terms line required when the brief has terms");
assert.ok(offerPlanProblems(mkPlan(["Flat 20 off", "30 Nov", "SAVE20", "Terms apply"], "Hurry, ends tonight!", { ...withOffer, offer: { ...withOffer.offer!, validity: undefined } }), flat).length > 0, "false deadline urgency is caught");
assert.ok(offerPlanProblems(mkPlan(["Flat 20 off", "30 Nov", "SAVE20", "Terms apply"], "Only the last few left!", withOffer), flat).some((m) => /stock/i.test(m)), "false stock urgency is caught");
assert.deepEqual(offerPlanProblems(mkPlan([], "Hi", brief), getStyle("cosy-floor-chat")!), [], "non-offer styles are unaffected");
assert.equal(parseOffer({ details: "  " }), undefined);
assert.deepEqual(parseOffer({ details: "10 off", code: "A1", stockLimited: true }), { details: "10 off", code: "A1", stockLimited: true });

console.log(`ugc styles: ${styles.length} styles, all checks passed`);
