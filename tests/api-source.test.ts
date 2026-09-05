import { describe, expect, it, vi } from 'vitest';
import {
  ApiSource,
  FILTERABLE,
  MAX_RESULT_WINDOW,
  assertUsableEnvelope,
  buildQuery,
  parseArrivalDate,
  recordKey,
} from '../src/lib/mandi/api-source';
import { UpstreamError } from '../src/lib/mandi/source';

const KEY = 'test-key';

describe('buildQuery', () => {
  it('uses the .keyword sub-field for every filter', () => {
    const params = buildQuery(
      {
        state: 'Andhra Pradesh',
        district: 'Chittor',
        market: 'Kuppam APMC',
        commodity: 'Tomato',
        variety: 'Local',
        grade: 'FAQ',
      },
      KEY,
      { limit: 100, offset: 0 },
    );

    // The bare field is analysed text upstream: filters[market]=Kuppam APMC matches on
    // the token "APMC" and returns ~3,900 rows from unrelated markets. Only .keyword is
    // an exact match. This assertion is the guard against that regression.
    expect(params.get('filters[state.keyword]')).toBe('Andhra Pradesh');
    expect(params.get('filters[market.keyword]')).toBe('Kuppam APMC');
    expect(params.get('filters[commodity.keyword]')).toBe('Tomato');
    expect(params.get('filters[district.keyword]')).toBe('Chittor');
    expect(params.get('filters[variety.keyword]')).toBe('Local');
    expect(params.get('filters[grade.keyword]')).toBe('FAQ');

    for (const key of [...params.keys()]) {
      if (!key.startsWith('filters[')) continue;
      expect(key, `${key} must target a .keyword sub-field`).toMatch(/\.keyword\]$/);
    }
  });

  it('maps every filterable field to a .keyword target', () => {
    for (const target of Object.values(FILTERABLE)) {
      expect(target.endsWith('.keyword')).toBe(true);
    }
  });

  it('omits empty filters rather than sending blank values', () => {
    const params = buildQuery({ state: 'Bihar', commodity: '' }, KEY, { limit: 10, offset: 0 });
    expect(params.has('filters[commodity.keyword]')).toBe(false);
    expect(params.get('filters[state.keyword]')).toBe('Bihar');
  });

  it('refuses to page past the upstream 10,000 result window', () => {
    // Upstream answers offset+limit > 10000 with HTTP 200 and a 500 in the body, so this
    // has to be caught on our side or it surfaces as "no data" rather than an error.
    expect(() => buildQuery({}, KEY, { limit: 100, offset: MAX_RESULT_WINDOW })).toThrow(
      UpstreamError,
    );
    expect(() => buildQuery({}, KEY, { limit: 1, offset: MAX_RESULT_WINDOW - 1 })).not.toThrow();
  });
});

describe('assertUsableEnvelope', () => {
  it('rejects an HTTP 200 carrying an error body', () => {
    // Verbatim shape of the real max_result_window failure.
    const body = {
      message:
        '{"error":{"root_cause":[{"type":"query_phase_execution_exception",' +
        '"reason":"Result window is too large"}]},"status":500}',
    };
    expect(() => assertUsableEnvelope(body)).toThrow(UpstreamError);
  });

  it('rejects a non-ok status', () => {
    expect(() => assertUsableEnvelope({ status: 'error', records: [] })).toThrow(UpstreamError);
  });

  it('accepts a valid envelope and coerces the string-typed numerics', () => {
    const env = assertUsableEnvelope({
      status: 'ok',
      message: 'Resource lists',
      total: 1251,
      count: 100,
      limit: '100',
      offset: '0',
      updated: 1788598845,
      records: [],
    });
    expect(env.limit).toBe(100);
    expect(env.offset).toBe(0);
    expect(env.total).toBe(1251);
  });
});

describe('parseArrivalDate', () => {
  it('converts DD/MM/YYYY to an ISO calendar date without shifting the day', () => {
    expect(parseArrivalDate('05/09/2026')).toBe('2026-09-05');
    expect(parseArrivalDate('1/1/2026')).toBe('2026-01-01');
    expect(parseArrivalDate('31/12/2025')).toBe('2025-12-31');
  });

  it('returns empty for values it cannot parse', () => {
    expect(parseArrivalDate('')).toBe('');
    expect(parseArrivalDate('2026-09-05')).toBe('');
    expect(parseArrivalDate('45/09/2026')).toBe('');
  });
});

