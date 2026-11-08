import type { SectionTypeDef } from "@/lib/products/sitecraft-ai/section-registry";
import { numOr, record, str } from "@/lib/products/sitecraft-ai/parse-helpers";
import AgentDirectorySection from "@/components/sections/AgentDirectorySection";

/**
 * "Talk to our agents": lists the company's PUBLIC AgentOS voice agents and lets a visitor talk to one in the browser. The block stores copy only;
 * which agents appear, and where they may be used, is set per agent in AgentOS (Voice → Website).
 */
const agentDirectory: SectionTypeDef<{ heading: string; intro: string; height: number } & Record<string, unknown>> = {
  type: "agent-directory",
  label: "Talk to our agents (voice)",
  defaultConfig: { heading: "", intro: "", height: 640 },
  parse: (raw) => {
    const r = record(raw);
    return { heading: str(r.heading, 160), intro: str(r.intro, 400), height: Math.min(Math.max(Math.round(numOr(r.height, 640)), 360), 1400) };
  },
  Renderer: AgentDirectorySection,
  toProps: (c) => ({ heading: c.heading, intro: c.intro, height: c.height }),
  fields: [
    { key: "heading", label: "Heading", kind: "text" },
    { key: "intro", label: "Intro", kind: "textarea" },
    { key: "height", label: "Minimum height (pixels, 360 to 1400)", kind: "number" },
  ],
};

export const AGENT_SECTION_TYPES: SectionTypeDef<any>[] = [agentDirectory]; // eslint-disable-line @typescript-eslint/no-explicit-any -- heterogeneous config types, same as the other registries
