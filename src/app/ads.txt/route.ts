import { ADSENSE_CLIENT_ID, adsEnabled } from '@/lib/ads';

/**
 * `/ads.txt` — the IAB authorised-sellers file.
 *
 * Without it, most demand sources refuse to bid and AdSense reports the domain as
 * unauthorised, which quietly costs most of the revenue. Generated from the publisher ID
 * rather than committed as a static file so there is one source of truth and no chance of
 * the two drifting apart.
 *
 * Note the `ca-` prefix is dropped here: ads.txt wants the bare `pub-...` form.
 */
export const dynamic = 'force-static';

export function GET() {
  if (!adsEnabled) {
    // A malformed or placeholder ads.txt is worse than none - crawlers cache it and it
    // can invalidate the domain. Serve nothing until there is a real publisher ID.
    return new Response('Not found', { status: 404 });
  }

  const publisherId = ADSENSE_CLIENT_ID.replace(/^ca-/, '');
  const body = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
}
