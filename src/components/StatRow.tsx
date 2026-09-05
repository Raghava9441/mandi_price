'use client';

import Link from 'next/link';
import { formatPrice } from '@/lib/format';
import { useUnit, useUnitSuffix } from './UnitContext';

/**
 * The headline block: one hero figure plus supporting stats.
 *
 * The hero is the HIGHEST modal price and the mandi paying it, because that is the
 * decision the reader came to make. Modal - not maximum - is used throughout: the maximum
 * usually reflects a small lot of top grade, and headlining it would set an expectation
 * most sellers will not be paid.
 *
 * Prices arrive as rupees per quintal and are formatted here against the shared unit, so
 * the hero always agrees with the list below it.
 */

export interface StatRowLabels {
  perQuintal: string;
  perKg: string;
  perBag: string;
}

export function StatRow({
  best,
  stats,
  labels,
}: {
  best: { label: string; price: number | null; place: string; sub: string; href?: string };
  /** `price` is per quintal and gets converted; `value` is shown verbatim (e.g. a count). */
  stats: { label: string; price?: number | null; value?: string }[];
  labels: StatRowLabels;
}) {
  const { unit } = useUnit();
  const unitSuffix = useUnitSuffix(labels);

  const heroInner = (
    <>
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        ★ {best.label}
      </p>
      <p className="tabular mt-2 text-[2.75rem] font-extrabold leading-none tracking-tight sm:text-5xl">
        <span className="text-3xl font-bold" style={{ color: 'var(--text-muted)' }}>
          ₹
        </span>
        {formatPrice(best.price, unit)}
      </p>
      <p className="mt-1 text-xs font-medium" style={{ color: 'var(--text-faint)' }}>
        {unitSuffix}
      </p>
      <p className="mt-3 text-lg font-bold leading-tight">{best.place}</p>
      {best.sub && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {best.sub}
        </p>
      )}
    </>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {best.href ? (
        <Link
          href={best.href}
          className="card card-link animate-rise p-5 sm:col-span-3"
          style={{ borderColor: 'var(--accent)' }}
        >
          {heroInner}
        </Link>
      ) : (
        <div className="card animate-rise p-5 sm:col-span-3" style={{ borderColor: 'var(--accent)' }}>
          {heroInner}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:grid-cols-1">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="card flex flex-col justify-end gap-0.5 p-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:px-4"
          >
            <p
              className="text-[0.6875rem] font-bold uppercase tracking-wide"
              style={{ color: 'var(--text-faint)' }}
            >
              {stat.label}
            </p>
            <p className="tabular text-xl font-extrabold leading-tight sm:text-2xl">
              {stat.value ?? `₹${formatPrice(stat.price ?? null, unit)}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
