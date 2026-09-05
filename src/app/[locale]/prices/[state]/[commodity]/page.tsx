import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { commoditiesInState, findCommodity, findState, getStates } from '@/lib/catalog';
import { PRERENDER_PRICE_PAGES } from '@/lib/prerender';
import { getSource } from '@/lib/mandi';
import { summarise } from '@/lib/mandi/derive';
import type { PriceRecord } from '@/lib/mandi/types';
import { formatDate, formatNumber, formatPrice, formatUpdatedIST } from '@/lib/format';
import { getDictionary, isLocale, t, type Locale } from '@/lib/i18n';
import { alternates, priceTitle } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbs, faqPage, itemList, priceDataset } from '@/lib/seo/jsonld';
import { PriceBoard } from '@/components/PriceBoard';
import { StatRow } from '@/components/StatRow';
import { UnitProvider } from '@/components/UnitContext';
import { EmptyState } from '@/components/EmptyState';
import { FaqBlock } from '@/components/FaqBlock';
import { RelatedLinks } from '@/components/RelatedLinks';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { FreshnessLine } from '@/components/FreshnessLine';

export const revalidate = 1800;
export const dynamicParams = true;

interface Params {
  locale: string;
  state: string;
  commodity: string;
}

/**
 * Pre-build a small set of the highest-value pages; render the long tail on demand.
 *
 * Each prerendered page costs one upstream request at build time, and data.gov.in
 * rate-limits hard enough that prerendering the catalog fails the build outright. The
 * cap therefore stays low by default and `dynamicParams` + `revalidate` cover the rest.
 * See `lib/prerender.ts`.
 */
export function generateStaticParams() {
  const params: { locale: string; state: string; commodity: string }[] = [];
  if (PRERENDER_PRICE_PAGES === 0) return params;

  // Widest-traded crops in the biggest states first - the pages most likely to be hit
  // before ISR has warmed anything up.
  for (const state of getStates()) {
    for (const commodity of commoditiesInState(state)) {
      params.push({ locale: 'en', state: state.slug, commodity: commodity.slug });
      if (params.length >= PRERENDER_PRICE_PAGES) return params;
    }
  }
  return params;
}

/**
 * An upstream failure degrades this page; it never takes the build or the request down.
 *
 * data.gov.in rate-limits and has outages, and an unhandled throw here fails the whole
 * deploy over one bad minute on a government API. Returning `unavailable` instead lets
 * the page render, and ISR replaces it with real prices on the next revalidation.
 *
 * Note this is reported as its own state rather than as an empty result: showing "no
 * arrivals reported today" when the API is simply down would be telling the reader
 * something false about their market.
 */
