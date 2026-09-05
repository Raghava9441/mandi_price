/**
 * The min - modal - max range for one quote, drawn against the range of the whole page.
 *
 * This is the one visual that carries real information rather than decoration: it shows
 * at a glance how a mandi's rate sits relative to every other mandi, and how wide the
 * spread between grades within that mandi is. Pure CSS, no chart library, no client JS.
 */
export function PriceRangeBar({
  min,
  modal,
  max,
  scaleLow,
  scaleHigh,
  label,
}: {
  min: number | null;
  modal: number | null;
  max: number | null;
  /** Low and high across every row on the page, so bars are comparable to each other. */
  scaleLow: number;
  scaleHigh: number;
  label?: string;
}) {
  if (modal === null) return null;

  const span = Math.max(1, scaleHigh - scaleLow);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - scaleLow) / span) * 100));

  const lo = min ?? modal;
  const hi = max ?? modal;
  const left = pct(Math.min(lo, modal));
  const right = pct(Math.max(hi, modal));
  const width = Math.max(right - left, 1.5);
  const dot = pct(modal);

  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: 'var(--bg-sunken)' }}
      role="img"
      aria-label={label}
    >
      <div
        className="absolute inset-y-0 rounded-full"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          backgroundColor: 'color-mix(in oklab, var(--brand) 28%, transparent)',
        }}
      />
      <div
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
        style={{
          left: `${dot}%`,
          backgroundColor: 'var(--brand)',
          // Ring in the surface colour so the dot reads as separate from the track.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ['--tw-ring-color' as string]: 'var(--bg-raised)',
          boxShadow: '0 0 0 2px var(--bg-raised)',
        }}
      />
    </div>
  );
}
