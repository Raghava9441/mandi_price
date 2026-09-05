import type { PriceRecord } from './types';

/**
 * Everything the upstream API refuses to do: sorting, ranking and summary statistics.
 * `sort[...]` is silently ignored upstream (it returns unsorted data with HTTP 200), and
 * there is no aggregation endpoint at all, so all of this is computed here over the small
 * per-page result sets.
 */

export type SortKey = 'modal' | 'min' | 'max' | 'market' | 'district' | 'commodity';
export type SortDir = 'asc' | 'desc';

const priceOf = (r: PriceRecord, key: SortKey) =>
  key === 'min' ? r.minPrice : key === 'max' ? r.maxPrice : r.modalPrice;

export function sortRecords(
  records: PriceRecord[],
  key: SortKey,
  dir: SortDir = 'desc',
): PriceRecord[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    if (key === 'market' || key === 'district' || key === 'commodity') {
      return sign * a[key].localeCompare(b[key]);
    }
    const av = priceOf(a, key);
    const bv = priceOf(b, key);
    // Rows with no reported price sort last regardless of direction - they are absences,
    // not zero-rupee quotes, and burying them at the bottom is the honest presentation.
    if (av === null && bv === null) return a.market.localeCompare(b.market);
    if (av === null) return 1;
    if (bv === null) return -1;
    return dir === 'asc' ? av - bv : bv - av;
  });
}

export interface PriceSummary {
  /** Quotes carrying a usable modal price. */
  quoted: number;
  /** Rows present but with no usable price - shown as "not reported", never as zero. */
  unquoted: number;
  markets: number;
  districts: number;
  low: number | null;
  high: number | null;
  median: number | null;
  average: number | null;
  best: PriceRecord | null;
  worst: PriceRecord | null;
  /** Difference between the best and worst modal price, in rupees per quintal. */
  spread: number | null;
  /** Spread as a share of the low price - how much the choice of mandi is worth. */
  spreadPct: number | null;
  arrivalDate: string | null;
}

export function summarise(records: PriceRecord[]): PriceSummary {
  const quoted = records.filter((r) => r.modalPrice !== null && r.modalPrice > 0);
  const prices = quoted.map((r) => r.modalPrice as number).sort((a, b) => a - b);

  const markets = new Set(records.map((r) => `${r.district}|${r.market}`)).size;
  const districts = new Set(records.map((r) => r.district)).size;

  const dates = records.map((r) => r.arrivalDate).filter(Boolean).sort();
  const arrivalDate = dates.length > 0 ? dates[dates.length - 1] : null;

  if (prices.length === 0) {
    return {
      quoted: 0,
      unquoted: records.length,
      markets,
      districts,
      low: null,
      high: null,
      median: null,
      average: null,
      best: null,
      worst: null,
      spread: null,
      spreadPct: null,
      arrivalDate,
    };
  }

  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0 ? Math.round((prices[mid - 1] + prices[mid]) / 2) : prices[mid];
  const low = prices[0];
  const high = prices[prices.length - 1];

  let best = quoted[0];
  let worst = quoted[0];
  for (const r of quoted) {
    if ((r.modalPrice as number) > (best.modalPrice as number)) best = r;
    if ((r.modalPrice as number) < (worst.modalPrice as number)) worst = r;
  }

  return {
    quoted: quoted.length,
    unquoted: records.length - quoted.length,
    markets,
    districts,
    low,
    high,
    median,
    average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    best,
    worst,
    spread: high - low,
    spreadPct: low > 0 ? Math.round(((high - low) / low) * 100) : null,
    arrivalDate,
  };
}

/** Group records so one market shows as one row with its varieties nested. */
export function groupByMarket(records: PriceRecord[]) {
  const groups = new Map<string, { market: string; district: string; rows: PriceRecord[] }>();
  for (const r of records) {
    const key = `${r.district}|${r.market}`;
    let group = groups.get(key);
    if (!group) {
      group = { market: r.market, district: r.district, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(r);
  }
  return [...groups.values()];
}

export function topCommodities(records: PriceRecord[], limit: number) {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.commodity, (counts.get(r.commodity) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([commodity, count]) => ({ commodity, count }));
}
