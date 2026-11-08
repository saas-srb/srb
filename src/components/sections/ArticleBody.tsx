import React from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";

export type ArticleBlock =
  | { type: "lead"; text: string }
  | { type: "p"; text: string }
  | { type: "h2"; id: string; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "callout"; title: string; text: string }
  | { type: "link"; text: string; href: string };

/** Renders `**bold**` runs inside plain text as <strong>, so content can lean on
 *  markdown-style emphasis without pulling in a markdown parser. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function renderBlock(block: ArticleBlock, key: number) {
  switch (block.type) {
    case "lead":
      return (
        <p key={key} className="text-lg sm:text-xl leading-relaxed text-foreground/90 font-medium mb-8">
          {renderInline(block.text)}
        </p>
      );
    case "p":
      return (
        <p key={key} className="text-base sm:text-lg leading-relaxed text-muted-foreground mb-6">
          {renderInline(block.text)}
        </p>
      );
    case "h2":
      return (
        <h2 key={key} id={block.id} className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-14 mb-5 scroll-mt-28 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-gradient-to-br from-primary to-secondary flex-none" />
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3 key={key} className="text-xl font-bold text-foreground mt-10 mb-4">
          {block.text}
        </h3>
      );
    case "ul":
      return (
        <ul key={key} className="space-y-3 mb-6">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-base sm:text-lg leading-relaxed text-muted-foreground">
              <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-primary flex-none" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="space-y-3 mb-6">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-4 text-base sm:text-lg leading-relaxed text-muted-foreground">
              <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote key={key} className="border-l-4 border-primary pl-6 py-2 my-8 text-lg sm:text-xl font-medium italic text-foreground/90">
          {renderInline(block.text)}
        </blockquote>
      );
    case "callout":
      return (
        <div key={key} className="rounded-2xl bg-primary/5 border border-primary/20 p-6 my-8 flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-none">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground mb-1.5">{block.title}</p>
            <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">{renderInline(block.text)}</p>
          </div>
        </div>
      );
    case "link":
      return (
        <p key={key} className="mb-6">
          <Link href={block.href} className="text-base sm:text-lg font-semibold text-primary hover:underline">
            {block.text}
          </Link>
        </p>
      );
    default:
      return null;
  }
}

export default function ArticleBody({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-3xl px-6 lg:px-8 py-16 sm:py-20">
        <article>{blocks.map((block, i) => renderBlock(block, i))}</article>
      </div>
    </section>
  );
}
