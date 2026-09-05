import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findMarket, findState, getStates } from '@/lib/catalog';
import { PRERENDER_MANDI_PAGES } from '@/lib/prerender';
import { getSource } from '@/lib/mandi';
import { summarise } from '@/lib/mandi/derive';
import { formatDate, formatNumber, formatPrice, formatUpdatedIST } from '@/lib/format';
import { getDictionary, isLocale, t, type Locale } from '@/lib/i18n';
import { alternates } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbs, faqPage, priceDataset } from '@/lib/seo/jsonld';
import { PriceBoard } from '@/components/PriceBoard';
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
  market: string;
}

/**
 * Mandi pages are not prerendered by default - there are hundreds, each costing an
 * upstream request at build time against a rate-limited API, and they are lower search
 * volume than the crop pages. `dynamicParams` renders them on first request instead.
 * See `lib/prerender.ts`.
 */
export function generateStaticParams() {
  const params: { locale: string; state: string; market: string }[] = [];
  if (PRERENDER_MANDI_PAGES === 0) return params;

  for (const state of getStates()) {
    for (const district of state.districts) {
      for (const market of district.markets) {
        params.push({ locale: 'en', state: state.slug, market: market.slug });
        if (params.length >= PRERENDER_MANDI_PAGES) return params;
      }
    }
  }
  return params;
}

/**
 * Degrades on upstream failure rather than throwing - see the equivalent note on the
 * price page. "Could not load" is reported separately from "no arrivals today", because
 * conflating an outage with a quiet market would misinform the reader.
 */
async function load(params: Params) {
  const state = findState(params.state);
  const market = findMarket(params.state, params.market);
  if (!state || !market) return null;

  try {
    const page = await getSource().getPrices({
      state: state.api,
      market: market.api,
      limit: 300,
    });
    return { state, market, page, unavailable: false };
  } catch (error) {
    console.error(
      `[mandi] upstream failed for ${market.api}:`,
      error instanceof Error ? error.message : error,
    );
    return {
      state,
      market,
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

  const { state, market, page } = data;
  const s = summarise(page.records);
  const d = getDictionary(p.locale);
  const date = s.arrivalDate ? formatDate(s.arrivalDate) : null;

  // "1 crops" in a search result reads as a broken page, so the count is pluralised here
  // as well as in the body copy.
  const crops = s.quoted === 1 ? '1 crop' : `${s.quoted} crops`;
  const title = `${market.name} Mandi Prices Today${date ? ` — ${date}` : ''}${
    s.quoted ? ` · ${crops}` : ''
  }`;

  return {
    title,
    description:
      s.quoted > 0
        ? `Today's rates at ${market.name} mandi, ${state.name}: ${crops} reported, modal prices from ₹${formatPrice(s.low)} to ₹${formatPrice(s.high)} per quintal.`
        : t(d.market.noData, { market: market.name }),
    alternates: alternates(p.locale as Locale, `/mandi/${state.slug}/${market.slug}`),
  };
}

export default async function MarketPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  if (!isLocale(p.locale)) notFound();
  const locale: Locale = p.locale;
  const d = getDictionary(locale);

  const data = await load(p);
  if (!data) notFound();
  const { state, market, page, unavailable } = data;
  const s = summarise(page.records);

  const district = state.districts.find((dist) => dist.slug === market.districtSlug);
  const dateLabel = s.arrivalDate
    ? formatDate(s.arrivalDate, locale === 'te' ? 'te-IN' : 'en-IN')
    : null;

  const crumbs = [
    { name: d.nav.home, path: `/${locale}` },
    { name: state.name, path: `/${locale}/state/${state.slug}` },
    { name: market.name, path: `/${locale}/mandi/${state.slug}/${market.slug}` },
  ];

  const faq = [
    { question: d.faq.whatIsModal, answer: d.faq.whatIsModalAnswer },
    { question: d.faq.whyMissing, answer: d.faq.whyMissingAnswer },
    { question: d.faq.unitQuestion, answer: d.faq.unitAnswer },
  ];

  // Other mandis in the same district: the realistic alternatives for someone deciding
  // where to take a load today.
  const nearby = (district?.markets ?? [])
    .filter((m) => m.slug !== market.slug)
    .slice(0, 12);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbs(crumbs),
          priceDataset({
            name: `${market.name} mandi prices`,
            description: `Daily commodity arrival prices reported by ${market.name} APMC mandi, ${district?.name ?? ''} district, ${state.name}.`,
            path: `/${locale}/mandi/${state.slug}/${market.slug}`,
            modified: page.updatedAt,
            spatial: `${market.name}, ${state.name}, India`,
            variable: 'Commodity price (INR per quintal)',
          }),
          faqPage(faq),
        ]}
      />

      <section className="hero-mesh border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-5">
          <Breadcrumbs items={crumbs} />
          <h1 className="mt-3 text-[1.75rem] font-extrabold leading-[1.15] tracking-tight sm:text-4xl">
            {market.name}
          </h1>
          <p className="mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>
            {t(d.market.subheading, { district: district?.name ?? '', state: state.name })}
          </p>
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
            title={t(d.market.noData, { market: market.name })}
            help={d.prices.noDataHelp}
          />
        ) : (
          <>
            <h2 className="mt-8 text-xl font-extrabold tracking-tight">{d.market.cropsToday}</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {/* Separate singular message rather than a count + "crops" - "1 crops"
                  reads as a bug to the reader, and Telugu does not pluralise the way a
                  naive `n === 1 ? '' : 's'` would assume. */}
              {t(s.quoted === 1 ? d.market.summaryOne : d.market.summary, {
                date: dateLabel ?? '',
                market: market.name,
                district: district?.name ?? '',
                state: state.name,
                commodities: formatNumber(s.quoted),
              })}
            </p>
            <div className="mt-5">
              <UnitProvider>
              <PriceBoard
                records={page.records}
                primaryField="commodity"
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
              </UnitProvider>
            </div>
          </>
        )}

        <FaqBlock heading={d.faq.heading} entries={faq} />

        <RelatedLinks
          groups={[
            {
              heading: `${d.common.market} · ${district?.name ?? state.name}`,
              links: nearby.map((m) => ({
                label: m.name,
                href: `/${locale}/mandi/${state.slug}/${m.slug}`,
              })),
            },
          ]}
        />
      </div>
    </>
  );
}