describe('recordKey', () => {
  it('treats case-differing duplicates as the same quote', () => {
    const base = {
      state: 'Andhra Pradesh',
      district: 'Chittor',
      market: 'Kuppam APMC',
      commodity: 'Tomato',
      variety: 'Tomato',
      grade: 'Grade C',
    };
    expect(recordKey(base)).toBe(recordKey({ ...base, market: 'KUPPAM APMC' }));
    expect(recordKey(base)).not.toBe(recordKey({ ...base, grade: 'FAQ' }));
  });
});

// --- getPrices, against a stubbed upstream ----------------------------------------

function envelope(records: unknown[], total: number, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: 'ok',
      message: 'Resource lists',
      total,
      count: records.length,
      records,
      updated: 1788598845,
      ...extra,
    }),
  } as unknown as Response;
}

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    state: 'Andhra Pradesh',
    district: 'Chittor',
    market: 'Kuppam APMC',
    commodity: 'Tomato',
    variety: 'Tomato',
    grade: 'FAQ',
    arrival_date: '05/09/2026',
    min_price: 900,
    max_price: 1212,
    modal_price: 1212,
    ...over,
  };
}

describe('ApiSource.getPrices', () => {
  it('pages using the length upstream actually returned, not the limit asked for', async () => {
    // Upstream silently caps page size per key (100 registered, 10 on the demo key), so
    // advancing the offset by the requested limit would skip records.
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      seen.push(String(offset));
      const rows = Array.from({ length: 10 }, (_, i) =>
        row({ market: `Market ${offset + i}` }),
      );
      return envelope(offset >= 20 ? [] : rows, 30);
    }) as unknown as typeof fetch;

    const source = new ApiSource({ apiKey: KEY, fetchImpl });
    const page = await source.getPrices({ state: 'Andhra Pradesh' });

    expect(seen).toEqual(['0', '10', '20']);
    expect(page.records).toHaveLength(20);
    expect(page.total).toBe(30);
  });

  it('deduplicates repeated quotes', async () => {
    const fetchImpl = vi.fn(async () =>
      envelope([row(), row(), row({ market: 'Palamaner APMC' })], 3),
    ) as unknown as typeof fetch;

    const source = new ApiSource({ apiKey: KEY, fetchImpl });
    const page = await source.getPrices({ state: 'Andhra Pradesh' });
    expect(page.records).toHaveLength(2);
  });

  it('coerces string prices and blanks them when not numeric', async () => {
    const fetchImpl = vi.fn(async () =>
      envelope([row({ min_price: '2312.5', max_price: 'NR', modal_price: '' })], 1),
    ) as unknown as typeof fetch;

    const source = new ApiSource({ apiKey: KEY, fetchImpl });
    const { records } = await source.getPrices({});
    expect(records[0].minPrice).toBe(2312.5);
    expect(records[0].maxPrice).toBeNull();
    expect(records[0].modalPrice).toBeNull();
  });

  it('reports truncation instead of silently returning a partial set', async () => {
    const fetchImpl = vi.fn(async () => envelope([row()], 500)) as unknown as typeof fetch;
    const source = new ApiSource({ apiKey: KEY, fetchImpl });
    const page = await source.getPrices({ limit: 1 });
    expect(page.truncated).toBe(true);
  });

  it('never issues a request that would cross the result window', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const sum = Number(params.get('offset')) + Number(params.get('limit'));
      expect(sum).toBeLessThanOrEqual(MAX_RESULT_WINDOW);
      const offset = Number(params.get('offset'));
      return envelope(
        offset >= MAX_RESULT_WINDOW ? [] : Array.from({ length: 100 }, (_, i) => row({ market: `M${offset + i}` })),
        50_000,
      );
    }) as unknown as typeof fetch;

    const source = new ApiSource({ apiKey: KEY, fetchImpl });
    const page = await source.getPrices({ limit: MAX_RESULT_WINDOW });
    expect(page.truncated).toBe(true);
  });

  it('does not retry a deterministic upstream error', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: '{"error":"nope","status":500}' }),
    })) as unknown as typeof fetch;

    const source = new ApiSource({ apiKey: KEY, fetchImpl });
    await expect(source.getPrices({})).rejects.toThrow(UpstreamError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 3) return { ok: false, status: 503, json: async () => ({}) } as Response;
      return envelope([row()], 1);
    }) as unknown as typeof fetch;

    const source = new ApiSource({ apiKey: KEY, fetchImpl });
    const page = await source.getPrices({});
    expect(calls).toBe(3);
    expect(page.records).toHaveLength(1);
  });

  it('refuses to construct without an API key', () => {
    const previous = process.env.DATA_GOV_API_KEY;
    delete process.env.DATA_GOV_API_KEY;
    expect(() => new ApiSource({})).toThrow(/DATA_GOV_API_KEY/);
    if (previous) process.env.DATA_GOV_API_KEY = previous;
  });
});
