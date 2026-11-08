import { cmsPageMetadata } from "@/lib/products/sitecraft-ai/page-route";
import AskContent from "./Content";

/** SEO: the CMS page "/ask". The chat itself is the AI chatbot (its settings live in the LMS chatbot product). */
export const generateMetadata = () => cmsPageMetadata("/ask");

export default function AskPage() {
  return <AskContent />;
}
