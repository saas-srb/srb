/**
 * "Talk to our agents" block: the company's public voice agents, inside the page. It shows the directory page of the SAME host (the company's
 * own site), so the block works wherever it is placed and always lists what is public right now, without the page being rebuilt.
 */
export default function AgentDirectorySection({ heading, intro, height }: { heading: string; intro: string; height: number }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8" aria-labelledby="agent-directory-heading">
      {(heading || intro) && (
        <div className="mb-6 max-w-2xl">
          {heading && <h2 id="agent-directory-heading" className="text-3xl font-bold tracking-tight text-foreground">{heading}</h2>}
          {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
        </div>
      )}
      <iframe src="/agentos-public/agents" title={heading || "Talk to our voice agents"} allow="microphone" loading="lazy" className="block w-full border-0" style={{ minHeight: height }} />
    </section>
  );
}
