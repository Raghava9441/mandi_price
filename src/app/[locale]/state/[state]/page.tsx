import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { commoditiesInState, findState, getStates } from '@/lib/catalog';
import { formatNumber } from '@/lib/format';
import { getDictionary, isLocale, t, type Locale } from '@/lib/i18n';
import { alternates } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbs } from '@/lib/seo/jsonld';
import { Breadcrumbs } from '@/components/Breadcrumbs';

export const revalidate = 3600;
export const dynamicParams = true;

interface Params {
  locale: string;
  state: string;
}

export function generateStaticParams() {
  return getStates().map((state) => ({ locale: 'en', state: state.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const p = await params;
  if (!isLocale(p.locale)) return {};
  const state = findState(p.state);
  if (!state) return {};
  const d = getDictionary(p.locale);
  const markets = state.districts.reduce((n, dist) => n + dist.markets.length, 0);

  return {
    title: t(d.state.title, { state: state.name }),
    description: t(d.state.summary, {
      state: state.name,
      markets: formatNumber(markets),
      districts: formatNumber(state.districts.length),
      commodities: formatNumber(state.commoditySlugs.length),
    }),
    alternates: alternates(p.locale as Locale, `/state/${state.slug}`),
  };
}

export default async function StatePage({ params }: { params: Promise<Params> }) {
  const p = await params;
  if (!isLocale(p.locale)) notFound();
  const locale: Locale = p.locale;
  const state = findState(p.state);
  if (!state) notFound();

  const d = getDictionary(locale);
  const crops = commoditiesInState(state);
  const markets = state.districts.reduce((n, dist) => n + dist.markets.length, 0);

  const crumbs = [
    { name: d.nav.home, path: `/${locale}` },
    { name: state.name, path: `/${locale}/state/${state.slug}` },
  ];

  return (
    <>
      <JsonLd data={breadcrumbs(crumbs)} />

      <section className="hero-mesh border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-5">
          <Breadcrumbs items={crumbs} />
          <h1 className="mt-3 text-[1.75rem] font-extrabold leading-[1.15] tracking-tight sm:text-4xl">
            {t(d.state.heading, { state: state.name })}
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {t(d.state.summary, {
              state: state.name,
              markets: formatNumber(markets),
              districts: formatNumber(state.districts.length),
              commodities: formatNumber(crops.length),
            })}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <section>
          <h2 className="text-xl font-extrabold tracking-tight">
            {t(d.state.crops, { state: state.name })}
          </h2>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {crops.map((crop) => (
              <li key={crop.slug}>
                <Link
                  href={`/${locale}/prices/${state.slug}/${crop.slug}`}
                  className="card card-link flex items-center gap-3 px-4 py-3.5"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{crop.name}</span>
                  <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-extrabold tracking-tight">{d.state.districts}</h2>
          <div className="mt-4 space-y-2">
            {state.districts.map((district) => (
              <details key={district.slug} className="card px-4 py-3">
                <summary className="tap cursor-pointer list-none justify-between gap-3 font-semibold marker:hidden">
                  <span className="flex-1">{district.name}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-faint)' }}>
                    {district.markets.length}
                  </span>
                </summary>
                <ul className="flex flex-wrap gap-2 pb-1 pt-3">
                  {district.markets.map((market) => (
                    <li key={market.slug}>
                      <Link
                        href={`/${locale}/mandi/${state.slug}/${market.slug}`}
                        className="tap rounded-lg border px-3 text-sm font-medium"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        {market.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
