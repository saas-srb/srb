import { Fragment, type ReactNode } from "react";

/**
 * Minimal inline text renderer for CMS-stored strings that flow into a
 * `React.ReactNode` prop (e.g. `PageHero.description`). Supports line breaks
 * and `**bold**` only — Phase 1 scope. A real rich-text editor is a bigger
 * decision, deferred (see the CMS plan's open questions).
 */
export function renderInline(text: string | null | undefined): ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {renderBold(line)}
        </Fragment>
      ))}
    </>
  );
}

function renderBold(line: string): ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  if (parts.length <= 1) return line;
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
  );
}
