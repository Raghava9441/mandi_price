import type { Facets, PricePage, PriceQuery } from './types';

/**
 * The one contract the whole app talks to.
 *
 * Phase 1 is backed by data.gov.in directly (`ApiSource`); phase 3 swaps in a Postgres
 * implementation (`DbSource`) that can do the things the upstream API cannot - history,
 * trends, sorting and real search. Pages and components import `getSource()` from
 * `./index` and never construct a source or call `fetch` themselves, so that swap is a
 * one-file change.
 */
export interface MandiSource {
  readonly name: string;
  getPrices(query: PriceQuery): Promise<PricePage>;
  getFacets(): Promise<Facets>;
}

/**
 * Thrown when the app itself is misconfigured - a missing API key, say.
 *
 * Kept separate from `UpstreamError` on purpose. Both end up rendering the same graceful
 * fallback, but they have opposite causes and opposite fixes, and reporting a missing
 * environment variable as "the Government of India service is not responding" sends
 * whoever is debugging it to look in entirely the wrong place.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Thrown when the upstream responded but the response is not usable. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
    /** Deterministic failures (bad query, paging past the window) must not be retried. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}
