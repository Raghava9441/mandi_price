'use client';

import { useMemo, useState } from 'react';
import type { PriceRecord } from '@/lib/mandi/types';
import { UNITS, formatPrice } from '@/lib/format';
import { useUnit, useUnitSuffix } from './UnitContext';
import { sortRecords, type SortDir, type SortKey } from '@/lib/mandi/derive';
import { PriceRangeBar } from './PriceRangeBar';

/**
 * The interactive price list.
 *
 * Sorting lives here rather than upstream because `sort[...]` is silently ignored by the
 * API. The unit itself comes from `UnitContext` so that this list and the headline figure
 * above it can never show the same price in two different units.
 */

export interface PriceBoardLabels {
  unit: string;
  quintal: string;
  kg: string;
  bag: string;
  perQuintal: string;
  perKg: string;
  perBag: string;
  sortBy: string;
  highestFirst: string;
  lowestFirst: string;
  byName: string;
  market: string;
  district: string;
  variety: string;
  grade: string;
  minPrice: string;
  maxPrice: string;
  notReported: string;
  bestToday: string;
}

type SortOption = 'high' | 'low' | 'name';

const SORTS: Record<SortOption, { key: SortKey; dir: SortDir }> = {
  high: { key: 'modal', dir: 'desc' },
  low: { key: 'modal', dir: 'asc' },
  name: { key: 'market', dir: 'asc' },
};

export function PriceBoard({
  records,
  labels,
  /** Shown instead of the market name when the list covers a single mandi. */
  primaryField = 'market',
}: {
  records: PriceRecord[];
  labels: PriceBoardLabels;
  primaryField?: 'market' | 'commodity';
}) {
  const { unit, setUnit } = useUnit();
  const [sort, setSort] = useState<SortOption>('high');

  const sorted = useMemo(() => {
    const { key, dir } = SORTS[sort];
    return sortRecords(records, key, dir);
  }, [records, sort]);

  const { scaleLow, scaleHigh } = useMemo(() => {
    const prices = records
      .map((r) => r.modalPrice)
      .filter((p): p is number => p !== null && p > 0);
    return {
      scaleLow: prices.length ? Math.min(...prices) : 0,
      scaleHigh: prices.length ? Math.max(...prices) : 1,
    };
  }, [records]);

  const unitSuffix = useUnitSuffix(labels);

  const priced = sorted.filter((r) => r.modalPrice !== null && r.modalPrice > 0);
  // With a single quote there is no ranking to communicate, so the badge is noise.
  const best = priced.length > 1 ? priced[0] : undefined;

  return (
    <div>
      {/* Controls are pinned to the bottom of the viewport on mobile so they sit under
          the thumb, and inline above the list from tablet up. Fixed rather than sticky:
          a sticky element scrolls away with its container, which put the unit switch out
          of reach exactly when the reader was deep in a long list of mandis. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:static sm:mb-4 sm:rounded-2xl sm:border sm:px-4 sm:pb-3"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'color-mix(in oklab, var(--bg) 92%, transparent)',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="sr-only sm:not-sr-only sm:text-sm sm:font-semibold" style={{ color: 'var(--text-muted)' }}>
              {labels.unit}
            </span>
            <div
              className="inline-flex rounded-xl p-1"
              style={{ backgroundColor: 'var(--bg-sunken)' }}
              role="group"
              aria-label={labels.unit}
            >
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  aria-pressed={unit === u}
                  className="tap rounded-lg px-3 text-sm font-semibold transition-colors"
                  style={
                    unit === u
                      ? { backgroundColor: 'var(--bg-raised)', color: 'var(--brand-text)', boxShadow: 'var(--shadow-card)' }
                      : { color: 'var(--text-muted)' }
                  }
                >
                  {u === 'quintal' ? labels.quintal : u === 'kg' ? labels.kg : labels.bag}
                </button>
              ))}
            </div>
          </div>

          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="sr-only sm:not-sr-only sm:font-semibold" style={{ color: 'var(--text-muted)' }}>
              {labels.sortBy}
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="tap rounded-xl border px-3 text-sm font-semibold"
              style={{
                borderColor: 'var(--border-strong)',
                backgroundColor: 'var(--bg-raised)',
                color: 'var(--text)',
              }}
            >
              <option value="high">{labels.highestFirst}</option>
              <option value="low">{labels.lowestFirst}</option>
              <option value="name">{labels.byName}</option>
            </select>
          </label>
        </div>
      </div>

      <ol className="space-y-2.5 pb-24 sm:pb-0">
        {sorted.map((r, i) => {
          const isBest = best === r && sort === 'high';
          const primary = primaryField === 'market' ? r.market : r.commodity;
          const secondary =
            primaryField === 'market'
              ? r.district
              : [r.variety, r.grade].filter(Boolean).join(' · ');

          return (
            <li
              key={`${r.market}|${r.commodity}|${r.variety}|${r.grade}|${i}`}
              className="card p-4"
              style={
                isBest
                  ? { borderColor: 'var(--accent)', backgroundColor: 'var(--bg-raised)' }
                  : undefined
              }
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {isBest && (
                    <span
                      className="pill mb-1.5"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      ★ {labels.bestToday}
                    </span>
                  )}
                  <p className="truncate text-[1.0625rem] font-bold leading-snug">{primary}</p>
                  {secondary && (
                    <p className="truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                      {secondary}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  {r.modalPrice === null ? (
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-faint)' }}>
                      {labels.notReported}
                    </p>
                  ) : (
                    <>
                      <p className="tabular text-2xl font-extrabold leading-none tracking-tight">
                        <span style={{ color: 'var(--text-muted)' }} className="text-lg font-bold">
                          ₹
                        </span>
                        {formatPrice(r.modalPrice, unit)}
                      </p>
                      <p className="mt-1 text-xs font-medium" style={{ color: 'var(--text-faint)' }}>
                        {unitSuffix}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {r.modalPrice !== null && (
                <div className="mt-3 space-y-1.5">
                  <PriceRangeBar
                    min={r.minPrice}
                    modal={r.modalPrice}
                    max={r.maxPrice}
                    scaleLow={scaleLow}
                    scaleHigh={scaleHigh}
                    label={`${labels.minPrice} ${formatPrice(r.minPrice, unit)}, ${labels.maxPrice} ${formatPrice(r.maxPrice, unit)}`}
                  />
                  <div
                    className="tabular flex flex-wrap gap-x-3 gap-y-0.5 text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span>
                      {labels.minPrice} ₹{formatPrice(r.minPrice, unit)}
                    </span>
                    <span>
                      {labels.maxPrice} ₹{formatPrice(r.maxPrice, unit)}
                    </span>
                    {primaryField === 'market' && (r.variety || r.grade) && (
                      <span className="truncate">
                        {[r.variety, r.grade].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
