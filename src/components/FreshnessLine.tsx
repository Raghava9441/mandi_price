/**
 * The "as of" line.
 *
 * Freshness is both a trust signal for the reader and a ranking signal for "today"
 * queries, so the date the prices refer to and the time the feed was last read are always
 * stated - never implied by the word "today" alone.
 */
export function FreshnessLine({
  asOf,
  updated,
  source,
}: {
  asOf: string | null;
  updated: string | null;
  source: string;
}) {
  return (
    <p
      className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium"
      style={{ color: 'var(--text-muted)' }}
    >
      {asOf && (
        <span
          className="pill"
          style={{ backgroundColor: 'var(--bg-raised)', color: 'var(--brand-text)' }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--brand)' }}
            aria-hidden="true"
          />
          {asOf}
        </span>
      )}
      {updated && <span>{updated}</span>}
      <span style={{ color: 'var(--text-faint)' }}>· {source}</span>
    </p>
  );
}
