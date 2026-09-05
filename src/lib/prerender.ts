/**
 * How many pages to prerender at build time.
 *
 * Every prerendered price or mandi page costs one upstream request during the build, and
 * data.gov.in rate-limits aggressively - it starts returning 429 and then 403 well before
 * a few hundred requests. Prerendering the whole catalog therefore does not just make
 * builds slow, it makes them FAIL, and a failed deploy is a far worse outcome than a
 * cold first request.
 *
 * So the defaults are deliberately small. Everything not prerendered is still served:
 * the routes set `dynamicParams: true` and `revalidate`, so the long tail renders on
 * first request and is cached from then on. Raise these only if you have a key with
 * headroom and you have measured the build.
 */

function envCount(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Commodity x state pages to prebuild. These are the main SEO landing pages. */
export const PRERENDER_PRICE_PAGES = envCount('PRERENDER_PRICE_PAGES', 12);

/**
 * Mandi pages to prebuild. Zero by default: there are hundreds of them, they are lower
 * search volume than the crop pages, and ISR covers them at no build cost.
 */
export const PRERENDER_MANDI_PAGES = envCount('PRERENDER_MANDI_PAGES', 0);
