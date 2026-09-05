import 'server-only';
import { ApiSource } from './api-source';
import { SnapshotSource } from './snapshot-source';
import type { MandiSource } from './source';

/**
 * The single entry point to price data.
 *
 * `server-only` is load-bearing: it makes the build fail loudly if a Client Component
 * ever imports this module, which is what keeps DATA_GOV_API_KEY out of the browser
 * bundle. Never remove it, and never read the key anywhere else.
 *
 * `MANDI_SOURCE=snapshot` serves the archived NDJSON instead of the live API - useful in
 * development and CI, where a hot-reload loop would otherwise exhaust the rate limit.
 * Phase 3 adds a Postgres-backed source here and nowhere else.
 */
let instance: MandiSource | null = null;

export function getSource(): MandiSource {
  instance ??= process.env.MANDI_SOURCE === 'snapshot' ? new SnapshotSource() : new ApiSource();
  return instance;
}

export type { MandiSource } from './source';
export { UpstreamError } from './source';
export type { Facets, PricePage, PriceQuery, PriceRecord } from './types';