async function load(params: Params) {
  const state = findState(params.state);
  const commodity = findCommodity(params.commodity);
  if (!state || !commodity) return null;

  try {
    const page = await getSource().getPrices({
      state: state.api,
      commodity: commodity.api,
      limit: 500,
    });
    return { state, commodity, page, unavailable: false };
  } catch (error) {
    console.error(
      `[prices] upstream failed for ${state.api} / ${commodity.api}:`,
      error instanceof Error ? error.message : error,
    );
    return {
      state,
      commodity,
      page: {
        records: [],
        total: 0,
        truncated: false,
        updatedAt: null,
        fetchedAt: new Date().toISOString(),
      },
      unavailable: true,
    };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const p = await params;
  if (!isLocale(p.locale)) return {};
  const data = await load(p).catch(() => null);
  if (!data) return {};

  const { state, commodity, page } = data;
  const s = summarise(page.records);
  const path = `/prices/${state.slug}/${commodity.slug}`;

  const title = priceTitle({
    commodity: commodity.name,
    place: state.name,
    price: s.median !== null ? formatPrice(s.median) : null,
    date: s.arrivalDate ? formatDate(s.arrivalDate) : null,
    markets: s.markets || undefined,
  });

  const description =
    s.quoted > 0
      ? `${commodity.name} modal price in ${state.name} today: ₹${formatPrice(s.low)} to ₹${formatPrice(s.high)} per quintal across ${s.markets} mandis. Highest at ${s.best?.market}. Updated daily from Agmarknet.`
      : `Latest reported ${commodity.name} mandi prices in ${state.name}, from the Government of India Agmarknet feed.`;

  return {
    title,
    description,
    alternates: alternates(p.locale as Locale, path),
    openGraph: { title, description, type: 'article' },
  };
}

export default async function CommodityStatePage({ params }: { params: Promise<Params> }) {
  const p = await params;
  if (!isLocale(p.locale)) notFound();
  const locale = p.locale as Locale;
  const d = getDictionary(locale);

  const data = await load(p);
  if (!data) notFound();
  const { state, commodity, page, unavailable } = data;
  const s = summarise(page.records);
  const path = `/prices/${state.slug}/${commodity.slug}`;

  const dateLabel = s.arrivalDate ? formatDate(s.arrivalDate, locale === 'te' ? 'te-IN' : 'en-IN') : null;

  const crumbs = [
    { name: d.nav.home, path: `/${locale}` },
    { name: state.name, path: `/${locale}/state/${state.slug}` },
    { name: commodity.name, path: `/${locale}${path}` },
  ];

  /*
   * Data-derived prose.
   *
   * A page that is only a table reads to Google as thin, templated doorway content, and
   * programmatic sites get demoted wholesale for it. This paragraph is generated from the
   * page's own numbers - never boilerplate, never invented - so every page says something
   * specific and true about its own data.
   */
  const summaryProse =
    s.quoted === 0
      ? null
      : s.markets === 1
        ? t(d.prices.summaryOne, {
            date: dateLabel ?? '',
            commodity: commodity.name,
            state: state.name,
            bestMarket: s.best?.market ?? '',
            bestDistrict: s.best?.district ?? '',
            high: `₹${formatPrice(s.high)}`,
          })
        : t(d.prices.summary, {
            date: dateLabel ?? '',
            commodity: commodity.name,
            state: state.name,
            markets: formatNumber(s.markets),
            districts: formatNumber(s.districts),
            low: `₹${formatPrice(s.low)}`,
            high: `₹${formatPrice(s.high)}`,
            median: `₹${formatPrice(s.median)}`,
            bestMarket: s.best?.market ?? '',
            bestDistrict: s.best?.district ?? '',
          });

  const faq = [
    { question: d.faq.whatIsModal, answer: d.faq.whatIsModalAnswer },
    { question: d.faq.unitQuestion, answer: d.faq.unitAnswer },
    { question: d.faq.howOften, answer: d.faq.howOftenAnswer },
    { question: d.faq.whyMissing, answer: d.faq.whyMissingAnswer },
  ];

  const otherCrops = commoditiesInState(state)
    .filter((c) => c.slug !== commodity.slug)
    .slice(0, 12);

  const otherStates = getStates()
    .filter((st) => st.slug !== state.slug && st.commoditySlugs.includes(commodity.slug))
    .slice(0, 10);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbs(crumbs),
          priceDataset({
            name: `${commodity.name} mandi prices in ${state.name}`,
            description: `Daily minimum, maximum and modal ${commodity.name} prices reported by APMC mandis in ${state.name}, India.`,
            path: `/${locale}${path}`,
            modified: page.updatedAt,
            spatial: `${state.name}, India`,
            variable: `${commodity.name} price (INR per quintal)`,
          }),
          ...(s.quoted > 0
            ? [
                itemList({
                  name: `${commodity.name} prices by mandi in ${state.name}`,
                  items: page.records.slice(0, 50).map((r: PriceRecord) => ({
                    name: `${r.market}, ${r.district}`,
                    description: `Modal ₹${formatPrice(r.modalPrice)} per quintal (min ₹${formatPrice(r.minPrice)}, max ₹${formatPrice(r.maxPrice)})`,
                  })),
                }),
              ]
            : []),
          faqPage(faq),
        ]}
      />

      <section className="hero-mesh border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-5">
          <Breadcrumbs items={crumbs} />
          <h1 className="mt-3 text-[1.75rem] font-extrabold leading-[1.15] tracking-tight sm:text-4xl">
            {t(d.prices.heading, { commodity: commodity.name, state: state.name })}
          </h1>
          <FreshnessLine
            asOf={dateLabel ? t(d.common.asOf, { date: dateLabel }) : null}
            updated={
              page.updatedAt
                ? t(d.common.updated, { time: formatUpdatedIST(page.updatedAt) ?? '' })
                : null
            }
            source={d.common.source}
          />
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4">
        {unavailable ? (
          <EmptyState title={d.common.unavailable} help={d.common.unavailableHelp} />
        ) : s.quoted === 0 ? (
          <EmptyState
            title={t(d.prices.noData, { state: state.name, commodity: commodity.name })}
            help={d.prices.noDataHelp}
          />
        ) : (
          <UnitProvider>
            <div className="-mt-5">
              <StatRow
                best={{
                  label: d.prices.bestToday,
                  // Raw rupees per quintal: StatRow converts against the shared unit so
                  // the headline can never disagree with the list below it.
                  price: s.high,
                  place: s.best?.market ?? '',
                  sub: s.best?.district ?? '',
                  href: s.best
                    ? `/${locale}/mandi/${state.slug}/${marketSlug(state.slug, s.best.market)}`
                    : undefined,
                }}
                stats={[
                  { label: d.prices.median, price: s.median },
                  { label: d.prices.lowestToday, price: s.low },
                  { label: d.common.mandis, value: formatNumber(s.markets) },
                ]}
                labels={{
                  perQuintal: d.common.perQuintal,
                  perKg: d.common.perKg,
                  perBag: d.common.perBag,
                }}
              />
            </div>

            {/* The number that answers "is it worth driving further?" - stated in rupees,
                not left for the reader to subtract two figures in their head. */}
            {s.spread !== null && s.spread > 0 && s.best && s.worst && (
              <p
                className="mt-4 rounded-2xl border px-4 py-3 text-sm leading-relaxed"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--brand-soft)',
                  color: 'var(--brand-text)',
                }}
              >
                {t(d.prices.spreadHelp, {
                  best: s.best.market,
                  worst: s.worst.market,
                  amount: `₹${formatPrice(s.spread)}`,
                  pct: String(s.spreadPct ?? 0),
                })}
              </p>
            )}

            {summaryProse && (
              <p className="mt-4 text-[0.9375rem] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {summaryProse}
              </p>
            )}

            <div className="mt-6">
              <PriceBoard
                records={page.records}
                labels={{
                  unit: d.common.unit,
                  quintal: d.common.quintal,
                  kg: d.common.kg,
                  bag: d.common.bag,
                  perQuintal: d.common.perQuintal,
                  perKg: d.common.perKg,
                  perBag: d.common.perBag,
                  sortBy: d.common.sortBy,
                  highestFirst: d.common.highestFirst,
                  lowestFirst: d.common.lowestFirst,
                  byName: d.common.byName,
                  market: d.common.market,
                  district: d.common.district,
                  variety: d.common.variety,
                  grade: d.common.grade,
                  minPrice: d.common.minPrice,
                  maxPrice: d.common.maxPrice,
                  notReported: d.common.notReported,
                  bestToday: d.prices.bestToday,
                }}
              />
            </div>
          </UnitProvider>
        )}

        <FaqBlock heading={d.faq.heading} entries={faq} />

        {/* Internal linking is how the long tail gets discovered at all: these pages are
            too deep for Google to reach from the homepage without them. */}
        <RelatedLinks
          groups={[
            {
              heading: t(d.prices.otherCrops, { state: state.name }),
              links: otherCrops.map((c) => ({
                label: c.name,
                href: `/${locale}/prices/${state.slug}/${c.slug}`,
              })),
            },
            {
              heading: t(d.prices.otherStates, { commodity: commodity.name }),
              links: otherStates.map((st) => ({
                label: st.name,
                href: `/${locale}/prices/${st.slug}/${commodity.slug}`,
              })),
            },
          ]}
        />

        <p className="mt-10 text-center">
          <Link
            href={`/${locale}/state/${state.slug}`}
            className="tap rounded-xl px-4 text-sm font-semibold"
            style={{ color: 'var(--brand-text)' }}
          >
            {t(d.state.heading, { state: state.name })} →
          </Link>
        </p>
      </div>
    </>
  );
}

/** Resolve a market name back to its catalog slug for linking. */
function marketSlug(stateSlug: string, marketName: string): string {
  const state = findState(stateSlug);
  if (!state) return '';
  for (const district of state.districts) {
    const match = district.markets.find((m) => m.api === marketName);
    if (match) return match.slug;
  }
  return '';
}
