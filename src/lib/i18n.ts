import en from '../messages/en.json';
import te from '../messages/te.json';

/**
 * Minimal server-side i18n.
 *
 * Hand-rolled rather than pulling in next-intl: locale-prefixed routes and a dictionary
 * lookup in Server Components is all this app needs, and it ships zero client JavaScript,
 * which matters on the rural 3G connections this is built for.
 */

export const LOCALES = ['en', 'te'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** BCP-47 tags for `hreflang`, `<html lang>` and `Intl`. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en-IN',
  te: 'te-IN',
};

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  te: 'తెలుగు',
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export type Dictionary = typeof en;

/**
 * Merge a partial translation over English, key by key and section by section.
 *
 * This has to be a DEEP merge. A shallow spread would let a partially translated section
 * replace the English one wholesale - so translating three keys of `prices` would delete
 * the other six, and any page reading them would crash rather than fall back.
 */
function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const out = { ...(base as object) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    const current = out[key];
    out[key] =
      current && typeof current === 'object' && typeof value === 'object'
        ? deepMerge(current, value)
        : value;
  }
  return out as T;
}

const dictionaries: Record<Locale, Dictionary> = {
  en,
  // Telugu is filled in incrementally; anything missing falls back to the English string
  // rather than rendering a raw key - or crashing - at the reader.
  te: deepMerge(en, te),
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/**
 * Interpolate `{name}` placeholders.
 * `t(d.prices.title, { commodity: 'Tomato' })`
 *
 * Tolerates a missing template so that one untranslated string can never take a whole
 * page down - the fallback chain above should prevent it, but a page of prices is far too
 * useful to lose over a missing label.
 */
export function t(
  template: string | undefined | null,
  values: Record<string, string | number> = {},
): string {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}
