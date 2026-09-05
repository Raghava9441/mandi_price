/**
 * AdSense configuration.
 *
 * Everything here is inert until `NEXT_PUBLIC_ADSENSE_CLIENT_ID` is set, so the ad code
 * ships but costs nothing - no script, no layout reservation, no console noise - until
 * there is a real publisher account behind it.
 *
 * `NEXT_PUBLIC_` is correct for once: a publisher ID is not a secret, it is emitted in
 * the page source by design and is visible to anyone who views source on any AdSense site.
 */

/** e.g. `ca-pub-1234567890123456`. */
export const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim() ?? '';

/** Numeric slot IDs created in the AdSense dashboard, one per placement. */
export const AD_SLOTS = {
  /** Below the headline stats on a price page, above the mandi list. */
  priceTop: process.env.NEXT_PUBLIC_ADSENSE_SLOT_PRICE_TOP?.trim() ?? '',
  /** Between the price list and the FAQ. */
  priceBottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_PRICE_BOTTOM?.trim() ?? '',
} as const;

export type AdSlotName = keyof typeof AD_SLOTS;

export const adsEnabled = ADSENSE_CLIENT_ID.length > 0;

export function slotId(name: AdSlotName): string {
  return AD_SLOTS[name];
}

/**
 * Whether a given page may show ads at all.
 *
 * AdSense policy prohibits ads on pages without publisher content, and a page that is
 * empty because a mandi did not trade - or because the upstream API is down - is exactly
 * that. Serving ads against "no arrivals reported today" risks the whole account, and it
 * is a poor experience besides: the reader came for a number and got an advert instead.
 */
export function mayShowAds(options: { hasContent: boolean }): boolean {
  return adsEnabled && options.hasContent;
}
