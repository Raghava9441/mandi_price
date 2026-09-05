import type { MetadataRoute } from 'next';
import { commoditiesInState, catalogMeta, getStates } from '@/lib/catalog';
import { LOCALES, LOCALE_TAGS } from '@/lib/i18n';
import { absolute } from '@/lib/seo/metadata';

/**
 * Sitemaps, split one file per state.
 *
 * The full URL set is states x commodities x locales - comfortably past the 50,000 URL
 * and 50 MB limits for a single sitemap file, so it is sharded. Splitting by state also
 * means a state whose data changed gets a fresh `lastmod` without touching the others.
 *
 * `alternates.languages` emits xhtml:link hreflang entries inside the sitemap, which is
 * the most reliable way to declare locale pairs at this scale.
 */
export async function generateSitemaps() {
  return getStates().map((_, index) => ({ id: index }));
}

function languagesFor(path: string) {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) languages[LOCALE_TAGS[locale]] = absolute(`/${locale}${path}`);
  return languages;
}

/**
 * Next 16 hands `id` in asynchronously, the same way it did to page `params`. Awaiting a
 * plain number is harmless, so this handles both shapes rather than depending on the
 * framework version - getting it wrong silently produces an EMPTY sitemap, not an error.
 */
export default async function sitemap({
  id,
}: {
  id: number | Promise<number>;
}): Promise<MetadataRoute.Sitemap> {
  const index = Number(await id);
  const states = getStates();
  const state = states[index];
  if (!state) return [];

  const { sourceUpdatedAt, generatedAt } = catalogMeta();
  const lastModified = new Date(sourceUpdatedAt ?? generatedAt);

  const entries: MetadataRoute.Sitemap = [];

  // The first shard also carries the site-wide entries, so they are published exactly once.
  if (index === 0) {
    for (const path of ['/', '/states']) {
      entries.push({
        url: absolute(`/en${path === '/' ? '' : path}`),
        lastModified,
        changeFrequency: 'daily',
        priority: path === '/' ? 1 : 0.6,
        alternates: { languages: languagesFor(path === '/' ? '' : path) },
      });
    }
  }

  const statePath = `/state/${state.slug}`;
  entries.push({
    url: absolute(`/en${statePath}`),
    lastModified,
    changeFrequency: 'daily',
    priority: 0.8,
    alternates: { languages: languagesFor(statePath) },
  });

  for (const commodity of commoditiesInState(state)) {
    const path = `/prices/${state.slug}/${commodity.slug}`;
    entries.push({
      url: absolute(`/en${path}`),
      lastModified,
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: { languages: languagesFor(path) },
    });
  }

  for (const district of state.districts) {
    for (const market of district.markets) {
      const path = `/mandi/${state.slug}/${market.slug}`;
      entries.push({
        url: absolute(`/en${path}`),
        lastModified,
        changeFrequency: 'daily',
        priority: 0.7,
        alternates: { languages: languagesFor(path) },
      });
    }
  }

  return entries;
}
