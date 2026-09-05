import { LOCALES, LOCALE_TAGS, type Locale } from '../i18n';

/** Absolute origin. Canonicals and sitemaps are meaningless without one. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function absolute(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Canonical + hreflang for one page.
 *
 * Two rules this encodes:
 *  - The canonical is always the clean path. Sort and unit live in query params and must
 *    never mint separate indexable URLs, or a handful of real pages becomes thousands of
 *    near-duplicates and the crawl budget goes to filter permutations.
 *  - Every locale points at every other, plus x-default. Google discards one-way hreflang.
 */
export function alternates(locale: Locale, pathWithoutLocale: string) {
  const path = pathWithoutLocale === '/' ? '' : pathWithoutLocale;
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[LOCALE_TAGS[l]] = absolute(`/${l}${path}`);
  languages['x-default'] = absolute(`/en${path}`);

  return {
    canonical: absolute(`/${locale}${path}`),
    languages,
  };
}

/**
 * Titles carry the actual number.
 *
 * "Tomato Price Today in Andhra Pradesh - Rs 1,300/qtl (5 Sep 2026)" outperforms a
 * generic title on price queries by a wide margin, because the searcher can see their
 * answer in the result and the freshness date signals the page is not a stale archive.
 */
export function priceTitle(parts: {
  commodity: string;
  place: string;
  price?: string | null;
  date?: string | null;
  markets?: number;
}): string {
  const head = `${parts.commodity} Price Today in ${parts.place}`;
  const bits: string[] = [];
  if (parts.price) bits.push(`₹${parts.price}/qtl`);
  if (parts.date) bits.push(parts.date);
  const tail = bits.length > 0 ? ` — ${bits.join(', ')}` : '';
  const markets = parts.markets ? ` · ${parts.markets} mandis` : '';
  return `${head}${tail}${markets}`;
}
