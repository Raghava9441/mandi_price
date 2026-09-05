import { describe, expect, it } from 'vitest';
import { BASE_URL, MAX_RESULT_WINDOW } from '../../src/lib/mandi/api-source';

/**
 * Contract tests against the real data.gov.in API.
 *
 * Excluded from the default `npm test` run because they need the network and a key.
 * Run them with `npm run test:live` after changing anything in `api-source.ts`, and
 * whenever upstream behaviour is in doubt.
 *
 * These encode the three upstream behaviours that are invisible from the documentation
 * and that silently produce WRONG DATA rather than errors.
 */

const KEY =
  process.env.DATA_GOV_API_KEY ?? '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b';

async function total(params: Record<string, string>): Promise<number> {
  const q = new URLSearchParams({ 'api-key': KEY, format: 'json', limit: '1', ...params });
  const res = await fetch(`${BASE_URL}?${q}`);
  const body = (await res.json()) as { total?: number };
  return Number(body.total ?? 0);
}

describe('data.gov.in filter semantics', { timeout: 60_000 }, () => {
  it('matches a market EXACTLY only via .keyword', async () => {
    // The bare field is analysed text: "Kuppam APMC" matches the token "APMC" and pulls
    // in every market whose name contains it - thousands of rows from the wrong mandis.
    const fuzzy = await total({ 'filters[market]': 'Kuppam APMC' });
    const exact = await total({ 'filters[market.keyword]': 'Kuppam APMC' });

    expect(exact).toBeLessThanOrEqual(5);
    expect(fuzzy).toBeGreaterThan(exact * 10);
  });

  it('matches a state EXACTLY only via .keyword', async () => {
    // filters[state]=Andhra Pradesh also matches Himachal, Madhya and Uttar Pradesh,
    // because they all share the token "Pradesh".
    const fuzzy = await total({ 'filters[state]': 'Andhra Pradesh' });
    const exact = await total({ 'filters[state.keyword]': 'Andhra Pradesh' });

    expect(exact).toBeGreaterThan(0);
    expect(fuzzy).toBeGreaterThan(exact);
  });

  it('silently ignores an unknown filter key instead of erroring', async () => {
    // This is why the source keeps an allow-list: a typo'd filter name returns the FULL
    // unfiltered dataset with HTTP 200, which looks like success.
    const unfiltered = await total({});
    const bogus = await total({ 'filters[not_a_field.keyword]': 'anything' });
    expect(bogus).toBe(unfiltered);
  });

  it('silently ignores arrival_date filters - there is no queryable history', async () => {
    const unfiltered = await total({});
    const dated = await total({ 'filters[arrival_date]': '01/01/2020' });
    expect(dated).toBe(unfiltered);
  });

  it('returns HTTP 200 with an error body when paging past the result window', async () => {
    const q = new URLSearchParams({
      'api-key': KEY,
      format: 'json',
      limit: '100',
      offset: String(MAX_RESULT_WINDOW + 1000),
    });
    const res = await fetch(`${BASE_URL}?${q}`);
    const body = (await res.json()) as { records?: unknown; message?: unknown };

    expect(res.status).toBe(200);
    expect(Array.isArray(body.records)).toBe(false);
    expect(JSON.stringify(body.message)).toContain('Result window is too large');
  });

  it('caps page size at 100 regardless of the limit requested', async () => {
    const q = new URLSearchParams({ 'api-key': KEY, format: 'json', limit: '1000' });
    const res = await fetch(`${BASE_URL}?${q}`);
    const body = (await res.json()) as { records?: unknown[] };
    expect(body.records?.length ?? 0).toBeLessThanOrEqual(100);
  });
});
