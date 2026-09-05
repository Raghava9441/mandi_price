/**
 * Domain types for mandi price data.
 *
 * These are deliberately free of any upstream (data.gov.in) shapes: every field is
 * already normalised, coerced and named the way the app wants it. Swapping the API
 * source for a database source in phase 3 must not require touching this file.
 */

/** Every price in the source dataset is rupees per quintal (100 kg). */
export const SOURCE_UNIT = 'quintal' as const;

export interface PriceRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  /**
   * Calendar date of arrival as `YYYY-MM-DD`.
   *
   * Kept as a plain date string on purpose. The upstream value is `DD/MM/YYYY` with no
   * time and no zone; converting it to a `Date` would silently re-interpret it as UTC
   * midnight and render as the previous day for anyone east of Greenwich - including
   * every user of this app. A calendar date has no instant, so it does not get one.
   */
  arrivalDate: string;
  /** Rupees per quintal. `null` when the source reported no usable number. */
  minPrice: number | null;
  maxPrice: number | null;
  modalPrice: number | null;
}

/**
 * A price query. Every field is matched EXACTLY against the upstream `.keyword`
 * sub-field - there is no substring or fuzzy matching available upstream, so values
 * must be the exact source spelling (use the catalog to map slugs to these).
 */
export interface PriceQuery {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  variety?: string;
  grade?: string;
  /** Stop after this many records. Defaults to a safe ceiling, never unbounded. */
  limit?: number;
}

export interface PricePage {
  records: PriceRecord[];
  /** Total matching records upstream, which may exceed `records.length`. */
  total: number;
  /** True when we stopped before reading every matching record. */
  truncated: boolean;
  /** When the upstream dataset itself was last refreshed (ISO 8601). */
  updatedAt: string | null;
  /** When we read it (ISO 8601). Drives the "as of" line in the UI. */
  fetchedAt: string;
}

export interface Facets {
  states: string[];
  districtsByState: Record<string, string[]>;
  marketsByState: Record<string, string[]>;
  commoditiesByState: Record<string, string[]>;
  commodities: string[];
}
