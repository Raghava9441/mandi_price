/**
 * Shown when a place reported nothing.
 *
 * Absence is stated in words and explained, never rendered as a zero or an empty table.
 * A farmer who sees "₹0" concludes the crop is worthless; a farmer who sees "no arrivals
 * reported today" understands the mandi simply did not trade - which is the truth, and
 * the single biggest trust failure of the sites this one competes with.
 */
export function EmptyState({ title, help }: { title: string; help: string }) {
  return (
    <div className="card mt-6 px-5 py-10 text-center">
      <div
        className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
        style={{ backgroundColor: 'var(--bg-sunken)' }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" style={{ color: 'var(--text-faint)' }}>
          <path
            d="M4 19h16M6 19V9m4 10V5m4 14v-7m4 7v-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="mt-4 text-lg font-bold leading-snug">{title}</p>
      <p
        className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
      >
        {help}
      </p>
    </div>
  );
}
