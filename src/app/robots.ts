import type { MetadataRoute } from 'next';
import { getStates } from '@/lib/catalog';
import { absolute } from '@/lib/seo/metadata';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Sort and unit are view preferences, not distinct pages. Left crawlable they
        // would multiply every real page into a dozen near-duplicates and spend the
        // crawl budget on filter permutations instead of on new mandi data.
        disallow: ['/*?sort=', '/*?unit=', '/*&sort=', '/*&unit=', '/api/'],
      },
    ],
    sitemap: getStates().map((_, index) => absolute(`/sitemap/${index}.xml`)),
    host: absolute('/'),
  };
}
