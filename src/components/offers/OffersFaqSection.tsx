"use client";

import FAQAccordion from "@/components/sections/FAQAccordion";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

export default function OffersFaqSection({ faqs }: { faqs: { question: string; answer: string }[] }) {
  const tx = useText();
  return <FAQAccordion title={tx("offers.offersFaqSection.frequently-asked-questions")} faqs={faqs} tone="muted" />;
}
