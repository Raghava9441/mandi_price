import { ConfigError, UpstreamError, type MandiSource } from './source';
import type { Facets, PricePage, PriceQuery, PriceRecord } from './types';
import { upstreamEnvelopeSchema, upstreamRecordSchema } from './upstream-schema';
import { loadCatalog } from '../catalog';

export const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
export const BASE_URL = `https://api.data.gov.in/resource/${RESOURCE_ID}`;

/**
 * Elasticsearch `index.max_result_window` on the upstream index. `offset + limit` above
 * this returns HTTP 200 carrying a 500 error in the body. All-India is ~11.6k records,
 * so the full dataset genuinely cannot be paged flat - queries must be sharded by state.
 */
export const MAX_RESULT_WINDOW = 10_000;

/** Upstream silently caps page size per API key (100 on a registered key, 10 on demo). */
const REQUESTED_PAGE_SIZE = 100;

/** Never walk the whole dataset by accident. */
const DEFAULT_RECORD_LIMIT = 5_000;

const REQUEST_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 15_000);
const MAX_ATTEMPTS = 3;

/**
 * Domain field -> upstream filter key.
 *
 * Every value MUST be the `.keyword` sub-field. The bare field is analysed text, so
 * `filters[market]=Kuppam APMC` matches on the tokens "Kuppam" OR "APMC" and returns
 * ~3,900 rows from every market whose name contains "APMC", while
 * `filters[market.keyword]=Kuppam APMC` returns the 1 correct row. Same trap on state:
 * `filters[state]=Andhra Pradesh` also matches Himachal, Madhya and Uttar Pradesh.
 *
 * Upstream ignores unrecognised filter keys silently and returns the UNFILTERED set with
 * HTTP 200, so an unknown key is a correctness bug, not an error. Hence the allow-list.
 */
export const FILTERABLE = {
  state: 'state.keyword',
  district: 'district.keyword',
  market: 'market.keyword',
  commodity: 'commodity.keyword',
  variety: 'variety.keyword',
  grade: 'grade.keyword',
} as const;

export type FilterField = keyof typeof FILTERABLE;

export interface ApiSourceOptions {
  apiKey?: string;
  /** Seconds Next.js should cache each upstream response. Upstream refreshes hourly. */
  revalidate?: number;
  fetchImpl?: typeof fetch;
}

/** `DD/MM/YYYY` -> `YYYY-MM-DD`. Returns '' when unparseable. */
export function parseArrivalDate(raw: string): string {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw.trim());
  if (!m) return '';
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (day < 1 || day > 31 || month < 1 || month > 12) return '';
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Identity of one quote. Upstream repeats rows, so this is the dedupe key. */
export function recordKey(r: {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
}): string {
  return [r.state, r.district, r.market, r.commodity, r.variety, r.grade]
    .map((s) => s.toLowerCase())
    .join('|');
}

/**
 * Build the upstream query string for one page.
 * Exported so tests can assert `.keyword` usage and window safety without network I/O.
 */
export function buildQuery(
  query: PriceQuery,
  apiKey: string,
  page: { limit: number; offset: number },
): URLSearchParams {
  if (page.offset + page.limit > MAX_RESULT_WINDOW) {
    throw new UpstreamError(
      `Refusing request: offset+limit (${page.offset + page.limit}) exceeds the upstream ` +
        `result window of ${MAX_RESULT_WINDOW}. Shard the query by state instead.`,
      { page },
    );
  }

  const params = new URLSearchParams({
    'api-key': apiKey,
    format: 'json',
    limit: String(page.limit),
    offset: String(page.offset),
  });

  for (const field of Object.keys(FILTERABLE) as FilterField[]) {
    const value = query[field];
    if (value === undefined || value === null || value === '') continue;
    params.set(`filters[${FILTERABLE[field]}]`, value);
  }

  return params;
}

/**
 * Validate an upstream envelope.
 *
 * Upstream signals failure with HTTP 200 and an error blob in `message`, so the status
 * code alone proves nothing - the body is the only source of truth.
 */
