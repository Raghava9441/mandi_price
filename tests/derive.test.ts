import { describe, expect, it } from 'vitest';
import { groupByMarket, sortRecords, summarise, topCommodities } from '../src/lib/mandi/derive';
import type { PriceRecord } from '../src/lib/mandi/types';

function rec(over: Partial<PriceRecord> = {}): PriceRecord {
  return {
    state: 'Andhra Pradesh',
    district: 'Chittor',
    market: 'Kuppam APMC',
    commodity: 'Tomato',
    variety: 'Tomato',
    grade: 'FAQ',
    arrivalDate: '2026-09-05',
    minPrice: 900,
    maxPrice: 1300,
    modalPrice: 1200,
    ...over,
  };
}

describe('sortRecords', () => {
  const records = [
    rec({ market: 'A', modalPrice: 1000 }),
    rec({ market: 'B', modalPrice: 3000 }),
    rec({ market: 'C', modalPrice: 2000 }),
  ];

  it('sorts by modal price descending by default', () => {
    expect(sortRecords(records, 'modal').map((r) => r.market)).toEqual(['B', 'C', 'A']);
  });

  it('sorts ascending when asked', () => {
    expect(sortRecords(records, 'modal', 'asc').map((r) => r.market)).toEqual(['A', 'C', 'B']);
  });

  it('keeps unpriced rows last in both directions', () => {
    // A mandi that did not report is an absence, not a zero-rupee quote. Sorting it to
    // the top of an ascending list would read as "this mandi pays nothing".
    const withGap = [...records, rec({ market: 'D', modalPrice: null })];
    expect(sortRecords(withGap, 'modal', 'asc').at(-1)?.market).toBe('D');
    expect(sortRecords(withGap, 'modal', 'desc').at(-1)?.market).toBe('D');
  });

  it('does not mutate the input', () => {
    const input = [...records];
    sortRecords(input, 'modal');
    expect(input.map((r) => r.market)).toEqual(['A', 'B', 'C']);
  });
});

describe('summarise', () => {
  it('computes the range, median and best/worst mandi', () => {
    const s = summarise([
      rec({ market: 'A', modalPrice: 1000 }),
      rec({ market: 'B', modalPrice: 3000 }),
      rec({ market: 'C', modalPrice: 2000 }),
    ]);
    expect(s.low).toBe(1000);
    expect(s.high).toBe(3000);
    expect(s.median).toBe(2000);
    expect(s.best?.market).toBe('B');
    expect(s.worst?.market).toBe('A');
    expect(s.spread).toBe(2000);
    expect(s.spreadPct).toBe(200);
    expect(s.markets).toBe(3);
  });

  it('averages the two middle values for an even count', () => {
    const s = summarise([rec({ modalPrice: 1000 }), rec({ modalPrice: 2000 })]);
    expect(s.median).toBe(1500);
  });

  it('excludes unpriced and zero rows from the statistics but still counts them', () => {
    const s = summarise([
      rec({ market: 'A', modalPrice: 2000 }),
      rec({ market: 'B', modalPrice: null }),
      rec({ market: 'C', modalPrice: 0 }),
    ]);
    expect(s.quoted).toBe(1);
    expect(s.unquoted).toBe(2);
    expect(s.low).toBe(2000);
    expect(s.markets).toBe(3);
  });

  it('returns null statistics rather than zeroes when nothing was reported', () => {
    const s = summarise([rec({ modalPrice: null, minPrice: null, maxPrice: null })]);
    expect(s.low).toBeNull();
    expect(s.median).toBeNull();
    expect(s.best).toBeNull();
    expect(s.spread).toBeNull();
  });

  it('reports the latest arrival date present', () => {
    const s = summarise([
      rec({ arrivalDate: '2026-09-03' }),
      rec({ market: 'B', arrivalDate: '2026-09-05' }),
    ]);
    expect(s.arrivalDate).toBe('2026-09-05');
  });

  it('counts the same market name in two districts separately', () => {
    const s = summarise([
      rec({ market: 'Central', district: 'Guntur' }),
      rec({ market: 'Central', district: 'Krishna' }),
    ]);
    expect(s.markets).toBe(2);
    expect(s.districts).toBe(2);
  });
});

describe('groupByMarket', () => {
  it('collects varieties under one market', () => {
    const groups = groupByMarket([
      rec({ variety: 'Local' }),
      rec({ variety: 'Hybrid' }),
      rec({ market: 'Palamaner APMC' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].rows).toHaveLength(2);
  });
});

describe('topCommodities', () => {
  it('ranks by frequency, breaking ties by name', () => {
    const top = topCommodities(
      [
        rec({ commodity: 'Tomato' }),
        rec({ commodity: 'Tomato' }),
        rec({ commodity: 'Onion' }),
        rec({ commodity: 'Brinjal' }),
      ],
      3,
    );
    expect(top.map((c) => c.commodity)).toEqual(['Tomato', 'Brinjal', 'Onion']);
  });
});
