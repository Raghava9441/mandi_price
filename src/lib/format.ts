/**
 * Units and number formatting.
 *
 * The dataset quotes rupees per quintal (100 kg) throughout. Farmers routinely think in
 * kg or in bags, and a page that only ever says "2,450" without making the unit obvious
 * is easy to misread by a factor of 100 - so the unit is always rendered next to the
 * number, and the reader can switch the basis.
 */

export const UNITS = ['quintal', 'kg', 'bag'] as const;
export type Unit = (typeof UNITS)[number];

/** Kilograms per unit. A "bag" here is the common 50 kg sack. */
export const UNIT_KG: Record<Unit, number> = {
  quintal: 100,
  kg: 1,
  bag: 50,
};

export function isUnit(value: string | undefined): value is Unit {
  return !!value && (UNITS as readonly string[]).includes(value);
}

/** Convert a rupees-per-quintal figure to another basis. */
export function convertPrice(perQuintal: number, unit: Unit): number {
  return (perQuintal * UNIT_KG[unit]) / UNIT_KG.quintal;
}

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrDecimal = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a price in the Indian grouping convention (1,23,456 - not 123,456).
 * Per-kg values keep two decimals because whole rupees would round away the difference
 * between mandis entirely.
 */
export function formatPrice(perQuintal: number | null, unit: Unit = 'quintal'): string {
  if (perQuintal === null) return '—';
  const value = convertPrice(perQuintal, unit);
  return unit === 'kg' ? inrDecimal.format(value) : inr.format(Math.round(value));
}

export function formatNumber(value: number): string {
  return inr.format(value);
}

/** `YYYY-MM-DD` -> `5 Sep 2026`, without ever constructing a zoned Date. */
export function formatDate(iso: string, locale = 'en-IN'): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const months =
    locale === 'te-IN'
      ? ['జన', 'ఫిబ్ర', 'మార్చి', 'ఏప్రి', 'మే', 'జూన్', 'జూలై', 'ఆగ', 'సెప్టెం', 'అక్టో', 'నవం', 'డిసెం']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(mo) - 1]} ${y}`;
}

/** "Updated 2:30 PM IST" - the freshness signal, always in IST since the data is Indian. */
export function formatUpdatedIST(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

/** Today's calendar date in IST, as `YYYY-MM-DD`. */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * How stale a quote is, in whole days, comparing calendar dates in IST.
 * Returns null for an unparseable date.
 */
export function daysOld(arrivalDate: string, today = todayIST()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) return null;
  const a = Date.UTC(
    Number(arrivalDate.slice(0, 4)),
    Number(arrivalDate.slice(5, 7)) - 1,
    Number(arrivalDate.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}
