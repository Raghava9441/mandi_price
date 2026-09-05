import { describe, expect, it } from 'vitest';
import { LOCALES, getDictionary, isLocale, t } from '../src/lib/i18n';
import en from '../src/messages/en.json';

describe('getDictionary', () => {
  it('falls back to English key by key, not section by section', () => {
    // The bug this pins: a shallow merge let a partially translated `prices` section
    // replace the English one wholesale, deleting `summary` and crashing every price
    // page in Telugu.
    const te = getDictionary('te');
    expect(te.prices.summary).toBe(en.prices.summary);
    expect(te.prices.summaryOne).toBe(en.prices.summaryOne);
    expect(te.prices.spreadHelp).toBe(en.prices.spreadHelp);
  });

  it('keeps the translations that do exist', () => {
    const te = getDictionary('te');
    expect(te.common.market).not.toBe(en.common.market);
    expect(te.prices.bestToday).not.toBe(en.prices.bestToday);
  });

  it('exposes every English key in every locale', () => {
    const paths = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        value && typeof value === 'object'
          ? paths(value as Record<string, unknown>, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );

    const expected = paths(en as unknown as Record<string, unknown>);
    for (const locale of LOCALES) {
      const dict = getDictionary(locale) as unknown as Record<string, unknown>;
      const actual = new Set(paths(dict));
      const missing = expected.filter((p) => !actual.has(p));
      expect(missing, `${locale} is missing keys`).toEqual([]);
    }
  });
});

describe('t', () => {
  it('interpolates named placeholders', () => {
    expect(t('{commodity} in {state}', { commodity: 'Tomato', state: 'AP' })).toBe(
      'Tomato in AP',
    );
  });

  it('leaves unknown placeholders in place rather than printing undefined', () => {
    expect(t('{a} and {b}', { a: 'x' })).toBe('x and {b}');
  });

  it('returns empty for a missing template instead of throwing', () => {
    // One untranslated label must never take a whole page of prices down.
    expect(t(undefined)).toBe('');
    expect(t(null)).toBe('');
  });
});

describe('isLocale', () => {
  it('accepts supported locales only', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('te')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
