import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/products/evaliq/db";
import { OtsInputError } from "@/lib/products/evaliq/viewer";
import { poolIds, type Question } from "@/lib/products/evaliq/questions";
import { QUESTION_TYPES, seededRng, shuffled } from "@/lib/products/evaliq/question-types";
import type { Test } from "@/lib/products/evaliq/tests";
import type { PaperItem } from "@/lib/products/evaliq/attempt-types";

/** A fresh random seed for a staff preview paper. */
export function newPreviewSeed(): number {
  return 1 + Math.floor(Math.random() * 2 ** 30);
}

/**
 * Builds one attempt's question paper from a test: manual picks + random
 * draws for each automatic rule, optional question / option shuffling and a
 * random subset ("questions per attempt"). Every question is SNAPSHOTTED
 * into the paper so the attempt is marked against exactly what was shown.
 * All randomness comes from the attempt's seed.
 */
export async function buildPaper(test: Test, seed: number): Promise<PaperItem[]> {
  const rng = seededRng(seed);
  const manualIds = test.sections.flatMap((s) => s.questionIds);
  const chosen = new Set(manualIds);
  const perSection: { section: number; ids: string[] }[] = [];

  for (const [i, sec] of test.sections.entries()) {
    const ids = [...sec.questionIds];
    for (const rule of sec.rules) {
      const pool = (await poolIds(rule, Array.from(chosen))).filter((id) => !chosen.has(id));
      if (pool.length < rule.count) throw new OtsInputError("This test's question pool is too small right now — please contact the test administrator.");
      const pick = shuffled(pool, rng).slice(0, rule.count);
      for (const id of pick) chosen.add(id);
      ids.push(...pick);
    }
    perSection.push({ section: i, ids: test.config.randomizeQuestions ? shuffled(ids, rng) : ids });
  }

  let order = perSection.flatMap((s) => s.ids.map((id) => ({ section: s.section, id })));
  if (test.config.questionsPerAttempt && test.config.questionsPerAttempt < order.length) {
    const keep = new Set(shuffled(order.map((_, i) => i), rng).slice(0, test.config.questionsPerAttempt));
    order = order.filter((_, i) => keep.has(i));
  }

  const db = await getDb();
  const docs = await db.collection<Question>(COLLECTIONS.questions).find({ _id: { $in: order.map((o) => o.id) } }).toArray();
  const byId = new Map(docs.map((q) => [q._id, q]));
  if (order.length === 0) throw new OtsInputError("This test has no questions.");

  return order.map(({ section, id }) => {
    const q = byId.get(id);
    if (!q) throw new OtsInputError("A question in this test no longer exists — please contact the test administrator.");
    const sec = test.sections[section];
    const spec = QUESTION_TYPES[q.type];
    const negOn = sec.negativeMarking ?? test.config.negativeMarking;
    const marks = sec.marksPerQuestion ?? q.marks;
    const negativeMarks = negOn ? (sec.marksPerQuestion ? Math.min(q.negativeMarks, marks) : q.negativeMarks) : 0;
    return {
      qid: q._id,
      code: q.code,
      section,
      type: q.type,
      prompt: q.prompt,
      media: q.media,
      difficulty: q.difficulty,
      subject: q.subject,
      topic: q.topic,
      categoryId: q.categoryId,
      explanation: q.explanation,
      definition: q.definition,
      view: spec.publicDefinition(q.definition, { shuffle: test.config.randomizeOptions, rng }),
      marks,
      negativeMarks,
      autoGradable: spec.autoGradable(q.definition),
      outcome: null,
    };
  });
}
