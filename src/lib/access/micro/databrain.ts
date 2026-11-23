import type { MicroFeature } from "./types";

const P = "databrain-ai";

/**
 * DataBrain in micro features. There is one thing to give: opening DataBrain and asking questions. WHICH records an answer may use is never decided here:
 * it is decided per business entity from the person's own access in the other products (`catalog/access.ts`), so DataBrain grants no data by itself.
 */
export const DATABRAIN_MICRO: MicroFeature[] = [
  {
    key: `${P}.ask.use`, product: P, module: "Questions", kind: "page", label: "Open DataBrain and ask questions",
    description: "Open DataBrain, ask business questions in plain language and keep or delete the person's own past conversations. Answers only use data the person may already see in the other products.",
    level: "write", legacy: ["intelligence.USE", "intelligence.hasIntelligenceAccess"], baseline: true,
  },
];
