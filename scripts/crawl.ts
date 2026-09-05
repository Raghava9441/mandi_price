/**
 * Full-dataset crawler for the data.gov.in mandi price resource.
 *
 * Shared by `build-catalog.ts` and `snapshot.ts`.
 *
 * Why a crawler and not one big request: the upstream Elasticsearch index enforces
 * `offset + limit <= 10000`, and the national dataset is larger than that (~11.6k rows),
 * so the full set literally cannot be paged flat. The crawl is therefore sharded by
 * `state.keyword`, where the largest shard (Tamil Nadu, ~6.8k) still fits the window.
 */
import {
  BASE_URL,
  MAX_RESULT_WINDOW,
  assertUsableEnvelope,
  buildQuery,
  parseArrivalDate,
  recordKey,
} from '../src/lib/mandi/api-source';
import type { PriceRecord } from '../src/lib/mandi/types';

/** Public demo key from the data.gov.in docs. Caps responses at 10 records per request. */
const DEMO_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b';

/**
 * Candidate state spellings, including the upstream misspellings. This is only a seed:
 * anything missing is discovered by the reconciliation scan below, because hardcoding
 * the list is exactly how ~744 records went unaccounted for during research.
 */
const SEED_STATES = [
  'Andaman and Nicobar',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chattisgarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  // Upstream spells it 'Keralam'. Discovered by the reconciliation scan below, which
  // is exactly why that scan exists - this one spelling is ~640 records a day.
  'Keralam',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'NCT of Delhi',
  'Nagaland',
  'Odisha',
  'Orissa',
  'Pondicherry',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'Uttrakhand',
  'West Bengal',
];

export function resolveApiKey(): { key: string; isDemo: boolean } {
  const key = process.env.DATA_GOV_API_KEY?.trim();
  if (key) return { key, isDemo: false };
  return { key: DEMO_KEY, isDemo: true };
}

/** Minimal `.env.local` loader - avoids a dependency for two variables. */
export async function loadEnvLocal() {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['.env.local', '.env']) {
    try {
      const text = await readFile(file, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!m) continue;
        const [, name, rawValue] = m;
        if (process.env[name]) continue;
        process.env[name] = rawValue.trim().replace(/^["']|["']$/g, '');
      }
    } catch {
      // Absent file is fine.
    }
  }
}

/** Thrown for HTTP 429 so the backoff can be far longer than for an ordinary blip. */
class RateLimited extends Error {
  constructor(readonly retryAfterMs: number) {
    super('HTTP 429');
  }
}

/**
 * Global request pacing.
 *
 * data.gov.in rate-limits by burst, and a 130-request crawl at full speed reliably trips
 * it - after which every retry just extends the block. Spacing requests out is far faster
 * end to end than backing off from a ban, so all traffic funnels through one gate.
 */
const MIN_REQUEST_GAP_MS = Number(process.env.MANDI_REQUEST_GAP_MS ?? 350);
let nextSlot = 0;

async function throttle() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_REQUEST_GAP_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

async function requestPage(
  key: string,
  filters: { state?: string },
  limit: number,
  offset: number,
) {
  await throttle();
  // Upstream clamps `limit` to 100; asking for more silently drops the page to 10 rows,
  // which quadruples the request count and trips the rate limiter that much faster.
  const params = buildQuery(filters, key, { limit: Math.min(limit, 100), offset });
  const res = await fetch(`${BASE_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: 'application/json' },
  });
  if (res.status === 429) {
    const header = Number(res.headers.get('retry-after'));
    throw new RateLimited(Number.isFinite(header) && header > 0 ? header * 1000 : 0);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return assertUsableEnvelope(await res.json());
}

async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts) break;
      // A rate limit needs to be waited out, not retried at speed - the demo key in
      // particular throttles for seconds at a time, and hammering it just extends the ban.
      const wait =
        err instanceof RateLimited
          ? err.retryAfterMs || Math.min(30_000, 4_000 * 2 ** (i - 1))
          : 400 * 2 ** (i - 1);
      await new Promise((r) => setTimeout(r, wait + Math.random() * 300));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${String(lastError)}`);
}

/** Run tasks with bounded concurrency. Upstream is a government API - be polite. */
async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export interface CrawlResult {
  records: PriceRecord[];
  nationalTotal: number;
  sourceUpdatedAt: string | null;
  /** Per-state upstream totals, for reconciliation reporting. */
  stateTotals: Map<string, number>;
  shortfall: number;
  /** Shards that came back short - usually a rate limit, occasionally a window overflow. */
  incomplete: { state: string; got: number; expected: number }[];
}

function normaliseRow(raw: unknown): PriceRecord | null {
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? '' : String(v).trim());
  const num = (v: unknown) => {
    if (v == null) return null;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : null;
  };
  const state = str(r.state);
  const market = str(r.market);
  const commodity = str(r.commodity);
  if (!state || !market || !commodity) return null;
  return {
    state,
    district: str(r.district),
    market,
    commodity,
    variety: str(r.variety),
    grade: str(r.grade),
    arrivalDate: parseArrivalDate(str(r.arrival_date)),
    minPrice: num(r.min_price),
    maxPrice: num(r.max_price),
    modalPrice: num(r.modal_price),
  };
}

/**
 * Page one state shard to completion.
 *
 * Returns whatever it managed to read rather than throwing: one state hitting a rate
 * limit should cost that state's tail, not the other 24 states and the whole catalog.
 * The caller reports any shard that came back short.
 */
