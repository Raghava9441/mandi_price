/**
 * FAQ, rendered with <details> so it needs no client JavaScript and stays fully
 * expandable. The same entries are emitted as FAQPage structured data by the page.
 */
export function FaqBlock({
  heading,
  entries,
}: {
  heading: string;
  entries: { question: string; answer: string }[];
}) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-extrabold tracking-tight">{heading}</h2>
      <div className="mt-3 space-y-2">
        {entries.map((entry) => (
          <details key={entry.question} className="card group px-4 py-3">
            <summary className="tap cursor-pointer list-none justify-between gap-3 font-semibold marker:hidden">
              <span className="flex-1">{entry.question}</span>
              <span
                className="shrink-0 transition-transform group-open:rotate-45"
                style={{ color: 'var(--text-faint)' }}
                aria-hidden="true"
              >
                +
              </span>
            </summary>
            <p className="pb-1 pt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
