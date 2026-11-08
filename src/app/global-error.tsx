"use client";

/**
 * The last resort: the root layout itself failed, so there are no providers, no theme and no stylesheet to lean on. A small, fully
 * self-contained page (inline styles only) with the same words and the same ways forward as the full error screen.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const box: React.CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0a0a0a", color: "#f5f5f5", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" };
  const btn: React.CSSProperties = { border: "1px solid #3a3a3a", background: "#f5f5f5", color: "#0a0a0a", borderRadius: 10, padding: "10px 18px", fontSize: 15, fontWeight: 600, cursor: "pointer" };
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <main style={box} role="alert">
          <div style={{ maxWidth: 440 }}>
            <p style={{ margin: 0, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", color: "#a3a3a3" }}>Something went wrong</p>
            <h1 style={{ margin: "8px 0 12px", fontSize: 28, lineHeight: 1.2 }}>Something went wrong on our side</h1>
            <p style={{ margin: "0 0 20px", color: "#d4d4d4", lineHeight: 1.6 }}>The app hit a problem and couldn’t finish loading. Your data is safe. Try again — if it keeps happening, tell your admin or support with the reference below.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={btn} onClick={() => reset()}>Try again</button>
              <button type="button" style={{ ...btn, background: "transparent", color: "#f5f5f5" }} onClick={() => window.location.reload()}>Reload page</button>
            </div>
            {error.digest ? <p style={{ marginTop: 20, fontSize: 12, color: "#a3a3a3" }}>Reference: <code>{error.digest}</code></p> : null}
          </div>
        </main>
      </body>
    </html>
  );
}