async function crawlState(key: string, state: string, total: number, pageSize: number) {
  const out: PriceRecord[] = [];
  let offset = 0;
  let error: string | null = null;

  while (offset < total && offset < MAX_RESULT_WINDOW) {
    const limit = Math.min(pageSize, MAX_RESULT_WINDOW - offset);
    let env;
    try {
      env = await withRetry(() => requestPage(key, { state }, limit, offset), `${state} @${offset}`);
    } catch (err) {
      error = String(err);
      break;
    }
    const rows = env.records ?? [];
    if (rows.length === 0) break;
    for (const raw of rows) {
      const rec = normaliseRow(raw);
      if (rec) out.push(rec);
    }
    offset += rows.length;
  }
  return { rows: out, error };
}

export async function crawlAll(
  options: {
    concurrency?: number;
    onProgress?: (msg: string) => void;
    /** Restrict the crawl to these exact upstream state names. */
    states?: string[];
    /** Skip the discovery scan - used for deliberate partial builds. */
    skipDiscovery?: boolean;
  } = {},
): Promise<CrawlResult> {
  const { key, isDemo } = resolveApiKey();
  const log = options.onProgress ?? (() => {});
  const concurrency = options.concurrency ?? (isDemo ? 2 : 6);

  if (isDemo) {
    log(
      'WARNING: using the public demo API key (10 records/request). Set DATA_GOV_API_KEY in\n' +
        '.env.local for a 10x faster crawl.',
    );
  }

  // 1. National total and the real per-request page cap, from one probe.
  const probe = await withRetry(() => requestPage(key, {}, 100, 0), 'probe');
  const nationalTotal = probe.total ?? 0;
  const pageSize = Math.max(1, probe.records?.length ?? 10);
  const sourceUpdatedAt = probe.updated ? new Date(probe.updated * 1000).toISOString() : null;
  log(`national total=${nationalTotal}, page size=${pageSize}, updated=${sourceUpdatedAt}`);

  // 2. Per-state totals from the seed list. Cheap: one request each.
  //    A failed probe skips that state rather than aborting - a partial catalog is far
  //    more useful than none, and the shortfall is reported at the end either way.
  const candidates = options.states?.length ? options.states : SEED_STATES;
  const stateTotals = new Map<string, number>();
  const probeFailures: string[] = [];
  const seedTotals = await pool(candidates, concurrency, async (state) => {
    try {
      const env = await withRetry(() => requestPage(key, { state }, 1, 0), `total ${state}`);
      return [state, env.total ?? 0] as const;
    } catch {
      probeFailures.push(state);
      return [state, 0] as const;
    }
  });
  for (const [state, total] of seedTotals) if (total > 0) stateTotals.set(state, total);
  if (probeFailures.length > 0) {
    log(`  could not probe ${probeFailures.length} state(s): ${probeFailures.join(', ')}`);
  }

  let covered = [...stateTotals.values()].reduce((a, b) => a + b, 0);
  log(`seed states matched ${stateTotals.size}, covering ${covered}/${nationalTotal}`);

  // 3. Reconcile. Any shortfall means states exist that the seed list does not name, so
  //    scan the flat dataset (up to the window) to discover their exact spellings.
  if (covered < nationalTotal && !options.skipDiscovery && !options.states?.length) {
    log(`shortfall of ${nationalTotal - covered} records - scanning for unknown states`);
    const found = new Set<string>();
    try {
      let offset = 0;
      while (offset < Math.min(nationalTotal, MAX_RESULT_WINDOW)) {
        const env = await withRetry(
          () => requestPage(key, {}, Math.min(pageSize, MAX_RESULT_WINDOW - offset), offset),
          `scan @${offset}`,
        );
        const rows = env.records ?? [];
        if (rows.length === 0) break;
        for (const raw of rows) {
          const state = String((raw as Record<string, unknown>).state ?? '').trim();
          if (state && !stateTotals.has(state)) found.add(state);
        }
        offset += rows.length;
      }
      for (const state of found) {
        const env = await withRetry(() => requestPage(key, { state }, 1, 0), `total ${state}`);
        if (env.total) stateTotals.set(state, env.total);
      }
    } catch (err) {
      // Discovery is an optimisation, not a prerequisite. Failing it costs coverage of a
      // few states; aborting the whole build over it would cost every state, so the crawl
      // continues and the shortfall is reported loudly at the end instead.
      log(`  discovery scan stopped early (${String(err)}) - continuing with known states`);
    }
    if (found.size > 0) log(`  discovered: ${[...found].join(', ')}`);
    covered = [...stateTotals.values()].reduce((a, b) => a + b, 0);
    log(`after scan: ${stateTotals.size} states covering ${covered}/${nationalTotal}`);
  }

  // 4. Full pull per state shard. Smallest first, so a rate limit late in the run costs
  //    the tail of one big state rather than a dozen small ones entirely.
  const shards = [...stateTotals.entries()].sort((a, b) => a[1] - b[1]);
  const incomplete: { state: string; got: number; expected: number }[] = [];
  let done = 0;

  const perState = await pool(shards, concurrency, async ([state, total]) => {
    const { rows, error } = await crawlState(key, state, total, pageSize);
    done++;
    log(`  [${done}/${shards.length}] ${state}: ${rows.length}/${total}${error ? ' (incomplete)' : ''}`);
    if (rows.length < total) incomplete.push({ state, got: rows.length, expected: total });
    return rows;
  });

  // 5. Flatten and dedupe - upstream repeats rows.
  const seen = new Set<string>();
  const records: PriceRecord[] = [];
  for (const rows of perState) {
    for (const rec of rows) {
      const k = recordKey(rec);
      if (seen.has(k)) continue;
      seen.add(k);
      records.push(rec);
    }
  }

  return {
    records,
    nationalTotal,
    sourceUpdatedAt,
    stateTotals,
    shortfall: nationalTotal - covered,
    incomplete,
  };
}
