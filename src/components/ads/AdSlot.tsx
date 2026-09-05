'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ADSENSE_CLIENT_ID, adsEnabled, slotId, type AdSlotName } from '@/lib/ads';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * One AdSense placement.
 *
 * Two things this gets right that naive AdSense integrations do not:
 *
 * 1. **The space is reserved before the ad loads.** An ad that pops in and shoves the
 *    price list down is a Cumulative Layout Shift hit on every page, and CLS is a ranking
 *    factor for the exact queries this site competes on. The container has a fixed height
 *    from first paint, so the ad fills a hole rather than creating one.
 *
 * 2. **It re-initialises per route.** The App Router keeps the React tree alive across
 *    navigations, so a slot pushed once on mount would silently stay blank on every
 *    subsequent page. Keying on the pathname forces a fresh `<ins>` per page, and the
 *    ref guard stops the double push that React Strict Mode would otherwise cause in
 *    development (AdSense errors with "already have ads in them").
 */
export function AdSlot({
  name,
  className = '',
  /** Reserved height in px. Match this to the unit size you configure in AdSense. */
  height = 280,
  label = 'Advertisement',
}: {
  name: AdSlotName;
  className?: string;
  height?: number;
  label?: string;
}) {
  const pathname = usePathname();
  const pushedFor = useRef<string | null>(null);
  const slot = slotId(name);

  useEffect(() => {
    if (!adsEnabled || !slot) return;
    if (pushedFor.current === pathname) return;
    pushedFor.current = pathname;

    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // An ad failing to load must never break the page around it. Blockers, offline
      // readers and regional restrictions all land here and are all fine.
    }
  }, [pathname, slot]);

  // A configured client ID but no slot ID is a half-finished setup; render nothing rather
  // than an empty bordered box.
  if (!adsEnabled || !slot) return null;

  return (
    <aside
      className={`my-6 ${className}`}
      // Not part of the page's information, so it is skipped by screen readers reading
      // the price content, but still announced if navigated to deliberately.
      aria-label={label}
    >
      <p
        className="mb-1 text-center text-[0.625rem] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-faint)' }}
      >
        {label}
      </p>
      <div
        // Fixed height from first paint: this is the CLS guard.
        style={{ minHeight: height }}
        className="flex items-center justify-center overflow-hidden rounded-2xl"
      >
        <ins
          key={pathname}
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', height }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </aside>
  );
}