export function assertUsableEnvelope(body: unknown) {
  const parsed = upstreamEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    throw new UpstreamError('Upstream response did not match the expected envelope', parsed.error);
  }
  const env = parsed.data;

  if (!Array.isArray(env.records)) {
    const detail =
      typeof env.message === 'string' ? env.message : JSON.stringify(env.message ?? null);
    throw new UpstreamError(`Upstream returned no records: ${detail}`, env);
  }
  if (env.status && env.status !== 'ok') {
    throw new UpstreamError(`Upstream status "${env.status}"`, env);
  }
  return env;
}

function normalise(raw: unknown): PriceRecord | null {
  const parsed = upstreamRecordSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (!r.state || !r.market || !r.commodity) return null;
  return {
    state: r.state,
    district: r.district,
    market: r.market,
    commodity: r.commodity,
    variety: r.variety,
    grade: r.grade,
    arrivalDate: parseArrivalDate(r.arrival_date),
    minPrice: r.min_price,
    maxPrice: r.max_price,
    modalPrice: r.modal_price,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ApiSource implements MandiSource {
  readonly name = 'data.gov.in';
  private readonly apiKey: string;
  private readonly revalidate: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiSourceOptions = {}) {
    // Trimmed and unquoted: a key pasted into a hosting dashboard very often arrives with
    // a trailing newline or wrapping quotes, and upstream answers that with a flat 403
    // that looks identical to an outage.
    const raw = options.apiKey ?? process.env.DATA_GOV_API_KEY ?? '';
    const key = raw.trim().replace(/^['"]+|['"]+$/g, '');
    if (!key) {
      throw new ConfigError(
        'DATA_GOV_API_KEY is not set. Locally, put it in .env.local; on a deployment host, ' +
          'set it in the project environment variables and redeploy.',
      );
    }
    this.apiKey = key;
    this.revalidate = options.revalidate ?? 1_800;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async requestPage(query: PriceQuery, limit: number, offset: number) {
    const params = buildQuery(query, this.apiKey, { limit, offset });
    const url = `${BASE_URL}?${params.toString()}`;

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { accept: 'application/json' },
          // Ignored outside Next (the catalog script runs in plain Node).
          next: { revalidate: this.revalidate, tags: ['prices'] },
        } as RequestInit);

        if (res.status === 429 || res.status >= 500) {
          throw new UpstreamError(`Upstream HTTP ${res.status}`, undefined, true);
        }
        if (!res.ok) {
          throw new UpstreamError(`Upstream HTTP ${res.status}`);
        }
        return assertUsableEnvelope(await res.json());
      } catch (err) {
        lastError = err;
        // Deterministic failures (bad filters, paging past the window) never come good
        // on a retry, so only network-ish faults are retried.
        const retryable = !(err instanceof UpstreamError) || err.retryable;
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        await sleep(200 * 2 ** (attempt - 1) + Math.random() * 150);
      }
    }
    throw lastError;
  }

  async getPrices(query: PriceQuery): Promise<PricePage> {
    const wanted = Math.max(1, Math.min(query.limit ?? DEFAULT_RECORD_LIMIT, MAX_RESULT_WINDOW));
    const seen = new Set<string>();
    const records: PriceRecord[] = [];

    let offset = 0;
    let total = 0;
    let updated: number | undefined;
    let truncated = false;

    while (records.length < wanted) {
      const room = MAX_RESULT_WINDOW - offset;
      if (room <= 0) {
        truncated = true;
        break;
      }
      const limit = Math.min(REQUESTED_PAGE_SIZE, room, wanted - records.length);
      const env = await this.requestPage(query, limit, offset);

      total = env.total ?? total;
      updated = env.updated ?? updated;

      const rows = env.records ?? [];
      if (rows.length === 0) break;

      for (const raw of rows) {
        const rec = normalise(raw);
        if (!rec) continue;
        const key = recordKey(rec);
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(rec);
      }

      // Advance by what upstream actually returned, not what we asked for: the page size
      // is silently capped per API key, so the response is the only honest page length.
      offset += rows.length;
      if (offset >= total) break;
    }

    if (offset < total) truncated = true;

    return {
      records,
      total,
      truncated,
      updatedAt: updated ? new Date(updated * 1000).toISOString() : null,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Facets come from the generated catalog, not the API: upstream has no aggregation
   * endpoint, so "which commodities exist in Andhra Pradesh?" is unanswerable at request
   * time. See `scripts/build-catalog.ts`.
   */
  async getFacets(): Promise<Facets> {
    const catalog = await loadCatalog();
    return catalog.facets;
  }
}
