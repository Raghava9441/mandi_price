import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALES } from './lib/i18n';

/**
 * Locale routing. (Next 16 renamed the middleware convention to "proxy".)
 *
 * Every page lives under /{locale}/..., so a request without one is redirected to the
 * visitor's best match. The redirect is 307 rather than 308: which locale a bare path
 * resolves to depends on the request, and caching that permanently would pin the first
 * visitor's language onto everyone behind the same CDN node.
 */
function pickLocale(header: string | null): string {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    const match = LOCALES.find((locale) => locale === base);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const locale = pickLocale(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  /*
   * Everything except Next internals, the SEO files and static assets.
   *
   * Note the doubled backslash. In a JS string literal `\.` collapses to a bare `.`,
   * which turns the final alternative into "any path with at least one character" - a
   * lookahead that excludes essentially every route and silently disables locale
   * redirects. It has to reach the regex engine as `\\.` to mean a literal dot.
   */
  matcher: [
    '/((?!_next/|api/|favicon\\.ico|robots\\.txt|sitemap/|icon|apple-icon|.*\\.).*)',
  ],
};
