import Script from 'next/script';
import { ADSENSE_CLIENT_ID, adsEnabled } from '@/lib/ads';

/**
 * Loads the AdSense library once, from the root layout.
 *
 * `afterInteractive` rather than `beforeInteractive`: the ad script is third-party and
 * comparatively heavy, and letting it block first paint would undo the Core Web Vitals
 * work the price pages depend on for ranking. Ads are the secondary concern on a page
 * whose whole job is showing a number quickly.
 *
 * Renders nothing at all when no publisher ID is configured.
 */
export function AdSenseScript() {
  if (!adsEnabled) return null;

  return (
    <Script
      id="adsbygoogle-init"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
    />
  );
}
